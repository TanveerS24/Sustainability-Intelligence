import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import OverviewPage from './pages/OverviewPage.jsx';
import WarehousePage from './pages/WarehousePage.jsx';
import ClustersPage from './pages/ClustersPage.jsx';
import RulesPage from './pages/RulesPage.jsx';
import AdvisorPage from './pages/AdvisorPage.jsx';

export default function App() {
  return (
    <div className="app-container">
      <Navbar />

      <main className="main-content">
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/warehouse" element={<WarehousePage />} />
          <Route path="/clusters" element={<ClustersPage />} />
          <Route path="/rules" element={<RulesPage />} />
          <Route path="/advisor" element={<AdvisorPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <footer className="footer-bar">
        Sustainability Intelligence Decision Support System • Powered by Smart Meters in London & UN SDGs 7, 11, 12, 13
      </footer>
    </div>
  );
}
