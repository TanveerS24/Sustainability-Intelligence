import React, { useState, useEffect } from 'react';
import { fetchOlapRollup, fetchOlapDrilldown } from '../api.js';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export default function WarehousePage() {
  const [dim, setDim] = useState('community');
  const [level, setLevel] = useState('acorn_grouped');
  const [rollupData, setRollupData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [drilldownKey, setDrilldownKey] = useState(null);
  const [drilldownData, setDrilldownData] = useState(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);

  const loadRollup = async () => {
    try {
      setLoading(true);
      setError(null);
      setDrilldownKey(null);
      setDrilldownData(null);
      const res = await fetchOlapRollup(dim, level);
      setRollupData(res.rows || []);
    } catch (err) {
      setError(err.message || 'Failed to execute OLAP roll-up');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRollup();
  }, [dim, level]);

  const handleDrilldown = async (keyVal) => {
    try {
      setDrilldownLoading(true);
      setDrilldownKey(keyVal);
      const params = dim === 'time' ? { date: keyVal } : { acornGroup: keyVal };
      const res = await fetchOlapDrilldown(params);
      setDrilldownData(res.rows || []);
    } catch (err) {
      setError(err.message || 'Drill-down failed');
    } finally {
      setDrilldownLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Warehouse Explorer & OLAP Engine</h1>
          <p className="page-desc">
            Multi-dimensional analytical queries across Time, Community (SDG 11), and Tariff dimensions
          </p>
        </div>
      </div>

      {/* Control selectors */}
      <div className="card" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)', display: 'block', marginBottom: '0.25rem' }}>
            DIMENSION
          </label>
          <select
            className="select-control"
            value={dim}
            onChange={(e) => {
              const newDim = e.target.value;
              setDim(newDim);
              if (newDim === 'time') setLevel('month');
              else if (newDim === 'community') setLevel('acorn_grouped');
              else setLevel('tariff');
            }}
          >
            <option value="community">Community (ACORN / SDG 11)</option>
            <option value="time">Time Hierarchy</option>
            <option value="tariff">Tariff Plan (Std vs ToU)</option>
          </select>
        </div>

        <div>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)', display: 'block', marginBottom: '0.25rem' }}>
            GRANULARITY / LEVEL
          </label>
          <select
            className="select-control"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
            {dim === 'time' && (
              <>
                <option value="month">Month</option>
                <option value="season">Season</option>
                <option value="day">Day</option>
                <option value="hour">Hour of Day</option>
              </>
            )}
            {dim === 'community' && (
              <>
                <option value="acorn_grouped">Broad Community Group</option>
                <option value="acorn">Detailed ACORN Category</option>
              </>
            )}
            {dim === 'tariff' && (
              <option value="tariff">Tariff Type</option>
            )}
          </select>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="state-box">Executing OLAP aggregation query...</div>
      ) : rollupData.length === 0 ? (
        <div className="state-box">No records returned for this roll-up view.</div>
      ) : (
        <>
          {/* Chart View */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>
              Roll-up Aggregation: Total kWh by {level}
            </h3>
            <div style={{ height: '280px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rollupData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#332227" />
                  <XAxis dataKey="label" stroke="#987b74" fontSize={12} />
                  <YAxis stroke="#987b74" fontSize={12} />
                  <Tooltip contentStyle={{ backgroundColor: '#261c20', borderColor: '#5e3c45', color: '#fff3ee', borderRadius: '6px' }} />
                  <Bar dataKey="total_kwh" fill="#ff8a65" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Table View */}
          <div className="table-wrapper" style={{ marginBottom: '1.5rem' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Category / Key</th>
                  <th>Total kWh</th>
                  <th>Total CO₂ (kg)</th>
                  <th>Mean kWh</th>
                  <th>Households</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rollupData.map((row, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 600 }}>{row.label || row.group_key || `Item ${idx}`}</td>
                    <td>{(row.total_kwh || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                    <td>{(row.total_co2 || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                    <td>{(row.mean_kwh || 0).toFixed(3)}</td>
                    <td>{row.household_count || '–'}</td>
                    <td>
                      <button
                        className="btn"
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                        onClick={() => handleDrilldown(row.label || row.group_key)}
                      >
                        Drill Down
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Drilldown Section */}
          {drilldownKey && (
            <div className="card">
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                Drill-Down: Sub-aggregates for "{drilldownKey}"
              </h3>
              {drilldownLoading ? (
                <p style={{ color: 'var(--text-muted)' }}>Loading drilldown rows...</p>
              ) : drilldownData && drilldownData.length > 0 ? (
                <div className="table-wrapper" style={{ marginTop: '1rem' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Detail Sub-Key</th>
                        <th>Total kWh</th>
                        <th>CO₂ (kg)</th>
                        <th>Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drilldownData.map((d, i) => (
                        <tr key={i}>
                          <td>{d.sub_key || d.hour || d.lclid || `Row ${i}`}</td>
                          <td>{(d.kwh || d.total_kwh || 0).toFixed(2)}</td>
                          <td>{(d.co2_kg || d.total_co2 || 0).toFixed(2)}</td>
                          <td>{d.readings || d.count || '–'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                  No drilldown sub-levels available for this selection.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
