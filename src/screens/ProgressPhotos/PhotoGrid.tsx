import { useObjectUrl } from './useObjectUrl';
import { formatDisplayDate } from '../_shared/dates';
import type { ProgressPhoto } from '../../types';

interface PhotoThumbnailProps {
  photo: ProgressPhoto;
  selected: boolean;
  onToggleSelect: () => void;
  onDelete: () => void;
}

/** Its own component (not inlined in PhotoGrid's .map) because useObjectUrl is a hook —
 * calling it once per photo means each thumbnail needs its own component instance,
 * hooks can't run inside a .map callback directly. */
function PhotoThumbnail({ photo, selected, onToggleSelect, onDelete }: PhotoThumbnailProps) {
  const url = useObjectUrl(photo.blob);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggleSelect}
        aria-pressed={selected}
        aria-label={`${selected ? 'Deselect' : 'Select'} photo from ${formatDisplayDate(photo.date, true)}`}
        className={`aspect-square w-full overflow-hidden rounded-md border-2 bg-surface transition-colors ${
          selected ? 'border-accent' : 'border-transparent'
        }`}
      >
        {url && <img src={url} alt={`Progress photo from ${formatDisplayDate(photo.date, true)}`} className="h-full w-full object-cover" />}
      </button>
      <span className="mt-1 block truncate font-mono text-[10px] tabular-nums text-ink-muted">
        {formatDisplayDate(photo.date)}
      </span>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete photo from ${formatDisplayDate(photo.date, true)}`}
        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-bg text-xs text-ink-muted hover:text-accent-warn"
      >
        ×
      </button>
    </div>
  );
}

interface PhotoGridProps {
  /** Any order in — this component displays newest first regardless. */
  photos: ProgressPhoto[];
  selectedIds: readonly string[];
  onToggleSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function PhotoGrid({ photos, selectedIds, onToggleSelect, onDelete }: PhotoGridProps) {
  if (photos.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        No progress photos yet — add one above. They're stored only on this device.
      </p>
    );
  }

  const newestFirst = [...photos].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="grid grid-cols-3 gap-3">
      {newestFirst.map((photo) => (
        <PhotoThumbnail
          key={photo.id}
          photo={photo}
          selected={selectedIds.includes(photo.id)}
          onToggleSelect={() => onToggleSelect(photo.id)}
          onDelete={() => onDelete(photo.id)}
        />
      ))}
    </div>
  );
}
