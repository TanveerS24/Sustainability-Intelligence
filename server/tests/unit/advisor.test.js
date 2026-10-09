/**
 * Unit tests for RAG Advisor (offline template mode).
 */
import { describe, it, expect } from 'vitest';
import { generateRecommendation } from '../../src/rag/advisor.js';

describe('RAG Advisor unit tests', () => {
  const sampleCluster = {
    cluster_id: 1,
    name: 'Evening Peakers',
    size: 25,
  };

  const sampleRule = {
    antecedent: 'season:winter, temp:cold',
    consequent: 'usage:high',
    support: 0.25,
    confidence: 0.8,
    lift: 1.6,
    explanation: 'Households in winter and cold temperatures tend to have high usage.',
  };

  it('generates recommendation in offline template mode', async () => {
    const res = await generateRecommendation(sampleCluster, sampleRule);
    expect(res).toBeDefined();
    expect(res.mode).toBe('template');
    expect(res.recommendation).toContain('Evening Peakers');
    expect(res.evidence.cluster.name).toBe('Evening Peakers');
  });

  it('all citations exist in retrieved set and have valid chunkId format', async () => {
    const res = await generateRecommendation(sampleCluster, sampleRule);
    expect(res.citations.length).toBeGreaterThan(0);
    for (const c of res.citations) {
      expect(c.chunkId).toMatch(/^[a-z0-9_]+#\d+$/);
      expect(c.doc).toBeDefined();
      expect(c.text.length).toBeGreaterThan(0);
    }
  });

  it('generates recommendation when rule is null', async () => {
    const res = await generateRecommendation(sampleCluster, null);
    expect(res).toBeDefined();
    expect(res.mode).toBe('template');
    expect(res.evidence.rule).toBeNull();
    expect(res.citations.length).toBeGreaterThan(0);
  });
});
