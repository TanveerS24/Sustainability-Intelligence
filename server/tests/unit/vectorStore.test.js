/**
 * Unit tests for Persistent Vector Store.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { VectorStore } from '../../src/rag/vectorStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
describe('VectorStore', () => {
  let store;

  beforeEach(() => {
    store = new VectorStore(':memory:');
  });

  afterEach(() => {
    if (store) store.close();
  });

  it('stores and retrieves vectors using cosine similarity', () => {
    // 3D vector test
    const docA = {
      id: 'docA',
      doc: 'energy_guide',
      chunkId: 'energy_guide#1',
      heading: 'Peak Load Shifting',
      text: 'Peak shifting reduces evening grid stress.',
      metadata: { category: 'clean-energy' },
      embedding: [1.0, 0.0, 0.0],
      hash: 'hashA',
    };
    const docB = {
      id: 'docB',
      doc: 'weather_guide',
      chunkId: 'weather_guide#1',
      heading: 'Winter Cold Snaps',
      text: 'Cold winter days elevate domestic gas heating.',
      metadata: { category: 'weather' },
      embedding: [0.0, 1.0, 0.0],
      hash: 'hashB',
    };

    store.upsertBatch([docA, docB]);
    expect(store.count()).toBe(2);

    // Query close to docA
    const resultsA = store.similaritySearch([0.9, 0.1, 0.0], 2);
    expect(resultsA.length).toBe(2);
    expect(resultsA[0].id).toBe('docA');
    expect(resultsA[0].score).toBeGreaterThan(0.9);

    // Query close to docB
    const resultsB = store.similaritySearch([0.1, 0.95, 0.0], 2);
    expect(resultsB[0].id).toBe('docB');
    expect(resultsB[0].score).toBeGreaterThan(0.9);
  });

  it('filters results by metadata category', () => {
    const doc1 = {
      id: '1',
      doc: 'doc1',
      chunkId: '1',
      heading: 'Heading 1',
      text: 'Text 1',
      metadata: { category: 'category-A' },
      embedding: [1.0, 0.5],
      hash: 'h1',
    };
    const doc2 = {
      id: '2',
      doc: 'doc2',
      chunkId: '2',
      heading: 'Heading 2',
      text: 'Text 2',
      metadata: { category: 'category-B' },
      embedding: [1.0, 0.5],
      hash: 'h2',
    };

    store.upsertBatch([doc1, doc2]);

    const results = store.similaritySearch([1.0, 0.5], 5, { category: 'category-B' });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('2');
  });

  it('supports incremental indexing by tracking hashes', () => {
    const doc = {
      id: 'test_hash_doc',
      doc: 'doc',
      chunkId: 'test_hash_doc#0',
      heading: 'Hash Test',
      text: 'Content here',
      metadata: {},
      embedding: [0.5, 0.5],
      hash: 'unique-sha256-hash',
    };

    expect(store.hasHash('unique-sha256-hash')).toBe(false);
    store.upsertDocument(doc);
    expect(store.hasHash('unique-sha256-hash')).toBe(true);
    expect(store.getAllHashes().has('unique-sha256-hash')).toBe(true);
  });

  it('deletes documents cleanly', () => {
    const doc = {
      id: 'to_delete',
      doc: 'doc',
      chunkId: 'to_delete#0',
      heading: 'Delete me',
      text: 'Delete me text',
      metadata: {},
      embedding: [0.1, 0.2],
      hash: 'del-hash',
    };
    store.upsertDocument(doc);
    expect(store.count()).toBe(1);

    store.deleteDocument('to_delete');
    expect(store.count()).toBe(0);
  });
});
