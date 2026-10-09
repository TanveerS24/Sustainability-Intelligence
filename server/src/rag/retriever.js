/**
 * BM25 in-memory retriever — implemented from scratch.
 * Deterministic, local, no embedding service.
 */
import { tokenise } from './chunker.js';

const K1 = 1.5;
const B = 0.75;

export class BM25Retriever {
  constructor(chunks) {
    this.chunks = chunks;
    this._buildIndex();
  }

  _buildIndex() {
    const n = this.chunks.length;
    if (n === 0) { this.df = new Map(); this.avgdl = 0; return; }

    // Document frequency per term
    this.df = new Map();
    this.avgdl = 0;

    for (const chunk of this.chunks) {
      this.avgdl += chunk.tokens.length;
      const seen = new Set();
      for (const t of chunk.tokens) {
        if (!seen.has(t)) {
          this.df.set(t, (this.df.get(t) || 0) + 1);
          seen.add(t);
        }
      }
    }
    this.avgdl /= n;
    this.N = n;
  }

  /**
   * Score a query against a chunk using BM25.
   */
  _score(chunk, queryTokens) {
    const dl = chunk.tokens.length;
    // Term frequency within chunk
    const tf = new Map();
    for (const t of chunk.tokens) tf.set(t, (tf.get(t) || 0) + 1);

    let score = 0;
    for (const term of queryTokens) {
      const f = tf.get(term) || 0;
      if (f === 0) continue;
      const df = this.df.get(term) || 0;
      const idf = Math.log((this.N - df + 0.5) / (df + 0.5) + 1);
      const tfNorm = (f * (K1 + 1)) / (f + K1 * (1 - B + B * dl / this.avgdl));
      score += idf * tfNorm;
    }
    return score;
  }

  /**
   * Retrieve top-k chunks for a query string.
   * @param {string} query
   * @param {number} topK
   * @returns {Array<{chunk, score}>}
   */
  retrieve(query, topK = 5) {
    const qTokens = tokenise(query);
    if (qTokens.length === 0 || this.chunks.length === 0) return [];

    const scored = this.chunks.map(chunk => ({
      chunk,
      score: this._score(chunk, qTokens),
    }));

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}
