/**
 * ETL pipeline orchestrator — Stage 1: Staging
 * Streams block CSVs into stg_readings for the sampled households and date range.
 */
import fs from 'fs';
import path from 'path';
import cfg from '../config.js';
import { getDb } from '../db/schema.js';
import { streamBlock, listBlockFiles, loadHouseholdInfo, loadWeather, loadHolidays } from './loaders.js';
import { stratifiedSample } from './sampler.js';

/**
 * Count valid readings per household in a date range by scanning blocks.
 * Uses only the household IDs present in hhInfo.
 */
async function countReadings(hhInfo, dateFrom, dateTo) {
  const counts = new Map();
  const blockFiles = listBlockFiles();
  const fromTs = `${dateFrom}T00:00`;
  const toTs = `${dateTo}T23:59`;

  for (const blockFile of blockFiles) {
    await streamBlock(blockFile, ({ lclid, ts }) => {
      if (!hhInfo.has(lclid)) return;
      if (ts < fromTs || ts > toTs) return;
      counts.set(lclid, (counts.get(lclid) || 0) + 1);
    });
  }
  return counts;
}

/**
 * Load all staging data for the sampled households into stg_readings.
 */
export async function runStaging(db, sampledIds, dateFrom, dateTo) {
  const blockFiles = listBlockFiles();
  const fromTs = `${dateFrom}T00:00`;
  const toTs = `${dateTo}T23:59`;

  db.exec('DELETE FROM stg_readings');

  const insert = db.prepare(
    'INSERT OR IGNORE INTO stg_readings (lclid, ts, kwh, source_file) VALUES (?,?,?,?)'
  );

  let rowsRead = 0;
  let inserted = 0;

  const batchInsert = db.transaction((rows) => {
    for (const r of rows) insert.run(r.lclid, r.ts, r.kwh, r.sourceFile);
  });

  for (const blockFile of blockFiles) {
    const batch = [];
    await streamBlock(blockFile, ({ lclid, ts, kwh }) => {
      rowsRead++;
      if (!sampledIds.has(lclid)) return;
      if (ts < fromTs || ts > toTs) return;
      batch.push({ lclid, ts, kwh, sourceFile: path.basename(blockFile) });
      if (batch.length >= 5000) {
        batchInsert(batch.splice(0));
        inserted += batch.length;
      }
    });
    if (batch.length > 0) {
      inserted += batch.length;
      batchInsert(batch);
    }
  }
  return { rowsRead, inserted };
}

/**
 * Count staging rows to detect duplicates.
 */
export function getStagingStats(db) {
  const total = db.prepare('SELECT COUNT(*) AS n FROM stg_readings').get().n;
  const unique = db.prepare('SELECT COUNT(DISTINCT lclid||ts) AS n FROM stg_readings').get().n;
  const nullCount = db.prepare('SELECT COUNT(*) AS n FROM stg_readings WHERE kwh IS NULL').get().n;
  return { total, unique, duplicates: total - unique, nullCount };
}

/**
 * Full pipeline entrypoint for real data.
 */
export async function runRealDataPipeline(db) {
  const hhInfo = await loadHouseholdInfo();
  const blockFiles = listBlockFiles();
  if (blockFiles.length === 0) {
    throw new Error('No block files found in ' + path.join(cfg.RAW_DATA_DIR, 'hhblock_dataset'));
  }

  // Count readings to enable stratified sampling
  console.log('Counting readings per household (this may take a minute)...');
  const readingCounts = await countReadings(hhInfo, cfg.DATE_FROM, cfg.DATE_TO);
  const sampledIds = stratifiedSample(hhInfo, readingCounts, cfg.SAMPLE_HOUSEHOLDS);
  console.log(`Sampled ${sampledIds.size} households`);

  const stagingResult = await runStaging(db, sampledIds, cfg.DATE_FROM, cfg.DATE_TO);
  const weather = await loadWeather();
  const holidays = await loadHolidays();

  return { sampledIds, hhInfo, stagingResult, weather, holidays };
}
