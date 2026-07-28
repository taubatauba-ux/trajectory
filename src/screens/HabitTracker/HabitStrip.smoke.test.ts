// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { db } from '../../data/db';
import { HabitStrip } from './HabitStrip';

describe('HabitStrip (smoke)', () => {
  afterEach(() => cleanup());

  beforeEach(async () => {
    await Promise.all([db.habitDefinitions.clear(), db.habitEntries.clear()]);
  });

  it('renders nothing when there are no habits, rather than an empty shell', async () => {
    const { container } = render(createElement(HabitStrip));
    await waitFor(() => expect(container.innerHTML).toBe(''));
  });

  it('renders only active habits and toggles today\'s entry on tap', async () => {
    await db.habitDefinitions.bulkAdd([
      { id: 'h1', name: 'Water', icon: '💧', active: true },
      { id: 'h2', name: 'Retired habit', icon: '🗑️', active: false },
    ]);

    render(createElement(HabitStrip, { date: '2026-07-14' }));
    await screen.findByTitle('Water');
    expect(screen.queryByTitle('Retired habit')).toBeNull();

    const button = screen.getByLabelText('Mark Water done for today');
    expect(button.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.getByLabelText('Mark Water not done for today').getAttribute('aria-pressed')).toBe('true'),
    );

    const entry = await db.habitEntries.where('[habitId+date]').equals(['h1', '2026-07-14']).first();
    expect(entry?.completed).toBe(true);
  });
});
