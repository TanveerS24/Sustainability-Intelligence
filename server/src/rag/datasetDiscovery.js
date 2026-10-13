/**
 * Dataset Discovery & Ingestion Profiler.
 * Automatically discovers supported dataset files, infers schemas,
 * profiles data quality (missing, duplicates, column types),
 * and categorizes them into sustainability domains.
 */
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse';

export const DOMAIN_CATEGORIES = {
  TELEMETRY: 'smart-meter-telemetry',
  HOUSEHOLDS: 'household-profiles',
  WEATHER: 'weather-telemetry',
  HOLIDAYS: 'calendar-holidays',
  DOCUMENTATION: 'documentation-specs',
  GUIDANCE: 'sustainability-guidance',
  UNKNOWN: 'other',
};

/**
 * Categorize a file based on its name and path.
 */
export function categorizeFile(relPath) {
  const norm = relPath.toLowerCase().replace(/\\/g, '/');
  if (norm.includes('hhblock') || norm.includes('halfhourly') || norm.includes('daily_dataset')) {
    return DOMAIN_CATEGORIES.TELEMETRY;
  }
  if (norm.includes('information') || norm.includes('acorn')) {
    return DOMAIN_CATEGORIES.HOUSEHOLDS;
  }
  if (norm.includes('weather')) {
    return DOMAIN_CATEGORIES.WEATHER;
  }
  if (norm.includes('holiday')) {
    return DOMAIN_CATEGORIES.HOLIDAYS;
  }
  if (norm.includes('darksky_parameters') || norm.endsWith('.html')) {
    return DOMAIN_CATEGORIES.DOCUMENTATION;
  }
  if (norm.endsWith('.md')) {
    return DOMAIN_CATEGORIES.GUIDANCE;
  }
  return DOMAIN_CATEGORIES.UNKNOWN;
}

/**
 * Recursively discover all supported files in a directory.
 * Breadth-first: processes current directory entries first.
 */
export function discoverFiles(dirPath, maxFiles = 200) {
  if (!fs.existsSync(dirPath)) return [];
  const files = [];
  const dirs = [dirPath];

  while (dirs.length > 0 && files.length < maxFiles) {
    const current = dirs.shift();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    // Collect files first
    for (const entry of entries) {
      if (files.length >= maxFiles) break;
      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.csv', '.html', '.md', '.json', '.txt'].includes(ext)) {
          files.push(path.join(current, entry.name));
        }
      }
    }

    // Then queue subdirectories
    for (const entry of entries) {
      if (entry.isDirectory()) {
        dirs.push(path.join(current, entry.name));
      }
    }
  }

  return files;
}

/**
 * Profile a CSV file (streaming sample up to sampleRows).
 */
export async function profileCsvFile(filePath, sampleLimit = 500) {
  return new Promise((resolve) => {
    let rowCount = 0;
    let headers = [];
    const missingCounts = {};
    const typeInferences = {};
    const seenHashes = new Set();
    let duplicates = 0;

    const parser = parse({
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    });

    const stream = fs.createReadStream(filePath);

    parser.on('data', (row) => {
      rowCount++;
      if (headers.length === 0) {
        headers = Object.keys(row);
        headers.forEach((h) => {
          missingCounts[h] = 0;
          typeInferences[h] = 'integer';
        });
      }

      if (rowCount <= sampleLimit) {
        // Fast duplicate check on row content
        const rowStr = JSON.stringify(row);
        if (seenHashes.has(rowStr)) duplicates++;
        else seenHashes.add(rowStr);

        for (const [col, val] of Object.entries(row)) {
          if (val === null || val === undefined || val === '' || val.toLowerCase() === 'null') {
            missingCounts[col] = (missingCounts[col] || 0) + 1;
            continue;
          }
          const currType = typeInferences[col];
          if (currType !== 'string') {
            const num = Number(val);
            if (Number.isNaN(num)) {
              typeInferences[col] = 'string';
            } else if (!Number.isInteger(num) && currType === 'integer') {
              typeInferences[col] = 'float';
            }
          }
        }
      }
    });

    parser.on('error', (err) => {
      resolve({
        error: err.message,
        rowCount,
        headers,
        columns: headers.length,
      });
    });

    parser.on('end', () => {
      resolve({
        rowCount,
        sampleRowsExamined: Math.min(rowCount, sampleLimit),
        columns: headers.length,
        headers,
        missingCounts,
        inferredTypes: typeInferences,
        sampleDuplicates: duplicates,
      });
    });

    stream.pipe(parser);
  });
}

/**
 * Run comprehensive discovery and profiling across datasets and knowledge documents.
 */
export async function generateIngestionReport(datasetDir, knowledgeDir) {
  const datasetFiles = discoverFiles(datasetDir);
  const knowledgeFiles = knowledgeDir ? discoverFiles(knowledgeDir) : [];
  const allFiles = [...datasetFiles, ...knowledgeFiles];

  const report = {
    generatedAt: new Date().toISOString(),
    totalFilesDiscovered: allFiles.length,
    datasetDirectory: datasetDir,
    knowledgeDirectory: knowledgeDir,
    categories: {},
    fileProfiles: [],
  };

  let blockSchemaCache = null;

  for (const filePath of allFiles) {
    const stats = fs.statSync(filePath);
    const rel = path.relative(path.dirname(datasetDir), filePath);
    const ext = path.extname(filePath).toLowerCase();
    const category = categorizeFile(rel);

    if (!report.categories[category]) {
      report.categories[category] = 0;
    }
    report.categories[category]++;

    const profile = {
      filename: path.basename(filePath),
      relativePath: rel,
      category,
      extension: ext,
      sizeBytes: stats.size,
      lastModified: stats.mtime.toISOString(),
    };

    if (ext === '.csv' && stats.size < 50 * 1024 * 1024) {
      if (/block_\d+\.csv$/i.test(filePath)) {
        if (!blockSchemaCache) {
          blockSchemaCache = await profileCsvFile(filePath, 100);
        }
        profile.schema = blockSchemaCache;
      } else {
        profile.schema = await profileCsvFile(filePath, 100);
      }
    } else if (ext === '.csv') {
      profile.schema = { note: 'Large CSV (>50MB), schema deferred to stream processing' };
    }

    report.fileProfiles.push(profile);
  }

  return report;
}
