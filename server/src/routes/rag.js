/**
 * RAG API Router.
 * Endpoints for semantic sustainability querying, dataset ingestion,
 * system status, and dataset discovery source reporting.
 */
import { Router } from 'express';
import { executeRagQuery, ingestAllKnowledge, getVectorStore, getEmbedder, getLlmClient } from '../rag/ragPipeline.js';
import { generateIngestionReport } from '../rag/datasetDiscovery.js';
import cfg from '../config.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_DIR = path.resolve(__dirname, '../../knowledge');

const router = Router();
let ingestionState = { status: 'idle', lastRun: null, error: null };

/**
 * POST /api/rag/query
 * Body: { query, topK?, filter?, clusterId? }
 */
router.post('/query', async (req, res) => {
  const { query, topK, filter, clusterId } = req.body || {};

  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({
      error: { code: 'INVALID_QUERY', message: 'A non-empty "query" string is required.' },
    });
  }

  try {
    const result = await executeRagQuery(query.trim(), {
      topK: topK ? parseInt(topK, 10) : cfg.RAG_TOP_K,
      filter: filter || {},
      clusterId,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: { code: 'RAG_QUERY_ERROR', message: err.message },
    });
  }
});

/**
 * POST /api/rag/ingest
 * Start or update dataset and knowledge base ingestion and indexing.
 */
router.post('/ingest', async (req, res) => {
  if (ingestionState.status === 'running') {
    return res.status(409).json({
      message: 'Ingestion is already currently running.',
      state: ingestionState,
    });
  }

  const { force = false } = req.body || {};
  ingestionState = { status: 'running', startedAt: new Date().toISOString() };

  // Trigger asynchronously
  ingestAllKnowledge({ force })
    .then((result) => {
      ingestionState = {
        status: 'done',
        startedAt: ingestionState.startedAt,
        finishedAt: new Date().toISOString(),
        result,
      };
    })
    .catch((err) => {
      ingestionState = {
        status: 'error',
        startedAt: ingestionState.startedAt,
        finishedAt: new Date().toISOString(),
        error: err.message,
      };
    });

  res.json({
    message: 'Dataset discovery, chunking, and embedding ingestion initiated.',
    status: 'running',
  });
});

/**
 * GET /api/rag/status
 * Returns indexing progress, model availability, and vector database status.
 */
router.get('/status', async (req, res) => {
  const store = getVectorStore();
  const embedder = getEmbedder();
  const llm = getLlmClient();

  const [embedPing, llmPing] = await Promise.all([
    embedder.ping().catch((e) => ({ ok: false, error: e.message })),
    llm.ping().catch((e) => ({ ok: false, error: e.message })),
  ]);

  res.json({
    vectorStore: {
      totalDocuments: store.count(),
      databasePath: cfg.VECTOR_DB_PATH,
    },
    embeddingModel: {
      name: cfg.OLLAMA_EMBED_MODEL,
      expectedDim: 768,
      status: embedPing,
    },
    generationModel: {
      name: cfg.OLLAMA_LLM_MODEL,
      status: llmPing,
    },
    ollamaEndpoint: cfg.OLLAMA_BASE_URL,
    ingestionJob: ingestionState,
  });
});

/**
 * GET /api/rag/sources
 * List indexed datasets and document sources.
 */
router.get('/sources', (req, res) => {
  try {
    const store = getVectorStore();
    const sources = store.listSources();
    res.json({
      sources,
      totalSources: sources.length,
      totalChunks: store.count(),
    });
  } catch (err) {
    res.status(500).json({ error: { code: 'SOURCES_ERROR', message: err.message } });
  }
});

/**
 * GET /api/rag/report
 * Detailed schema analysis, columns, types, quality and domain profiling.
 */
router.get('/report', async (req, res) => {
  try {
    const report = await generateIngestionReport(cfg.DATASET_DIR, KNOWLEDGE_DIR);
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: { code: 'REPORT_ERROR', message: err.message } });
  }
});

export default router;
