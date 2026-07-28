import { useEffect } from 'react';

interface ToastProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  durationMs?: number;
}

/** Border, not shadow, to stay consistent with §10's stated preference for hairlines
 * over "card shadows or heavy borders" even outside the list-row context it was
 * written for. */
export function Toast({ message, actionLabel, onAction, onDismiss, durationMs = 4000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [onDismiss, durationMs]);

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-20 z-50 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-md border border-hairline bg-surface-raised px-4 py-3"
    >
      <span className="text-sm text-ink">{message}</span>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={() => {
            onAction();
            onDismiss();
          }}
          className="shrink-0 text-sm font-medium text-accent"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
