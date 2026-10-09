/**
 * check-lines.js — fails if any tracked file exceeds 400 lines.
 * Scans the client directory, ignoring node_modules, dist, lock files.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MAX_LINES = 400;

const IGNORE_DIRS = new Set(['node_modules', 'dist', '.git']);
const IGNORE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.svg', '.ico', '.woff', '.woff2']);
const IGNORE_FILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']);

function getFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getFiles(full));
    } else if (entry.isFile()) {
      if (IGNORE_FILES.has(entry.name)) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (IGNORE_EXTS.has(ext)) continue;
      files.push(full);
    }
  }
  return files;
}

const files = getFiles(ROOT);
const violations = [];
const stats = [];

for (const file of files) {
  const rel = path.relative(ROOT, file);
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n').length;
  stats.push({ rel, lines });
  if (lines > MAX_LINES) {
    violations.push({ rel, lines });
  }
}

stats.sort((a, b) => b.lines - a.lines);
console.log('\n=== Top 15 longest client files ===');
for (const s of stats.slice(0, 15)) {
  console.log(`  ${String(s.lines).padStart(4)} lines  ${s.rel}`);
}
console.log();

if (violations.length > 0) {
  console.error(`\x1b[31mError: ${violations.length} file(s) exceed ${MAX_LINES} lines limit:\x1b[0m`);
  for (const v of violations) {
    console.error(`  ${v.rel}: ${v.lines} lines`);
  }
  process.exit(1);
} else {
  console.log(`\x1b[32mAll client files within ${MAX_LINES} line limit.\x1b[0m\n`);
}
