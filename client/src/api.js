/**
 * Centralized API client module.
 * All client HTTP calls to backend endpoints pass through here.
 */

const BASE_URL = import.meta.env.VITE_API_URL || '';

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = data?.error?.message || `Request failed with status ${response.status}`;
    const err = new Error(errorMsg);
    err.code = data?.error?.code || 'HTTP_ERROR';
    err.status = response.status;
    throw err;
  }

  return data;
}

export async function fetchHealth() {
  return request('/api/health');
}

export async function triggerPipeline() {
  return request('/api/pipeline/run', { method: 'POST' });
}

export async function fetchPipelineStatus() {
  return request('/api/pipeline/status');
}

export async function fetchOlapSummary() {
  return request('/api/olap/summary');
}

export async function fetchOlapRollup(dim = 'time', level = 'month') {
  return request(`/api/olap/rollup?dim=${encodeURIComponent(dim)}&level=${encodeURIComponent(level)}`);
}

export async function fetchOlapDrilldown(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return request(`/api/olap/drilldown?${qs}`);
}

export async function triggerMining() {
  return request('/api/mining/run', { method: 'POST' });
}

export async function fetchMiningClusters() {
  return request('/api/mining/clusters');
}

export async function fetchMiningOutliers() {
  return request('/api/mining/outliers');
}

export async function fetchMiningRules(clusterId = null) {
  const endpoint = clusterId !== null && clusterId !== undefined
    ? `/api/mining/rules?clusterId=${encodeURIComponent(clusterId)}`
    : '/api/mining/rules';
  return request(endpoint);
}

export async function fetchMiningEvaluation() {
  return request('/api/mining/evaluation');
}

export async function calculateImpact(payload) {
  return request('/api/impact', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchRecommendation(payload) {
  return request('/api/advisor/recommend', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchRagQuery(payload) {
  return request('/api/rag/query', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function triggerRagIngest(payload = {}) {
  return request('/api/rag/ingest', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchRagStatus() {
  return request('/api/rag/status');
}

export async function fetchRagSources() {
  return request('/api/rag/sources');
}

export async function fetchClusters() {
  return request('/api/clusters');
}

export async function fetchClusterDetail(clusterId) {
  return request(`/api/clusters/${encodeURIComponent(clusterId)}`);
}

export async function simulateSustainability(payload) {
  return request('/api/sustainability/simulate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
