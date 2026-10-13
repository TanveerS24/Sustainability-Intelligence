/**
 * Persistent SQLite-Backed Vector Knowledge Database.
 * Stores document chunks, rich metadata, SHA-256 hashes, and 768-d Float32 embeddings.
 * Provides cosine similarity retrieval, metadata filtering, incremental indexing,
 * and persistence across server restarts without external daemons.
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import cfg from '../config.js';

export class VectorStore {
  constructor(dbPath = cfg.VECTOR_DB_PATH) {
    this.dbPath = dbPath;
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this._initSchema();
  }

  _initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vector_documents (
        id TEXT PRIMARY KEY,
        doc TEXT NOT NULL,
        chunk_id TEXT NOT NULL,
        heading TEXT,
        text TEXT NOT NULL,
        category TEXT,
        dataset_type TEXT,
        metadata TEXT NOT NULL,
        embedding BLOB NOT NULL,
        dim INTEGER NOT NULL,
        hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_vec_doc ON vector_documents(doc);
      CREATE INDEX IF NOT EXISTS idx_vec_category ON vector_documents(category);
      CREATE INDEX IF NOT EXISTS idx_vec_hash ON vector_documents(hash);
    `);
  }

  /**
   * Check if a chunk with the given hash already exists.
   */
  hasHash(hash) {
    const row = this.db.prepare('SELECT id FROM vector_documents WHERE hash = ? LIMIT 1').get(hash);
    return Boolean(row);
  }

  /**
   * Get all existing hashes as a Set for fast batch differential checks.
   */
  getAllHashes() {
    const rows = this.db.prepare('SELECT hash FROM vector_documents').all();
    return new Set(rows.map((r) => r.hash));
  }

  /**
   * Insert or update a vector document.
   */
  upsertDocument(doc) {
    const { id, chunkId, heading, text, metadata = {}, embedding, hash } = doc;
    if (!embedding || !embedding.length) {
      throw new Error(`Cannot store document ${id} without embedding vector`);
    }

    const float32 = new Float32Array(embedding);
    const blob = Buffer.from(float32.buffer);
    const now = new Date().toISOString();
    const category = metadata.category || 'general';
    const datasetType = metadata.datasetType || 'text';

    const stmt = this.db.prepare(`
      INSERT INTO vector_documents (
        id, doc, chunk_id, heading, text, category, dataset_type,
        metadata, embedding, dim, hash, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        doc = excluded.doc,
        chunk_id = excluded.chunk_id,
        heading = excluded.heading,
        text = excluded.text,
        category = excluded.category,
        dataset_type = excluded.dataset_type,
        metadata = excluded.metadata,
        embedding = excluded.embedding,
        dim = excluded.dim,
        hash = excluded.hash,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      id,
      doc.doc || metadata.doc || id,
      chunkId || id,
      heading || '',
      text,
      category,
      datasetType,
      JSON.stringify(metadata),
      blob,
      embedding.length,
      hash,
      now,
      now
    );
  }

  /**
   * Batch upsert documents within a transaction.
   */
  upsertBatch(docs) {
    const tx = this.db.transaction((batch) => {
      for (const d of batch) {
        this.upsertDocument(d);
      }
    });
    tx(docs);
  }

  /**
   * Delete document by ID.
   */
  deleteDocument(id) {
    return this.db.prepare('DELETE FROM vector_documents WHERE id = ?').run(id);
  }

  /**
   * Delete documents matching a doc source or category.
   */
  deleteByDoc(docName) {
    return this.db.prepare('DELETE FROM vector_documents WHERE doc = ?').run(docName);
  }

  /**
   * Search for top-K most similar chunks to query embedding.
   */
  similaritySearch(queryEmbedding, topK = 5, filter = {}) {
    const qArray = new Float32Array(queryEmbedding);
    const qDim = qArray.length;

    // Precompute query norm
    let qNorm = 0;
    for (let i = 0; i < qDim; i++) qNorm += qArray[i] * qArray[i];
    qNorm = Math.sqrt(qNorm);
    if (qNorm === 0) return [];

    let sql = 'SELECT id, doc, chunk_id, heading, text, category, dataset_type, metadata, embedding, dim FROM vector_documents';
    const params = [];
    const whereClauses = [];

    if (filter.category) {
      whereClauses.push('category = ?');
      params.push(filter.category);
    }
    if (filter.doc) {
      whereClauses.push('doc = ?');
      params.push(filter.doc);
    }
    if (filter.datasetType) {
      whereClauses.push('dataset_type = ?');
      params.push(filter.datasetType);
    }

    if (whereClauses.length > 0) {
      sql += ' WHERE ' + whereClauses.join(' AND ');
    }

    const rows = this.db.prepare(sql).all(...params);
    const scored = [];

    for (const row of rows) {
      if (row.dim !== qDim) continue;

      const f32 = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.dim);
      let dot = 0;
      let dNorm = 0;

      for (let i = 0; i < qDim; i++) {
        dot += qArray[i] * f32[i];
        dNorm += f32[i] * f32[i];
      }

      dNorm = Math.sqrt(dNorm);
      const similarity = dNorm > 0 ? dot / (qNorm * dNorm) : 0;

      scored.push({
        id: row.id,
        doc: row.doc,
        chunkId: row.chunk_id,
        heading: row.heading,
        text: row.text,
        category: row.category,
        datasetType: row.dataset_type,
        metadata: JSON.parse(row.metadata || '{}'),
        score: similarity,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /**
   * Total number of indexed chunks.
   */
  count() {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM vector_documents').get();
    return row ? row.cnt : 0;
  }

  /**
   * List indexed document sources and counts.
   */
  listSources() {
    return this.db.prepare(`
      SELECT doc, category, dataset_type, COUNT(*) as chunkCount, MAX(updated_at) as lastUpdated
      FROM vector_documents
      GROUP BY doc, category, dataset_type
      ORDER BY chunkCount DESC
    `).all();
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}
