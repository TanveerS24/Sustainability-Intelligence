import React, { useState, useEffect } from 'react';
import { fetchMiningClusters, fetchMiningEvaluation, fetchMiningOutliers } from '../api.js';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export default function ClustersPage() {
  const [clusters, setClusters] = useState([]);
  const [evaluation, setEvaluation] = useState(null);
  const [outliers, setOutliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const [clRes, evRes, outRes] = await Promise.all([
          fetchMiningClusters(),
          fetchMiningEvaluation().catch(() => null),
          fetchMiningOutliers().catch(() => []),
        ]);
        setClusters(clRes.clusters || []);
        setEvaluation(evRes);
        setOutliers(outRes.outliers || []);
      } catch (err) {
        setError(err.message || 'Failed to fetch cluster analytics');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) return <div className="state-box">Loading cluster models & evaluation metrics...</div>;
  if (error) return <div className="error-banner">{error}</div>;

  const kScores = evaluation?.kEvaluation || [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Household Consumption Clusters</h1>
          <p className="page-desc">
            Unsupervised Persona Profiling (K-Means & DBSCAN) with 24-Hour Load Curves (CO4)
          </p>
        </div>
      </div>

      {/* Cluster Evaluation (Silhouette vs K) */}
      {kScores.length > 0 && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
            Cluster Quality Evaluation: Silhouette Coefficient vs K
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '1rem' }}>
            Higher silhouette values indicate well-separated and cohesive household groups.
          </p>
          <div style={{ height: '220px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={kScores}>
                <CartesianGrid strokeDasharray="3 3" stroke="#332227" />
                <XAxis dataKey="k" stroke="#987b74" label={{ value: 'Number of Clusters (k)', position: 'insideBottom', offset: -5, fill: '#987b74', fontSize: 12 }} />
                <YAxis stroke="#987b74" fontSize={12} />
                <Tooltip contentStyle={{ backgroundColor: '#261c20', borderColor: '#5e3c45', color: '#fff3ee', borderRadius: '6px' }} />
                <Line type="monotone" dataKey="silhouette" stroke="#ff8a65" strokeWidth={2} dot={{ r: 4, fill: '#ff8a65' }} name="Silhouette Score" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Persona Cards */}
      <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>
        Discovered Archetype Personas ({clusters.length})
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
        {clusters.map((c) => {
          const profile = c.loadProfile || Array.from({ length: 24 }, (_, h) => ({
            hour: `${String(h).padStart(2, '0')}:00`,
            kwh: c.centroid ? c.centroid[h] : 0,
          }));

          return (
            <div key={c.cluster_id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary)' }}>
                  {c.name || `Cluster ${c.cluster_id}`}
                </h4>
                <span className="badge" style={{ backgroundColor: 'rgba(255, 138, 101, 0.15)', color: '#ff8a65', border: '1px solid rgba(255, 138, 101, 0.3)' }}>
                  {c.size || 0} households ({c.pctShare || 0}%)
                </span>
              </div>
              <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                {c.description || 'Characteristic daily electricity usage signature.'}
              </p>

              {/* Hourly Load Curve */}
              <div style={{ height: '160px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={profile}>
                    <CartesianGrid strokeDasharray="2 2" stroke="#332227" />
                    <XAxis dataKey="hour" stroke="#987b74" fontSize={10} interval={4} />
                    <YAxis stroke="#987b74" fontSize={10} />
                    <Tooltip contentStyle={{ backgroundColor: '#261c20', borderColor: '#5e3c45', color: '#fff3ee', fontSize: '11px', borderRadius: '6px' }} />
                    <Line type="monotone" dataKey="kwh" stroke="#ff8a65" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', justifyContent: 'space-between' }}>
                <span>Peak Load: {(c.peakKwh || 0).toFixed(2)} kWh</span>
                <span>Base Load: {(c.baseKwh || 0).toFixed(2)} kWh</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* DBSCAN Outlier Analysis */}
      <div className="card">
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          DBSCAN Anomaly & Outlier Diagnostics
        </h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '1rem' }}>
          Identifies noise households whose usage cannot be reconciled with mainstream clusters.
        </p>

        {outliers.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No anomalous outliers detected in the active cohort.</p>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Household LCLID</th>
                  <th>Tariff</th>
                  <th>ACORN Group</th>
                  <th>Assigned Cluster</th>
                  <th>Outlier Score / Distance</th>
                </tr>
              </thead>
              <tbody>
                {outliers.slice(0, 10).map((out, idx) => (
                  <tr key={idx}>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{out.lclid || out.household_id}</td>
                    <td>{out.tariff || 'Std'}</td>
                    <td>{out.acorn_grouped || 'Urban'}</td>
                    <td>{out.clusterName || 'Noise'}</td>
                    <td style={{ color: 'var(--amber)' }}>{(out.distance || out.score || 0).toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
