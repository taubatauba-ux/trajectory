import { useObjectUrl } from './useObjectUrl';
import { formatDisplayDate, daysBetweenISO } from '../_shared/dates';
import type { ProgressPhoto } from '../../types';

function ComparisonPane({ photo }: { photo: ProgressPhoto }) {
  const url = useObjectUrl(photo.blob);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="aspect-[3/4] w-full overflow-hidden rounded-md bg-surface">
        {url && (
          <img
            src={url}
            alt={`Progress photo from ${formatDisplayDate(photo.date, true)}`}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <span className="text-center font-mono text-xs tabular-nums text-ink">
        {formatDisplayDate(photo.date, true)}
      </span>
      {photo.note && <span className="text-center text-xs text-ink-muted">{photo.note}</span>}
    </div>
  );
}

interface ComparisonViewProps {
  /** Rendered left-to-right in whatever order they're passed — index.tsx passes them
   * chronologically (earlier first), which reads naturally as "before → after". */
  first: ProgressPhoto;
  second: ProgressPhoto;
  onClear: () => void;
}

/** §9.11: "simple side-by-side comparison view between any two dates." Two fixed
 * aspect-ratio panes so photos of different original dimensions/orientations still line
 * up cleanly, rather than each rendering at its own native size. */
export function ComparisonView({ first, second, onClear }: ComparisonViewProps) {
  const daysApart = Math.abs(daysBetweenISO(first.date, second.date));

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm text-ink">
          {daysApart} day{daysApart === 1 ? '' : 's'} apart
        </h3>
        <button type="button" onClick={onClear} className="text-xs text-ink-muted hover:text-ink">
          Clear
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <ComparisonPane photo={first} />
        <ComparisonPane photo={second} />
      </div>
    </div>
  );
}
