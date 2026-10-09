import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import RulesPage from '../src/pages/RulesPage.jsx';
import * as api from '../src/api.js';

vi.mock('../src/api.js');

describe('RulesPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    api.fetchMiningClusters.mockReturnValue(new Promise(() => {}));
    api.fetchMiningRules.mockReturnValue(new Promise(() => {}));

    render(<RulesPage />);
    expect(screen.getByText(/Mining association patterns/i)).toBeDefined();
  });

  it('renders association rules with metrics and explanations', async () => {
    api.fetchMiningClusters.mockResolvedValue({
      clusters: [{ cluster_id: 1, name: 'Evening Peakers' }],
    });
    api.fetchMiningRules.mockResolvedValue({
      rules: [
        {
          antecedent: 'season:winter, temp:cold',
          consequent: 'usage:high',
          support: 0.18,
          confidence: 0.72,
          lift: 1.65,
          explanation: 'Cold winter days lead to high consumption 1.65x more often than baseline.',
        },
      ],
    });

    render(<RulesPage />);

    await waitFor(() => {
      expect(screen.getByText(/Behavioral Association Rules/i)).toBeDefined();
      expect(screen.getByText(/season:winter, temp:cold/i)).toBeDefined();
      expect(screen.getByText(/usage:high/i)).toBeDefined();
      expect(screen.getAllByText(/1.65x/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/Cold winter days lead to high consumption/i)).toBeDefined();
    });
  });

  it('renders empty state when no rules exist', async () => {
    api.fetchMiningClusters.mockResolvedValue({ clusters: [] });
    api.fetchMiningRules.mockResolvedValue({ rules: [] });

    render(<RulesPage />);

    await waitFor(() => {
      expect(screen.getByText(/No association rules found/i)).toBeDefined();
    });
  });
});
