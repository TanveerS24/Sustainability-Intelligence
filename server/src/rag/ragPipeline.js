/**
 * Local RAG Pipeline Orchestrator.
 * Connects Intelligent Chunking, OllamaEmbedder, Persistent VectorStore,
 * K-Means Analytical Context, and Qwen3:14B Generation into an integrated pipeline.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import cfg from '../config.js';
import { OllamaEmbedder } from './ollamaEmbedder.js';
import { OllamaClient } from './ollamaClient.js';
import { VectorStore } from './vectorStore.js';
import {
  chunkMarkdownFile,
  chunkHtmlFile,
  chunkAcornDetails,
  chunkHouseholdInfo,
  chunkWeatherDataset,
  chunkBankHolidays,
} from './intelligentChunker.js';
import { discoverFiles } from './datasetDiscovery.js';
import { getDb } from '../db/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_DIR = path.resolve(__dirname, '../../knowledge');

let _vectorStore = null;
let _embedder = null;
let _llm = null;

export function getVectorStore() {
  if (!_vectorStore) _vectorStore = new VectorStore();
  return _vectorStore;
}

export function getEmbedder() {
  if (!_embedder) _embedder = new OllamaEmbedder();
  return _embedder;
}

export function getLlmClient() {
  if (!_llm) _llm = new OllamaClient();
  return _llm;
}

/**
 * Ingest and index all datasets and knowledge documents into the persistent vector store.
 */
export async function ingestAllKnowledge(options = {}) {
  const { onProgress = null, force = false } = options;
  const store = getVectorStore();
  const embedder = getEmbedder();
  const startedAt = Date.now();

  const allChunks = [];

  // 1. Ingest Knowledge Markdown files
  const mdFiles = discoverFiles(KNOWLEDGE_DIR).filter((f) => f.endsWith('.md'));
  for (const f of mdFiles) {
    allChunks.push(...chunkMarkdownFile(f, 'sustainability-guidance'));
  }

  // 2. Ingest Dataset files
  const datasetDir = cfg.DATASET_DIR;
  const acornPath = path.join(datasetDir, 'acorn_details.csv');
  const hhPath = path.join(datasetDir, 'informations_households.csv');
  const wHourly = path.join(datasetDir, 'weather_hourly_darksky.csv');
  const wDaily = path.join(datasetDir, 'weather_daily_darksky.csv');
  const holPath = path.join(datasetDir, 'uk_bank_holidays.csv');
  const htmlPath = path.join(datasetDir, 'darksky_parameters_documentation.html');

  allChunks.push(...chunkAcornDetails(acornPath));
  allChunks.push(...chunkHouseholdInfo(hhPath));
  allChunks.push(...chunkWeatherDataset(wDaily, wHourly));
  allChunks.push(...chunkBankHolidays(holPath));
  if (path.resolve(htmlPath)) allChunks.push(...chunkHtmlFile(htmlPath));

  // Differential check against existing hashes
  const existingHashes = force ? new Set() : store.getAllHashes();
  const toEmbed = allChunks.filter((c) => !existingHashes.has(c.hash));
  const skippedCount = allChunks.length - toEmbed.length;

  if (toEmbed.length > 0) {
    const texts = toEmbed.map((c) => `${c.heading}\n${c.text}`);
    const embeddings = await embedder.embedBatch(
      texts,
      (done, total) => {
        if (onProgress) onProgress(done, total, `Embedding ${done}/${total} chunks`);
      },
      3
    );

    const validDocs = [];
    toEmbed.forEach((chunk, i) => {
      if (embeddings[i]) {
        validDocs.push({
          ...chunk,
          embedding: embeddings[i],
        });
      }
    });

    store.upsertBatch(validDocs);
  }

  return {
    totalChunksEvaluated: allChunks.length,
    newlyIndexed: toEmbed.length,
    skippedUnchanged: skippedCount,
    durationMs: Date.now() - startedAt,
    vectorStoreCount: store.count(),
  };
}

/**
 * Retrieve relevant cluster evidence from SQLite DB to complement semantic retrieval.
 */
function getClusterEvidence(clusterId) {
  try {
    const db = getDb();
    const lastRun = db.prepare(
      'SELECT id FROM mining_runs WHERE status = ? ORDER BY id DESC LIMIT 1'
    ).get('done');
    if (!lastRun) return null;

    let cluster;
    if (clusterId !== undefined && clusterId !== null) {
      cluster = db.prepare(
        'SELECT * FROM clusters WHERE cluster_id = ? AND mining_run_id = ?'
      ).get(parseInt(clusterId, 10), lastRun.id);
    } else {
      cluster = db.prepare(
        'SELECT * FROM clusters WHERE mining_run_id = ? ORDER BY size DESC LIMIT 1'
      ).get(lastRun.id);
    }

    if (!cluster) return null;

    const rules = db.prepare(
      'SELECT antecedent, consequent, lift, explanation FROM rules WHERE cluster_id = ? AND mining_run_id = ? LIMIT 3'
    ).all(cluster.cluster_id, lastRun.id);

    return {
      clusterId: cluster.cluster_id,
      name: cluster.name,
      householdCount: cluster.size,
      rules,
    };
  } catch (err) {
    return null;
  }
}

/**
 * Build structured system prompt and context for Qwen3:14B.
 */
