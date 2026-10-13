/**
 * Sustainability Scenario Simulator API Router.
 * Evaluates configurable, evidence-based energy and carbon abatement scenarios
 * mapped directly to SDG 7, 11, 12, and 13.
 */
import { Router } from 'express';
import { getDb } from '../db/schema.js';
import cfg from '../config.js';

const router = Router();

/**
 * POST /api/sustainability/simulate
 * Body: { clusterId?, peakShiftPct?, reductionPct?, emissionFactor?, marginalPeakEmissionFactor? }
 */
router.post('/simulate', (req, res) => {
  const {
    clusterId,
    peakShiftPct = 15,
    reductionPct = 10,
    emissionFactor = cfg.EMISSION_FACTOR_KG_PER_KWH,
    marginalPeakEmissionFactor = 0.40,
  } = req.body || {};

  const pShift = Math.max(0, Math.min(100, Number(peakShiftPct) || 0)) / 100;
  const pReduce = Math.max(0, Math.min(100, Number(reductionPct) || 0)) / 100;
  const efAvg = Number(emissionFactor) > 0 ? Number(emissionFactor) : cfg.EMISSION_FACTOR_KG_PER_KWH;
  const efPeak = Number(marginalPeakEmissionFactor) > 0 ? Number(marginalPeakEmissionFactor) : 0.40;

  const db = getDb();
  const lastRun = db.prepare(
    'SELECT id FROM mining_runs WHERE status=? ORDER BY id DESC LIMIT 1'
  ).get('done');

  if (!lastRun) {
    return res.status(400).json({ error: { code: 'NO_MINING', message: 'Execute mining pipeline before running simulation' } });
  }

  let clusterStats;
  let filterDescription;

  if (clusterId !== undefined && clusterId !== null && clusterId !== '') {
    const cid = parseInt(clusterId, 10);
    clusterStats = db.prepare(`
      SELECT SUM(f.kwh) AS total_kwh,
             SUM(f.co2_kg) AS total_co2,
             SUM(CASE WHEN f.is_peak=1 THEN f.kwh ELSE 0 END) AS peak_kwh,
             COUNT(DISTINCT t.date) AS days,
             COUNT(DISTINCT f.household_key) AS households,
             c.name AS cluster_name
      FROM fact_consumption f
      JOIN cluster_assignments ca ON ca.household_key = f.household_key
      JOIN dim_time t ON t.hour_key = f.hour_key
      JOIN clusters c ON c.cluster_id = ca.cluster_id AND c.mining_run_id = ca.mining_run_id
      WHERE ca.cluster_id = ? AND ca.mining_run_id = ?
    `).get(cid, lastRun.id);
    filterDescription = `Cluster ${cid} (${clusterStats?.cluster_name || 'Target Cluster'})`;
  } else {
    // City-wide aggregate across all monitored households
    clusterStats = db.prepare(`
      SELECT SUM(f.kwh) AS total_kwh,
             SUM(f.co2_kg) AS total_co2,
             SUM(CASE WHEN f.is_peak=1 THEN f.kwh ELSE 0 END) AS peak_kwh,
             COUNT(DISTINCT t.date) AS days,
             COUNT(DISTINCT f.household_key) AS households
      FROM fact_consumption f
      JOIN dim_time t ON t.hour_key = f.hour_key
    `).get();
    filterDescription = 'All Monitored Households';
  }

  if (!clusterStats || !clusterStats.households) {
    return res.status(404).json({ error: { code: 'NO_DATA', message: 'No consumption records found for simulation' } });
  }

  const { total_kwh, peak_kwh, days, households } = clusterStats;

  // 1. SDG 12: Direct efficiency energy reduction
  const kwhSavedReduction = total_kwh * pReduce;
  const co2SavedReduction = kwhSavedReduction * efAvg;

  // 2. SDG 7: Peak demand shifting to off-peak (shaving marginal peak fossil generation)
  const kwhShiftedOffPeak = peak_kwh * pShift;
  const co2SavedShift = kwhShiftedOffPeak * Math.max(0, efPeak - efAvg);

  // Total Carbon Abatement
  const totalCo2Saved = co2SavedReduction + co2SavedShift;
  const avgDaysPerHousehold = households > 0 ? days / households : 365;
  const annualFactor = avgDaysPerHousehold > 0 ? 365 / avgDaysPerHousehold : 1;
  const annualisedCo2Saved = totalCo2Saved * annualFactor;
  const annualisedKwhSaved = kwhSavedReduction * annualFactor;

  res.json({
    scenario: {
      scope: filterDescription,
      households,
      sampleDays: Math.round(avgDaysPerHousehold),
      parameters: {
        peakShiftPercentage: Number((pShift * 100).toFixed(1)),
        reductionPercentage: Number((pReduce * 100).toFixed(1)),
        averageEmissionFactor: efAvg,
        marginalPeakEmissionFactor: efPeak,
      },
    },
    baseline: {
      totalKwh: Number(total_kwh.toFixed(2)),
      peakKwh: Number(peak_kwh.toFixed(2)),
      peakSharePercent: Number(((peak_kwh / total_kwh) * 100).toFixed(2)),
    },
    simulatedImpact: {
      sdg7_cleanEnergy: {
        peakReliefKwh: Number(kwhShiftedOffPeak.toFixed(2)),
        annualisedPeakReliefKwh: Number((kwhShiftedOffPeak * annualFactor).toFixed(2)),
        description: 'Peak load shifted to off-peak hours improves grid load factor and reduces strain on fossil peaker plants.',
      },
      sdg12_responsibleConsumption: {
        energySavedKwh: Number(kwhSavedReduction.toFixed(2)),
        annualisedEnergySavedKwh: Number(annualisedKwhSaved.toFixed(2)),
        description: 'Direct curtailment of wasteful standby and inefficient heating consumption.',
      },
      sdg13_climateAction: {
        co2SavedKg: Number(totalCo2Saved.toFixed(2)),
        co2FromEfficiencyKg: Number(co2SavedReduction.toFixed(2)),
        co2FromPeakShiftKg: Number(co2SavedShift.toFixed(2)),
        annualisedCo2SavedKg: Number(annualisedCo2Saved.toFixed(2)),
        description: 'Estimated carbon emissions abated based on configured UK grid intensity.',
      },
    },
    methodology: [
      `SDG 12 Energy Saved = Total Consumption (${total_kwh.toFixed(1)} kWh) × ${(pReduce * 100).toFixed(1)}% = ${kwhSavedReduction.toFixed(2)} kWh`,
      `SDG 7 Peak Relieved = Peak Consumption (${peak_kwh.toFixed(1)} kWh) × ${(pShift * 100).toFixed(1)}% = ${kwhShiftedOffPeak.toFixed(2)} kWh`,
      `CO₂ from Efficiency = Energy Saved × ${efAvg} kg/kWh = ${co2SavedReduction.toFixed(2)} kg CO₂`,
      `CO₂ from Peak Shifting = Shifted kWh × (${efPeak} - ${efAvg}) kg/kWh = ${co2SavedShift.toFixed(2)} kg CO₂`,
      `Annualised CO₂ Abatement = Total CO₂ Saved × (365 / ${avgDaysPerHousehold.toFixed(1)} days) = ${annualisedCo2Saved.toFixed(2)} kg/year`,
    ],
    assumptionsNotice: 'Simulation model assumes linear demand response. Shifting assumes marginal grid emissions during 16:00-20:00 exceed base load.',
  });
});

export default router;
