/**
 * Document chunker — splits markdown files by heading into chunks.
 * Each chunk: { doc, chunkId, heading, text, tokens: string[] }
 */
import fs from 'fs';
import path from 'path';

/**
 * Tokenise text for BM25: lowercase, split on non-word chars, remove stopwords.
 */
const STOPWORDS = new Set(['the','a','an','and','or','of','in','to','for','is','are',
  'was','were','be','been','by','as','at','on','with','this','that','it','its','from']);

export function tokenise(text) {
  return text.toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Chunk a markdown file by heading (## or ###).
 */
export function chunkMarkdown(filePath, docName) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const chunks = [];
  let currentHeading = docName;
  let currentLines = [];
  let chunkIdx = 0;

  function flush() {
    const text = currentLines.join('\n').trim();
    if (text.length > 20) {
      chunks.push({
        doc: docName,
        chunkId: `${docName}#${chunkIdx}`,
        heading: currentHeading,
        text,
        tokens: tokenise(text),
      });
      chunkIdx++;
    }
    currentLines = [];
  }

  for (const line of lines) {
    if (/^#{1,3}\s/.test(line)) {
      flush();
      currentHeading = line.replace(/^#{1,3}\s+/, '').trim();
    }
    currentLines.push(line);
  }
  flush();

  return chunks;
}

/**
 * Load all markdown files from a directory and return all chunks.
 */
export function loadKnowledgeBase(knowledgeDir) {
  if (!fs.existsSync(knowledgeDir)) return [];
  const files = fs.readdirSync(knowledgeDir)
    .filter(f => f.endsWith('.md'))
    .sort();

  const allChunks = [];
  for (const file of files) {
    const docName = path.basename(file, '.md');
    const filePath = path.join(knowledgeDir, file);
    allChunks.push(...chunkMarkdown(filePath, docName));
  }
  return allChunks;
}
