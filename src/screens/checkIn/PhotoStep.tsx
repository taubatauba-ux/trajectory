import { useEffect, useRef, useState } from 'react';

export interface PhotoStepProps {
  photoBlob: Blob | null;
  onChange: (blob: Blob | null) => void;
}

export function PhotoStep({ photoBlob, onChange }: PhotoStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!photoBlob) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photoBlob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoBlob]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">
        Optional — a progress photo stays entirely on this device, same as everything
        else in the app.
      </p>

      {previewUrl ? (
        <div className="flex flex-col gap-3">
          <img src={previewUrl} alt="Progress preview" className="max-h-80 w-full rounded-xl object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="self-start text-xs text-ink-muted hover:text-accent-warn"
          >
            Remove photo
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-hairline py-10 text-sm text-ink-muted hover:text-ink"
        >
          <span className="text-2xl">＋</span>
          Add a photo
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onChange(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
