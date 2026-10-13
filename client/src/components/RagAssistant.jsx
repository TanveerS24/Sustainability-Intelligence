import React, { useState } from 'react';
import { fetchRagQuery } from '../api.js';

const SAMPLE_QUESTIONS = [
  'How does peak shifting from 16:00 to 20:00 support SDG 7 and reduce grid emissions?',
  'What are the socioeconomic characteristics of ACORN-A and ACORN-E households?',
  'What temperature thresholds in London trigger winter peak space heating demand?',
  'How do Time-of-Use tariffs incentivize domestic demand flexibility?',
];

export default function RagAssistant({ selectedClusterId }) {
  const [ragQuery, setRagQuery] = useState('');
  const [ragResult, setRagResult] = useState(null);
  const [ragLoading, setRagLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleExecuteRagQuery = async (queryText = null) => {
    const q = (queryText || ragQuery).trim();
    if (!q) return;
    try {
      setRagLoading(true);
      setError(null);
      const res = await fetchRagQuery({
        query: q,
        clusterId: selectedClusterId,
      });
      setRagResult(res);
    } catch (err) {
      setError(err.message || 'Failed to execute RAG query');
    } finally {
      setRagLoading(false);
    }
  };

  return (
    <div
      className="card"
      style={{
        marginBottom: '1.5rem',
        background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%)',
        border: '1px solid rgba(255, 138, 101, 0.25)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.1rem' }}>🤖</span>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
            Grounded Sustainability Intelligence (Qwen3:14B)
          </h3>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <span className="badge" style={{ backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
            Model: qwen3:14b
          </span>
          <span className="badge" style={{ backgroundColor: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
            Embedder: nomic-embed-text (768d)
          </span>
        </div>
      </div>

      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Ask any question regarding smart-meter consumption, ACORN demographics, UK weather sensitivity, or SDG policy actions. Answers are strictly grounded in retrieved vector evidence.
      </p>

      {error && <div className="error-banner" style={{ marginBottom: '0.75rem' }}>{error}</div>}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <input
          type="text"
          className="select-control"
          style={{ flex: 1, padding: '0.6rem 0.8rem', fontSize: '0.9rem' }}
          placeholder="e.g. How does shifting peak load from 16:00 to 20:00 reduce carbon emissions?"
          value={ragQuery}
          onChange={(e) => setRagQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleExecuteRagQuery(); }}
        />
        <button
          className="btn btn-primary"
          onClick={() => handleExecuteRagQuery()}
          disabled={ragLoading || !ragQuery.trim()}
        >
          {ragLoading ? 'Analyzing & Generating...' : 'Ask Qwen3:14B'}
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', alignSelf: 'center', marginRight: '0.25rem' }}>
          Sample queries:
        </span>
        {SAMPLE_QUESTIONS.map((sq, i) => (
          <button
            key={i}
            type="button"
            className="citation-pill"
            style={{ cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)' }}
            onClick={() => {
              setRagQuery(sq);
              handleExecuteRagQuery(sq);
            }}
          >
            {sq}
          </button>
        ))}
      </div>

      {ragResult && (
        <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <strong style={{ fontSize: '0.9rem', color: 'var(--primary)' }}>
              Response Grounded in {ragResult.retrievedCount} Evidence Chunks ({ragResult.mode})
            </strong>
            {ragResult.citations && ragResult.citations.length > 0 && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                Validated Citations: {ragResult.citations.join(', ')}
              </span>
            )}
          </div>

          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: '#f1f5f9', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem' }}>
            {ragResult.answer}
          </div>

          <div>
            <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
              Retrieved Vector Chunks
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.5rem' }}>
              {ragResult.retrievedEvidence?.map((ev, i) => (
                <div key={i} style={{ background: 'var(--bg-surface-elevated)', padding: '0.6rem 0.8rem', borderRadius: '4px', fontSize: '0.8rem', borderLeft: '3px solid var(--primary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                    <strong>[{ev.chunkId}]</strong>
                    <span style={{ color: 'var(--cyan)' }}>sim: {ev.score}</span>
                  </div>
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>{ev.heading}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
