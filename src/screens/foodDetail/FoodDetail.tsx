import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import { newId } from '../../data/id';
import { scaleMacros } from '../../data/macrosMath';
import { formatMacroValue, populatedMacroFields } from '../../data/macroFields';
import { isRecipe } from '../../types/food';
import type { LogEntry } from '../../types/logging';
import { TagChip } from '../../components/TagChip';
import { DetailRow } from '../../components/DetailRow';
import { RecipeIngredientsList } from './RecipeIngredientsList';

export interface FoodDetailProps {
  foodItemId: string;
  /** Defaults to today. Accepting this rather than hardcoding "today" lets a future
   * "log to a past day" flow reuse this screen unchanged. */
  date?: string;
  onBack?: () => void;
  onLogged?: (entry: LogEntry) => void;
}

type PickerMode = 'grams' | 'serving';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function FoodDetail({ foodItemId, date, onBack, onLogged }: FoodDetailProps) {
  const item = useLiveQuery(() => db.foodItems.get(foodItemId), [foodItemId]);

  const [mode, setMode] = useState<PickerMode>('grams');
  const [gramsInput, setGramsInput] = useState('100');
  const [servingCount, setServingCount] = useState('1');
  const [logged, setLogged] = useState(false);
  const [isLogging, setIsLogging] = useState(false);
  const [logError, setLogError] = useState<string | undefined>(undefined);

  // "Added ✓" is a transient confirmation, not a persistent state — the button stays
  // usable so logging the same food a second time (a second serving) is one more tap,
  // not something the user has to "undo" a stuck checkmark for first.
  useEffect(() => {
    if (!logged) return;
    const timer = setTimeout(() => setLogged(false), 2000);
    return () => clearTimeout(timer);
  }, [logged]);

  if (item === undefined) {
    return (
      <div className="flex h-full min-h-[100dvh] items-center justify-center bg-bg">
        <p className="text-sm text-ink-muted">Loading…</p>
      </div>
    );
  }

  const grams =
    mode === 'grams'
      ? Number(gramsInput) || 0
      : (Number(servingCount) || 0) * (item.servingSuggestion?.grams ?? 0);

  const scaledMacros = scaleMacros(item.per100g, grams / 100);
  const fields = populatedMacroFields(scaledMacros);
  const headlineFields = fields.filter((f) => f.def.headline);
  const extendedFields = fields.filter((f) => !f.def.headline);

  async function handleAddToLog() {
    if (!item || grams <= 0 || isLogging) return;
    setIsLogging(true);
    setLogError(undefined);
    try {
      const entry: LogEntry = {
        id: newId(),
        date: date ?? todayISO(),
        loggedAt: new Date().toISOString(),
        foodItemId: item.id,
        grams,
        macrosAtLogTime: scaledMacros,
      };
      await db.logEntries.put(entry);
      setLogged(true);
      onLogged?.(entry);
    } catch (err) {
      setLogError(err instanceof Error ? err.message : 'Could not add this to your log.');
    } finally {
      setIsLogging(false);
    }
  }

  return (
    <div className="flex h-full min-h-[100dvh] flex-col bg-bg text-ink">
      <header className="flex items-center gap-3 px-4 pt-4">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="rounded-full p-2 text-ink-muted hover:bg-surface-raised hover:text-ink"
          >
            ←
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2">
        <div className="mb-1">
          <TagChip item={item} />
        </div>
        <h1 className="mb-4 text-xl font-semibold text-ink">{item.displayName}</h1>

        {/* Serving-size picker */}
        <div className="mb-5 flex flex-col gap-2">
          {item.servingSuggestion && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('serving')}
                className={[
                  'flex-1 rounded-xl border px-3 py-2 text-sm font-medium',
                  mode === 'serving' ? 'border-accent bg-accent/10 text-accent' : 'border-hairline text-ink-muted',
                ].join(' ')}
              >
                {item.servingSuggestion.label}
              </button>
              <button
                type="button"
                onClick={() => setMode('grams')}
                className={[
                  'flex-1 rounded-xl border px-3 py-2 text-sm font-medium',
                  mode === 'grams' ? 'border-accent bg-accent/10 text-accent' : 'border-hairline text-ink-muted',
                ].join(' ')}
              >
                Grams
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 rounded-xl border border-hairline bg-surface px-3 py-2.5">
            {mode === 'grams' ? (
              <>
                <input
                  type="number"
                  inputMode="decimal"
                  value={gramsInput}
                  onChange={(e) => setGramsInput(e.target.value)}
                  className="tabular w-full bg-transparent text-ink focus:outline-none"
                />
                <span className="tabular text-sm text-ink-muted">g</span>
              </>
            ) : (
              <>
                <input
                  type="number"
                  inputMode="decimal"
                  value={servingCount}
                  onChange={(e) => setServingCount(e.target.value)}
                  className="tabular w-full bg-transparent text-ink focus:outline-none"
                />
                <span className="tabular text-sm text-ink-muted">
                  × {item.servingSuggestion?.label} ({item.servingSuggestion?.grams}g each) ={' '}
                  {Math.round(grams)}g
                </span>
              </>
            )}
          </div>
        </div>

        {/* Headline macros */}
        <div className="mb-3 grid grid-cols-4 gap-2">
          {headlineFields.map(({ def, value }) => (
            <div key={def.key} className="rounded-xl border border-hairline bg-surface px-2 py-3 text-center">
              <p className="tabular text-base font-semibold text-ink">{formatMacroValue(def, value)}</p>
              <p className="text-[10px] uppercase tracking-wide text-ink-muted">{def.unit}</p>
              <p className="mt-0.5 text-[10px] text-ink-muted">{def.label}</p>
            </div>
          ))}
        </div>

        {/* Extended macros — only fields actually populated on this item */}
        {extendedFields.length > 0 && (
          <div className="hairline-divide mb-5 rounded-xl border border-hairline bg-surface px-3">
            {extendedFields.map(({ def, value }) => (
              <DetailRow
                key={def.key}
                label={def.label}
                value={
                  <span className="tabular">
                    {formatMacroValue(def, value)} {def.unit}
                  </span>
                }
              />
            ))}
          </div>
        )}

        {isRecipe(item) && (
          <div className="mb-5">
            <RecipeIngredientsList ingredients={item.ingredients ?? []} />
          </div>
        )}
      </div>

      <footer className="border-t border-hairline px-4 py-3">
        {logError && <p className="mb-2 text-xs text-accent-warn">{logError}</p>}
        <button
          type="button"
          onClick={handleAddToLog}
          disabled={grams <= 0 || isLogging}
          className="w-full rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-bg disabled:cursor-not-allowed disabled:opacity-40"
        >
          {logged ? 'Added ✓' : 'Add to log'}
        </button>
      </footer>
    </div>
  );
}
