/**
 * Seeded LCG RNG — same algorithm as sampler.js for cross-module consistency.
 */
export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function () {
    s = Math.imul(1664525, s) + 1013904223 >>> 0;
    return s / 4294967296;
  };
}

/** Euclidean distance squared between two same-length vectors. */
export function distSq(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return s;
}

/** Euclidean distance between two vectors. */
export function dist(a, b) { return Math.sqrt(distSq(a, b)); }

/** Standardise a matrix (each column: subtract mean, divide by std). */
export function standardise(matrix) {
  if (matrix.length === 0) return { scaled: [], means: [], stds: [] };
  const nCols = matrix[0].length;
  const means = Array(nCols).fill(0);
  const stds = Array(nCols).fill(1);

  for (const row of matrix) {
    for (let j = 0; j < nCols; j++) means[j] += row[j];
  }
  for (let j = 0; j < nCols; j++) means[j] /= matrix.length;

  for (const row of matrix) {
    for (let j = 0; j < nCols; j++) {
      const d = row[j] - means[j];
      stds[j] += d * d;
    }
  }
  for (let j = 0; j < nCols; j++) {
    stds[j] = Math.sqrt(stds[j] / matrix.length) || 1;
  }

  const scaled = matrix.map(row =>
    row.map((v, j) => (v - means[j]) / stds[j])
  );
  return { scaled, means, stds };
}

/** Compute centroid of a set of rows (indices into matrix). */
export function computeCentroid(matrix, indices) {
  const n = indices.length;
  if (n === 0) return null;
  const dim = matrix[0].length;
  const c = Array(dim).fill(0);
  for (const i of indices) {
    for (let j = 0; j < dim; j++) c[j] += matrix[i][j];
  }
  return c.map(v => v / n);
}
