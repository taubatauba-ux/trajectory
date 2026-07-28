import { useEffect, useState } from 'react';

/**
 * Blobs (ProgressPhoto.blob) can't be used directly as an <img src> — they need a
 * browser object URL, and that URL must be revoked when no longer needed or it leaks
 * memory for the life of the tab. Centralized here rather than inlined in PhotoGrid and
 * ComparisonView separately, since both need the exact same create-on-blob-change /
 * revoke-on-unmount-or-change lifecycle.
 */
export function useObjectUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  return url;
}
