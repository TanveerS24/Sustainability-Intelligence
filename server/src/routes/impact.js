import { Router } from 'express';
import { getDb } from '../db/schema.js';
import cfg from '../config.js';

const router = Router();

/**
 * POST /api/impact
 * Body: { clusterId, peakShiftPct?, reductionPct? }
 * Formula shown in response.
 */
router.post('/', (req, res) => {
  const { clusterId, peakShiftPct = 0, reductionPct = 0 } = req.body || {};

  if (clusterId === undefined || clusterId === null) {
    return res.status(400).json({ error: { code: 'MISSING_PARAM', message: 'clusterId required' } });
  }

  const pShift = Math.max(0, Math.min(100, Number(peakShiftPct) || 0)) / 100;
  const pReduce = Math.max(0, Math.min(100, Number(reductionPct) || 0)) / 100;

  const db = getDb();
  const lastRun = db.prepare('SELECT id FROM mining_runs WHERE status=? ORDER BY id DESC LIMIT 1').get('done');
  if (!lastRun) {
    return res.status(400).json({ error: { code: 'NO_MINING', message: 'Run mining first' } });
  }

  // Get cluster stats
  const clusterStats = db.prepare(`
    SELECT SUM(f.kwh) AS total_kwh,
           SUM(f.co2_kg) AS total_co2,
           SUM(CASE WHEN f.is_peak=1 THEN f.kwh ELSE 0 END) AS peak_kwh,
           COUNT(DISTINCT t.date) AS days,
           COUNT(DISTINCT f.household_key) AS households,
           dh.tariff
    FROM fact_consumption f
    JOIN cluster_assignments ca ON ca.household_key = f.household_key
    JOIN dim_time t ON t.hour_key = f.hour_key
    JOIN dim_household dh ON dh.household_key = f.household_key
    WHERE ca.cluster_id = ? AND ca.mining_run_id = ?
    GROUP BY dh.tariff
    LIMIT 1
  `).get(parseInt(clusterId, 10), lastRun.id);

  if (!clusterStats) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Cluster not found or no data' } });
  }

  const { total_kwh, total_co2, peak_kwh, days, households, tariff } = clusterStats;

  // What-if calculation:
  // kWh saved from reduction = total_kwh * reductionPct
  const kwhSavedReduction = total_kwh * pReduce;
  // Peak kWh shifted off-peak = peak_kwh * peakShiftPct
  // (shifting does not reduce total kWh — just moves it)
  const kwhShiftedOffPeak = peak_kwh * pShift;

  // CO2 saved from reduction (using average emission factor)
  const co2SavedReduction = kwhSavedReduction * cfg.EMISSION_FACTOR_KG_PER_KWH;
  // CO2 saved from shifting: marginal peak emission factor is higher (~0.40 vs average 0.207)
  // but we use average and note the conservative estimate
  const co2SavedShift = kwhShiftedOffPeak * (0.40 - cfg.EMISSION_FACTOR_KG_PER_KWH);

  const totalCo2Saved = co2SavedReduction + co2SavedShift;

  // Annualised (data window -> 365 days)
  const dataWindowDays = days / households; // avg days per household in window
  const annualisedFactor = dataWindowDays > 0 ? 365 / dataWindowDays : 1;

  const formula = [
    `kWh saved (reduction) = ${total_kwh.toFixed(1)} × ${(pReduce * 100).toFixed(1)}% = ${kwhSavedReduction.toFixed(2)} kWh`,
    `kWh shifted off-peak = ${peak_kwh.toFixed(1)} × ${(pShift * 100).toFixed(1)}% = ${kwhShiftedOffPeak.toFixed(2)} kWh`,
    `CO₂ from reduction = ${kwhSavedReduction.toFixed(2)} × ${cfg.EMISSION_FACTOR_KG_PER_KWH} = ${co2SavedReduction.toFixed(2)} kg`,
    `CO₂ from shift = ${kwhShiftedOffPeak.toFixed(2)} × (0.40 - ${cfg.EMISSION_FACTOR_KG_PER_KWH}) = ${co2SavedShift.toFixed(2)} kg (conservative, peak vs average)`,
  ];

  const tariffNote = tariff === 'ToU'
    ? 'This cluster is on ToU tariff data. Cost savings are not estimated without configured tariff prices.'
    : 'Cost savings are not estimated — configure current tariff prices to enable cost calculations.';

  res.json({
    clusterId,
    dataWindow: { totalKwh: total_kwh, totalCo2: total_co2, peakKwh: peak_kwh, days, households },
    whatIf: {
      kwhSavedReduction,
      kwhShiftedOffPeak,
      co2SavedReduction,
      co2SavedShift,
      totalCo2Saved,
      annualisedCo2Saved: totalCo2Saved * annualisedFactor,
    },
    formula,
    tariffNote,
    emissionFactorUsed: cfg.EMISSION_FACTOR_KG_PER_KWH,
  });
});

export default router;
