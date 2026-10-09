import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AdvisorPage from '../src/pages/AdvisorPage.jsx';
import * as api from '../src/api.js';

vi.mock('../src/api.js');

describe('AdvisorPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders advisor page and simulates what-if impacts', async () => {
    api.fetchMiningClusters.mockResolvedValue({
      clusters: [
        { cluster_id: 1, name: 'Evening Peakers', size: 30 },
      ],
    });
    api.fetchMiningRules.mockResolvedValue({
      rules: [
        { id: 101, antecedent: 'season:winter', consequent: 'usage:high', lift: 1.4 },
      ],
    });
    api.calculateImpact.mockResolvedValue({
      whatIf: {
        kwhSavedReduction: 250.0,
        kwhShiftedOffPeak: 120.0,
        totalCo2Saved: 76.5,
        annualisedCo2Saved: 310.2,
      },
      formula: [
        'kWh saved = 2500 x 10% = 250 kWh',
        'CO2 saved = 250 x 0.207 = 51.75 kg',
      ],
      tariffNote: 'Calculated using standard baseline.',
    });
    api.fetchRecommendation.mockResolvedValue({
      mode: 'template',
      recommendation: 'Shift appliance cycles away from peak hours 16:00-20:00 to reduce strain.',
      citations: [
        { chunkId: 'peak_shifting#1', doc: 'peak_shifting.md', text: 'Peak load shifting lowers carbon...' },
      ],
    });

    render(<AdvisorPage />);

    await waitFor(() => {
      expect(screen.getByText(/Decision Support & Policy Impact Advisor/i)).toBeDefined();
      expect(screen.getByText(/Evening Peakers/i)).toBeDefined();
      expect(screen.getByText('250.0 kWh')).toBeDefined();
      expect(screen.getByText('76.5 kg')).toBeDefined();
    });

    // Click Generate Recommendation button
    const recButton = screen.getByText('Generate DSS Recommendation');
    fireEvent.click(recButton);

    await waitFor(() => {
      expect(screen.getByText(/Mode: TEMPLATE/i)).toBeDefined();
      expect(screen.getByText(/Shift appliance cycles away from peak hours/i)).toBeDefined();
      expect(screen.getByText(/peak_shifting#1/i)).toBeDefined();
    });
  });

  it('handles slider adjustments correctly', async () => {
    api.fetchMiningClusters.mockResolvedValue({
      clusters: [{ cluster_id: 1, name: 'Evening Peakers', size: 30 }],
    });
    api.fetchMiningRules.mockResolvedValue({ rules: [] });
    api.calculateImpact.mockResolvedValue({
      whatIf: {
        kwhSavedReduction: 300,
        kwhShiftedOffPeak: 150,
        totalCo2Saved: 90,
        annualisedCo2Saved: 360,
      },
      formula: ['Formula output'],
    });

    render(<AdvisorPage />);

    await waitFor(() => {
      expect(screen.getByText(/Evening Peakers/i)).toBeDefined();
    });

    const sliders = screen.getAllByRole('slider');
    expect(sliders.length).toBe(2);

    fireEvent.change(sliders[0], { target: { value: 25 } });
    expect(api.calculateImpact).toHaveBeenCalled();
  });
});
