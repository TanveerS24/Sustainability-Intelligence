/**
 * Unit tests for OLAP roll-up totals matching fact table totals.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';

let db;

beforeAll(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE dim_time (
      time_key TEXT PRIMARY KEY,
      year INTEGER,
      month INTEGER,
      day INTEGER,
      hour INTEGER,
      season TEXT,
      is_weekend INTEGER,
      is_holiday INTEGER
    );
    CREATE TABLE dim_household (
      lclid TEXT PRIMARY KEY,
      tariff TEXT,
      acorn TEXT,
      acorn_grouped TEXT
    );
    CREATE TABLE fact_consumption (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lclid TEXT,
      time_key TEXT,
      kwh REAL,
      co2_kg REAL,
      quality_flag TEXT
    );
  `);

  // Insert test records
  db.prepare(`
    INSERT INTO dim_household VALUES
    ('MAC000001', 'Std', 'ACORN-A', 'Affluent'),
    ('MAC000002', 'ToU', 'ACORN-B', 'Affluent'),
    ('MAC000003', 'Std', 'ACORN-E', 'Comfortable');
  `).run();

  db.prepare(`
    INSERT INTO dim_time VALUES
    ('2013-01-01T00', 2013, 1, 1, 0, 'winter', 0, 1),
    ('2013-01-01T01', 2013, 1, 1, 1, 'winter', 0, 1),
    ('2013-02-01T00', 2013, 2, 1, 0, 'winter', 0, 0);
  `).run();

  const insertFact = db.prepare(`
    INSERT INTO fact_consumption (lclid, time_key, kwh, co2_kg, quality_flag)
    VALUES (?, ?, ?, ?, 'ok')
  `);
  insertFact.run('MAC000001', '2013-01-01T00', 1.5, 0.354);
  insertFact.run('MAC000001', '2013-01-01T01', 2.0, 0.472);
  insertFact.run('MAC000002', '2013-01-01T00', 0.5, 0.118);
  insertFact.run('MAC000003', '2013-02-01T00', 3.0, 0.708);
});

afterAll(() => {
  db.close();
});

describe('OLAP roll-up consistency', () => {
  it('roll-up by time dimension equals fact table total kWh and CO2', () => {
    const factTotals = db.prepare(`
      SELECT SUM(kwh) AS total_kwh, SUM(co2_kg) AS total_co2 FROM fact_consumption
    `).get();

    const timeRollup = db.prepare(`
      SELECT SUM(rollup_kwh) AS total_kwh, SUM(rollup_co2) AS total_co2
      FROM (
        SELECT t.month, SUM(f.kwh) AS rollup_kwh, SUM(f.co2_kg) AS rollup_co2
        FROM fact_consumption f
        JOIN dim_time t ON f.time_key = t.time_key
        GROUP BY t.month
      )
    `).get();

    expect(timeRollup.total_kwh).toBeCloseTo(factTotals.total_kwh, 6);
    expect(timeRollup.total_co2).toBeCloseTo(factTotals.total_co2, 6);
  });

  it('roll-up by community dimension equals fact table total kWh', () => {
    const factTotals = db.prepare(`
      SELECT SUM(kwh) AS total_kwh FROM fact_consumption
    `).get();

    const commRollup = db.prepare(`
      SELECT SUM(rollup_kwh) AS total_kwh
      FROM (
        SELECT h.acorn_grouped, SUM(f.kwh) AS rollup_kwh
        FROM fact_consumption f
        JOIN dim_household h ON f.lclid = h.lclid
        GROUP BY h.acorn_grouped
      )
    `).get();

    expect(commRollup.total_kwh).toBeCloseTo(factTotals.total_kwh, 6);
  });

  it('roll-up by tariff dimension equals fact table total kWh', () => {
    const factTotals = db.prepare(`
      SELECT SUM(kwh) AS total_kwh FROM fact_consumption
    `).get();

    const tariffRollup = db.prepare(`
      SELECT SUM(rollup_kwh) AS total_kwh
      FROM (
        SELECT h.tariff, SUM(f.kwh) AS rollup_kwh
        FROM fact_consumption f
        JOIN dim_household h ON f.lclid = h.lclid
        GROUP BY h.tariff
      )
    `).get();

    expect(tariffRollup.total_kwh).toBeCloseTo(factTotals.total_kwh, 6);
  });
});
