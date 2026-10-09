/**
 * Main pipeline orchestrator — detects real vs synthetic data,
 * runs all ETL stages, updates pipeline_runs table.
 */
import fs from 'fs';
import path from 'path';
import cfg from '../config.js';
import { getDb } from '../db/schema.js';
import { listBlockFiles, loadHouseholdInfo, loadWeather, loadHolidays } from './loaders.js';
import { stratifiedSample } from './sampler.js';
import { runStaging } from './staging.js';
import { buildDimHousehold, buildWarehouse, buildAggregates, buildFeatures } from './warehouse.js';
import { generateSyntheticData, generateSyntheticWeather, generateSyntheticHolidays } from './synthetic.js';

export function isRealDataPresent() {
  const hhFile = path.join(cfg.RAW_DATA_DIR, 'informations_households.csv');
  const blockDir = path.join(cfg.RAW_DATA_DIR, 'hhblock_dataset');
  return fs.existsSync(hhFile) && fs.existsSync(blockDir) &&
    fs.readdirSync(blockDir).some(f => /^block_\d+\.csv$/i.test(f));
}

/**
 * Insert synthetic data directly into staging table.
 */
function loadSyntheticToStaging(db, households, readings) {
  db.exec('DELETE FROM stg_readings');
  const insert = db.prepare(
    'INSERT OR IGNORE INTO stg_readings (lclid, ts, kwh, source_file) VALUES (?,?,?,?)'
  );

  const BATCH = 5000;
  const doInsert = db.transaction((batch) => {
    for (const r of batch) insert.run(r.lclid, r.ts, r.kwh, 'synthetic');
  });

  for (let i = 0; i < readings.length; i += BATCH) {
    doInsert(readings.slice(i, i + BATCH));
  }
}

function loadSyntheticHouseholds(db, households) {
  const upsert = db.prepare(`
    INSERT OR IGNORE INTO dim_household (lclid, tariff, acorn, acorn_grouped)
    VALUES (?,?,?,?)
  `);
  const doInsert = db.transaction(() => {
    for (const hh of households) {
      upsert.run(hh.lclid, hh.tariff, hh.acorn, hh.acornGrouped);
    }
  });
  doInsert();
}

export async function runPipeline(opts = {}) {
  const { forceSynthetic = false } = opts;
  const db = getDb();
  const startedAt = new Date().toISOString();
  const runRow = db.prepare(
    'INSERT INTO pipeline_runs (started_at, status) VALUES (?,?)'
  ).run(startedAt, 'running');
  const runId = runRow.lastInsertRowid;

  try {
    let hhInfo, sampledIds, weather, holidays, stagingResult;
    const useReal = !forceSynthetic && isRealDataPresent();

    if (useReal) {
      console.log('[Pipeline] Real data detected — loading...');
      hhInfo = await loadHouseholdInfo();
      const blockFiles = listBlockFiles();
      if (blockFiles.length === 0) throw new Error('No block files found');

      // Count readings for stratified sampling
      console.log('[Pipeline] Counting readings (streaming)...');
      const { countReadings } = await import('./staging.js');
      // We use a simplified approach: assume all households in hhInfo present in blocks
      // are eligible — the staging will only load sampled ones
      const readingCounts = new Map();
      for (const lclid of hhInfo.keys()) readingCounts.set(lclid, cfg.MIN_READINGS_PER_HH + 1);

      sampledIds = stratifiedSample(hhInfo, readingCounts, cfg.SAMPLE_HOUSEHOLDS);

      // Now count actual readings for the sampled households
      const { getStagingStats } = await import('./staging.js');
      stagingResult = await runStaging(db, sampledIds, cfg.DATE_FROM, cfg.DATE_TO);
      weather = await loadWeather();
      holidays = await loadHolidays();

      // Refine: remove sampled households with insufficient readings
      const actualCounts = new Map();
      for (const r of db.prepare('SELECT lclid, COUNT(*) AS cnt FROM stg_readings WHERE kwh IS NOT NULL GROUP BY lclid').all()) {
        actualCounts.set(r.lclid, r.cnt);
      }
      const refinedIds = new Set([...sampledIds].filter(id => (actualCounts.get(id) || 0) >= cfg.MIN_READINGS_PER_HH));
      sampledIds = refinedIds;
      console.log(`[Pipeline] After quality filter: ${sampledIds.size} households`);

    } else {
      console.log('[Pipeline] No real data — using synthetic data (demo mode)');
      const nDays = 90;
      const { households, readings } = generateSyntheticData({ nHouseholds: 60 });
      hhInfo = new Map(households.map(h => [h.lclid, h]));
      sampledIds = new Set(households.map(h => h.lclid));
      loadSyntheticToStaging(db, households, readings);
      stagingResult = { rowsRead: readings.length, inserted: readings.length };
      weather = generateSyntheticWeather();
      holidays = generateSyntheticHolidays();
    }

    // Build dimension tables
    buildDimHousehold(db, sampledIds, hhInfo);

    // Cleanse and build warehouse
    console.log('[Pipeline] Building warehouse...');
    const cleansingStats = buildWarehouse(db, weather, holidays);
    buildAggregates(db);
    buildFeatures(db);

    const finishedAt = new Date().toISOString();
    db.prepare(`
      UPDATE pipeline_runs SET finished_at=?, status=?, rows_read=?,
        duplicates_removed=?, missing_flagged=?, outliers_flagged=?, households_kept=?
      WHERE id=?
    `).run(finishedAt, 'done',
      stagingResult.rowsRead,
      cleansingStats.duplicates,
      cleansingStats.missing,
      cleansingStats.outliers,
      cleansingStats.hhKept,
      runId
    );

    console.log('[Pipeline] Done:', cleansingStats);
    return { runId, useReal, cleansingStats };

  } catch (err) {
    db.prepare('UPDATE pipeline_runs SET finished_at=?, status=?, error=? WHERE id=?')
      .run(new Date().toISOString(), 'error', err.message, runId);
    throw err;
  }
}
