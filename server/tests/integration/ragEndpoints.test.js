/**
 * Integration tests for RAG, Clusters, and Sustainability API Endpoints.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { initDb } from '../../src/db/schema.js';
import { runPipeline } from '../../src/etl/pipeline.js';
import { runMining } from '../../src/mining/miningPipeline.js';

describe('RAG, Clusters, & Sustainability Endpoints', () => {
  beforeAll(async () => {
    initDb();
    // Run synthetic pipeline + mining if no clusters exist yet
    try {
      await runPipeline({ forceSynthetic: true });
      await runMining();
    } catch (e) {
      // Already populated
    }
  });

  it('GET /api/rag/status returns model and vector store status', async () => {
    const res = await request(app).get('/api/rag/status');
    expect(res.status).toBe(200);
    expect(res.body.vectorStore).toBeDefined();
    expect(res.body.embeddingModel.name).toBeDefined();
    expect(res.body.generationModel.name).toBeDefined();
  });

  it('GET /api/rag/sources lists indexed sources', async () => {
    const res = await request(app).get('/api/rag/sources');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sources)).toBe(true);
  });

  it('GET /api/rag/report returns dataset schema discovery report', async () => {
    const res = await request(app).get('/api/rag/report');
    expect(res.status).toBe(200);
    expect(res.body.totalFilesDiscovered).toBeGreaterThan(0);
    expect(res.body.categories).toBeDefined();
    expect(Array.isArray(res.body.fileProfiles)).toBe(true);
  });

  it('POST /api/rag/query validates non-empty query string', async () => {
    const res = await request(app).post('/api/rag/query').send({ query: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_QUERY');
  });

  it('GET /api/clusters returns cluster profiles and load metrics', async () => {
    const res = await request(app).get('/api/clusters');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.clusters)).toBe(true);
    if (res.body.clusters.length > 0) {
      const c = res.body.clusters[0];
      expect(c.cluster_id).toBeDefined();
      expect(c.name).toBeDefined();
      expect(Array.isArray(c.loadProfile)).toBe(true);
    }
  });

  it('GET /api/clusters/:id returns single cluster details', async () => {
    const listRes = await request(app).get('/api/clusters');
    if (listRes.body.clusters.length > 0) {
      const id = listRes.body.clusters[0].cluster_id;
      const res = await request(app).get(`/api/clusters/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.cluster_id).toBe(id);
      expect(res.body.recommendation).toBeDefined();
    }
  });

  it('POST /api/sustainability/simulate runs scenario across SDGs 7, 12, 13', async () => {
    const res = await request(app)
      .post('/api/sustainability/simulate')
      .send({
        peakShiftPct: 20,
        reductionPct: 15,
        emissionFactor: 0.207,
      });

    expect(res.status).toBe(200);
    expect(res.body.baseline).toBeDefined();
    expect(res.body.simulatedImpact.sdg7_cleanEnergy).toBeDefined();
    expect(res.body.simulatedImpact.sdg12_responsibleConsumption).toBeDefined();
    expect(res.body.simulatedImpact.sdg13_climateAction).toBeDefined();
    expect(res.body.simulatedImpact.sdg13_climateAction.co2SavedKg).toBeGreaterThanOrEqual(0);
    expect(res.body.methodology.length).toBeGreaterThan(0);
  });
});
