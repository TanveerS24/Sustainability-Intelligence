import React, { useState, useEffect } from 'react';
import {
  fetchMiningClusters,
  fetchMiningRules,
  calculateImpact,
  fetchRecommendation,
} from '../api.js';
import RagAssistant from '../components/RagAssistant.jsx';

export default function AdvisorPage() {
  const [clusters, setClusters] = useState([]);
  const [selectedClusterId, setSelectedClusterId] = useState(null);
  const [rules, setRules] = useState([]);
  const [selectedRuleId, setSelectedRuleId] = useState(null);

  // What-if sliders
  const [peakShiftPct, setPeakShiftPct] = useState(15);
  const [reductionPct, setReductionPct] = useState(10);
  const [impactData, setImpactData] = useState(null);
  const [impactLoading, setImpactLoading] = useState(false);

  // Recommendation
  const [recommendation, setRecommendation] = useState(null);
  const [recLoading, setRecLoading] = useState(false);
  const [error, setError] = useState(null);

  // Initial load: clusters
  useEffect(() => {
    async function init() {
      try {
        const clRes = await fetchMiningClusters();
        const list = clRes.clusters || [];
        setClusters(list);
        if (list.length > 0) {
          setSelectedClusterId(list[0].cluster_id);
        }
      } catch (err) {
        setError('Please run the data mining pipeline before using the advisor.');
      }
    }
    init();
  }, []);

  // When selected cluster changes, load its rules and compute initial impact
  useEffect(() => {
    if (selectedClusterId === null) return;
    async function loadClusterDetails() {
      try {
        const rRes = await fetchMiningRules(selectedClusterId).catch(() => ({ rules: [] }));
        setRules(rRes.rules || []);
        setSelectedRuleId(null);
        handleImpactCalc(selectedClusterId, peakShiftPct, reductionPct);
      } catch (err) {
        // ignore
      }
    }
    loadClusterDetails();
  }, [selectedClusterId]);

  const handleImpactCalc = async (cId, pShift, pRed) => {
    try {
      setImpactLoading(true);
      const res = await calculateImpact({
        clusterId: cId,
        peakShiftPct: pShift,
        reductionPct: pRed,
      });
      setImpactData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setImpactLoading(false);
    }
  };

  const handleGetRecommendation = async () => {
    if (selectedClusterId === null) return;
    try {
      setRecLoading(true);
      setError(null);
      const res = await fetchRecommendation({
        clusterId: selectedClusterId,
        ruleId: selectedRuleId,
      });
      setRecommendation(res);
    } catch (err) {
      setError(err.message || 'Failed to generate recommendation');
    } finally {
      setRecLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Decision Support & Policy Impact Advisor</h1>
          <p className="page-desc">
            Local RAG Intelligence (Qwen3:14B + SQLite Vector DB) & Sustainability Simulator
          </p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Local RAG Intelligence Assistant */}
      <RagAssistant selectedClusterId={selectedClusterId} />

      {/* Persona Selection */}
      <div className="card" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)', display: 'block', marginBottom: '0.25rem' }}>
            TARGET HOUSEHOLD CLUSTER
          </label>
          <select
            className="select-control"
            value={selectedClusterId ?? ''}
            onChange={(e) => setSelectedClusterId(Number(e.target.value))}
          >
            {clusters.map((c) => (
              <option key={c.cluster_id} value={c.cluster_id}>
                {c.name || `Cluster ${c.cluster_id}`} ({c.size} households)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)', display: 'block', marginBottom: '0.25rem' }}>
            LINKED ASSOCIATION RULE (OPTIONAL)
          </label>
          <select
            className="select-control"
            value={selectedRuleId ?? ''}
            onChange={(e) => setSelectedRuleId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">General Cluster Profile</option>
            {rules.map((r, i) => (
              <option key={i} value={r.id || i}>
                {r.antecedent} → {r.consequent} (Lift {r.lift?.toFixed(2)}x)
              </option>
            ))}
          </select>
        </div>

        <div style={{ alignSelf: 'flex-end' }}>
          <button
            className="btn btn-primary"
            onClick={handleGetRecommendation}
            disabled={recLoading || selectedClusterId === null}
          >
            {recLoading ? 'Retrieving Knowledge...' : 'Generate DSS Recommendation'}
          </button>
        </div>
      </div>

      {/* RAG Recommendation Output */}
      {recommendation && (
        <div className="card" style={{ marginBottom: '2rem', borderLeft: '4px solid var(--primary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 600 }}>RAG Energy Advisory & Policy Guidance</h3>
            <span className="badge" style={{ backgroundColor: 'rgba(255, 138, 101, 0.15)', color: 'var(--primary)', border: '1px solid rgba(255, 138, 101, 0.3)' }}>
              Mode: {recommendation.mode.toUpperCase()}
            </span>
          </div>

          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: '#e2e8f0', marginBottom: '1.5rem' }}>
            {recommendation.recommendation}
          </div>

          {/* Citations */}
          {recommendation.citations && recommendation.citations.length > 0 && (
            <div>
              <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                Retrieved Knowledge Citations
              </h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {recommendation.citations.map((c, i) => (
                  <div key={i} className="citation-pill" title={c.text}>
                    <strong>[{c.chunkId}]</strong> {c.doc}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* What-If Impact Simulator */}
      <div className="card">
        <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          What-If Sustainability Impact Simulator (SDG 7, 12, 13)
        </h3>
        <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
          Simulate carbon and energy reductions via demand flexibility (peak load shifting) and efficiency actions.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', marginBottom: '1.5rem' }}>
          <div>
            <div className="slider-container">
              <div className="slider-label">
                <span>Peak Load Shift to Off-Peak:</span>
                <strong style={{ color: 'var(--primary)' }}>{peakShiftPct}%</strong>
              </div>
              <input
                type="range"
                className="slider-input"
                min="0"
                max="50"
                step="5"
                value={peakShiftPct}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setPeakShiftPct(val);
                  handleImpactCalc(selectedClusterId, val, reductionPct);
                }}
              />
            </div>

            <div className="slider-container">
              <div className="slider-label">
                <span>Overall Consumption Reduction:</span>
                <strong style={{ color: 'var(--cyan)' }}>{reductionPct}%</strong>
              </div>
              <input
                type="range"
                className="slider-input"
                min="0"
                max="40"
                step="5"
                value={reductionPct}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setReductionPct(val);
                  handleImpactCalc(selectedClusterId, peakShiftPct, val);
                }}
              />
            </div>
          </div>

          {/* Results Display */}
          {impactData?.whatIf && (
            <div style={{ background: 'var(--bg-surface-elevated)', padding: '1.25rem', borderRadius: 'var(--radius-sm)' }}>
              <h4 style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginBottom: '1rem', textTransform: 'uppercase' }}>
                Estimated Impact Over Sample Period
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ENERGY SAVED</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--primary)' }}>
                    {impactData.whatIf.kwhSavedReduction.toFixed(1)} kWh
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>PEAK LOAD RELIEVED</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--cyan)' }}>
                    {impactData.whatIf.kwhShiftedOffPeak.toFixed(1)} kWh
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>CO₂ REDUCED</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--primary)' }}>
                    {impactData.whatIf.totalCo2Saved.toFixed(1)} kg
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ANNUALISED CO₂ SAVINGS</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--amber)' }}>
                    {impactData.whatIf.annualisedCo2Saved.toFixed(1)} kg/yr
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Formulas card */}
        {impactData?.formula && (
          <div>
            <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              Calculation Methodology & Carbon Accounting Formulas:
            </h4>
            {impactData.formula.map((f, idx) => (
              <div key={idx} className="formula-card">{f}</div>
            ))}
            {impactData.tariffNote && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
                * {impactData.tariffNote}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
