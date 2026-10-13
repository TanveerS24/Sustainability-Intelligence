/**
 * Intelligent Chunking Strategy.
 * Adapts to Markdown, HTML documentation, and tabular/structured datasets.
 * Produces structured, context-rich chunks with standardized metadata and SHA-256 hashes.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { parse } from 'csv-parse/sync';

export function computeHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Chunk a Markdown file into section-aware chunks.
 */
export function chunkMarkdownFile(filePath, category = 'sustainability-guidance') {
  const content = fs.readFileSync(filePath, 'utf-8');
  const doc = path.basename(filePath, path.extname(filePath));
  const lines = content.split('\n');
  const chunks = [];
  let currentHeading = doc.replace(/_/g, ' ');
  let currentLines = [];
  let chunkIdx = 0;

  function flush() {
    const text = currentLines.join('\n').trim();
    if (text.length > 30) {
      const chunkId = `${doc}#${chunkIdx}`;
      chunks.push({
        id: chunkId,
        doc,
        chunkId,
        heading: currentHeading,
        text,
        metadata: {
          sourceFile: path.basename(filePath),
          datasetType: 'markdown-guidance',
          category,
          doc,
          heading: currentHeading,
          chunkIndex: chunkIdx,
        },
        hash: computeHash(`${doc}:${currentHeading}:${text}`),
      });
      chunkIdx++;
    }
    currentLines = [];
  }

  for (const line of lines) {
    if (/^#{1,3}\s+/.test(line)) {
      flush();
      currentHeading = line.replace(/^#{1,3}\s+/, '').trim();
    }
    currentLines.push(line);
  }
  flush();

  return chunks;
}

/**
 * Chunk an HTML documentation file (e.g., darksky_parameters_documentation.html).
 */
export function chunkHtmlFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const doc = path.basename(filePath, path.extname(filePath));
  const chunks = [];

  // Strip scripts/styles
  const clean = content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Extract h2/h3 sections or paragraph blocks
  const sections = clean.split(/<h[23][^>]*>/i);

  sections.forEach((sect, idx) => {
    let heading = `Section ${idx}`;
    let body = sect;
    const hCloseIdx = sect.indexOf('</h');
    if (hCloseIdx !== -1) {
      heading = sect.substring(0, hCloseIdx).replace(/<[^>]+>/g, '').trim();
      body = sect.substring(hCloseIdx + 5);
    }
    // Clean HTML tags from body
    const text = body
      .replace(/<tr[^>]*>/gi, '\n')
      .replace(/<\/td>\s*<td[^>]*>/gi, ' | ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (text.length > 50) {
      const chunkId = `${doc}#${idx}`;
      chunks.push({
        id: chunkId,
        doc,
        chunkId,
        heading,
        text: `Documentation: ${heading}\n${text.substring(0, 1500)}`,
        metadata: {
          sourceFile: path.basename(filePath),
          datasetType: 'html-documentation',
          category: 'documentation-specs',
          doc,
          heading,
          chunkIndex: idx,
        },
        hash: computeHash(`${doc}:${heading}:${text.substring(0, 1500)}`),
      });
    }
  });

  return chunks;
}

/**
 * Create structured domain chunks from acorn_details.csv.
 */
export function chunkAcornDetails(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const records = parse(content, { columns: true, skip_empty_lines: true, trim: true });
  const doc = 'acorn_details';
  const chunks = [];

  // Identify ACORN letter columns A through Q
  const letters = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q'];

  letters.forEach((letter) => {
    const colName = `ACORN-${letter}`;
    const attributes = [];

    for (const row of records) {
      const mainCat = row['MAIN CATEGORIES'] || '';
      const cat = row['CATEGORIES'] || '';
      const ref = row['REFERENCE'] || '';
      const score = row[colName] || '';
      if (score && score !== '0.0') {
        attributes.push(`- ${mainCat} [${cat}]: ${ref} = ${score}%`);
      }
    }

    if (attributes.length > 0) {
      const chunkId = `${doc}#group_${letter}`;
      const text = `UK ACORN Demographic Profile for Group ${letter} (ACORN-${letter}):\n` +
        `This socioeconomic profile characterizes household demographics, housing traits, and population density.\n` +
        attributes.slice(0, 30).join('\n');

      chunks.push({
        id: chunkId,
        doc,
        chunkId,
        heading: `ACORN Group ${letter} Demographic Profile`,
        text,
        metadata: {
          sourceFile: path.basename(filePath),
          datasetType: 'tabular-demographics',
          category: 'household-profiles',
          doc,
          acornGroup: letter,
          chunkIndex: letter.charCodeAt(0) - 65,
        },
        hash: computeHash(text),
      });
    }
  });

  return chunks;
}

/**
 * Create structured summary chunks from informations_households.csv.
 */
