/**
 * ETL pipeline — Stage 2 & 3: Cleansing and Warehouse build.
 * Reads from stg_readings, applies quality rules, writes star schema.
 */
import cfg from '../config.js';
import { buildTimeDim, isPeakHour, aggregateHour, forwardFillWeather, percentile999 } from './transforms.js';

/**
 * Build dim_household rows for sampled households.
 */
export function buildDimHousehold(db, sampledIds, hhInfo) {
  const upsert = db.prepare(`
    INSERT OR IGNORE INTO dim_household (lclid, tariff, acorn, acorn_grouped)
    VALUES (?,?,?,?)
  `);
  const doInsert = db.transaction(() => {
    for (const lclid of sampledIds) {
      const info = hhInfo.get(lclid);
      if (!info) continue;
      upsert.run(lclid, info.tariff, info.acorn, info.acornGrouped);
    }
  });
  doInsert();
}

/**
 * Build dim_time and dim_weather, then fact_consumption.
 * Returns cleansing statistics.
 */
export function buildWarehouse(db, weather, holidays) {
  const BATCH = 2000;

  // Load all staging rows grouped by household
  const hhRows = db.prepare(
    'SELECT lclid, ts, kwh FROM stg_readings ORDER BY lclid, ts'
  ).all();

  if (hhRows.length === 0) return { rowsRead: 0, duplicates: 0, missing: 0, outliers: 0, hhKept: 0 };

  // Group by household
  const byHH = new Map();
  for (const row of hhRows) {
    if (!byHH.has(row.lclid)) byHH.set(row.lclid, []);
    byHH.get(row.lclid).push({ ts: row.ts, kwh: row.kwh });
  }

  // Collect all unique hour keys for weather forward-fill
  const allHourKeys = new Set();
  for (const rows of byHH.values()) {
    for (const r of rows) {
      allHourKeys.add(r.ts.substring(0, 13));
    }
  }
  const filledWeather = forwardFillWeather(weather, allHourKeys);

  // Insert dim_time entries
  const insertTime = db.prepare(`
    INSERT OR IGNORE INTO dim_time (hour_key, date, hour, weekday, is_weekend, month, season, is_holiday)
    VALUES (?,?,?,?,?,?,?,?)
  `);
  const doInsertTime = db.transaction((entries) => {
    for (const e of entries) {
      insertTime.run(e.hourKey, e.date, e.hour, e.weekday, e.isWeekend, e.month, e.season, e.isHoliday);
    }
  });

  const timeBatch = [];
  for (const hk of allHourKeys) {
    timeBatch.push(buildTimeDim(hk, holidays));
  }
  doInsertTime(timeBatch);

  // Insert dim_weather
  const insertWeather = db.prepare(`
    INSERT OR IGNORE INTO dim_weather (hour_key, temperature, humidity, temp_band, is_forward_filled)
    VALUES (?,?,?,?,?)
  `);
  const doInsertWeather = db.transaction((entries) => {
    for (const [hk, w] of entries) {
      insertWeather.run(hk, w.temperature, w.humidity, w.tempBand, w.isForwardFilled || 0);
    }
  });
  doInsertWeather([...filledWeather.entries()]);

  // Build fact rows
  const hhKeyStmt = db.prepare('SELECT household_key FROM dim_household WHERE lclid=?');
  const insertFact = db.prepare(`
    INSERT OR REPLACE INTO fact_consumption (household_key, hour_key, kwh, co2_kg, is_peak, quality_flag)
    VALUES (?,?,?,?,?,?)
  `);

  let rowsRead = 0;
  let duplicates = 0;
  let missing = 0;
  let outliers = 0;
  let hhKept = 0;

  db.exec('DELETE FROM fact_consumption');

  const doInsertFacts = db.transaction((rows) => {
    for (const r of rows) insertFact.run(...r);
  });

  for (const [lclid, rows] of byHH) {
    const hhKey = hhKeyStmt.get(lclid);
    if (!hhKey) continue;
    const householdKey = hhKey.household_key;

    // Deduplicate: keep last occurrence per ts
    const deduped = new Map();
    for (const r of rows) {
      if (deduped.has(r.ts)) duplicates++;
      deduped.set(r.ts, r.kwh);
    }
    rowsRead += rows.length;

    // Compute household 99.9th percentile for outlier detection
    const validKwh = [...deduped.values()].filter(v => v !== null && v >= 0);
    const p999 = percentile999(validKwh);

    // Group by hour (2 slots per hour)
    const byHour = new Map();
    for (const [ts, kwh] of deduped) {
      const hourKey = ts.substring(0, 13);
      if (!byHour.has(hourKey)) byHour.set(hourKey, []);
      const slot = parseInt(ts.substring(14, 16), 10) === 30 ? 1 : 0;
      byHour.get(hourKey).push({ slot, kwh });
    }

    const factBatch = [];
    for (const [hourKey, slotReadings] of byHour) {
      const agg = aggregateHour(slotReadings);
      if (!agg) { missing++; continue; }

      let { kwh, qualityFlag } = agg;
      if (slotReadings.some(r => r.kwh === null)) missing++;

      // Flag negative
      let flag = qualityFlag;
      if (kwh < 0) { flag = 'negative'; kwh = 0; }
      // Flag outlier (above 99.9th percentile of household readings)
      else if (kwh > p999) { flag = 'outlier'; outliers++; }

      const co2 = kwh * cfg.EMISSION_FACTOR_KG_PER_KWH;
      const hour = parseInt(hourKey.substring(11, 13), 10);
      const isPeak = isPeakHour(hour);
      factBatch.push([householdKey, hourKey, kwh, co2, isPeak, flag]);
    }

    if (factBatch.length > 0) {
      for (let i = 0; i < factBatch.length; i += BATCH) {
        doInsertFacts(factBatch.slice(i, i + BATCH));
      }
      hhKept++;
    }
  }

  return { rowsRead, duplicates, missing, outliers, hhKept };
}

