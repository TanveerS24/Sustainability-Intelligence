/**
 * check-lines.js — fails if any tracked file exceeds 400 lines.
 * Scans the directory containing this script, ignoring node_modules, dist, data, lock files.
 * Run as: node scripts/check-lines.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const IGNORE_DIRS = new Set(['node_modules', 'dist', 'data', '.git', 'coverage', 'scripts']);
const IGNORE_EXTS = new Set(['.lock', '.log', '.db', '.sqlite']);
const IGNORE_FILES = new Set(['package-lock.json', 'yarn.lock']);
const MAX_LINES = 400;

function* walkDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) yield* walkDir(path.join(dir, entry.name));
    } else if (entry.isFile()) {
      const full = path.join(dir, entry.name);
      const ext = path.extname(entry.name);
      if (!IGNORE_FILES.has(entry.name) && !IGNORE_EXTS.has(ext)) yield full;
    }
  }
}

function countLines(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content.split('\n').length;
}

let violations = 0;
const all = [];

for (const file of walkDir(ROOT)) {
  const lines = countLines(file);
  const rel = path.relative(ROOT, file);
  all.push({ rel, lines });
  if (lines > MAX_LINES) {
    console.error(`LINE LIMIT EXCEEDED: ${rel} has ${lines} lines (max ${MAX_LINES})`);
    violations++;
  }
}

// Print top 15 longest files
const sorted = all.sort((a, b) => b.lines - a.lines).slice(0, 15);
console.log('\n=== Top 15 longest files ===');
for (const { rel, lines } of sorted) {
  const flag = lines > MAX_LINES ? ' *** VIOLATION ***' : '';
  console.log(`  ${lines.toString().padStart(4)} lines  ${rel}${flag}`);
}

if (violations > 0) {
  console.error(`\n${violations} file(s) exceed ${MAX_LINES} lines. Fix before committing.`);
  process.exit(1);
} else {
  console.log(`\nAll files within ${MAX_LINES} line limit.`);
}
