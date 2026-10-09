import React from 'react';
import { NavLink } from 'react-router-dom';

export default function Navbar() {
  return (
    <header className="header-bar">
      <div className="brand-section">
        <svg className="brand-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L2 7l10 5 10-5-10-5zm0 8.5L4.5 7 12 3.5 19.5 7 12 10.5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
        <div>
          <div className="brand-title">Sustainability Intelligence</div>
          <div className="brand-subtitle">Knowledge-Augmented Decision Support System</div>
        </div>
      </div>

      <nav>
        <ul className="nav-links">
          <li>
            <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Overview
            </NavLink>
          </li>
          <li>
            <NavLink to="/warehouse" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Warehouse Explorer
            </NavLink>
          </li>
          <li>
            <NavLink to="/clusters" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Clusters
            </NavLink>
          </li>
          <li>
            <NavLink to="/rules" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Rules
            </NavLink>
          </li>
          <li>
            <NavLink to="/advisor" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Advisor & Impact
            </NavLink>
          </li>
        </ul>
      </nav>
    </header>
  );
}
