import { Router } from 'express';
import { isRealDataPresent, runPipeline } from '../etl/pipeline.js';
import { getDb } from '../db/schema.js';

const router = Router();

// In-memory job state for async pipeline run
let currentJob = null;

router.post('/run', async (req, res) => {
  if (currentJob && currentJob.status === 'running') {
    return res.json({ jobId: currentJob.id, status: 'running' });
  }
  const jobId = Date.now().toString();
  currentJob = { id: jobId, status: 'running', startedAt: new Date().toISOString() };

  // Run async
  runPipeline()
    .then(result => {
      currentJob.status = 'done';
      currentJob.result = result;
      currentJob.finishedAt = new Date().toISOString();
    })
    .catch(err => {
      currentJob.status = 'error';
      currentJob.error = err.message;
      currentJob.finishedAt = new Date().toISOString();
    });

  res.json({ jobId, status: 'running' });
});

router.get('/status', (req, res) => {
  const db = getDb();
  const lastRun = db.prepare(
    'SELECT * FROM pipeline_runs ORDER BY id DESC LIMIT 1'
  ).get();
  res.json({
    job: currentJob,
    lastRun: lastRun || null,
    demoMode: !isRealDataPresent(),
  });
});

export default router;
