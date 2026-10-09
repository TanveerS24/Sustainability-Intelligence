import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse';
import cfg from '../config.js';
import { normKey, resolveCol, parseReading } from './headerUtils.js';

const BLOCK_DIR = path.join(cfg.RAW_DATA_DIR, 'hhblock_dataset');

/**
 * Stream a block CSV (wide format) and call onRow for each (lclid, ts, kwh) triple.
 * ts is ISO string "YYYY-MM-DDTHH:MM" for each 30-min slot.
 * Returns { rowsRead, nullCount } statistics.
 */
export async function streamBlock(filePath, onRow) {
  return new Promise((resolve, reject) => {
    let rowsRead = 0;
    let nullCount = 0;
    let headerMap = null;
    let lclIdx, dayIdx;
    const slotIndices = [];

    const parser = parse({ columns: false, skip_empty_lines: true, relax_column_count: true });

    parser.on('data', (cols) => {
      if (headerMap === null) {
        // First row is header
        headerMap = {};
        cols.forEach((h, i) => { headerMap[normKey(h)] = i; });
        lclIdx = resolveCol(headerMap, ['lclid'], 'LCLid');
        dayIdx = resolveCol(headerMap, ['day'], 'day');
        // Collect hh_0..hh_47 indices
        for (let slot = 0; slot < 48; slot++) {
          const k = normKey(`hh_${slot}`);
          if (k in headerMap) slotIndices.push({ slot, idx: headerMap[k] });
        }
        if (slotIndices.length === 0) {
          reject(new Error(`No hh_N columns found in ${filePath}`));
        }
        return;
      }

      rowsRead++;
      const lclid = String(cols[lclIdx] || '').trim();
      const day = String(cols[dayIdx] || '').trim();
      if (!lclid || !day) return;

      for (const { slot, idx } of slotIndices) {
        const kwh = parseReading(cols[idx]);
        if (kwh === null) { nullCount++; }
        // hh_N = slot number, each slot = 30 min starting at 00:00
        const hourNum = Math.floor(slot / 2);
        const minOffset = (slot % 2) * 30;
        const hh = String(hourNum).padStart(2, '0');
        const mm = String(minOffset).padStart(2, '0');
        const ts = `${day}T${hh}:${mm}`;
        onRow({ lclid, ts, kwh, slot });
      }
    });

    parser.on('error', reject);
    parser.on('end', () => resolve({ rowsRead, nullCount }));

    fs.createReadStream(filePath).pipe(parser);
  });
}

/**
 * List all block_*.csv files that exist in the raw data directory.
 */
export function listBlockFiles() {
  if (!fs.existsSync(BLOCK_DIR)) return [];
  return fs.readdirSync(BLOCK_DIR)
    .filter(f => /^block_\d+\.csv$/i.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)[0], 10);
      const nb = parseInt(b.match(/\d+/)[0], 10);
      return na - nb;
    })
    .map(f => path.join(BLOCK_DIR, f));
}

/**
 * Load informations_households.csv and return a Map<lclid, { tariff, acorn, acornGrouped, file }>.
 */
