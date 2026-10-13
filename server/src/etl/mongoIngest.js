/**
 * High-Throughput MongoDB Dataset Populator.
 * Ingests actual smart-meter, weather, demographic, and holiday datasets
 * from DataSet/ into Docker MongoDB with streaming, bulk operations, and index optimization.
 */
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse';
import { parse as parseSync } from 'csv-parse/sync';
import { connectMongo } from '../db/mongo.js';
import cfg from '../config.js';

export async function populateMongoFromDataset(options = {}) {
  const {
    datasetDir = cfg.DATASET_DIR,
    maxBlocks = 6, // default blocks 0..5 (300 households sample)
    onProgress = null,
  } = options;

  const db = await connectMongo();
  const summary = {
    startedAt: new Date().toISOString(),
    datasetDir,
    counts: {},
    durationMs: 0,
  };
  const startTime = Date.now();

  // 1. Ingest Households
  const hhPath = path.join(datasetDir, 'informations_households.csv');
  if (fs.existsSync(hhPath)) {
    if (onProgress) onProgress('Ingesting informations_households.csv...');
    const count = await ingestHouseholds(db, hhPath);
    summary.counts.households = count;
  }

  // 2. Ingest ACORN Demographic Profiles
  const acornPath = path.join(datasetDir, 'acorn_details.csv');
  if (fs.existsSync(acornPath)) {
    if (onProgress) onProgress('Ingesting acorn_details.csv...');
    const count = await ingestAcornProfiles(db, acornPath);
    summary.counts.acornProfiles = count;
  }

  // 3. Ingest Bank Holidays
  const holPath = path.join(datasetDir, 'uk_bank_holidays.csv');
  if (fs.existsSync(holPath)) {
    if (onProgress) onProgress('Ingesting uk_bank_holidays.csv...');
    const count = await ingestBankHolidays(db, holPath);
    summary.counts.bankHolidays = count;
  }

  // 4. Ingest Daily Weather
  const wDailyPath = path.join(datasetDir, 'weather_daily_darksky.csv');
  if (fs.existsSync(wDailyPath)) {
    if (onProgress) onProgress('Ingesting weather_daily_darksky.csv...');
    const count = await ingestDailyWeather(db, wDailyPath);
    summary.counts.weatherDaily = count;
  }

  // 5. Ingest Hourly Weather
  const wHourlyPath = path.join(datasetDir, 'weather_hourly_darksky.csv');
  if (fs.existsSync(wHourlyPath)) {
    if (onProgress) onProgress('Ingesting weather_hourly_darksky.csv (streaming)...');
    const count = await ingestHourlyWeather(db, wHourlyPath);
    summary.counts.weatherHourly = count;
  }

  // 6. Ingest Smart Meter Blocks
  let blockDir = path.join(datasetDir, 'hhblock_dataset', 'hhblock_dataset');
  if (!fs.existsSync(blockDir)) {
    blockDir = path.join(datasetDir, 'hhblock_dataset');
  }
  if (fs.existsSync(blockDir)) {
    if (onProgress) onProgress('Ingesting smart-meter telemetry block CSVs...');
    const count = await ingestSmartMeterBlocks(db, blockDir, maxBlocks);
    summary.counts.smartMeterReadings = count;
  }

  summary.finishedAt = new Date().toISOString();
  summary.durationMs = Date.now() - startTime;
  return summary;
}

async function ingestHouseholds(db, filePath) {
  const collection = db.collection('households');
  const operations = [];
  const stream = fs.createReadStream(filePath);
  const parser = parse({ columns: true, skip_empty_lines: true, trim: true });

  for await (const row of stream.pipe(parser)) {
    const lclid = (row.LCLid || row.lclid || '').trim();
    if (!lclid) continue;
    operations.push({
      updateOne: {
        filter: { lclid },
        update: {
          $set: {
            lclid,
            tariff: (row.stdorToU || row.tariff || 'Std').trim(),
            acorn: (row.Acorn || row.acorn || 'ACORN-U').trim(),
            acornGrouped: (row.Acorn_grouped || row.acorn_grouped || 'Unknown').trim(),
            file: (row.file || '').trim(),
            updatedAt: new Date(),
          },
        },
        upsert: true,
      },
    });

    if (operations.length >= 2000) {
      await collection.bulkWrite(operations, { ordered: false });
      operations.length = 0;
    }
  }

  if (operations.length > 0) {
    await collection.bulkWrite(operations, { ordered: false });
  }
  return collection.countDocuments();
}

async function ingestAcornProfiles(db, filePath) {
  const collection = db.collection('acorn_profiles');
  const content = fs.readFileSync(filePath, 'utf-8');
  const records = parseSync(content, { columns: true, skip_empty_lines: true, trim: true });
  const letters = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q'];
  const operations = [];

  for (const letter of letters) {
    const colName = `ACORN-${letter}`;
    const attributes = [];
    for (const r of records) {
      const score = Number(r[colName]);
      if (score && score > 0) {
        attributes.push({
          mainCategory: r['MAIN CATEGORIES'],
          category: r['CATEGORIES'],
          reference: r['REFERENCE'],
          percentage: score,
        });
      }
    }
    operations.push({
      updateOne: {
        filter: { group: letter },
        update: {
          $set: {
            group: letter,
            name: `ACORN-${letter}`,
            attributeCount: attributes.length,
            attributes,
            updatedAt: new Date(),
          },
        },
        upsert: true,
      },
    });
  }

  if (operations.length > 0) {
    await collection.bulkWrite(operations, { ordered: false });
  }
  return collection.countDocuments();
}

