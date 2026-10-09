import React, { useState, useEffect } from 'react';
import { triggerPipeline, fetchPipelineStatus, triggerMining } from '../api.js';

export default function PipelineControl({ onRefresh }) {
  const [runningPipeline, setRunningPipeline] = useState(false);
  const [runningMining, setRunningMining] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const handleRunPipeline = async () => {
    try {
      setRunningPipeline(true);
      setErrorMsg(null);
      setStatusMsg('Starting ETL pipeline...');
      const res = await triggerPipeline();
      setStatusMsg(`Pipeline job ${res.jobId || 'initiated'}. Processing in background...`);
      // Poll a couple times
      setTimeout(async () => {
        try {
          const st = await fetchPipelineStatus();
          setStatusMsg(`Pipeline: ${st.status || 'running'}`);
          if (onRefresh) onRefresh();
        } catch {
          // ignore
        } finally {
          setRunningPipeline(false);
        }
      }, 3000);
    } catch (err) {
      setErrorMsg(err.message);
      setRunningPipeline(false);
    }
  };

  const handleRunMining = async () => {
    try {
      setRunningMining(true);
      setErrorMsg(null);
      setStatusMsg('Running Data Mining pipeline (K-Means, DBSCAN, Rules)...');
      const res = await triggerMining();
      setStatusMsg(`Mining completed: best k=${res.bestK}, ${res.rulesCount || 0} rules.`);
      if (onRefresh) onRefresh();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setRunningMining(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Pipeline Operations</h3>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
            Execute warehouse ETL ingestion or run data mining models on refreshed data.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            className="btn"
            onClick={handleRunPipeline}
            disabled={runningPipeline || runningMining}
          >
            {runningPipeline ? 'Running Pipeline...' : 'Run ETL Pipeline'}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleRunMining}
            disabled={runningPipeline || runningMining}
          >
            {runningMining ? 'Mining Data...' : 'Run Data Mining'}
          </button>
        </div>
      </div>

      {statusMsg && (
        <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--primary)' }}>
          {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div style={{ marginTop: '1rem' }} className="error-banner">
          {errorMsg}
        </div>
      )}
    </div>
  );
}