export async function loadHouseholdInfo() {
  const filePath = path.join(cfg.RAW_DATA_DIR, 'informations_households.csv');
  if (!fs.existsSync(filePath)) throw new Error(`Missing: ${filePath}`);

  return new Promise((resolve, reject) => {
    const result = new Map();
    let headerMap = null;
    let lclIdx, tariffIdx, acornIdx, acornGrpIdx, fileIdx;

    const parser = parse({ columns: false, skip_empty_lines: true });
    parser.on('data', (cols) => {
      if (!headerMap) {
        headerMap = {};
        cols.forEach((h, i) => { headerMap[normKey(h)] = i; });
        lclIdx = resolveCol(headerMap, ['lclid'], 'LCLid');
        tariffIdx = resolveCol(headerMap, ['stdortou', 'tariff', 'stdorou'], 'stdorToU');
        acornIdx = resolveCol(headerMap, ['acorn'], 'Acorn');
        acornGrpIdx = resolveCol(headerMap, ['acorngrouped', 'acorn_grouped'], 'Acorn_grouped');
        fileIdx = resolveCol(headerMap, ['file'], 'file');
        return;
      }
      const lclid = String(cols[lclIdx] || '').trim();
      if (!lclid) return;
      result.set(lclid, {
        tariff: String(cols[tariffIdx] || '').trim(),
        acorn: String(cols[acornIdx] || '').trim(),
        acornGrouped: String(cols[acornGrpIdx] || '').trim() || 'Unknown',
        file: String(cols[fileIdx] || '').trim(),
      });
    });
    parser.on('error', reject);
    parser.on('end', () => resolve(result));
    fs.createReadStream(filePath).pipe(parser);
  });
}

/**
 * Load weather_hourly_darksky.csv. Returns Map<hourKey, { temperature, humidity, tempBand }>.
 * hourKey = "YYYY-MM-DDTHH" (truncated to hour).
 */
export async function loadWeather() {
  const filePath = path.join(cfg.RAW_DATA_DIR, 'weather_hourly_darksky.csv');
  if (!fs.existsSync(filePath)) return new Map();

  return new Promise((resolve, reject) => {
    const result = new Map();
    let headerMap = null;
    let tempIdx, timeIdx, humidIdx;

    const parser = parse({ columns: false, skip_empty_lines: true });
    parser.on('data', (cols) => {
      if (!headerMap) {
        headerMap = {};
        cols.forEach((h, i) => { headerMap[normKey(h)] = i; });
        tempIdx = resolveCol(headerMap, ['temperature'], 'temperature');
        timeIdx = resolveCol(headerMap, ['time'], 'time');
        humidIdx = headerMap['humidity'] !== undefined ? headerMap['humidity'] : -1;
        return;
      }
      const timeStr = String(cols[timeIdx] || '').trim();
      const temp = parseReading(cols[tempIdx]);
      const humid = humidIdx >= 0 ? parseReading(cols[humidIdx]) : null;
      if (!timeStr || temp === null) return;
      // Build hour key from "YYYY-MM-DD HH:MM:SS" or ISO
      const hourKey = timeStr.replace(' ', 'T').substring(0, 13);
      const tempBand = tempBandFor(temp);
      result.set(hourKey, { temperature: temp, humidity: humid, tempBand });
    });
    parser.on('error', reject);
    parser.on('end', () => resolve(result));
    fs.createReadStream(filePath).pipe(parser);
  });
}

function tempBandFor(t) {
  if (t < cfg.TEMP_COLD_MAX) return 'cold';
  if (t < cfg.TEMP_MILD_MAX) return 'mild';
  return 'warm';
}

/**
 * Load uk_bank_holidays.csv. Returns Set<dateString> e.g. "2013-01-01".
 */
export async function loadHolidays() {
  const filePath = path.join(cfg.RAW_DATA_DIR, 'uk_bank_holidays.csv');
  if (!fs.existsSync(filePath)) return new Set();

  return new Promise((resolve, reject) => {
    const result = new Set();
    let headerMap = null;
    let dateIdx;

    const parser = parse({ columns: false, skip_empty_lines: true });
    parser.on('data', (cols) => {
      if (!headerMap) {
        headerMap = {};
        cols.forEach((h, i) => { headerMap[normKey(h)] = i; });
        // "Bank holidays" header
        const k = Object.keys(headerMap).find(k =>
          k.includes('bank') || k.includes('holiday') || k === 'date'
        );
        dateIdx = k !== undefined ? headerMap[k] : 0;
        return;
      }
      const d = String(cols[dateIdx] || '').trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) result.add(d);
    });
    parser.on('error', reject);
    parser.on('end', () => resolve(result));
    fs.createReadStream(filePath).pipe(parser);
  });
}