export function chunkHouseholdInfo(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const records = parse(content, { columns: true, skip_empty_lines: true, trim: true });
  const doc = 'informations_households';
  const chunks = [];

  let stdCount = 0;
  let touCount = 0;
  const acornCounts = {};

  records.forEach((r) => {
    const tariff = (r.stdorToU || r.tariff || '').trim();
    if (tariff.toLowerCase() === 'tou') touCount++;
    else stdCount++;

    const grp = (r.Acorn_grouped || r.acorn_grouped || 'Unknown').trim();
    acornCounts[grp] = (acornCounts[grp] || 0) + 1;
  });

  const total = records.length;
  const summaryText = `London Smart Meter Dataset — Household Demographic and Tariff Distribution:\n` +
    `Total Households Monitored: ${total}\n` +
    `Tariff Allocation:\n` +
    `- Standard Flat Tariff (Std): ${stdCount} households (${((stdCount / total) * 100).toFixed(1)}%)\n` +
    `- Time of Use Dynamic Tariff (ToU / Low Carbon London dynamic trial): ${touCount} households (${((touCount / total) * 100).toFixed(1)}%)\n` +
    `Socio-economic ACORN Group Distribution:\n` +
    Object.entries(acornCounts).map(([k, v]) => `- ${k}: ${v} households (${((v / total) * 100).toFixed(1)}%)`).join('\n') +
    `\nSignificance: Time-of-use tariffs encourage demand flexibility and peak shaving (SDG 7, 12, 13).`;

  chunks.push({
    id: `${doc}#tariff_distribution`,
    doc,
    chunkId: `${doc}#distribution`,
    heading: 'London Smart Meter Tariff and Demographic Breakdown',
    text: summaryText,
    metadata: {
      sourceFile: path.basename(filePath),
      datasetType: 'tabular-household-summary',
      category: 'household-profiles',
      doc,
      totalHouseholds: total,
      stdTariffCount: stdCount,
      touTariffCount: touCount,
    },
    hash: computeHash(summaryText),
  });

  return chunks;
}

/**
 * Create structured summary chunks for weather telemetry datasets.
 */
export function chunkWeatherDataset(dailyPath, hourlyPath) {
  const doc = 'darksky_weather';
  const chunks = [];

  const text = `London Weather Conditions and Climate Profile (Dark Sky Telemetry):\n` +
    `Dataset contains hourly and daily meteorological observations recorded across Greater London from 2011 to 2014.\n` +
    `Key Parameters Monitored:\n` +
    `- Ambient Temperature (°C) and Apparent/Perceived Temperature (°C)\n` +
    `- Dew Point (°C) and Relative Humidity (0.0 to 1.0)\n` +
    `- Atmospheric Pressure (hPa/mbar), Cloud Cover, and UV Index\n` +
    `- Wind Speed (m/s) and Wind Bearing (degrees)\n` +
    `- Precipitation Intensity, Type (rain, snow), and Fog/Visibility metrics\n` +
    `Thermal Thresholds for Heating Sensitivity:\n` +
    `- Cold Days (< 8°C): High domestic heating load, evening gas/electric peak demand.\n` +
    `- Mild Days (8°C to 16°C): Intermediate heating/ventilation consumption.\n` +
    `- Warm Days (> 16°C): Low space heating demand, cooling usage in summer extremes.\n` +
    `Impact on SDGs: Temperature correlates strongly with space heating energy, peak grid carbon intensity, and thermal comfort (SDG 7, 11, 13).`;

  chunks.push({
    id: `${doc}#profile`,
    doc,
    chunkId: `${doc}#profile`,
    heading: 'London Climate and Temperature Sensitivity Standards',
    text,
    metadata: {
      sourceFile: 'weather_hourly_darksky.csv / weather_daily_darksky.csv',
      datasetType: 'weather-profile',
      category: 'weather-telemetry',
      doc,
    },
    hash: computeHash(text),
  });

  return chunks;
}

/**
 * Chunk UK bank holidays calendar.
 */
export function chunkBankHolidays(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const records = parse(content, { columns: true, skip_empty_lines: true, trim: true });
  const doc = 'uk_bank_holidays';

  const holidaysList = records.map((r) => {
    const d = r['Bank holidays'] || r['date'] || '';
    const t = r['Type'] || r['name'] || 'Bank Holiday';
    return `- ${d}: ${t}`;
  }).join('\n');

  const text = `United Kingdom Bank Holidays Reference (2012-2015):\n` +
    `List of official public bank holidays impacting household occupancy and energy profiles:\n` +
    holidaysList +
    `\nEnergy Behavior Note: Bank holidays exhibit weekend-like domestic load profiles with shifted daytime peak loads.`;

  return [{
    id: `${doc}#calendar`,
    doc,
    chunkId: `${doc}#calendar`,
    heading: 'UK Bank Holidays Reference Calendar',
    text,
    metadata: {
      sourceFile: path.basename(filePath),
      datasetType: 'calendar-holidays',
      category: 'calendar-holidays',
      doc,
    },
    hash: computeHash(text),
  }];
}
