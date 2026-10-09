import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import WarehousePage from '../src/pages/WarehousePage.jsx';
import * as api from '../src/api.js';

vi.mock('../src/api.js');

describe('WarehousePage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    api.fetchOlapRollup.mockReturnValue(new Promise(() => {}));

    render(<WarehousePage />);
    expect(screen.getByText(/Executing OLAP aggregation query/i)).toBeDefined();
  });

  it('renders OLAP table and supports drill-down', async () => {
    api.fetchOlapRollup.mockResolvedValue({
      rows: [
        { label: 'Affluent', total_kwh: 5200.4, total_co2: 1076.4, mean_kwh: 0.65, household_count: 20 },
        { label: 'Comfortable', total_kwh: 4100.2, total_co2: 848.7, mean_kwh: 0.51, household_count: 18 },
      ],
    });
    api.fetchOlapDrilldown.mockResolvedValue({
      rows: [
        { sub_key: 'ACORN-A', kwh: 2600.2, co2_kg: 538.2, readings: 1200 },
        { sub_key: 'ACORN-B', kwh: 2600.2, co2_kg: 538.2, readings: 1200 },
      ],
    });

    render(<WarehousePage />);

    await waitFor(() => {
      expect(screen.getByText(/Warehouse Explorer & OLAP Engine/i)).toBeDefined();
      expect(screen.getByText('Affluent')).toBeDefined();
      expect(screen.getByText('Comfortable')).toBeDefined();
    });

    const drillButtons = screen.getAllByText('Drill Down');
    expect(drillButtons.length).toBe(2);
    fireEvent.click(drillButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Sub-aggregates for "Affluent"/i)).toBeDefined();
      expect(screen.getByText('ACORN-A')).toBeDefined();
    });
  });

  it('handles error state gracefully', async () => {
    api.fetchOlapRollup.mockRejectedValue(new Error('Database locked'));

    render(<WarehousePage />);

    await waitFor(() => {
      expect(screen.getByText('Database locked')).toBeDefined();
    });
  });
});
