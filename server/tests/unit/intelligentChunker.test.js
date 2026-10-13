/**
 * Unit tests for Intelligent Chunker.
 */
import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  chunkMarkdownFile,
  chunkHtmlFile,
  chunkAcornDetails,
  chunkHouseholdInfo,
  chunkBankHolidays,
  computeHash,
} from '../../src/rag/intelligentChunker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const DATASET_DIR = path.join(ROOT, 'DataSet');
const KNOWLEDGE_DIR = path.resolve(__dirname, '../../knowledge');

describe('Intelligent Chunker', () => {
  it('chunks markdown files with headings and metadata preserved', () => {
    const mdPath = path.join(KNOWLEDGE_DIR, 'peak_shifting.md');
    const chunks = chunkMarkdownFile(mdPath);
    expect(chunks.length).toBeGreaterThan(0);
    const c0 = chunks[0];
    expect(c0.doc).toBe('peak_shifting');
    expect(c0.chunkId).toMatch(/^peak_shifting#\d+$/);
    expect(c0.metadata.datasetType).toBe('markdown-guidance');
    expect(c0.hash).toBeDefined();
    expect(c0.text.length).toBeGreaterThan(20);
  });

  it('chunks HTML documentation into structured sections', () => {
    const htmlPath = path.join(DATASET_DIR, 'darksky_parameters_documentation.html');
    const chunks = chunkHtmlFile(htmlPath);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].metadata.datasetType).toBe('html-documentation');
    expect(chunks[0].text).toContain('Documentation:');
  });

  it('chunks ACORN details into demographic socio-economic group profiles', () => {
    const acornPath = path.join(DATASET_DIR, 'acorn_details.csv');
    const chunks = chunkAcornDetails(acornPath);
    expect(chunks.length).toBe(17); // Groups A through Q
    const chunkA = chunks.find((c) => c.metadata.acornGroup === 'A');
    expect(chunkA).toBeDefined();
    expect(chunkA.text).toContain('ACORN-A');
  });

  it('chunks household info into aggregate distribution metrics', () => {
    const hhPath = path.join(DATASET_DIR, 'informations_households.csv');
    const chunks = chunkHouseholdInfo(hhPath);
    expect(chunks.length).toBe(1);
    expect(chunks[0].text).toContain('Total Households Monitored');
    expect(chunks[0].metadata.totalHouseholds).toBe(5566);
  });

  it('computes deterministic SHA-256 hash', () => {
    const h1 = computeHash('sample content');
    const h2 = computeHash('sample content');
    const h3 = computeHash('different content');
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
  });
});
