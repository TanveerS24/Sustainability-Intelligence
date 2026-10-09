/**
 * Silhouette score and Davies-Bouldin index — implemented from scratch.
 */
import { dist, computeCentroid } from './mathUtils.js';

/**
 * Silhouette score for a clustering result.
 * @param {number[][]} matrix - data points
 * @param {number[]} labels - cluster label per point (-1 = noise/outlier, excluded)
 * @returns {number} mean silhouette in [-1, 1]
 */
export function silhouetteScore(matrix, labels) {
  const n = matrix.length;
  const clustered = labels.map((l, i) => ({ i, l })).filter(x => x.l >= 0);
  if (clustered.length < 2) return 0;

  // Group indices by cluster
  const clusters = new Map();
  for (const { i, l } of clustered) {
    if (!clusters.has(l)) clusters.set(l, []);
    clusters.get(l).push(i);
  }

  // Skip if only one cluster
  if (clusters.size < 2) return 0;

  let totalS = 0;
  let count = 0;

  for (const { i, l } of clustered) {
    const ownCluster = clusters.get(l);
    if (ownCluster.length < 2) continue;

    // a(i) = mean distance to same cluster
    let aSum = 0;
    for (const j of ownCluster) {
      if (j !== i) aSum += dist(matrix[i], matrix[j]);
    }
    const a = aSum / (ownCluster.length - 1);

    // b(i) = min mean distance to any other cluster
    let b = Infinity;
    for (const [cl, members] of clusters) {
      if (cl === l) continue;
      let bSum = 0;
      for (const j of members) bSum += dist(matrix[i], matrix[j]);
      const bMean = bSum / members.length;
      if (bMean < b) b = bMean;
    }

    const s = (b - a) / Math.max(a, b);
    totalS += s;
    count++;
  }

  return count > 0 ? totalS / count : 0;
}

/**
 * Davies-Bouldin index for a clustering result (lower is better).
 * @param {number[][]} matrix
 * @param {number[]} labels
 * @returns {number}
 */
export function daviesBouldinScore(matrix, labels) {
  const clusters = new Map();
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i];
    if (l < 0) continue;
    if (!clusters.has(l)) clusters.set(l, []);
    clusters.get(l).push(i);
  }
  if (clusters.size < 2) return 0;

  const clusterIds = [...clusters.keys()];

  // Compute centroids and within-cluster scatter (avg dist to centroid)
  const centroids = new Map();
  const scatters = new Map();
  for (const [cl, indices] of clusters) {
    const c = computeCentroid(matrix, indices);
    centroids.set(cl, c);
    const scatter = indices.reduce((s, i) => s + dist(matrix[i], c), 0) / indices.length;
    scatters.set(cl, scatter);
  }

  let db = 0;
  for (const ci of clusterIds) {
    let maxR = 0;
    for (const cj of clusterIds) {
      if (ci === cj) continue;
      const dij = dist(centroids.get(ci), centroids.get(cj));
      if (dij === 0) continue;
      const R = (scatters.get(ci) + scatters.get(cj)) / dij;
      if (R > maxR) maxR = R;
    }
    db += maxR;
  }
  return db / clusterIds.length;
}
