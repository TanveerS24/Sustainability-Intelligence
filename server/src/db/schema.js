import Database from 'better-sqlite3';
import cfg from '../config.js';

let _db = null;

export function getDb() {
  if (!_db) throw new Error('DB not initialised — call initDb() first');
  return _db;
}

export function initDb(dbPath = cfg.DB_PATH) {
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.pragma('synchronous = NORMAL');
  applySchema(_db);
  return _db;
}

export function closeDb() {
  if (_db) { _db.close(); _db = null; }
}

function applySchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dim_time (
      hour_key TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      hour INTEGER NOT NULL,
      weekday INTEGER NOT NULL,
      is_weekend INTEGER NOT NULL,
      month INTEGER NOT NULL,
      season TEXT NOT NULL,
      is_holiday INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS dim_household (
      household_key INTEGER PRIMARY KEY AUTOINCREMENT,
      lclid TEXT UNIQUE NOT NULL,
      tariff TEXT NOT NULL,
      acorn TEXT NOT NULL,
      acorn_grouped TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dim_weather (
      hour_key TEXT PRIMARY KEY,
      temperature REAL,
      humidity REAL,
      temp_band TEXT,
      is_forward_filled INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS fact_consumption (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      household_key INTEGER NOT NULL REFERENCES dim_household(household_key),
      hour_key TEXT NOT NULL REFERENCES dim_time(hour_key),
      kwh REAL NOT NULL,
      co2_kg REAL NOT NULL,
      is_peak INTEGER NOT NULL,
      quality_flag TEXT NOT NULL DEFAULT 'ok'
    );

    CREATE INDEX IF NOT EXISTS idx_fact_hh ON fact_consumption(household_key);
    CREATE INDEX IF NOT EXISTS idx_fact_hour ON fact_consumption(hour_key);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_fact_unique ON fact_consumption(household_key, hour_key);

    CREATE TABLE IF NOT EXISTS agg_daily (
      household_key INTEGER NOT NULL REFERENCES dim_household(household_key),
      date TEXT NOT NULL,
      kwh REAL NOT NULL,
      co2_kg REAL NOT NULL,
      peak_kwh REAL NOT NULL,
      hours_count INTEGER NOT NULL,
      PRIMARY KEY (household_key, date)
    );

    CREATE TABLE IF NOT EXISTS agg_monthly (
      household_key INTEGER NOT NULL REFERENCES dim_household(household_key),
      year_month TEXT NOT NULL,
      kwh REAL NOT NULL,
      co2_kg REAL NOT NULL,
      days_count INTEGER NOT NULL,
      PRIMARY KEY (household_key, year_month)
    );

    CREATE TABLE IF NOT EXISTS household_features (
      household_key INTEGER PRIMARY KEY REFERENCES dim_household(household_key),
      h0 REAL, h1 REAL, h2 REAL, h3 REAL, h4 REAL, h5 REAL,
      h6 REAL, h7 REAL, h8 REAL, h9 REAL, h10 REAL, h11 REAL,
      h12 REAL, h13 REAL, h14 REAL, h15 REAL, h16 REAL, h17 REAL,
      h18 REAL, h19 REAL, h20 REAL, h21 REAL, h22 REAL, h23 REAL,
      mean_daily_kwh REAL,
      peak_share REAL,
      weekend_ratio REAL,
      load_factor REAL
    );

    CREATE TABLE IF NOT EXISTS pipeline_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      rows_read INTEGER,
      duplicates_removed INTEGER,
      missing_flagged INTEGER,
      outliers_flagged INTEGER,
      households_kept INTEGER,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS mining_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      best_k INTEGER,
      best_silhouette REAL,
      outlier_count INTEGER,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS clusters (
      cluster_id INTEGER PRIMARY KEY,
      mining_run_id INTEGER NOT NULL REFERENCES mining_runs(id),
      name TEXT NOT NULL,
      size INTEGER NOT NULL,
      inertia REAL,
      silhouette REAL,
      davies_bouldin REAL,
      centroid TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cluster_assignments (
      household_key INTEGER PRIMARY KEY REFERENCES dim_household(household_key),
      cluster_id INTEGER NOT NULL REFERENCES clusters(cluster_id),
      mining_run_id INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS outliers (
      household_key INTEGER PRIMARY KEY REFERENCES dim_household(household_key),
      mining_run_id INTEGER NOT NULL,
      kmeans_cluster_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mining_run_id INTEGER NOT NULL REFERENCES mining_runs(id),
      cluster_id INTEGER NOT NULL REFERENCES clusters(cluster_id),
      antecedent TEXT NOT NULL,
      consequent TEXT NOT NULL,
      support REAL NOT NULL,
      confidence REAL NOT NULL,
      lift REAL NOT NULL,
      explanation TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stg_readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lclid TEXT NOT NULL,
      ts TEXT NOT NULL,
      kwh REAL,
      source_file TEXT,
      UNIQUE(lclid, ts)
    );
    CREATE INDEX IF NOT EXISTS idx_stg_lclid ON stg_readings(lclid);
  `);
}
