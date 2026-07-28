import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { FoodItem } from '../types';
import { scaleMacros, roundKcal, roundGrams } from '../lib/macros';
import { TagChip } from './TagChip';
import { PlusIcon, StarIcon, ChevronDownIcon } from './icons';
import { cx } from '../lib/cx';

interface SearchResultRowProps {
  item: FoodItem;
  isFavorite: boolean;
  /** §9.3 "one-tap add" — logs immediately at whatever amount is currently shown. */
  onLog: (item: FoodItem, grams: number) => void;
  onToggleFavorite: (item: FoodItem, currentDefaultGrams: number) => void;
  /** Overrides the row's default/quick-add amount — used when rendering a Favorite
   * (§9.2: "pinnable favorites with a remembered serving size"), where the amount to
   * show and quick-add at is whatever was remembered when it was pinned, not the food's
   * own servingSuggestion. Leave unset for plain search/recents rows. */
  defaultGrams?: number;
}

/**
 * §9.3: "name, source tag, per-100g or per-serving macros inline, one-tap add." The row
 * itself is NOT a <button> — it contains two real <button>s (favorite star, quick-add)
 * as siblings, and nesting interactive elements inside a <button> is invalid HTML that
 * breaks click handling and screen readers. The expand-to-edit-quantity toggle is a
 * role="button" div instead, for exactly that reason.
 *
 * The expand affordance lets you set a custom gram amount before adding, without
 * leaving the list. §9.4's Food/Recipe Detail screen is now wired in as a separate
 * "Details" link inside the expanded area — added, not swapped in, so the row's own
 * contract (props, one-tap add) is unchanged from when this was written.
 */
export function SearchResultRow({ item, isFavorite, onLog, onToggleFavorite, defaultGrams: gramsOverride }: SearchResultRowProps) {
  const defaultGrams = gramsOverride ?? item.servingSuggestion?.grams ?? 100;
  const [expanded, setExpanded] = useState(false);
  const [grams, setGrams] = useState(defaultGrams);

  const collapsedMacros = gramsOverride
    ? scaleMacros(item.per100g, gramsOverride)
    : item.servingSuggestion
      ? scaleMacros(item.per100g, item.servingSuggestion.grams)
      : item.per100g;
  const collapsedLabel = gramsOverride
    ? 'favorite amount'
    : (item.servingSuggestion?.label ?? 'per 100g');
  const liveMacros = scaleMacros(item.per100g, grams);

  function handleGramsInput(raw: string) {
    const parsed = Number(raw);
    setGrams(Number.isFinite(parsed) ? Math.max(0, parsed) : 0);
  }

  function openExpanded() {
    setGrams(defaultGrams);
    setExpanded((v) => !v);
  }

  return (
    <div className="border-b border-hairline">
      <div className="flex items-center gap-2.5 py-2.5 pl-4 pr-3">
        <div
          role="button"
          tabIndex={0}
          onClick={openExpanded}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openExpanded();
            }
          }}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
        >
          <TagChip item={item} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] text-ink">{item.displayName}</div>
            <div className="mt-0.5 font-mono text-[11px] tabular-nums text-ink-muted">
              {roundKcal(collapsedMacros.kcal)} kcal · P{roundGrams(collapsedMacros.proteinG)} · C
              {roundGrams(collapsedMacros.carbG)} · F{roundGrams(collapsedMacros.fatG)}
              <span className="text-ink-muted"> · {collapsedLabel}</span>
            </div>
          </div>
          <ChevronDownIcon
            size={16}
            className={cx('shrink-0 text-ink-muted transition-transform', expanded && 'rotate-180')}
          />
        </div>

        <button
          type="button"
          onClick={() => onToggleFavorite(item, defaultGrams)}
          aria-label={isFavorite ? `Remove ${item.displayName} from favorites` : `Add ${item.displayName} to favorites`}
          aria-pressed={isFavorite}
          className={cx('shrink-0 p-1', isFavorite ? 'text-tag-icmr' : 'text-ink-muted')}
        >
          <StarIcon size={18} filled={isFavorite} />
        </button>

        <button
          type="button"
          onClick={() => onLog(item, defaultGrams)}
          aria-label={`Log ${item.displayName}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-bg"
        >
          <PlusIcon size={16} />
        </button>
      </div>

      {expanded && (
        <div className="flex items-center gap-3 px-4 pb-3 pl-[3.75rem]">
          <label className="flex items-center gap-1.5">
            <input
              type="number"
              inputMode="decimal"
              value={grams}
              onChange={(e) => handleGramsInput(e.target.value)}
              className="w-16 rounded border border-hairline bg-surface px-2 py-1 font-mono text-sm tabular-nums text-ink outline-none"
            />
            <span className="text-xs text-ink-muted">g</span>
          </label>
          <span className="font-mono text-xs tabular-nums text-ink-muted">
            {roundKcal(liveMacros.kcal)} kcal · P{roundGrams(liveMacros.proteinG)} · C{roundGrams(liveMacros.carbG)} · F
            {roundGrams(liveMacros.fatG)}
          </span>
          <button
            type="button"
            disabled={grams <= 0}
            onClick={() => {
              onLog(item, grams);
              setExpanded(false);
            }}
            className="ml-auto shrink-0 rounded bg-accent px-3 py-1.5 text-xs font-medium text-bg disabled:opacity-40"
          >
            Add
          </button>
          <Link
            to={`/food/${item.id}`}
            className="shrink-0 text-xs text-ink-muted underline decoration-hairline underline-offset-2"
          >
            Details
          </Link>
        </div>
      )}
    </div>
  );
}
