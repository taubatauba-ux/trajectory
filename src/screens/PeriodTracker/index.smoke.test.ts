// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { db } from '../../data/db';
import PeriodTracker from './index';

describe('PeriodTracker screen (smoke)', () => {
  afterEach(() => cleanup());

  beforeEach(async () => {
    await db.periodEntries.clear();
  });

  it('shows the no-history empty state with zero entries', async () => {
    render(createElement(PeriodTracker));
    expect(await screen.findByText(/Tap a date below to log/i)).toBeTruthy();
  });

  it('opens the day entry sheet on a date tap, saves a flow, and updates the calendar dot', async () => {
    render(createElement(PeriodTracker));

    // The 1st of the currently-displayed month is always rendered (leading blanks are
    // unlabeled cells), so this doesn't depend on "today" happening to be in this test.
    const dayOneButtons = await screen.findAllByText('1');
    fireEvent.click(dayOneButtons[0]!);

    const heavyOption = await screen.findByText('Heavy');
    fireEvent.click(heavyOption);
    fireEvent.click(screen.getByText('Save'));

    // Sheet closes itself on save.
    await waitFor(() => expect(screen.queryByText('Heavy')).toBeNull());

    const stored = await db.periodEntries.toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.flow).toBe('heavy');
  });

  it('shows cycle stats once at least one episode is logged', async () => {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    await db.periodEntries.add({ id: 'e1', date: `${y}-${m}-01`, flow: 'medium' });

    render(createElement(PeriodTracker));
    expect(await screen.findByText('Current cycle')).toBeTruthy();
    expect(screen.getByText('Avg. cycle length')).toBeTruthy();
  });
});
