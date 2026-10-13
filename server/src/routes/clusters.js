/**
 * Clusters API Router.
 * Provides cluster profiles, summary statistics, and cluster-level
 * energy-saving recommendations supported by retrieved evidence.
 */
import { Router } from 'express';
import { getDb } from '../db/schema.js';
import { generateRecommendation } from '../rag/advisor.js';

const router = Router();

/**
 * GET /api/clusters
 * Return cluster profiles and summary statistics.
 */
router.get('/', (req, res) => {
  const db = getDb();
  const lastRun = db.prepare(
    'SELECT id, best_k, best_silhouette, outlier_count, finished_at FROM mining_runs WHERE status=? ORDER BY id DESC LIMIT 1'
  ).get('done');

  if (!lastRun) {
    return res.json({ clusters: [], evaluation: null, message: 'No completed mining run found' });
  }

  const clusters = db.prepare(
    'SELECT * FROM clusters WHERE mining_run_id=? ORDER BY cluster_id'
  ).all(lastRun.id);

  const enriched = clusters.map((cl) => {
    const profile = db.prepare(`
      SELECT t.hour, ROUND(AVG(f.kwh), 4) AS avg_kwh
      FROM fact_consumption f
      JOIN cluster_assignments ca ON ca.household_key = f.household_key
      JOIN dim_time t ON t.hour_key = f.hour_key
      WHERE ca.cluster_id = ? AND ca.mining_run_id = ?
      GROUP BY t.hour ORDER BY t.hour
    `).all(cl.cluster_id, lastRun.id);

    // Consumption stats
    const stats = db.prepare(`
      SELECT ROUND(SUM(f.kwh), 2) AS total_kwh,
             ROUND(AVG(f.kwh), 4) AS mean_hourly_kwh,
             ROUND(SUM(f.co2_kg), 2) AS total_co2_kg,
             ROUND(SUM(CASE WHEN f.is_peak = 1 THEN f.kwh ELSE 0 END), 2) AS peak_kwh
      FROM fact_consumption f
      JOIN cluster_assignments ca ON ca.household_key = f.household_key
      WHERE ca.cluster_id = ? AND ca.mining_run_id = ?
    `).get(cl.cluster_id, lastRun.id);

    return {
      ...cl,
      centroid: JSON.parse(cl.centroid || '[]'),
      loadProfile: profile,
      metrics: stats,
    };
  });

  res.json({
    miningRunId: lastRun.id,
    evaluation: {
      bestK: lastRun.best_k,
      silhouetteScore: lastRun.best_silhouette,
      outlierCount: lastRun.outlier_count,
      completedAt: lastRun.finished_at,
    },
    clusters: enriched,
  });
});

/**
 * GET /api/clusters/:id
 * Return details of an individual cluster with evidence-backed recommendations.
 */
router.get('/:id', async (req, res) => {
  const clusterId = parseInt(req.params.id, 10);
  if (Number.isNaN(clusterId)) {
    return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Cluster ID must be an integer' } });
  }

  const db = getDb();
  const lastRun = db.prepare(
    'SELECT id FROM mining_runs WHERE status=? ORDER BY id DESC LIMIT 1'
  ).get('done');

  if (!lastRun) {
    return res.status(404).json({ error: { code: 'NO_MINING', message: 'No mining run completed yet' } });
  }

  const cluster = db.prepare(
    'SELECT * FROM clusters WHERE cluster_id=? AND mining_run_id=?'
  ).get(clusterId, lastRun.id);

  if (!cluster) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Cluster ${clusterId} not found` } });
  }

  const profile = db.prepare(`
    SELECT t.hour, ROUND(AVG(f.kwh), 4) AS avg_kwh
    FROM fact_consumption f
    JOIN cluster_assignments ca ON ca.household_key = f.household_key
    JOIN dim_time t ON t.hour_key = f.hour_key
    WHERE ca.cluster_id = ? AND ca.mining_run_id = ?
    GROUP BY t.hour ORDER BY t.hour
  `).all(clusterId, lastRun.id);

  const rules = db.prepare(`
    SELECT * FROM rules WHERE cluster_id=? AND mining_run_id=? ORDER BY lift DESC
  `).all(clusterId, lastRun.id);

  let recommendation = null;
  try {
    const topRule = rules.length > 0 ? rules[0] : null;
    recommendation = await generateRecommendation(cluster, topRule);
  } catch (err) {
    recommendation = { error: err.message };
  }

  res.json({
    ...cluster,
    centroid: JSON.parse(cluster.centroid || '[]'),
    loadProfile: profile,
    rules,
    recommendation,
  });
});

export default router;
