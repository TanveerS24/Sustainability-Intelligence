import React, { useState, useEffect } from 'react';
import { fetchOlapSummary, fetchHealth } from '../api.js';
import KpiCard from '../components/KpiCard.jsx';
import PipelineControl from '../components/PipelineControl.jsx';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export default function OverviewPage() {
  const [data, setData] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadOverview = async () => {
    try {
      setLoading(true);
      setError(null);
      const [summaryRes, healthRes] = await Promise.all([
        fetchOlapSummary(),
        fetchHealth().catch(() => null),
      ]);
      setData(summaryRes);
      setHealth(healthRes);
    } catch (err) {
      setError(err.message || 'Failed to load system overview');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  if (loading) {
    return (
      <div className="state-box">
        <p>Loading Sustainability DSS Overview...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="error-banner">
          <span>Failed to connect: {error}</span>
        </div>
        <button className="btn" onClick={loadOverview}>Retry</button>
      </div>
    );
  }

  const totals = data?.totals || {};
  const isDemo = data?.isDemo || totals.isDemo || false;
  const quality = data?.quality || {};
  const monthly = data?.monthlyTrend || [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Sustainability Intelligence Overview</h1>
          <p className="page-desc">
            Decision Support System for Smart Meter Electricity Analytics & Carbon Reduction
          </p>
        </div>
        <div>
          {isDemo ? (
            <span className="badge badge-demo">Demo Synthetic Data</span>
          ) : (
            <span className="badge badge-real">Real Smart Meter Dataset</span>
          )}
        </div>
      </div>

      <PipelineControl onRefresh={loadOverview} />

      {/* KPI Cards */}
      <div className="grid-cards">
        <KpiCard
          title="Total Electricity Consumption"
          value={totals.totalKwh ? `${(totals.totalKwh).toLocaleString(undefined, { maximumFractionDigits: 1 })} kWh` : '0 kWh'}
          subtext="Aggregate metered consumption"
          sdg="7"
        />
        <KpiCard
          title="Carbon Footprint"
          value={totals.totalCo2 ? `${(totals.totalCo2).toLocaleString(undefined, { maximumFractionDigits: 1 })} kg` : '0 kg'}
          subtext="Computed from UK grid emissions factor"
          sdg="13"
        />
        <KpiCard
          title="Active Households"
          value={totals.households ? totals.households.toLocaleString() : '0'}
          subtext="London smart meter participants"
          sdg="11"
        />
        <KpiCard
          title="Data Observation Window"
          value={totals.dateRange ? `${totals.dateRange.start} – ${totals.dateRange.end}` : 'N/A'}
          subtext={`${totals.readingsCount ? totals.readingsCount.toLocaleString() : 0} validated hourly readings`}
          sdg="12"
        />
      </div>

      {/* Quality Stats & Monthly Trend */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="card">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>Data Cleansing & Quality Audit</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ background: 'var(--bg-surface-elevated)', padding: '0.85rem', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>DUPLICATES CLEARED</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700 }}>{quality.duplicates?.toLocaleString() || 0}</div>
            </div>
            <div style={{ background: 'var(--bg-surface-elevated)', padding: '0.85rem', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>MISSING VALUES IMPUTED</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700 }}>{quality.missing?.toLocaleString() || 0}</div>
            </div>
            <div style={{ background: 'var(--bg-surface-elevated)', padding: '0.85rem', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>OUTLIERS DETECTED (99.9th %)</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700 }}>{quality.outliers?.toLocaleString() || 0}</div>
            </div>
            <div style={{ background: 'var(--bg-surface-elevated)', padding: '0.85rem', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>RETENTION RATE</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--primary)' }}>
                {quality.retentionRate ? `${(quality.retentionRate * 100).toFixed(1)}%` : '100%'}
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>Consumption Trend (kWh)</h3>
          {monthly && monthly.length > 0 ? (
            <div style={{ height: '220px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthly}>
                  <defs>
                    <linearGradient id="kwhGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ff8a65" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#ff8a65" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#332227" />
                  <XAxis dataKey="period" stroke="#987b74" fontSize={12} />
                  <YAxis stroke="#987b74" fontSize={12} />
                  <Tooltip contentStyle={{ backgroundColor: '#261c20', borderColor: '#5e3c45', color: '#fff3ee', borderRadius: '6px' }} />
                  <Area type="monotone" dataKey="kwh" stroke="#ff8a65" fillOpacity={1} fill="url(#kwhGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="state-box" style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              No time-series trends available yet. Run the pipeline to populate.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
