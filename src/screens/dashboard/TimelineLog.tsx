import { useState } from 'react';
import type { LogEntry, FoodItem } from '../../types';
import { LedgerRow } from '../../components/LedgerRow';
import { TagChip } from '../../components/TagChip';
import { PencilIcon, TrashIcon } from '../../components/icons';
import { formatLogTime } from '../../lib/dateUtils';
import { roundKcal, roundGrams, scaleMacros } from '../../lib/macros';

interface TimelineLogProps {
  /** Today's entries only, already sorted by loggedAt. */
  entries: LogEntry[];
  foodItemsById: Map<string, FoodItem>;
  onDelete: (entry: LogEntry) => void;
  /** The new macrosAtLogTime is computed by the caller (Dexie write lives in
   * DashboardScreen) — this just hands back the entry, the food it resolved to, and the
   * new gram amount to scale from. */
  onUpdateGrams: (entry: LogEntry, food: FoodItem, newGrams: number) => void;
}

/** §9.2: "a single chronological list for the day ... no meal boundaries to manage" —
 * deliberately NOT grouped by breakfast/lunch/dinner. */
export function TimelineLog({ entries, foodItemsById, onDelete, onUpdateGrams }: TimelineLogProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-ink-muted">
        Nothing logged yet today — search above to add your first thing.
      </div>
    );
  }

  return (
    <div>
      {entries.map((entry) => {
        const food = foodItemsById.get(entry.foodItemId);
        const isEditing = editingId === entry.id;
        return (
          <LedgerRow
            key={entry.id}
            actions={[
              ...(food
                ? [
                    {
                      key: 'edit',
                      label: 'Edit',
                      icon: <PencilIcon size={16} />,
                      onTrigger: () => setEditingId(entry.id),
                    },
                  ]
                : []),
              {
                key: 'delete',
                label: 'Delete',
                icon: <TrashIcon size={16} />,
                onTrigger: () => onDelete(entry),
                tone: 'danger',
              },
            ]}
          >
            <div className="px-4 py-2.5">
              <div className="flex items-center gap-2.5">
                {food && <TagChip item={food} />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] text-ink">{food?.displayName ?? 'Deleted food'}</div>
                  <div className="mt-0.5 font-mono text-[11px] tabular-nums text-ink-muted">
                    {roundGrams(entry.grams)}g · {formatLogTime(entry.loggedAt)}
                  </div>
                </div>
                <div className="font-mono text-sm tabular-nums text-ink">
                  {roundKcal(entry.macrosAtLogTime.kcal)}
                </div>
              </div>
              {isEditing && food && (
                <InlineGramsEditor
                  food={food}
                  initialGrams={entry.grams}
                  onCancel={() => setEditingId(null)}
                  onConfirm={(newGrams) => {
                    onUpdateGrams(entry, food, newGrams);
                    setEditingId(null);
                  }}
                />
              )}
            </div>
          </LedgerRow>
        );
      })}
    </div>
  );
}

function InlineGramsEditor({
  food,
  initialGrams,
  onCancel,
  onConfirm,
}: {
  food: FoodItem;
  initialGrams: number;
  onCancel: () => void;
  onConfirm: (grams: number) => void;
}) {
  const [grams, setGrams] = useState(initialGrams);
  const live = scaleMacros(food.per100g, grams);

  return (
    <div className="mt-2.5 flex items-center gap-3 border-t border-hairline pt-2.5">
      <label className="flex items-center gap-1.5">
        <input
          type="number"
          inputMode="decimal"
          autoFocus
          value={grams}
          onChange={(e) => {
            const parsed = Number(e.target.value);
            setGrams(Number.isFinite(parsed) ? Math.max(0, parsed) : 0);
          }}
          className="w-16 rounded border border-hairline bg-surface px-2 py-1 font-mono text-sm tabular-nums text-ink outline-none"
        />
        <span className="text-xs text-ink-muted">g</span>
      </label>
      <span className="font-mono text-xs tabular-nums text-ink-muted">{roundKcal(live.kcal)} kcal</span>
      <div className="ml-auto flex gap-2">
        <button type="button" onClick={onCancel} className="rounded px-3 py-1.5 text-xs font-medium text-ink-muted">
          Cancel
        </button>
        <button
          type="button"
          disabled={grams <= 0}
          onClick={() => onConfirm(grams)}
          className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-bg disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </div>
  );
}
