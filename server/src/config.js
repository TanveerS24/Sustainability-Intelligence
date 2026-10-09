import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// All configuration via environment variables with documented defaults
const cfg = {
  PORT: parseInt(process.env.PORT || '4000', 10),

  // Data paths
  RAW_DATA_DIR: process.env.RAW_DATA_DIR
    ? path.resolve(process.env.RAW_DATA_DIR)
    : path.join(ROOT, 'data', 'raw'),
  DB_PATH: process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.join(ROOT, 'data', 'sustainability.db'),

  // Sample window
  SAMPLE_HOUSEHOLDS: parseInt(process.env.SAMPLE_HOUSEHOLDS || '300', 10),
  DATE_FROM: process.env.DATE_FROM || '2013-01-01',
  DATE_TO: process.env.DATE_TO || '2013-12-31',

  // Peak hours (24h format, inclusive start exclusive end)
  PEAK_START_HOUR: parseInt(process.env.PEAK_START_HOUR || '16', 10),
  PEAK_END_HOUR: parseInt(process.env.PEAK_END_HOUR || '20', 10),

  // Clustering
  K_MIN: parseInt(process.env.K_MIN || '2', 10),
  K_MAX: parseInt(process.env.K_MAX || '8', 10),
  DBSCAN_EPS: process.env.DBSCAN_EPS ? parseFloat(process.env.DBSCAN_EPS) : null,
  DBSCAN_MIN_PTS: parseInt(process.env.DBSCAN_MIN_PTS || '5', 10),
  RANDOM_SEED: parseInt(process.env.RANDOM_SEED || '42', 10),

  // Association rules
  MIN_SUPPORT: parseFloat(process.env.MIN_SUPPORT || '0.05'),
  MIN_CONFIDENCE: parseFloat(process.env.MIN_CONFIDENCE || '0.6'),
  MAX_RULES_PER_CLUSTER: parseInt(process.env.MAX_RULES_PER_CLUSTER || '25', 10),

  // CO2 emission factor kg per kWh (UK grid average — verify current value)
  EMISSION_FACTOR_KG_PER_KWH: parseFloat(
    process.env.EMISSION_FACTOR_KG_PER_KWH || '0.207'
  ),

  // Temperature bands in Celsius
  TEMP_COLD_MAX: parseFloat(process.env.TEMP_COLD_MAX || '8'),
  TEMP_MILD_MAX: parseFloat(process.env.TEMP_MILD_MAX || '16'),

  // RAG
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  RAG_TOP_K: parseInt(process.env.RAG_TOP_K || '5', 10),

  // Validation
  MIN_READINGS_PER_HH: parseInt(process.env.MIN_READINGS_PER_HH || '1000', 10),
};

export default cfg;
