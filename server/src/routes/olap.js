import { Router } from 'express';
import { getDb } from '../db/schema.js';

const router = Router();

const VALID_DIMS = ['time', 'community', 'tariff'];
const VALID_TIME_LEVELS = ['hour', 'day', 'month', 'season'];
const VALID_COMM_LEVELS = ['acorn_group', 'tariff'];

// GET /api/olap/summary
router.get('/summary', (req, res) => {
  const db = getDb();

  const totals = db.prepare(`
    SELECT COUNT(DISTINCT f.household_key) AS households,
           ROUND(SUM(f.kwh),2) AS total_kwh,
           ROUND(SUM(f.co2_kg),2) AS total_co2_kg,
           MIN(t.date) AS date_from,
           MAX(t.date) AS date_to,
           ROUND(AVG(f.kwh),4) AS avg_kwh_per_hour
    FROM fact_consumption f
    JOIN dim_time t ON t.hour_key = f.hour_key
  `).get();

  const quality = db.prepare(`
    SELECT quality_flag, COUNT(*) AS n
    FROM fact_consumption GROUP BY quality_flag
  `).all();

  const pipelineRun = db.prepare(
    'SELECT * FROM pipeline_runs ORDER BY id DESC LIMIT 1'
  ).get();

  res.json({ totals, quality, pipelineRun });
});

// GET /api/olap/rollup?dim=time&level=month
router.get('/rollup', (req, res) => {
  const { dim = 'time', level = 'month' } = req.query;
  const db = getDb();

  if (!VALID_DIMS.includes(dim)) {
    return res.status(400).json({ error: { code: 'INVALID_DIM', message: `dim must be one of: ${VALID_DIMS.join(', ')}` } });
  }

  let sql;
  if (dim === 'time') {
    if (!VALID_TIME_LEVELS.includes(level)) {
      return res.status(400).json({ error: { code: 'INVALID_LEVEL', message: `level must be: ${VALID_TIME_LEVELS.join(', ')}` } });
    }
    const groupCol = level === 'hour' ? 't.hour'
      : level === 'day' ? 't.date'
      : level === 'month' ? "SUBSTR(t.date,1,7)"
      : 't.season';
    sql = `SELECT ${groupCol} AS label,
             ROUND(SUM(f.kwh),3) AS total_kwh,
             ROUND(SUM(f.co2_kg),3) AS total_co2,
             COUNT(DISTINCT f.household_key) AS households,
             ROUND(SUM(CASE WHEN f.is_peak=1 THEN f.kwh ELSE 0 END)*1.0/NULLIF(SUM(f.kwh),0),4) AS peak_share
           FROM fact_consumption f
           JOIN dim_time t ON t.hour_key = f.hour_key
           GROUP BY ${groupCol} ORDER BY label`;
  } else if (dim === 'community') {
    sql = `SELECT dh.acorn_grouped AS label,
             ROUND(SUM(f.kwh),3) AS total_kwh,
             ROUND(SUM(f.co2_kg),3) AS total_co2,
             COUNT(DISTINCT f.household_key) AS households,
             ROUND(SUM(CASE WHEN f.is_peak=1 THEN f.kwh ELSE 0 END)*1.0/NULLIF(SUM(f.kwh),0),4) AS peak_share
           FROM fact_consumption f
           JOIN dim_household dh ON dh.household_key = f.household_key
           GROUP BY dh.acorn_grouped ORDER BY total_kwh DESC`;
  } else {
    sql = `SELECT dh.tariff AS label,
             ROUND(SUM(f.kwh),3) AS total_kwh,
             ROUND(SUM(f.co2_kg),3) AS total_co2,
             COUNT(DISTINCT f.household_key) AS households,
             ROUND(SUM(CASE WHEN f.is_peak=1 THEN f.kwh ELSE 0 END)*1.0/NULLIF(SUM(f.kwh),0),4) AS peak_share
           FROM fact_consumption f
           JOIN dim_household dh ON dh.household_key = f.household_key
           GROUP BY dh.tariff ORDER BY label`;
  }

  const rows = db.prepare(sql).all();
  res.json({ dim, level, rows });
});

// GET /api/olap/drilldown?date=2013-03&dim=time
router.get('/drilldown', (req, res) => {
  const { date, acorn } = req.query;
  const db = getDb();

  if (date) {
    const rows = db.prepare(`
      SELECT t.date, t.hour, ROUND(SUM(f.kwh),3) AS kwh, ROUND(SUM(f.co2_kg),3) AS co2
      FROM fact_consumption f
      JOIN dim_time t ON t.hour_key = f.hour_key
      WHERE SUBSTR(t.date,1,7) = ?
      GROUP BY t.date, t.hour ORDER BY t.date, t.hour
    `).all(date);
    return res.json({ type: 'time_drilldown', date, rows });
  }

  if (acorn) {
    const rows = db.prepare(`
      SELECT dh.lclid, dh.tariff, dh.acorn,
             ROUND(SUM(f.kwh),3) AS total_kwh,
             ROUND(AVG(f.kwh),4) AS avg_hourly_kwh
      FROM fact_consumption f
      JOIN dim_household dh ON dh.household_key = f.household_key
      WHERE dh.acorn_grouped = ?
      GROUP BY dh.household_key ORDER BY total_kwh DESC LIMIT 50
    `).all(acorn);
    return res.json({ type: 'community_drilldown', acorn, rows });
  }

  res.status(400).json({ error: { code: 'MISSING_PARAM', message: 'Provide date or acorn query param' } });
});

export default router;
