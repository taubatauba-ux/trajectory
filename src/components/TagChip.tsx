import type { FoodItem } from '../types';
import { isICMRFoodItem, isOFFFoodItem, isRecipe } from '../types';
import { cx } from '../lib/cx';

interface TagChipProps {
  item: FoodItem;
  className?: string;
}

interface TagInfo {
  code: string;
  colorClass: string;
  borderClass: string;
}

// §9.3: "source tag rendered like short codes rather than generic rounded pills; ICMR
// tag rendered in the style of the book's own food codes (§5.5) — a deliberate nod to
// the source." Every branch below returns complete, literal Tailwind class strings
// (not string-interpolated) — Tailwind's JIT scanner needs the literal text `text-tag-
// icmr` etc. to appear in source, so building the class name at runtime from `source`
// would silently produce unstyled output.
function resolveTag(item: FoodItem): TagInfo {
  if (isICMRFoodItem(item)) {
    return { code: item.ifctCode, colorClass: 'text-tag-icmr', borderClass: 'border-tag-icmr' };
  }
  if (isOFFFoodItem(item)) {
    return { code: 'OFF', colorClass: 'text-tag-off', borderClass: 'border-tag-off' };
  }
  return {
    code: isRecipe(item) ? 'RECIPE' : 'CUSTOM',
    colorClass: 'text-tag-custom',
    borderClass: 'border-tag-custom',
  };
}

export function TagChip({ item, className }: TagChipProps) {
  const tag = resolveTag(item);
  return (
    <span
      className={cx(
        'inline-block shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none tracking-wider',
        tag.colorClass,
        tag.borderClass,
        className,
      )}
    >
      {tag.code}
    </span>
  );
}
