import React, { useState, useEffect } from 'react';
import { fetchMiningRules, fetchMiningClusters } from '../api.js';

export default function RulesPage() {
  const [clusters, setClusters] = useState([]);
  const [selectedCluster, setSelectedCluster] = useState('all');
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortField, setSortField] = useState('lift');
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const [clRes, rRes] = await Promise.all([
          fetchMiningClusters().catch(() => ({ clusters: [] })),
          fetchMiningRules(selectedCluster === 'all' ? null : selectedCluster),
        ]);
        setClusters(clRes.clusters || []);
        setRules(rRes.rules || []);
      } catch (err) {
        setError(err.message || 'Failed to retrieve association rules');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [selectedCluster]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const sortedRules = [...rules].sort((a, b) => {
    const va = a[sortField] || 0;
    const vb = b[sortField] || 0;
    return sortAsc ? va - vb : vb - va;
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Behavioral Association Rules (CO5)</h1>
          <p className="page-desc">
            Discovered Relationships: Seasonality, Temperature, Tariffs, and Consumption Levels
          </p>
        </div>
      </div>

      {/* Cluster Filter */}
      <div className="card" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>FILTER BY PERSONA:</label>
        <select
          className="select-control"
          value={selectedCluster}
          onChange={(e) => setSelectedCluster(e.target.value)}
        >
          <option value="all">All Clusters</option>
          {clusters.map((c) => (
            <option key={c.cluster_id} value={c.cluster_id}>
              {c.name || `Cluster ${c.cluster_id}`}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="state-box">Mining association patterns...</div>
      ) : sortedRules.length === 0 ? (
        <div className="state-box">
          No association rules found for the selected criteria. Ensure mining pipeline has been executed.
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Antecedent (Conditions)</th>
                <th>Consequent (Outcome)</th>
                <th onClick={() => handleSort('support')}>
                  Support {sortField === 'support' && (sortAsc ? '▲' : '▼')}
                </th>
                <th onClick={() => handleSort('confidence')}>
                  Confidence {sortField === 'confidence' && (sortAsc ? '▲' : '▼')}
                </th>
                <th onClick={() => handleSort('lift')}>
                  Lift {sortField === 'lift' && (sortAsc ? '▲' : '▼')}
                </th>
                <th>Plain-English Interpretation</th>
              </tr>
            </thead>
            <tbody>
              {sortedRules.map((rule, idx) => (
                <tr key={idx}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--cyan)' }}>
                    {rule.antecedent}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 600 }}>
                    {rule.consequent}
                  </td>
                  <td>{((rule.support || 0) * 100).toFixed(1)}%</td>
                  <td>{((rule.confidence || 0) * 100).toFixed(1)}%</td>
                  <td>
                    <span
                      style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        backgroundColor: (rule.lift || 0) >= 1.5 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                        color: (rule.lift || 0) >= 1.5 ? 'var(--primary)' : 'inherit',
                        fontWeight: 600,
                      }}
                    >
                      {(rule.lift || 0).toFixed(2)}x
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '420px' }}>
                    {rule.explanation}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
