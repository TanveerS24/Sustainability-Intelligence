import { Router } from 'express';
import { getDb } from '../db/schema.js';
import { runMining } from '../mining/miningPipeline.js';

const router = Router();
let miningJob = null;

// POST /api/mining/run
router.post('/run', async (req, res) => {
  if (miningJob && miningJob.status === 'running') {
    return res.json({ jobId: miningJob.id, status: 'running' });
  }
  const jobId = Date.now().toString();
  miningJob = { id: jobId, status: 'running', startedAt: new Date().toISOString() };

  runMining()
    .then(result => {
      miningJob.status = 'done';
      miningJob.result = result;
      miningJob.finishedAt = new Date().toISOString();
    })
    .catch(err => {
      miningJob.status = 'error';
      miningJob.error = err.message;
      miningJob.finishedAt = new Date().toISOString();
    });

  res.json({ jobId, status: 'running' });
});

// GET /api/mining/clusters
router.get('/clusters', (req, res) => {
  const db = getDb();
  const lastRun = db.prepare('SELECT id FROM mining_runs WHERE status=? ORDER BY id DESC LIMIT 1').get('done');
  if (!lastRun) return res.json({ clusters: [] });

  const clusters = db.prepare(
    'SELECT * FROM clusters WHERE mining_run_id=? ORDER BY cluster_id'
  ).all(lastRun.id);

  // Add average load profile per cluster
  const result = clusters.map(cl => {
    const profile = db.prepare(`
      SELECT t.hour, ROUND(AVG(f.kwh),4) AS avg_kwh
      FROM fact_consumption f
      JOIN cluster_assignments ca ON ca.household_key = f.household_key
      JOIN dim_time t ON t.hour_key = f.hour_key
      WHERE ca.cluster_id = ? AND ca.mining_run_id = ?
      GROUP BY t.hour ORDER BY t.hour
    `).all(cl.cluster_id, lastRun.id);

    return { ...cl, centroid: JSON.parse(cl.centroid || '[]'), loadProfile: profile };
  });

  const evaluation = db.prepare(
    'SELECT best_k, best_silhouette, outlier_count FROM mining_runs WHERE id=?'
  ).get(lastRun.id);

  res.json({ clusters: result, evaluation });
});

// GET /api/mining/outliers
router.get('/outliers', (req, res) => {
  const db = getDb();
  const lastRun = db.prepare('SELECT id FROM mining_runs WHERE status=? ORDER BY id DESC LIMIT 1').get('done');
  if (!lastRun) return res.json({ outliers: [] });

  const outliers = db.prepare(`
    SELECT o.household_key, dh.lclid, dh.tariff, dh.acorn_grouped,
           o.kmeans_cluster_id,
           c.name AS kmeans_cluster_name
    FROM outliers o
    JOIN dim_household dh ON dh.household_key = o.household_key
    LEFT JOIN clusters c ON c.cluster_id = o.kmeans_cluster_id AND c.mining_run_id = o.mining_run_id
    WHERE o.mining_run_id = ?
    ORDER BY o.household_key
  `).all(lastRun.id);

  // Cross-tab: outliers per K-Means cluster
  const crossTab = db.prepare(`
    SELECT o.kmeans_cluster_id, c.name, COUNT(*) AS outlier_count
    FROM outliers o
    LEFT JOIN clusters c ON c.cluster_id = o.kmeans_cluster_id AND c.mining_run_id = o.mining_run_id
    WHERE o.mining_run_id = ?
    GROUP BY o.kmeans_cluster_id
  `).all(lastRun.id);

  res.json({ outliers, crossTab });
});

// GET /api/mining/rules?clusterId=0
router.get('/rules', (req, res) => {
  const { clusterId } = req.query;
  const db = getDb();
  const lastRun = db.prepare('SELECT id FROM mining_runs WHERE status=? ORDER BY id DESC LIMIT 1').get('done');
  if (!lastRun) return res.json({ rules: [] });

  const params = [lastRun.id];
  let where = 'r.mining_run_id = ?';
  if (clusterId !== undefined) {
    where += ' AND r.cluster_id = ?';
    params.push(parseInt(clusterId, 10));
  }

  const rules = db.prepare(`
    SELECT r.*, c.name AS cluster_name
    FROM rules r
    JOIN clusters c ON c.cluster_id = r.cluster_id AND c.mining_run_id = r.mining_run_id
    WHERE ${where}
    ORDER BY r.lift DESC
  `).all(...params);

  res.json({ rules });
});

// GET /api/mining/evaluation
router.get('/evaluation', (req, res) => {
  const db = getDb();
  const runs = db.prepare(`
    SELECT mr.id, mr.best_k, mr.best_silhouette, mr.outlier_count, mr.finished_at
    FROM mining_runs mr WHERE mr.status = 'done' ORDER BY mr.id DESC LIMIT 5
  `).all();
  res.json({ runs });
});

export default router;