async function ingestBankHolidays(db, filePath) {
  const collection = db.collection('bank_holidays');
  const content = fs.readFileSync(filePath, 'utf-8');
  const records = parseSync(content, { columns: true, skip_empty_lines: true, trim: true });
  const operations = [];

  for (const r of records) {
    const date = (r['Bank holidays'] || r.date || '').trim();
    if (!date) continue;
    operations.push({
      updateOne: {
        filter: { date },
        update: {
          $set: {
            date,
            type: (r.Type || r.type || 'Bank Holiday').trim(),
            updatedAt: new Date(),
          },
        },
        upsert: true,
      },
    });
  }

  if (operations.length > 0) {
    await collection.bulkWrite(operations, { ordered: false });
  }
  return collection.countDocuments();
}

async function ingestDailyWeather(db, filePath) {
  const collection = db.collection('weather_daily');
  const operations = [];
  const stream = fs.createReadStream(filePath);
  const parser = parse({ columns: true, skip_empty_lines: true, trim: true });

  for await (const row of stream.pipe(parser)) {
    const timeStr = (row.time || '').trim();
    if (!timeStr) continue;
    const date = timeStr.substring(0, 10);
    operations.push({
      updateOne: {
        filter: { date },
        update: {
          $set: {
            date,
            time: timeStr,
            temperatureMax: parseFloat(row.temperatureMax) || null,
            temperatureMin: parseFloat(row.temperatureMin) || null,
            humidity: parseFloat(row.humidity) || null,
            windSpeed: parseFloat(row.windSpeed) || null,
            summary: row.summary || '',
            icon: row.icon || '',
          },
        },
        upsert: true,
      },
    });

    if (operations.length >= 2000) {
      await collection.bulkWrite(operations, { ordered: false });
      operations.length = 0;
    }
  }

  if (operations.length > 0) {
    await collection.bulkWrite(operations, { ordered: false });
  }
  return collection.countDocuments();
}

async function ingestHourlyWeather(db, filePath) {
  const collection = db.collection('weather_hourly');
  const operations = [];
  const stream = fs.createReadStream(filePath);
  const parser = parse({ columns: true, skip_empty_lines: true, trim: true });

  for await (const row of stream.pipe(parser)) {
    const timeStr = (row.time || '').trim();
    if (!timeStr) continue;
    const hourKey = timeStr.replace(' ', 'T').substring(0, 13);
    const temp = parseFloat(row.temperature);

    operations.push({
      updateOne: {
        filter: { time: timeStr },
        update: {
          $set: {
            time: timeStr,
            hourKey,
            temperature: Number.isNaN(temp) ? null : temp,
            apparentTemperature: parseFloat(row.apparentTemperature) || null,
            humidity: parseFloat(row.humidity) || null,
            windSpeed: parseFloat(row.windSpeed) || null,
            pressure: parseFloat(row.pressure) || null,
            summary: row.summary || '',
          },
        },
        upsert: true,
      },
    });

    if (operations.length >= 3000) {
      await collection.bulkWrite(operations, { ordered: false });
      operations.length = 0;
    }
  }

  if (operations.length > 0) {
    await collection.bulkWrite(operations, { ordered: false });
  }
  return collection.countDocuments();
}

async function ingestSmartMeterBlocks(db, blockDir, maxBlocks = 6) {
  const collection = db.collection('smart_meter_readings');
  const files = fs.readdirSync(blockDir)
    .filter((f) => /^block_\d+\.csv$/i.test(f))
    .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10))
    .slice(0, maxBlocks);

  for (const file of files) {
    const filePath = path.join(blockDir, file);
    const stream = fs.createReadStream(filePath);
    const parser = parse({ columns: true, skip_empty_lines: true, trim: true, relax_column_count: true });
    const operations = [];

    for await (const row of stream.pipe(parser)) {
      const lclid = (row.LCLid || row.lclid || '').trim();
      const day = (row.day || '').trim();
      if (!lclid || !day) continue;

      for (let slot = 0; slot < 48; slot++) {
        const rawKwh = row[`hh_${slot}`];
        if (rawKwh === undefined || rawKwh === 'Null' || rawKwh === null || rawKwh === '') continue;
        const kwh = parseFloat(rawKwh);
        if (Number.isNaN(kwh)) continue;

        const hour = Math.floor(slot / 2);
        const min = (slot % 2) * 30;
        const ts = `${day}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;

        operations.push({
          updateOne: {
            filter: { lclid, ts },
            update: {
              $set: {
                lclid,
                day,
                slot,
                hour,
                ts,
                kwh,
                isPeak: hour >= 16 && hour < 20 ? 1 : 0,
                blockFile: file,
              },
            },
            upsert: true,
          },
        });

        if (operations.length >= 4000) {
          await collection.bulkWrite(operations, { ordered: false });
          operations.length = 0;
        }
      }
    }

    if (operations.length > 0) {
      await collection.bulkWrite(operations, { ordered: false });
    }
  }

  return collection.countDocuments();
}
