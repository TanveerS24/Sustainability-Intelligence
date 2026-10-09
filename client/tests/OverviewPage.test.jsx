import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OverviewPage from '../src/pages/OverviewPage.jsx';
import * as api from '../src/api.js';

vi.mock('../src/api.js');

describe('OverviewPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    api.fetchOlapSummary.mockReturnValue(new Promise(() => {}));
    api.fetchHealth.mockReturnValue(new Promise(() => {}));

    render(
      <MemoryRouter>
        <OverviewPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/Loading Sustainability DSS Overview/i)).toBeDefined();
  });

  it('renders data state with KPIs and badges', async () => {
    api.fetchOlapSummary.mockResolvedValue({
      totals: {
        totalKwh: 45000.5,
        totalCo2: 9315.1,
        households: 60,
        readingsCount: 129600,
        dateRange: { start: '2013-01-01', end: '2013-03-31' },
        isDemo: true,
      },
      quality: {
        duplicates: 0,
        missing: 150,
        outliers: 25,
        retentionRate: 0.985,
      },
      monthlyTrend: [
        { period: '2013-01', kwh: 15000 },
        { period: '2013-02', kwh: 14000 },
      ],
    });
    api.fetchHealth.mockResolvedValue({ status: 'ok' });

    render(
      <MemoryRouter>
        <OverviewPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Sustainability Intelligence Overview/i)).toBeDefined();
      expect(screen.getByText(/Demo Synthetic Data/i)).toBeDefined();
      expect(screen.getByText(/45,000.5 kWh/i)).toBeDefined();
      expect(screen.getByText('60')).toBeDefined();
      expect(screen.getByText(/SDG 7/i)).toBeDefined();
      expect(screen.getByText(/SDG 13/i)).toBeDefined();
    });
  });

  it('renders error state when fetch fails', async () => {
    api.fetchOlapSummary.mockRejectedValue(new Error('Network connection failed'));
    api.fetchHealth.mockResolvedValue({ status: 'ok' });

    render(
      <MemoryRouter>
        <OverviewPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Failed to connect: Network connection failed/i)).toBeDefined();
      expect(screen.getByText(/Retry/i)).toBeDefined();
    });
  });
});
