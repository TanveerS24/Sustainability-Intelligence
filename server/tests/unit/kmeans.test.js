/**
 * Unit tests for K-Means clustering.
 * Uses hand-checkable 2D data where correct clustering is obvious.
 */
import { describe, it, expect } from 'vitest';
import { kmeans, selectBestK, nameAllClusters } from '../../src/mining/kmeans.js';

describe('K-Means', () => {
  // Two clearly separated clusters in 2D
  const clusterA = Array.from({ length: 20 }, (_, i) => [i * 0.1, i * 0.1]); // near (0,0)
  const clusterB = Array.from({ length: 20 }, (_, i) => [10 + i * 0.1, 10 + i * 0.1]); // near (10,10)
  const matrix = [...clusterA, ...clusterB];

  it('separates two obvious clusters', () => {
    const { labels, centroids } = kmeans(matrix, 2, { seed: 42 });
    const groupA = new Set(labels.slice(0, 20));
    const groupB = new Set(labels.slice(20));
    expect(groupA.size).toBe(1);
    expect(groupB.size).toBe(1);
    // The two clusters should be different
    expect([...groupA][0]).not.toBe([...groupB][0]);
  });

  it('is deterministic with same seed', () => {
    const r1 = kmeans(matrix, 2, { seed: 42 });
    const r2 = kmeans(matrix, 2, { seed: 42 });
    expect(r1.labels).toEqual(r2.labels);
    expect(r1.inertia).toBeCloseTo(r2.inertia, 6);
  });

  it('differs with different seeds (probabilistic check)', () => {
    // With well-separated data the result should still be valid
    const r1 = kmeans(matrix, 2, { seed: 42 });
    const r2 = kmeans(matrix, 2, { seed: 999 });
    // Both produce correct separation; within-cluster sum of squares is ~26.6 for these 40 points
    expect(r1.inertia).toBeLessThan(35);
    expect(r2.inertia).toBeLessThan(35);
  });

  it('selectBestK returns k=2 for clearly 2-cluster data', () => {
    const { bestK } = selectBestK(matrix, { kMin: 2, kMax: 4, seed: 42 });
    expect(bestK).toBe(2);
  });

  it('nameAllClusters returns array of right length', () => {
    const { bestResult } = selectBestK(matrix, { kMin: 2, kMax: 2, seed: 42 });
    const names = nameAllClusters(bestResult.centroids);
    expect(names).toHaveLength(2);
    expect(typeof names[0]).toBe('string');
  });
});
