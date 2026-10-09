/**
 * K-Means clustering with k-means++ initialisation, seeded RNG, multiple restarts.
 * Implemented from scratch — no mining libraries.
 */
import { makeRng, distSq, computeCentroid } from './mathUtils.js';
import { silhouetteScore, daviesBouldinScore } from './evaluate.js';
import cfg from '../config.js';

/**
 * K-means++ centroid initialisation.
 */
function kmeansppInit(matrix, k, rng) {
  const n = matrix.length;
  const centroids = [matrix[Math.floor(rng() * n)]];

  while (centroids.length < k) {
    const dists = matrix.map(p =>
      Math.min(...centroids.map(c => distSq(p, c)))
    );
    const total = dists.reduce((s, d) => s + d, 0);
    let r = rng() * total;
    for (let i = 0; i < n; i++) {
      r -= dists[i];
      if (r <= 0) { centroids.push(matrix[i]); break; }
    }
    if (centroids.length < k + 1 - k + centroids.length - 1) {
      centroids.push(matrix[Math.floor(rng() * n)]);
    }
  }
  return centroids.slice(0, k);
}

/**
 * Single K-Means run.
 * @param {number[][]} matrix
 * @param {number} k
 * @param {Function} rng
 * @param {number} maxIter
 * @returns {{ labels, centroids, inertia }}
 */
function kmeansRun(matrix, k, rng, maxIter = 200) {
  const n = matrix.length;
  let centroids = kmeansppInit(matrix, k, rng);
  let labels = new Array(n).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    // Assign
    const newLabels = matrix.map(p => {
      let best = 0;
      let bestD = distSq(p, centroids[0]);
      for (let c = 1; c < k; c++) {
        const d = distSq(p, centroids[c]);
        if (d < bestD) { bestD = d; best = c; }
      }
      return best;
    });

    // Check convergence
    const converged = newLabels.every((l, i) => l === labels[i]);
    labels = newLabels;
    if (converged) break;

    // Update centroids
    const newCentroids = Array.from({ length: k }, (_, ci) => {
      const members = labels.map((l, i) => l === ci ? i : -1).filter(i => i >= 0);
      return members.length > 0 ? computeCentroid(matrix, members) : centroids[ci];
    });
    centroids = newCentroids;
  }

  const inertia = matrix.reduce((s, p, i) => s + distSq(p, centroids[labels[i]]), 0);
  return { labels, centroids, inertia };
}

/**
 * Run K-Means for a given k with multiple restarts, pick best inertia.
 */
export function kmeans(matrix, k, opts = {}) {
  const { restarts = 5, seed = cfg.RANDOM_SEED } = opts;
  let best = null;
  for (let r = 0; r < restarts; r++) {
    const rng = makeRng(seed + r * 1000);
    const result = kmeansRun(matrix, k, rng);
    if (!best || result.inertia < best.inertia) best = result;
  }
  return best;
}

/**
 * Select best k by silhouette score over kMin..kMax.
 * @param {number[][]} matrix standardised feature matrix
 * @returns {{ bestK, results: [{k, silhouette, daviesBouldin, inertia}] }}
 */
export function selectBestK(matrix, opts = {}) {
  const { kMin = cfg.K_MIN, kMax = cfg.K_MAX, seed = cfg.RANDOM_SEED } = opts;
  const results = [];

  for (let k = kMin; k <= kMax; k++) {
    const { labels, centroids, inertia } = kmeans(matrix, k, { seed });
    const sil = silhouetteScore(matrix, labels);
    const db = daviesBouldinScore(matrix, labels);
    results.push({ k, labels, centroids, inertia, silhouette: sil, daviesBouldin: db });
  }

  const best = results.reduce((a, b) => b.silhouette > a.silhouette ? b : a);
  return { bestK: best.k, bestResult: best, results };
}

// Cluster name heuristics from centroid shape
const PEAK_HOURS = [16, 17, 18, 19]; // 4pm-8pm
const MORN_HOURS = [6, 7, 8, 9];
const NIGHT_HOURS = [22, 23, 0, 1, 2, 3];

function nameCluster(centroid, idx) {
  const dim = centroid.length;
  if (dim < 24) return `Cluster ${idx + 1}`;

  // First 24 values are the normalised load profile
  const profile = centroid.slice(0, 24);
  const peakShare = PEAK_HOURS.reduce((s, h) => s + (profile[h] || 0), 0);
  const mornShare = MORN_HOURS.reduce((s, h) => s + (profile[h] || 0), 0);
  const nightShare = NIGHT_HOURS.reduce((s, h) => s + (profile[h] || 0), 0);
  const maxVal = Math.max(...profile);
  const minVal = Math.min(...profile);
  const flatness = maxVal > 0 ? (maxVal - minVal) / maxVal : 0;

  if (peakShare > 0.30) return 'Evening-peak heavy';
  if (mornShare > 0.25) return 'Morning-peak';
  if (nightShare > 0.25) return 'Night-heavy';
  if (flatness < 0.3) return 'Flat and steady';

  // Use mean_daily_kwh (index 24) to distinguish low usage
  const meanKwh = centroid[24] || 0;
  if (meanKwh < -0.5) return 'Low and steady'; // standardised, negative = below mean
  return `Cluster ${idx + 1}`;
}

export function nameAllClusters(centroids) {
  return centroids.map((c, i) => nameCluster(c, i));
}
