import { useState } from 'react';
import { useObjectUrl } from './useObjectUrl';
import { todayISO } from '../_shared/dates';

interface PhotoCaptureSheetProps {
  file: File;
  onSave: (date: string, note: string | undefined) => void;
  onCancel: () => void;
}

/** Inline card (not a modal — see HabitFormSheet.tsx's comment on this project's
 * overlay-free convention). Date defaults to today but is editable, so importing an
 * older photo (e.g. from a camera roll, when first setting up the app) still gets
 * stored under its real date rather than the day it happened to be uploaded. */
export function PhotoCaptureSheet({ file, onSave, onCancel }: PhotoCaptureSheetProps) {
  const previewUrl = useObjectUrl(file);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface p-4">
      {previewUrl && (
        <img
          src={previewUrl}
          alt="Selected progress photo preview"
          className="max-h-64 w-full rounded-md object-contain"
        />
      )}

      <label className="flex flex-col gap-1">
        <span className="text-xs text-ink-muted">Date</span>
        <input
          type="date"
          value={date}
          max={todayISO()}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-hairline bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-ink-muted">Note (optional)</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. front, morning"
          maxLength={80}
          className="rounded-md border border-hairline bg-bg px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
        />
      </label>

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-xs text-ink-muted hover:text-ink">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave(date, note.trim() || undefined)}
          disabled={!date}
          className="rounded-md bg-accent px-3 py-1.5 text-xs text-bg disabled:opacity-40"
        >
          Save photo
        </button>
      </div>
    </div>
  );
}
