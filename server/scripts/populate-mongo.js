/**
 * Standalone script: Populate Docker MongoDB with actual data from DataSet.
 * Run as: node scripts/populate-mongo.js
 */
import { populateMongoFromDataset } from '../src/etl/mongoIngest.js';
import { closeMongo, pingMongo } from '../src/db/mongo.js';

async function main() {
  console.log('====================================================');
  console.log('Populating Docker MongoDB with actual London Smart Meter Datasets');
  console.log('====================================================');

  const ping = await pingMongo();
  if (!ping.ok) {
    console.error('Failed to connect to MongoDB:', ping.error);
    process.exit(1);
  }
  console.log(`Connected to MongoDB at ${ping.database}`);

  const result = await populateMongoFromDataset({
    maxBlocks: 6, // Ingests blocks 0 through 5 (300 households)
    onProgress: (msg) => console.log(`[Mongo Ingestion] ${msg}`),
  });

  console.log('\n====================================================');
  console.log('MongoDB Population Completed Successfully!');
  console.log(`Duration: ${(result.durationMs / 1000).toFixed(1)} seconds`);
  console.log('Collections Populated:');
  for (const [col, count] of Object.entries(result.counts)) {
    console.log(`  - ${col}: ${count.toLocaleString()} documents`);
  }
  console.log('====================================================');

  await closeMongo();
}

main().catch((err) => {
  console.error('Fatal error populating MongoDB:', err);
  process.exit(1);
});