/**
 * Build aggregate tables (agg_daily, agg_monthly).
 */
export function buildAggregates(db) {
  db.exec('DELETE FROM agg_daily');
  db.exec(`
    INSERT INTO agg_daily (household_key, date, kwh, co2_kg, peak_kwh, hours_count)
    SELECT f.household_key, t.date,
           SUM(f.kwh), SUM(f.co2_kg),
           SUM(CASE WHEN f.is_peak=1 THEN f.kwh ELSE 0 END),
           COUNT(*)
    FROM fact_consumption f
    JOIN dim_time t ON t.hour_key = f.hour_key
    GROUP BY f.household_key, t.date
  `);

  db.exec('DELETE FROM agg_monthly');
  db.exec(`
    INSERT INTO agg_monthly (household_key, year_month, kwh, co2_kg, days_count)
    SELECT household_key,
           SUBSTR(date,1,7) AS year_month,
           SUM(kwh), SUM(co2_kg), COUNT(DISTINCT date)
    FROM agg_daily
    GROUP BY household_key, year_month
  `);
}

/**
 * Build household_features table: normalised 24h load profile + summary stats.
 */
export function buildFeatures(db) {
  db.exec('DELETE FROM household_features');

  const households = db.prepare('SELECT household_key FROM dim_household').all();

  const getHourly = db.prepare(`
    SELECT t.hour, AVG(f.kwh) AS avg_kwh
    FROM fact_consumption f
    JOIN dim_time t ON t.hour_key = f.hour_key
    WHERE f.household_key=? AND f.quality_flag NOT IN ('outlier','negative')
    GROUP BY t.hour
    ORDER BY t.hour
  `);

  const getDailyStats = db.prepare(`
    SELECT AVG(kwh) AS mean_daily_kwh,
           SUM(CASE WHEN is_peak=1 THEN kwh ELSE 0 END)*1.0/NULLIF(SUM(kwh),0) AS peak_share,
           SUM(CASE WHEN t.is_weekend=1 THEN f.kwh ELSE 0 END)*1.0/NULLIF(SUM(f.kwh),0) AS weekend_ratio
    FROM fact_consumption f
    JOIN dim_time t ON t.hour_key = f.hour_key
    WHERE f.household_key=? AND f.quality_flag NOT IN ('outlier','negative')
  `);

  const getDailyKwh = db.prepare(`
    SELECT kwh FROM agg_daily WHERE household_key=?
  `);

  const insertFeature = db.prepare(`
    INSERT OR REPLACE INTO household_features
    (household_key, h0,h1,h2,h3,h4,h5,h6,h7,h8,h9,h10,h11,
     h12,h13,h14,h15,h16,h17,h18,h19,h20,h21,h22,h23,
     mean_daily_kwh, peak_share, weekend_ratio, load_factor)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  const doInsert = db.transaction(() => {
    for (const { household_key } of households) {
      const hourlyRows = getHourly.all(household_key);
      if (hourlyRows.length < 12) continue; // skip sparse households

      const profile = Array(24).fill(0);
      for (const r of hourlyRows) {
        if (r.hour >= 0 && r.hour < 24) profile[r.hour] = r.avg_kwh;
      }

      // Normalise profile to sum=1 (shape only)
      const total = profile.reduce((s, v) => s + v, 0);
      const norm = total > 0 ? profile.map(v => v / total) : profile.map(() => 1 / 24);

      const stats = getDailyStats.get(household_key);
      const dailyVals = getDailyKwh.all(household_key).map(r => r.kwh);
      const meanDaily = stats?.mean_daily_kwh ?? 0;
      const peakShare = stats?.peak_share ?? 0;
      const weekendRatio = stats?.weekend_ratio ?? 0;

      // Load factor = mean / max (of hourly)
      const maxHourly = Math.max(...profile);
      const loadFactor = maxHourly > 0 ? (meanDaily / 24) / maxHourly : 0;

      insertFeature.run(
        household_key, ...norm,
        meanDaily, peakShare, weekendRatio, loadFactor
      );
    }
  });
  doInsert();
}