function buildGroundedPrompt(query, retrievedChunks, clusterContext = null) {
  const contextSections = retrievedChunks.map((r, i) => {
    return `[Evidence #${i + 1} | ChunkID: ${r.chunkId} | Source: ${r.doc} | Category: ${r.category}]\n` +
      `Heading: ${r.heading}\n` +
      `${r.text}\n`;
  }).join('\n---\n\n');

  let clusterSection = '';
  if (clusterContext) {
    clusterSection = `\nMEASURED ANALYTICAL CLUSTER CONTEXT:\n` +
      `- Active Household Cluster: ${clusterContext.name} (Cluster ID: ${clusterContext.clusterId})\n` +
      `- Households in Cluster: ${clusterContext.householdCount}\n` +
      (clusterContext.rules.length > 0
        ? `- Discovered Consumption Behaviors:\n` +
          clusterContext.rules.map((r) => `  * When ${r.antecedent} → ${r.consequent} (Lift ${r.lift?.toFixed(2)}x): ${r.explanation}`).join('\n')
        : '') +
      `\n`;
  }

  const prompt = `You are a Sustainability Intelligence Decision Support Advisor for energy planning and carbon management.
Your purpose is to deliver accurate, grounded recommendations and insights based STRICTLY on the evidence provided below.

RETRIEVED KNOWLEDGE EVIDENCE:
${contextSections || 'No directly matching knowledge chunks were found.'}
${clusterSection}
USER QUESTION:
${query}

STRICT INSTRUCTIONS:
1. Grounding: Rely ONLY on facts, parameters, and numbers present in the retrieved evidence and cluster context.
2. Citations: You MUST cite your sources using bracketed chunk IDs (e.g., [chunkId] or [Source]) whenever making specific statements or numerical claims.
3. Insufficient Evidence: If the retrieved evidence does not contain sufficient details to address any aspect of the question, explicitly state: "The available dataset and evidence do not provide sufficient information to verify [specific item]." Do not guess or invent data.
4. Distinctions: Clearly distinguish between measured historical readings, statistical cluster profiles, calculated emissions metrics, and hypothetical what-if scenarios.
5. SDG Alignment: Explicitly reference applicable UN Sustainable Development Goals (SDG 7: Clean Energy, SDG 11: Sustainable Cities, SDG 12: Responsible Consumption, SDG 13: Climate Action) when discussing relevant impacts.
6. Actionable Advice: Provide clear, practical energy conservation or demand flexibility recommendations.

Provide a comprehensive, professional response:`;

  return prompt;
}

/**
 * Execute full RAG Query:
 * User Query → Embedding → Retrieval → Context Assembly → Qwen3:14B Generation.
 */
export async function executeRagQuery(query, options = {}) {
  const { topK = cfg.RAG_TOP_K, filter = {}, clusterId = null } = options;
  const store = getVectorStore();
  const embedder = getEmbedder();
  const llm = getLlmClient();

  // If vector store is empty, attempt initial indexing
  if (store.count() === 0) {
    console.log('[RAG] Vector store is empty — running initial indexing...');
    await ingestAllKnowledge();
  }

  // 1. Generate Query Embedding
  const queryEmbedding = await embedder.embedText(query);

  // 2. Similarity Retrieval with optional metadata filters
  const retrieved = store.similaritySearch(queryEmbedding, topK, filter);

  // 3. Cluster Context
  const clusterContext = getClusterEvidence(clusterId);

  // 4. Construct Prompt
  const prompt = buildGroundedPrompt(query, retrieved, clusterContext);

  // 5. Query Qwen3:14B
  let responseText = '';
  let modelUsed = cfg.OLLAMA_LLM_MODEL;
  let generationMode = 'local-qwen3';

  try {
    const genResult = await llm.generate(prompt, {
      temperature: 0.2,
      maxTokens: 1200,
      systemPrompt: 'You are an evidence-grounded sustainability energy advisor. Never hallucinate facts.',
    });
    responseText = genResult.text;
    modelUsed = genResult.model;
  } catch (err) {
    console.warn(`[RAG] Local Ollama generation failed (${err.message}). Falling back to grounded template summary.`);
    generationMode = 'template-fallback';
    responseText = buildFallbackResponse(query, retrieved, clusterContext);
  }

  // Citations extraction
  const retrievedIds = new Set(retrieved.map((r) => r.chunkId));
  const citedInText = [...responseText.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
  const validCitations = citedInText.filter((id) => retrievedIds.has(id));

  return {
    query,
    answer: responseText,
    mode: generationMode,
    model: modelUsed,
    retrievedCount: retrieved.length,
    retrievedEvidence: retrieved.map((r) => ({
      chunkId: r.chunkId,
      doc: r.doc,
      heading: r.heading,
      category: r.category,
      score: Number(r.score.toFixed(4)),
      textExcerpt: r.text.length > 250 ? r.text.substring(0, 250) + '...' : r.text,
    })),
    clusterEvidence: clusterContext,
    citations: validCitations,
  };
}

function buildFallbackResponse(query, retrieved, clusterContext) {
  let text = `Based on the retrieved sustainability evidence for "${query}":\n\n`;
  for (const r of retrieved) {
    text += `- **${r.heading}** (${r.chunkId}): ${r.text.substring(0, 220)}...\n\n`;
  }
  if (clusterContext) {
    text += `Measured cluster evidence for ${clusterContext.name} (${clusterContext.householdCount} households) indicates that peak load management directly supports SDG 7 and SDG 13.\n`;
  }
  return text;
}
