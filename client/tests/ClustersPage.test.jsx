import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ClustersPage from '../src/pages/ClustersPage.jsx';
import * as api from '../src/api.js';

vi.mock('../src/api.js');

describe('ClustersPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    api.fetchMiningClusters.mockReturnValue(new Promise(() => {}));
    api.fetchMiningEvaluation.mockReturnValue(new Promise(() => {}));
    api.fetchMiningOutliers.mockReturnValue(new Promise(() => {}));

    render(<ClustersPage />);
    expect(screen.getByText(/Loading cluster models/i)).toBeDefined();
  });

  it('renders persona archetypes and DBSCAN outliers', async () => {
    api.fetchMiningClusters.mockResolvedValue({
      clusters: [
        {
          cluster_id: 1,
          name: 'Evening Peakers',
          size: 28,
          pctShare: '46.7',
          description: 'High evening consumption spike.',
          peakKwh: 1.45,
          baseKwh: 0.35,
          loadProfile: Array.from({ length: 24 }, (_, i) => ({ hour: `${i}:00`, kwh: 0.5 + (i >= 17 ? 0.8 : 0) })),
        },
      ],
    });
    api.fetchMiningEvaluation.mockResolvedValue({
      kEvaluation: [
        { k: 2, silhouette: 0.42 },
        { k: 3, silhouette: 0.48 },
      ],
    });
    api.fetchMiningOutliers.mockResolvedValue({
      outliers: [
        { lclid: 'MAC000099', tariff: 'Std', acorn_grouped: 'Affluent', clusterName: 'Noise', score: 0.88 },
      ],
    });

    render(<ClustersPage />);

    await waitFor(() => {
      expect(screen.getByText(/Household Consumption Clusters/i)).toBeDefined();
      expect(screen.getByText('Evening Peakers')).toBeDefined();
      expect(screen.getByText(/28 households/i)).toBeDefined();
      expect(screen.getByText('MAC000099')).toBeDefined();
    });
  });

  it('renders error state on fetch rejection', async () => {
    api.fetchMiningClusters.mockRejectedValue(new Error('Mining results not ready'));

    render(<ClustersPage />);

    await waitFor(() => {
      expect(screen.getByText(/Mining results not ready/i)).toBeDefined();
    });
  });
});
