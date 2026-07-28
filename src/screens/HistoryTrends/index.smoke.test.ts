// @vitest-environment jsdom
//
// Per-file environment override (a standard Vitest feature) rather than changing
// vitest.config.ts's global `environment: 'node'` — the engine's existing tests are
// pure computation and run faster under 'node'; only screen-rendering tests need a DOM.
// Kept as a `.test.ts` file (not `.test.tsx`) using React.createElement instead of JSX
// so it still matches vitest.config.ts's current `include: ['src/**/*.{test,spec}.ts']`
// glob unmodified — see PART5_PROGRESS_REPORT.md for why this screen avoids touching
// that shared config file.
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { db } from '../../data/db';
import HistoryTrends from './index';

// jsdom doesn't implement ResizeObserver; Recharts' <ResponsiveContainer> needs one to
// mount at all. This no-op stub is the standard workaround (Recharts only uses it to
// react to container resizes, which don't happen in a one-shot render test anyway).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver = ResizeObserverStub;

describe('HistoryTrends screen (smoke)', () => {
  afterEach(() => cleanup());

  beforeEach(async () => {
    await Promise.all([
      db.profile.clear(),
      db.weighIns.clear(),
      db.logEntries.clear(),
    ]);
  });

  it('renders the no-profile empty state on a fresh database', async () => {
    render(createElement(HistoryTrends));
    expect(await screen.findByText('No profile yet')).toBeTruthy();
  });

  it('renders the no-weighins empty state once a profile exists but has no weigh-ins', async () => {
    await db.profile.add({
      id: 'p1',
      sex: 'female',
      dateOfBirth: '1994-03-10',
      heightCm: 165,
      goal: { type: 'cut' },
      measurements: {},
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });
    render(createElement(HistoryTrends));
    expect(await screen.findByText('No weigh-ins yet')).toBeTruthy();
  });

  it('renders charts, adherence panel, and export button once real data is present', async () => {
    await db.profile.add({
      id: 'p1',
      sex: 'male',
      dateOfBirth: '1990-06-01',
      heightCm: 178,
      goal: { type: 'cut', targetWeightKg: 78 },
      measurements: {},
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });
    // Two weeks of daily weigh-ins, gently trending down, is enough for the Kalman
    // filter to produce a real replay series rather than a single cold-start point.
    const weighIns = Array.from({ length: 14 }, (_, i) => ({
      id: `w${i}`,
      date: `2026-06-${String(i + 1).padStart(2, '0')}`,
      weightKg: 85 - i * 0.05,
    }));
    await db.weighIns.bulkAdd(weighIns);
    await db.logEntries.bulkAdd(
      weighIns.slice(0, 10).map((w, i) => ({
        id: `e${i}`,
        date: w.date,
        loggedAt: `${w.date}T12:00:00Z`,
        foodItemId: 'food-1',
        grams: 200,
        macrosAtLogTime: { kcal: 2200, proteinG: 150, fatG: 70, carbG: 220 },
      })),
    );

    render(createElement(HistoryTrends, null));

    expect(await screen.findByText('History & Trends')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Export CSV')).toBeTruthy());
    expect(screen.getByText('Weight trend')).toBeTruthy();
    expect(screen.getByText('Logged-days streak')).toBeTruthy();
    expect(screen.getByText('Accuracy, last 7 days')).toBeTruthy();
    expect(screen.getByText('Accuracy, last 30 days')).toBeTruthy();
    // Two Recharts ResponsiveContainers should have mounted (weight + expenditure).
    expect(document.querySelectorAll('.recharts-responsive-container').length).toBe(2);
  });
});
