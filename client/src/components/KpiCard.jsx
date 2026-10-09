import React from 'react';

export default function KpiCard({ title, value, subtext, sdg, icon }) {
  return (
    <div className="card">
      <div className="kpi-label">
        <span>{title}</span>
        {sdg && <span className={`sdg-tag sdg-${sdg}`}>SDG {sdg}</span>}
      </div>
      <div className="kpi-value">{value}</div>
      {subtext && <div className="kpi-sub">{subtext}</div>}
    </div>
  );
}
