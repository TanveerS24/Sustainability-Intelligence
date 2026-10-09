/**
 * Mining pipeline orchestrator.
 * Reads household_features from DB, runs K-Means + DBSCAN + rules, persists results.
 */
import cfg from '../config.js';
import { getDb } from '../db/schema.js';
import { standardise } from './mathUtils.js';
import { selectBestK, nameAllClusters } from './kmeans.js';
import { dbscan, computeKDistances, estimateEps } from './dbscan.js';
import { mineRules } from './rules.js';
import { buildTransaction, computePercentiles, usageLevel, peakShareBand } from './discretise.js';

/**
 * Load feature matrix from household_features table.
 * Returns { householdKeys, matrix, rawMatrix }
 */
function loadFeatures(db) {
  const rows = db.prepare(`
    SELECT hf.household_key, hf.h0,hf.h1,hf.h2,hf.h3,hf.h4,hf.h5,hf.h6,hf.h7,
           hf.h8,hf.h9,hf.h10,hf.h11,hf.h12,hf.h13,hf.h14,hf.h15,hf.h16,hf.h17,
           hf.h18,hf.h19,hf.h20,hf.h21,hf.h22,hf.h23,
           hf.mean_daily_kwh, hf.peak_share, hf.weekend_ratio, hf.load_factor
    FROM household_features hf
    ORDER BY hf.household_key
  `).all();

  if (rows.length === 0) throw new Error('No household features found — run pipeline first');

  const householdKeys = rows.map(r => r.household_key);
  const rawMatrix = rows.map(r => [
    r.h0,r.h1,r.h2,r.h3,r.h4,r.h5,r.h6,r.h7,r.h8,r.h9,r.h10,r.h11,
    r.h12,r.h13,r.h14,r.h15,r.h16,r.h17,r.h18,r.h19,r.h20,r.h21,r.h22,r.h23,
    r.mean_daily_kwh, r.peak_share, r.weekend_ratio, r.load_factor
  ]);

  return { householdKeys, rawMatrix };
}

/**
 * Build transactions for association rule mining per cluster.
 */
function buildTransactions(db, clusterHouseholds) {
  const transactions = [];
  for (const { householdKey, clusterName } of clusterHouseholds) {
    // Load daily data for this household
    const daily = db.prepare(`
      SELECT ad.date, ad.kwh, ad.peak_kwh, t.weekday, t.is_holiday, t.season,
             w.temp_band, dh.tariff, dh.acorn_grouped
      FROM agg_daily ad
      JOIN dim_time t ON t.date = ad.date AND t.hour = 0
      JOIN dim_household dh ON dh.household_key = ad.household_key
      LEFT JOIN dim_weather w ON w.hour_key = ad.date || 'T12'
      WHERE ad.household_key = ?
    `).all(householdKey);

    if (daily.length === 0) continue;

    const { p33, p67 } = computePercentiles(daily.map(d => d.kwh));

    for (const day of daily) {
      const usageLvl = usageLevel(day.kwh, p33, p67);
      const psb = peakShareBand(day.peak_kwh, day.kwh);
      const items = buildTransaction({
        weekday: day.weekday,
        isHoliday: day.is_holiday,
        season: day.season,
        tempBand: day.temp_band,
        usageLvl,
        peakShareBand: psb,
        tariff: day.tariff,
        acornGroup: day.acorn_grouped,
      });
      transactions.push(items);
    }
  }
  return transactions;
}

