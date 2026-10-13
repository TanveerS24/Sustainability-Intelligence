/**
 * Unit tests for Dataset Discovery and Ingestion Profiling.
 */
import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  categorizeFile,
  discoverFiles,
  profileCsvFile,
  DOMAIN_CATEGORIES,
} from '../../src/rag/datasetDiscovery.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const DATASET_DIR = path.join(ROOT, 'DataSet');

describe('Dataset Discovery & Profiling', () => {
  it('correctly categorizes files by path and name', () => {
    expect(categorizeFile('hhblock_dataset/block_0.csv')).toBe(DOMAIN_CATEGORIES.TELEMETRY);
    expect(categorizeFile('daily_dataset.csv')).toBe(DOMAIN_CATEGORIES.TELEMETRY);
    expect(categorizeFile('informations_households.csv')).toBe(DOMAIN_CATEGORIES.HOUSEHOLDS);
    expect(categorizeFile('acorn_details.csv')).toBe(DOMAIN_CATEGORIES.HOUSEHOLDS);
    expect(categorizeFile('weather_hourly_darksky.csv')).toBe(DOMAIN_CATEGORIES.WEATHER);
    expect(categorizeFile('uk_bank_holidays.csv')).toBe(DOMAIN_CATEGORIES.HOLIDAYS);
    expect(categorizeFile('darksky_parameters_documentation.html')).toBe(DOMAIN_CATEGORIES.DOCUMENTATION);
    expect(categorizeFile('peak_shifting.md')).toBe(DOMAIN_CATEGORIES.GUIDANCE);
  });

  it('discovers supported files in DataSet directory', () => {
    const files = discoverFiles(DATASET_DIR, 50);
    expect(files.length).toBeGreaterThan(0);
    const basenames = files.map((f) => path.basename(f));
    expect(basenames).toContain('acorn_details.csv');
    expect(basenames).toContain('informations_households.csv');
  });

  it('profiles CSV schema and infers column types and missing values', async () => {
    const holidaysPath = path.join(DATASET_DIR, 'uk_bank_holidays.csv');
    const profile = await profileCsvFile(holidaysPath, 100);
    expect(profile).toBeDefined();
    expect(profile.columns).toBeGreaterThan(0);
    expect(profile.headers).toContain('Bank holidays');
    expect(profile.rowCount).toBeGreaterThan(0);
    expect(profile.sampleDuplicates).toBe(0);
  });
});
