import { Router } from 'express';
import { getDb } from '../db/schema.js';
import { generateRecommendation } from '../rag/advisor.js';

const router = Router();

/**
 * POST /api/advisor/recommend
 * Body: { clusterId, ruleId? }
 */
router.post('/recommend', async (req, res) => {
  const { clusterId, ruleId } = req.body || {};

  if (clusterId === undefined || clusterId === null) {
    return res.status(400).json({ error: { code: 'MISSING_PARAM', message: 'clusterId required' } });
  }

  const db = getDb();
  const lastRun = db.prepare('SELECT id FROM mining_runs WHERE status=? ORDER BY id DESC LIMIT 1').get('done');
  if (!lastRun) {
    return res.status(400).json({ error: { code: 'NO_MINING', message: 'Run mining first' } });
  }

  const cluster = db.prepare(
    'SELECT * FROM clusters WHERE cluster_id=? AND mining_run_id=?'
  ).get(parseInt(clusterId, 10), lastRun.id);

  if (!cluster) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Cluster not found' } });
  }

  let rule = null;
  if (ruleId !== undefined && ruleId !== null) {
    rule = db.prepare('SELECT * FROM rules WHERE id=? AND mining_run_id=?')
      .get(parseInt(ruleId, 10), lastRun.id);
    if (!rule) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rule not found' } });
    }
  }

  try {
    const result = await generateRecommendation(cluster, rule);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: { code: 'ADVISOR_ERROR', message: err.message } });
  }
});

export default router;
