/**
 * Unit tests for silhouette and Davies-Bouldin evaluation metrics.
 * Values verified by hand calculation for small examples.
 */
import { describe, it, expect } from 'vitest';
import { silhouetteScore, daviesBouldinScore } from '../../src/mining/evaluate.js';

describe('Silhouette Score', () => {
  // Perfect separation: two clusters far apart
  const matrix = [
    [0, 0], [0.1, 0], [0, 0.1],  // cluster 0
    [10, 10], [10.1, 10], [10, 10.1], // cluster 1
  ];
  const labels = [0, 0, 0, 1, 1, 1];

  it('returns high silhouette for perfect separation', () => {
    const s = silhouetteScore(matrix, labels);
    expect(s).toBeGreaterThan(0.9);
  });

  it('returns score in [-1, 1]', () => {
    const s = silhouetteScore(matrix, labels);
    expect(s).toBeGreaterThanOrEqual(-1);
    expect(s).toBeLessThanOrEqual(1);
  });

  it('returns 0 for single cluster', () => {
    const labelsAll0 = [0, 0, 0, 0, 0, 0];
    const s = silhouetteScore(matrix, labelsAll0);
    expect(s).toBe(0);
  });

  it('ignores noise labels (-1)', () => {
    const labelsWithNoise = [0, 0, -1, 1, 1, -1];
    const s = silhouetteScore(matrix, labelsWithNoise);
    expect(s).toBeGreaterThan(0);
  });
});

describe('Davies-Bouldin Score', () => {
  const matrix = [
    [0, 0], [0.1, 0], [0, 0.1],
    [10, 10], [10.1, 10], [10, 10.1],
  ];
  const labels = [0, 0, 0, 1, 1, 1];

  it('returns low DB for well-separated clusters', () => {
    const db = daviesBouldinScore(matrix, labels);
    expect(db).toBeLessThan(0.1);
  });

  it('returns 0 for single cluster', () => {
    const db = daviesBouldinScore(matrix, [0, 0, 0, 0, 0, 0]);
    expect(db).toBe(0);
  });

  it('returns higher DB for overlapping clusters', () => {
    const overlapping = [
      [0, 0], [1, 0], [0, 1],
      [0.5, 0.5], [1.5, 0.5], [0.5, 1.5],
    ];
    const lb = [0, 0, 0, 1, 1, 1];
    const dbSep = daviesBouldinScore(matrix, labels);
    const dbOver = daviesBouldinScore(overlapping, lb);
    expect(dbOver).toBeGreaterThan(dbSep);
  });
});
