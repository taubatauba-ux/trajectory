import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../data/db';
import { createHabit, updateHabit, setHabitActive, toggleHabitEntry } from './useHabits';

describe('habit write operations (Dexie-backed)', () => {
  beforeEach(async () => {
    await Promise.all([db.habitDefinitions.clear(), db.habitEntries.clear()]);
  });

  describe('createHabit', () => {
    it('creates an active habit with a generated id', async () => {
      await createHabit('Drink water', '💧');
      const all = await db.habitDefinitions.toArray();
      expect(all).toHaveLength(1);
      expect(all[0]).toMatchObject({ name: 'Drink water', icon: '💧', active: true });
      expect(all[0]!.id).toBeTruthy();
    });

    it('trims whitespace and rejects an empty name', async () => {
      await createHabit('  Sleep 8h  ');
      expect((await db.habitDefinitions.toArray())[0]!.name).toBe('Sleep 8h');
      await expect(createHabit('   ')).rejects.toThrow(/empty/i);
    });
  });

  describe('updateHabit', () => {
    it('patches name and/or icon without touching other fields', async () => {
      await createHabit('Stretch', '🧘');
      const [habit] = await db.habitDefinitions.toArray();
      await updateHabit(habit!.id, { icon: '🤸' });
      const updated = await db.habitDefinitions.get(habit!.id);
      expect(updated).toMatchObject({ name: 'Stretch', icon: '🤸', active: true });
    });

    it('rejects patching the name to empty', async () => {
      await createHabit('Stretch');
      const [habit] = await db.habitDefinitions.toArray();
      await expect(updateHabit(habit!.id, { name: '   ' })).rejects.toThrow(/empty/i);
    });
  });

  describe('setHabitActive', () => {
    it('soft-deletes by flipping active, leaving the row (and its history) in place', async () => {
      await createHabit('Meditate');
      const [habit] = await db.habitDefinitions.toArray();
      await setHabitActive(habit!.id, false);
      const updated = await db.habitDefinitions.get(habit!.id);
      expect(updated?.active).toBe(false);
      expect(updated?.name).toBe('Meditate'); // still there, just inactive
    });
  });

  describe('toggleHabitEntry', () => {
    it('creates a completed entry on first toggle', async () => {
      await toggleHabitEntry('habit-1', '2026-07-14');
      const entry = await db.habitEntries.where('[habitId+date]').equals(['habit-1', '2026-07-14']).first();
      expect(entry?.completed).toBe(true);
    });

    it('flips an existing entry on subsequent toggles rather than duplicating it', async () => {
      await toggleHabitEntry('habit-1', '2026-07-14');
      await toggleHabitEntry('habit-1', '2026-07-14');
      const all = await db.habitEntries.where('[habitId+date]').equals(['habit-1', '2026-07-14']).toArray();
      expect(all).toHaveLength(1);
      expect(all[0]!.completed).toBe(false);

      await toggleHabitEntry('habit-1', '2026-07-14');
      const again = await db.habitEntries.where('[habitId+date]').equals(['habit-1', '2026-07-14']).first();
      expect(again?.completed).toBe(true);
    });

    it('keeps separate habits\' entries for the same date independent', async () => {
      await toggleHabitEntry('habit-1', '2026-07-14');
      await toggleHabitEntry('habit-2', '2026-07-14');
      const h1 = await db.habitEntries.where('[habitId+date]').equals(['habit-1', '2026-07-14']).first();
      const h2 = await db.habitEntries.where('[habitId+date]').equals(['habit-2', '2026-07-14']).first();
      expect(h1?.completed).toBe(true);
      expect(h2?.completed).toBe(true);
    });
  });
});
