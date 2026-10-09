/**
 * Unit tests for DBSCAN.
 * Uses a small dataset with known core, border, and noise points.
 */
import { describe, it, expect } from 'vitest';
import { dbscan, computeKDistances, estimateEps } from '../../src/mining/dbscan.js';

describe('DBSCAN', () => {
  // Points: two tight clusters + one noise point
  // Cluster 1: (0,0), (0.1,0), (0,0.1), (0.1,0.1)
  // Cluster 2: (5,5), (5.1,5), (5,5.1), (5.1,5.1)
  // Noise: (2.5, 2.5)
  const matrix = [
    [0, 0], [0.1, 0], [0, 0.1], [0.1, 0.1],
    [5, 5], [5.1, 5], [5, 5.1], [5.1, 5.1],
    [2.5, 2.5],
  ];

  it('identifies two clusters and one noise point', () => {
    const { labels, noiseIndices } = dbscan(matrix, 0.5, 2);
    // Two distinct cluster IDs (>=0)
    const clusterIds = new Set(labels.filter(l => l >= 0));
    expect(clusterIds.size).toBe(2);
    // The noise point (index 8) should be labeled -1
    expect(noiseIndices).toContain(8);
    expect(labels[8]).toBe(-1);
  });

  it('labels cluster 1 consistently', () => {
    const { labels } = dbscan(matrix, 0.5, 2);
    const cl1 = labels[0];
    expect(cl1).toBeGreaterThanOrEqual(0);
    expect(labels[1]).toBe(cl1);
    expect(labels[2]).toBe(cl1);
    expect(labels[3]).toBe(cl1);
  });

  it('labels cluster 2 consistently', () => {
    const { labels } = dbscan(matrix, 0.5, 2);
    const cl2 = labels[4];
    expect(cl2).toBeGreaterThanOrEqual(0);
    expect(labels[5]).toBe(cl2);
    expect(labels[6]).toBe(cl2);
  });

  it('cluster 1 and cluster 2 have different labels', () => {
    const { labels } = dbscan(matrix, 0.5, 2);
    expect(labels[0]).not.toBe(labels[4]);
  });

  it('computeKDistances returns sorted array', () => {
    const kd = computeKDistances(matrix, 3);
    for (let i = 1; i < kd.length; i++) {
      expect(kd[i]).toBeGreaterThanOrEqual(kd[i - 1]);
    }
  });

  it('estimateEps returns a positive number', () => {
    const kd = computeKDistances(matrix, 3);
    const eps = estimateEps(kd);
    expect(eps).toBeGreaterThan(0);
  });
});
