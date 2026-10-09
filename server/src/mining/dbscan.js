/**
 * DBSCAN clustering — implemented from scratch.
 * Used for detecting outlier households.
 */
import { dist } from './mathUtils.js';

const UNVISITED = -2;
const NOISE = -1;

/**
 * Compute the k-distance for the k-distance heuristic (eps estimation).
 * Returns the sorted k-distances array.
 */
export function computeKDistances(matrix, k = 5) {
  return matrix.map(p => {
    const dists = matrix.map(q => dist(p, q)).sort((a, b) => a - b);
    return dists[k] || dists[dists.length - 1];
  }).sort((a, b) => a - b);
}

/**
 * Estimate eps as the "elbow" of the k-distance graph.
 * Uses the point of maximum curvature.
 */
export function estimateEps(kDistances) {
  const n = kDistances.length;
  if (n < 3) return kDistances[Math.floor(n / 2)] || 1;

  // Find maximum second derivative (curvature)
  let maxCurv = -Infinity;
  let elbowIdx = Math.floor(n * 0.8); // default: 80th percentile

  for (let i = 1; i < n - 1; i++) {
    const curv = kDistances[i - 1] - 2 * kDistances[i] + kDistances[i + 1];
    if (curv > maxCurv) { maxCurv = curv; elbowIdx = i; }
  }
  return kDistances[elbowIdx];
}

/**
 * Run DBSCAN.
 * @param {number[][]} matrix
 * @param {number} eps
 * @param {number} minPts
 * @returns {{ labels: number[], noiseIndices: number[] }}
 *   labels: cluster id (>=0) or NOISE (-1) per point
 */
export function dbscan(matrix, eps, minPts) {
  const n = matrix.length;
  const labels = new Array(n).fill(UNVISITED);
  let clusterId = 0;

  function regionQuery(p) {
    const neighbors = [];
    for (let i = 0; i < n; i++) {
      if (dist(matrix[p], matrix[i]) <= eps) neighbors.push(i);
    }
    return neighbors;
  }

  function expandCluster(p, neighbors) {
    labels[p] = clusterId;
    let queue = [...neighbors];
    while (queue.length > 0) {
      const q = queue.shift();
      if (labels[q] === UNVISITED) {
        labels[q] = clusterId;
        const qNeighbors = regionQuery(q);
        if (qNeighbors.length >= minPts) {
          queue = queue.concat(qNeighbors.filter(nb => labels[nb] === UNVISITED || labels[nb] === NOISE));
        }
      }
      if (labels[q] === NOISE) labels[q] = clusterId;
    }
  }

  for (let i = 0; i < n; i++) {
    if (labels[i] !== UNVISITED) continue;
    const neighbors = regionQuery(i);
    if (neighbors.length < minPts) {
      labels[i] = NOISE;
    } else {
      expandCluster(i, neighbors);
      clusterId++;
    }
  }

  const noiseIndices = labels.reduce((acc, l, i) => {
    if (l === NOISE) acc.push(i);
    return acc;
  }, []);

  return { labels, noiseIndices };
}
