import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../data/db';
import { setDayEntry } from './usePeriodEntries';

describe('setDayEntry (Dexie-backed)', () => {
  beforeEach(async () => {
    await db.periodEntries.clear();
  });

  it('creates a new entry with flow and/or symptoms', async () => {
    await setDayEntry('2026-07-14', { flow: 'medium', symptoms: ['cramps', 'fatigue'] });
    const entry = await db.periodEntries.where('date').equals('2026-07-14').first();
    expect(entry).toMatchObject({ date: '2026-07-14', flow: 'medium', symptoms: ['cramps', 'fatigue'] });
  });

  it('updates an existing entry in place rather than creating a duplicate', async () => {
    await setDayEntry('2026-07-14', { flow: 'light' });
    await setDayEntry('2026-07-14', { flow: 'heavy' });
    const all = await db.periodEntries.where('date').equals('2026-07-14').toArray();
    expect(all).toHaveLength(1);
    expect(all[0]!.flow).toBe('heavy');
  });

  it('deletes the entry when set to empty (no flow, no symptoms)', async () => {
    await setDayEntry('2026-07-14', { flow: 'light' });
    await setDayEntry('2026-07-14', {});
    const entry = await db.periodEntries.where('date').equals('2026-07-14').first();
    expect(entry).toBeUndefined();
  });

  it('treats an empty symptoms array as empty too', async () => {
    await setDayEntry('2026-07-14', { flow: 'light' });
    await setDayEntry('2026-07-14', { symptoms: [] });
    const entry = await db.periodEntries.where('date').equals('2026-07-14').first();
    expect(entry).toBeUndefined();
  });

  it('is a no-op (not an error) clearing a date that never had an entry', async () => {
    await expect(setDayEntry('2026-07-14', {})).resolves.toBeUndefined();
    expect(await db.periodEntries.count()).toBe(0);
  });
});
