import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cfg from './config.js';
import { initDb } from './db/schema.js';
import pipelineRouter from './routes/pipeline.js';
import olapRouter from './routes/olap.js';
import miningRouter from './routes/mining.js';
import impactRouter from './routes/impact.js';
import advisorRouter from './routes/advisor.js';

const app = express();

// CORS restricted to client origin
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://client:80',
];
app.use(cors({
  origin: (origin, cb) => {
    // Allow no-origin (curl, Postman) and listed origins
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) cb(null, true);
    else cb(new Error('CORS not allowed'));
  },
}));

app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/pipeline', pipelineRouter);
app.use('/api/olap', olapRouter);
app.use('/api/mining', miningRouter);
app.use('/api/impact', impactRouter);
app.use('/api/advisor', advisorRouter);

// Consistent error format — no stack traces in response
app.use((err, req, res, _next) => {
  const status = err.status || 500;
  res.status(status).json({
    error: { code: err.code || 'INTERNAL_ERROR', message: err.message || 'An error occurred' }
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Route not found: ${req.path}` } });
});

export default app;

export function startServer() {
  initDb();
  app.listen(cfg.PORT, () => {
    console.log(`[Server] Listening on port ${cfg.PORT}`);
  });
}
