/**
 * Unit tests for RAG chunker and BM25 retriever.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import { tokenise, loadKnowledgeBase } from '../../src/rag/chunker.js';
import { BM25Retriever } from '../../src/rag/retriever.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_DIR = path.resolve(__dirname, '../../knowledge');

describe('tokenise', () => {
  it('lowercases and splits', () => {
    const tokens = tokenise('Peak Load Shifting');
    expect(tokens).toContain('peak');
    expect(tokens).toContain('load');
    expect(tokens).toContain('shifting');
  });

  it('removes stopwords', () => {
    const tokens = tokenise('the electricity is important for the grid');
    expect(tokens).not.toContain('the');
    expect(tokens).not.toContain('is');
    expect(tokens).toContain('electricity');
  });
});

describe('BM25Retriever', () => {
  let retriever;

  beforeAll(() => {
    const chunks = loadKnowledgeBase(KNOWLEDGE_DIR);
    expect(chunks.length).toBeGreaterThan(0);
    retriever = new BM25Retriever(chunks);
  });

  it('retrieves relevant doc for peak shifting query', () => {
    const results = retriever.retrieve('peak load shifting evening', 5);
    expect(results.length).toBeGreaterThan(0);
    const topDoc = results[0].chunk.doc;
    expect(topDoc).toContain('peak_shifting');
  });

  it('retrieves heating doc for cold temperature query', () => {
    const results = retriever.retrieve('heating efficiency cold winter insulation', 5);
    const docs = results.map(r => r.chunk.doc);
    expect(docs.some(d => d.includes('heating'))).toBe(true);
  });

  it('all results have positive scores', () => {
    const results = retriever.retrieve('electricity consumption households', 5);
    for (const r of results) {
      expect(r.score).toBeGreaterThan(0);
    }
  });

  it('returns empty for nonsense query', () => {
    const results = retriever.retrieve('xyzzy frobozz qwerty', 5);
    expect(results).toHaveLength(0);
  });
});
