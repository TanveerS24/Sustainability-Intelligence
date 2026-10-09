/**
 * RAG Advisor — recommendation generator.
 * Template mode (local, always available) + LLM mode (if ANTHROPIC_API_KEY set).
 * Input: cluster + optional rule. Output: recommendation with citations.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import cfg from '../config.js';
import { loadKnowledgeBase } from './chunker.js';
import { BM25Retriever } from './retriever.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_DIR = path.resolve(__dirname, '../../knowledge');

let _retriever = null;
let _chunks = null;

function getRetriever() {
  if (!_retriever) {
    _chunks = loadKnowledgeBase(KNOWLEDGE_DIR);
    _retriever = new BM25Retriever(_chunks);
  }
  return _retriever;
}

/**
 * Build a query string from mining evidence.
 */
function buildQuery(cluster, rule) {
  const parts = [cluster.name || ''];
  if (rule) {
    parts.push(rule.antecedent, rule.consequent);
  }
  // Add keywords from cluster name
  if (cluster.name?.toLowerCase().includes('peak')) parts.push('peak shifting');
  if (cluster.name?.toLowerCase().includes('night')) parts.push('standby power overnight');
  if (rule?.antecedent?.includes('temp:cold')) parts.push('heating efficiency');
  if (rule?.antecedent?.includes('season:winter')) parts.push('heating efficiency');
  if (rule?.antecedent?.includes('tariff:tou')) parts.push('time of use tariff');
  parts.push('electricity consumption reduction');
  return parts.join(' ');
}

/**
 * Template-based recommendation generator.
 * Composes recommendation from retrieved chunks with citations.
 */
function templateRecommend(cluster, rule, retrieved) {
  const usageLevel = rule?.consequent?.replace('usage:', '') || 'moderate';
  const clusterName = cluster.name || 'your cluster';

  let rec = `**Recommendations for ${clusterName} households:**\n\n`;

  if (rule) {
    rec += `**Pattern identified**: ${rule.explanation}\n\n`;
  }

  rec += `Based on the evidence for households with ${usageLevel} consumption:\n\n`;

  for (const { chunk } of retrieved) {
    // Extract 1-2 most relevant sentences from chunk text
    const sentences = chunk.text
      .split(/(?<=[.!?])\s+/)
      .filter(s => s.length > 30 && !s.startsWith('#'));
    const excerpt = sentences.slice(0, 2).join(' ');
    if (excerpt) {
      rec += `- ${excerpt} *(${chunk.chunkId})*\n`;
    }
  }

  rec += '\n**Sustainability note**: These actions contribute to SDG 7 (clean energy), ';
  rec += 'SDG 12 (responsible consumption), and SDG 13 (climate action).';

  return rec;
}

/**
 * LLM-based recommendation using Anthropic Claude.
 * Validates that all cited chunk IDs exist in the retrieved set.
 */
async function llmRecommend(cluster, rule, retrieved) {
  const { Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: cfg.ANTHROPIC_API_KEY });

  const chunkContext = retrieved.map(({ chunk }) =>
    `[${chunk.chunkId}] ${chunk.heading}\n${chunk.text.substring(0, 400)}`
  ).join('\n\n---\n\n');

  const evidence = rule
    ? `Cluster: ${cluster.name}. Rule: ${rule.explanation}`
    : `Cluster: ${cluster.name}. Size: ${cluster.size} households.`;

  const prompt = `You are an energy efficiency advisor. Use ONLY the retrieved knowledge chunks below to generate a recommendation.
Cite chunks using [chunkId] notation. Do not invent facts not present in the chunks.

EVIDENCE:
${evidence}

RETRIEVED KNOWLEDGE:
${chunkContext}

Write a 3-5 sentence actionable recommendation with citations. List only chunk IDs that you actually quote.`;

  const msg = await client.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = msg.content[0]?.text || '';

  // Validate cited IDs exist in retrieved set
  const retrievedIds = new Set(retrieved.map(r => r.chunk.chunkId));
  const cited = [...text.matchAll(/\[([^\]]+)\]/g)].map(m => m[1]);
  const invalidCitations = cited.filter(id => !retrievedIds.has(id));
  if (invalidCitations.length > 0) {
    throw new Error(`LLM cited non-retrieved chunks: ${invalidCitations.join(', ')}`);
  }

  return text;
}

/**
 * Main advisor entry point.
 */
export async function generateRecommendation(cluster, rule = null) {
  const retriever = getRetriever();
  const query = buildQuery(cluster, rule);
  const retrieved = retriever.retrieve(query, cfg.RAG_TOP_K);

  const evidence = {
    cluster: { id: cluster.cluster_id, name: cluster.name, size: cluster.size },
    rule: rule ? {
      antecedent: rule.antecedent,
      consequent: rule.consequent,
      support: rule.support,
      confidence: rule.confidence,
      lift: rule.lift,
    } : null,
  };

  const citations = retrieved.map(({ chunk }) => ({
    doc: chunk.doc,
    chunkId: chunk.chunkId,
    text: chunk.text.substring(0, 200) + (chunk.text.length > 200 ? '...' : ''),
  }));

  let recommendation;
  let mode;

  if (cfg.ANTHROPIC_API_KEY) {
    recommendation = await llmRecommend(cluster, rule, retrieved);
    mode = 'llm';
  } else {
    recommendation = templateRecommend(cluster, rule, retrieved);
    mode = 'template';
  }

  return { recommendation, evidence, citations, mode };
}
