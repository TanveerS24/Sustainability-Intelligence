/**
 * Run pipeline and data mining on the real imported dataset.
 * Reports cleansing stats, chosen k with metrics, outlier count, and rules per cluster.
 */
import { initDb, getDb } from '../src/db/schema.js';
import { runPipeline } from '../src/etl/pipeline.js';
import { runMining } from '../src/mining/miningPipeline.js';
import cfg from '../src/config.js';

async function main() {
  console.log('=== Step 1: Initializing Database ===');
  console.log(`Database Path: ${cfg.DB_PATH}`);
  initDb(cfg.DB_PATH);
  const db = getDb();

  console.log('\n=== Step 2: Executing Real ETL Pipeline ===');
  console.log(`Config: SAMPLE_HOUSEHOLDS=${cfg.SAMPLE_HOUSEHOLDS}, DATE_FROM=${cfg.DATE_FROM}, DATE_TO=${cfg.DATE_TO}`);
  const startTime = Date.now();
  const pipelineResult = await runPipeline();
  const etlElapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\nETL Pipeline completed in ${etlElapsed}s.`);
  console.log('Cleansing Stats:');
  console.log(`  - Total Rows Read: ${pipelineResult.cleansingStats.rowsRead?.toLocaleString()}`);
  console.log(`  - Duplicates Removed: ${pipelineResult.cleansingStats.duplicates}`);
  console.log(`  - Missing Readings Flagged: ${pipelineResult.cleansingStats.missing}`);
  console.log(`  - Outliers Flagged: ${pipelineResult.cleansingStats.outliers}`);
  console.log(`  - Households Retained: ${pipelineResult.cleansingStats.hhKept}`);

  console.log('\n=== Step 3: Executing Data Mining Pipeline ===');
  const miningStart = Date.now();
  const miningResult = await runMining();
  const miningElapsed = ((Date.now() - miningStart) / 1000).toFixed(1);

  console.log(`Mining completed in ${miningElapsed}s.`);
  console.log(`  - Chosen Optimal K: ${miningResult.bestK}`);
  console.log(`  - Silhouette Score: ${miningResult.silhouette?.toFixed(4)}`);
  console.log(`  - DBSCAN Outliers: ${miningResult.outlierCount}`);

  // Query clusters
  console.log('\n=== Discovered Archetypes / Personas ===');
  const clusters = db.prepare('SELECT cluster_id, name, size, silhouette, davies_bouldin FROM clusters ORDER BY cluster_id').all();
  for (const c of clusters) {
    console.log(`  Cluster ${c.cluster_id}: "${c.name}" | Size: ${c.size} households | Silhouette: ${c.silhouette?.toFixed(3)} | DB: ${c.davies_bouldin?.toFixed(3)}`);
  }

  // Query rules per cluster
  console.log('\n=== Association Rules per Cluster ===');
  const rulesPerCluster = db.prepare('SELECT cluster_id, COUNT(*) as rule_count FROM rules GROUP BY cluster_id ORDER BY cluster_id').all();
  for (const r of rulesPerCluster) {
    const cName = clusters.find(c => c.cluster_id === r.cluster_id)?.name || `Cluster ${r.cluster_id}`;
    console.log(`  ${cName} (Cluster ${r.cluster_id}): ${r.rule_count} rules generated`);
  }

  const sampleRules = db.prepare('SELECT cluster_id, antecedent, consequent, support, confidence, lift, explanation FROM rules ORDER BY lift DESC LIMIT 5').all();
  console.log('\nTop Association Rules (by lift):');
  for (const sr of sampleRules) {
    console.log(`  [Cluster ${sr.cluster_id}] ${sr.antecedent} => ${sr.consequent} (supp: ${(sr.support*100).toFixed(1)}%, conf: ${(sr.confidence*100).toFixed(1)}%, lift: ${sr.lift.toFixed(2)}x)`);
    console.log(`    Explanation: ${sr.explanation}`);
  }

  console.log('\n=== Real Data Execution Verified Successfully ===');
}

main().catch(err => {
  console.error('Pipeline execution error:', err);
  process.exit(1);
});
