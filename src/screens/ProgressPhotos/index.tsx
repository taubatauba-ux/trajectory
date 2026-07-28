import { useRef, useState } from 'react';
import { usePhotos } from './usePhotos';
import { addPhoto, deletePhoto } from './photoStore';
import { PhotoCaptureSheet } from './PhotoCaptureSheet';
import { PhotoGrid } from './PhotoGrid';
import { ComparisonView } from './ComparisonView';

/**
 * Top-level, route-ready screen component for §9.11. Default export, zero required
 * props, self-contained via usePhotos/Dexie — ready for Part 3's router. No nav chrome;
 * see HistoryTrends/index.tsx's doc comment for the same convention.
 *
 * All storage is local IndexedDB Blobs (types/media.ts's own comment: "no upload step,
 * no server") — nothing in this screen makes a network call, consistent with this
 * app's architecture throughout.
 */
export default function ProgressPhotos() {
  const photos = usePhotos();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length < 2) return [...prev, id];
      return [prev[1]!, id]; // keep the 2 most recently tapped, oldest drops off
    });
  };

  const handleDelete = (id: string) => {
    void deletePhoto(id);
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  };

  const handleFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so choosing the *same* file again still fires onChange next time.
    e.target.value = '';
    if (file && file.type.startsWith('image/')) setPendingFile(file);
  };

  if (!photos) {
    return <p className="p-6 text-sm text-ink-muted">Loading…</p>;
  }

  const selectedPhotos = selectedIds
    .map((id) => photos.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date)); // chronological: before → after

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg text-ink">Progress Photos</h1>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink-muted hover:text-ink"
        >
          + Add photo
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChosen}
          className="hidden"
        />
      </div>

      {pendingFile && (
        <PhotoCaptureSheet
          file={pendingFile}
          onCancel={() => setPendingFile(null)}
          onSave={(date, note) => {
            void addPhoto(date, pendingFile, note);
            setPendingFile(null);
          }}
        />
      )}

      {selectedPhotos.length === 2 ? (
        <ComparisonView
          first={selectedPhotos[0]!}
          second={selectedPhotos[1]!}
          onClear={() => setSelectedIds([])}
        />
      ) : selectedPhotos.length === 1 ? (
        <p className="text-xs text-ink-muted">Select one more photo to compare it side-by-side.</p>
      ) : photos.length > 0 ? (
        <p className="text-xs text-ink-muted">Select any two photos to compare them side-by-side.</p>
      ) : null}

      <PhotoGrid photos={photos} selectedIds={selectedIds} onToggleSelect={toggleSelect} onDelete={handleDelete} />
    </div>
  );
}
