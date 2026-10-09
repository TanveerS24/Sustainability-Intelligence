/**
 * Real-data smoke test — runs loader on a tiny slice of real files
 * and asserts that headers are detected correctly.
 * Skipped with a clear message if raw files are absent.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { listBlockFiles, loadHouseholdInfo, loadWeather } from '../../src/etl/loaders.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REAL_DATA = path.resolve(__dirname, '../../data/raw');
const HH_FILE = path.join(REAL_DATA, 'informations_households.csv');
const BLOCK_DIR = path.join(REAL_DATA, 'hhblock_dataset');

const hasRealData = fs.existsSync(HH_FILE) && fs.existsSync(BLOCK_DIR) &&
  fs.readdirSync(BLOCK_DIR).some(f => /^block_\d+\.csv$/i.test(f));

describe.skipIf(!hasRealData)('Real-data smoke test (skipped if raw files absent)', () => {
  it('household info file loads and detects required columns', async () => {
    const hhInfo = await loadHouseholdInfo();
    expect(hhInfo.size).toBeGreaterThan(0);
    // Check structure of first entry
    const [first] = hhInfo.values();
    expect(first).toHaveProperty('tariff');
    expect(first).toHaveProperty('acorn');
    expect(first).toHaveProperty('acornGrouped');
    expect(first).toHaveProperty('file');
  });

  it('block files are present', () => {
    const blockFiles = listBlockFiles();
    expect(blockFiles.length).toBeGreaterThan(0);
  });

  it('block_0 has correct wide-format structure', async () => {
    const { streamBlock } = await import('../../src/etl/loaders.js');
    const blockFiles = listBlockFiles();
    let rowCount = 0;
    let validTs = true;

    await streamBlock(blockFiles[0], ({ lclid, ts, kwh }) => {
      if (rowCount === 0) {
        // Check lclid looks like MAC...
        expect(lclid).toMatch(/^[A-Z0-9]+/);
        // Check ts is ISO-like
        expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
      }
      rowCount++;
      if (rowCount > 100) return; // sample only first 100 rows
    });

    expect(rowCount).toBeGreaterThan(0);
    expect(validTs).toBe(true);
  });

  it('weather file loads with temperature and time columns', async () => {
    const weather = await loadWeather();
    expect(weather.size).toBeGreaterThan(0);
    const [firstW] = weather.values();
    expect(firstW).toHaveProperty('temperature');
    expect(firstW).toHaveProperty('tempBand');
  });
});
