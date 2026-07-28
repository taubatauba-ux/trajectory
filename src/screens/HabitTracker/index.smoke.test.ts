// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { db } from '../../data/db';
import HabitTracker from './index';
import { todayISO } from '../_shared/dates';

describe('HabitTracker screen (smoke)', () => {
  afterEach(() => cleanup());

  beforeEach(async () => {
    await Promise.all([db.habitDefinitions.clear(), db.habitEntries.clear()]);
  });

  it('shows the empty state with no habits yet', async () => {
    render(createElement(HabitTracker));
    expect(await screen.findByText(/No active habits yet/i)).toBeTruthy();
  });

  it('creates a habit through the form and shows it in Today', async () => {
    render(createElement(HabitTracker));

    fireEvent.click(await screen.findByText('+ Add habit'));
    const nameInput = await screen.findByPlaceholderText('e.g. Drink water');
    fireEvent.change(nameInput, { target: { value: 'Drink water' } });
    fireEvent.click(screen.getByText('💧'));
    fireEvent.click(screen.getByText('Add habit'));

    // The name legitimately appears in more than one place once habits exist (Today
    // row, history grid cell title, All-habits row) — this waits for at least one to
    // show up rather than asserting a single match.
    await waitFor(() => expect(screen.getAllByText('Drink water').length).toBeGreaterThan(0));
    expect(screen.getByText('No streak yet')).toBeTruthy();
  });

  it('toggling today\'s check-off updates the streak live, with no reload/refetch needed', async () => {
    const today = todayISO();
    await db.habitDefinitions.add({ id: 'h1', name: 'Meditate', icon: '🧘', active: true });

    render(createElement(HabitTracker));
    await waitFor(() => expect(screen.getAllByText('Meditate').length).toBeGreaterThan(0));
    expect(screen.getByText('No streak yet')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Mark Meditate done for today'));

    // useLiveQuery re-runs asynchronously after the Dexie write, so this needs to wait
    // rather than assert immediately — a real test of the "live" part of live-query.
    await waitFor(() => expect(screen.getByText('1 day streak')).toBeTruthy());

    const entry = await db.habitEntries.where('[habitId+date]').equals(['h1', today]).first();
    expect(entry?.completed).toBe(true);
  });

  it('deactivating a habit removes it from Today but keeps it in All habits', async () => {
    await db.habitDefinitions.add({ id: 'h1', name: 'Journal', icon: '📖', active: true });
    render(createElement(HabitTracker));
    await waitFor(() => expect(screen.getAllByText('Journal').length).toBeGreaterThan(0));

    fireEvent.click(screen.getByText('Deactivate'));

    await waitFor(() => expect(screen.getByText(/No active habits yet/i)).toBeTruthy());
    // Only the All-habits row's <span> should remain once Today and the history grid
    // (which only render active habits) drop it — exactly one match now, not zero.
    expect(screen.getAllByText('Journal')).toHaveLength(1);
    expect(screen.getByText('(inactive)')).toBeTruthy();
  });
});
