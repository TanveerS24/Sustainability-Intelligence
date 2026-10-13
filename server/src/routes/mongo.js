/**
 * MongoDB Management API Router.
 * Endpoints for checking MongoDB container status and triggering dataset population.
 */
import { Router } from 'express';
import { pingMongo } from '../db/mongo.js';
import { populateMongoFromDataset } from '../etl/mongoIngest.js';

const router = Router();
let mongoJob = { status: 'idle', lastRun: null, error: null };

router.get('/status', async (req, res) => {
  const ping = await pingMongo();
  res.json({
    mongo: ping,
    job: mongoJob,
  });
});

router.post('/populate', async (req, res) => {
  if (mongoJob.status === 'running') {
    return res.status(409).json({ message: 'MongoDB population job is already running.', job: mongoJob });
  }

  const { maxBlocks = 6 } = req.body || {};
  mongoJob = { status: 'running', startedAt: new Date().toISOString() };

  populateMongoFromDataset({ maxBlocks: parseInt(maxBlocks, 10) })
    .then((result) => {
      mongoJob = {
        status: 'done',
        startedAt: mongoJob.startedAt,
        finishedAt: new Date().toISOString(),
        result,
      };
    })
    .catch((err) => {
      mongoJob = {
        status: 'error',
        startedAt: mongoJob.startedAt,
        finishedAt: new Date().toISOString(),
        error: err.message,
      };
    });

  res.json({ message: 'MongoDB population started.', status: 'running' });
});

export default router;
