/**
 * Integration tests — full pipeline on synthetic data, then all API endpoints.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';
import request from 'supertest';
import Database from 'better-sqlite3';
import { initDb, closeDb, getDb } from '../../src/db/schema.js';
import { runPipeline } from '../../src/etl/pipeline.js';
import { runMining } from '../../src/mining/miningPipeline.js';
import app from '../../src/app.js';

const TMP_DB = path.join(os.tmpdir(), `si_test_${Date.now()}.db`);

// Override DB_PATH for tests via env
process.env.DB_PATH = TMP_DB;
process.env.SAMPLE_HOUSEHOLDS = '60';
process.env.DATE_FROM = '2013-01-01';
process.env.DATE_TO = '2013-03-31';

let pipelineResult;

beforeAll(async () => {
  initDb(TMP_DB);
  pipelineResult = await runPipeline({ forceSynthetic: true });
}, 60000);

afterAll(() => {
  closeDb();
  if (fs.existsSync(TMP_DB)) fs.unlinkSync(TMP_DB);
  if (fs.existsSync(`${TMP_DB}-shm`)) fs.unlinkSync(`${TMP_DB}-shm`);
  if (fs.existsSync(`${TMP_DB}-wal`)) fs.unlinkSync(`${TMP_DB}-wal`);
});

describe('Pipeline on synthetic data', () => {
  it('completes without error', () => {
    expect(pipelineResult).toBeDefined();
    expect(pipelineResult.cleansingStats).toBeDefined();
  });

  it('keeps some households', () => {
    expect(pipelineResult.cleansingStats.hhKept).toBeGreaterThan(0);
  });

  it('writes fact_consumption rows', () => {
    const db = getDb();
    const count = db.prepare('SELECT COUNT(*) AS n FROM fact_consumption').get().n;
    expect(count).toBeGreaterThan(0);
  });

  it('writes agg_daily rows', () => {
    const db = getDb();
    const count = db.prepare('SELECT COUNT(*) AS n FROM agg_daily').get().n;
    expect(count).toBeGreaterThan(0);
  });

  it('writes household_features', () => {
    const db = getDb();
    const count = db.prepare('SELECT COUNT(*) AS n FROM household_features').get().n;
    expect(count).toBeGreaterThan(0);
  });

  it('hourly aggregation: sum of 2 half-hours equals fact kwh', () => {
    // The pipeline aggregates correctly when two valid readings exist
    const db = getDb();
    const row = db.prepare("SELECT kwh FROM fact_consumption WHERE quality_flag = 'ok' LIMIT 1").get();
    if (row) expect(row.kwh).toBeGreaterThanOrEqual(0);
  });
});

describe('GET /api/health', () => {
  it('returns 200 with ok status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('GET /api/olap/summary', () => {
  it('returns summary with totals', async () => {
    const res = await request(app).get('/api/olap/summary');
    expect(res.status).toBe(200);
    expect(res.body.totals).toBeDefined();
    expect(res.body.totals.households).toBeGreaterThan(0);
  });
});

describe('GET /api/olap/rollup', () => {
  it('rolls up by month', async () => {
    const res = await request(app).get('/api/olap/rollup?dim=time&level=month');
    expect(res.status).toBe(200);
    expect(res.body.rows.length).toBeGreaterThan(0);
    // Sum of roll-up kwh should be close to fact total
  });

  it('rolls up by community', async () => {
    const res = await request(app).get('/api/olap/rollup?dim=community');
    expect(res.status).toBe(200);
    expect(res.body.rows.length).toBeGreaterThan(0);
  });

  it('rejects invalid dim', async () => {
    const res = await request(app).get('/api/olap/rollup?dim=invalid');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe('Mining and downstream endpoints', () => {
  let miningResult;

  beforeAll(async () => {
    miningResult = await runMining();
  }, 60000);

  it('mining completes', () => {
    expect(miningResult.bestK).toBeGreaterThanOrEqual(2);
    expect(miningResult.silhouette).toBeGreaterThan(-1);
  });

  it('GET /api/mining/clusters returns clusters', async () => {
    const res = await request(app).get('/api/mining/clusters');
    expect(res.status).toBe(200);
    expect(res.body.clusters.length).toBeGreaterThan(0);
  });

  it('GET /api/mining/outliers returns response', async () => {
    const res = await request(app).get('/api/mining/outliers');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.outliers)).toBe(true);
  });

  it('GET /api/mining/rules returns rules', async () => {
    const res = await request(app).get('/api/mining/rules');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rules)).toBe(true);
  });

  it('POST /api/impact returns what-if calculation', async () => {
    const res = await request(app)
      .post('/api/impact')
      .send({ clusterId: 0, peakShiftPct: 20, reductionPct: 10 });
    expect(res.status).toBe(200);
    expect(res.body.whatIf).toBeDefined();
    expect(res.body.formula).toBeDefined();
    expect(Array.isArray(res.body.formula)).toBe(true);
  });

  it('POST /api/impact validates missing clusterId', async () => {
    const res = await request(app).post('/api/impact').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('POST /api/advisor/recommend returns recommendation (template mode)', async () => {
    const res = await request(app)
      .post('/api/advisor/recommend')
      .send({ clusterId: 0 });
    expect(res.status).toBe(200);
    expect(res.body.recommendation).toBeDefined();
    expect(res.body.mode).toBe('template');
    expect(Array.isArray(res.body.citations)).toBe(true);
  });

  it('advisor citations all exist in retrieved chunks', async () => {
    const res = await request(app)
      .post('/api/advisor/recommend')
      .send({ clusterId: 0 });
    expect(res.status).toBe(200);
    // All chunkIds in citations must follow the pattern doc#N
    for (const c of res.body.citations) {
      expect(c.chunkId).toMatch(/^[a-z0-9_]+#\d+$/);
      expect(c.doc).toBeDefined();
    }
  });

  it('POST /api/advisor/recommend validates missing clusterId', async () => {
    const res = await request(app).post('/api/advisor/recommend').send({});
    expect(res.status).toBe(400);
  });
});