export async function runMining() {
  const db = getDb();
  const startedAt = new Date().toISOString();
  const runRow = db.prepare(
    'INSERT INTO mining_runs (started_at, status) VALUES (?,?)'
  ).run(startedAt, 'running');
  const runId = runRow.lastInsertRowid;

  try {
    const { householdKeys, rawMatrix } = loadFeatures(db);
    const { scaled } = standardise(rawMatrix);

    // K-Means
    const { bestK, bestResult, results } = selectBestK(scaled, {
      kMin: cfg.K_MIN, kMax: cfg.K_MAX, seed: cfg.RANDOM_SEED
    });
    const clusterNames = nameAllClusters(bestResult.centroids);

    // Clear old results
    db.exec('DELETE FROM cluster_assignments; DELETE FROM clusters; DELETE FROM outliers; DELETE FROM rules');

    // Insert clusters
    const insertCluster = db.prepare(`
      INSERT INTO clusters (cluster_id, mining_run_id, name, size, inertia, silhouette, davies_bouldin, centroid)
      VALUES (?,?,?,?,?,?,?,?)
    `);
    const sizes = Array(bestK).fill(0);
    for (const l of bestResult.labels) sizes[l]++;

    db.transaction(() => {
      for (let k = 0; k < bestK; k++) {
        insertCluster.run(
          k, runId, clusterNames[k], sizes[k],
          bestResult.inertia, bestResult.silhouette, bestResult.daviesBouldin,
          JSON.stringify(bestResult.centroids[k])
        );
      }
    })();

    // Insert cluster assignments
    const insertAssign = db.prepare(`
      INSERT OR REPLACE INTO cluster_assignments (household_key, cluster_id, mining_run_id)
      VALUES (?,?,?)
    `);
    db.transaction(() => {
      for (let i = 0; i < householdKeys.length; i++) {
        insertAssign.run(householdKeys[i], bestResult.labels[i], runId);
      }
    })();

    // DBSCAN
    const eps = cfg.DBSCAN_EPS !== null
      ? cfg.DBSCAN_EPS
      : estimateEps(computeKDistances(scaled, cfg.DBSCAN_MIN_PTS));

    const { noiseIndices } = dbscan(scaled, eps, cfg.DBSCAN_MIN_PTS);

    const insertOutlier = db.prepare(
      'INSERT OR REPLACE INTO outliers (household_key, mining_run_id, kmeans_cluster_id) VALUES (?,?,?)'
    );
    db.transaction(() => {
      for (const idx of noiseIndices) {
        const hk = householdKeys[idx];
        const kmCluster = bestResult.labels[idx];
        insertOutlier.run(hk, runId, kmCluster);
      }
    })();

    // Association rules per cluster
    const insertRule = db.prepare(`
      INSERT INTO rules (mining_run_id, cluster_id, antecedent, consequent, support, confidence, lift, explanation)
      VALUES (?,?,?,?,?,?,?,?)
    `);

    for (let cl = 0; cl < bestK; cl++) {
      const clusterHouseholds = householdKeys
        .map((hk, i) => ({ householdKey: hk, idx: i, label: bestResult.labels[i] }))
        .filter(x => x.label === cl)
        .map(x => ({ householdKey: x.householdKey, clusterName: clusterNames[cl] }));

      const transactions = buildTransactions(db, clusterHouseholds);
      if (transactions.length < 10) continue;

      const rules = mineRules(transactions, {
        minSupport: cfg.MIN_SUPPORT,
        minConfidence: cfg.MIN_CONFIDENCE,
        maxRules: cfg.MAX_RULES_PER_CLUSTER,
      });

      db.transaction(() => {
        for (const rule of rules) {
          insertRule.run(runId, cl, rule.antecedent, rule.consequent,
            rule.support, rule.confidence, rule.lift, rule.explanation);
        }
      })();
    }

    const finishedAt = new Date().toISOString();
    db.prepare(`
      UPDATE mining_runs SET finished_at=?, status=?, best_k=?, best_silhouette=?, outlier_count=?
      WHERE id=?
    `).run(finishedAt, 'done', bestK, bestResult.silhouette, noiseIndices.length, runId);

    return { runId, bestK, silhouette: bestResult.silhouette, outlierCount: noiseIndices.length, results };

  } catch (err) {
    db.prepare('UPDATE mining_runs SET finished_at=?, status=?, error=? WHERE id=?')
      .run(new Date().toISOString(), 'error', err.message, runId);
    throw err;
  }
}
