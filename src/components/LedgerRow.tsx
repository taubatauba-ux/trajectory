import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface LedgerRowAction {
  key: string;
  label: string;
  icon: ReactNode;
  onTrigger: () => void;
  tone?: 'default' | 'danger';
}

interface LedgerRowProps {
  children: ReactNode;
  /** Revealed on swipe-left (§9.2: "swipeable to edit/delete"). Omit for rows that
   * don't need it (search results use a quick-add button instead). */
  actions?: LedgerRowAction[];
  /** Fires on a tap that isn't a drag and isn't on a revealed action. */
  onTap?: () => void;
  className?: string;
}

const ACTION_WIDTH = 64; // px per action button — reserved in the transform math below
const OPEN_THRESHOLD_RATIO = 0.4; // past 40% of the reveal width, a released drag snaps open

/**
 * A hairline-divided row (§10's "signature element ... under every list item") that
 * optionally reveals edit/delete-style actions via a left swipe.
 *
 * Swipe is implemented with Pointer Events rather than touch-only handlers, so it also
 * works with a mouse click-drag in a desktop browser, not just on a touchscreen. It is
 * NOT the only way to reach the actions: they sit in normal tab order underneath the
 * content layer, and focusing one (e.g. by tabbing through the page) opens the row
 * automatically, so keyboard/screen-reader use doesn't depend on performing a drag.
 */
export function LedgerRow({ children, actions, onTap, className }: LedgerRowProps) {
  const revealWidth = (actions?.length ?? 0) * ACTION_WIDTH;
  const [offset, setOffset] = useState(0); // 0 = closed, -revealWidth = fully open
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<{ startX: number; startOffset: number; moved: boolean; lastOffset: number } | null>(
    null,
  );

  const isOpen = offset < 0;

  function snapTo(target: 0 | number) {
    setOffset(target);
    setDragging(false);
  }

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!actions || actions.length === 0) return;
    // Don't engage swipe handling for a pointerdown that originated on interactive
    // content nested inside the row (e.g. TimelineLog's inline gram editor — its Save/
    // Cancel buttons and number input). Found by testing: setPointerCapture on this
    // outer element redirects the *subsequent* pointerup — and the click event derived
    // from it — away from whatever child the pointer is actually over and onto this row
    // instead, which silently ate clicks on Save/Cancel without erroring anywhere.
    const target = e.target as HTMLElement;
    if (target.closest('button, input, textarea, select, a')) return;
    dragState.current = { startX: e.clientX, startOffset: offset, moved: false, lastOffset: offset };
    setDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture is an enhancement (keeps tracking the pointer if it leaves the row's
      // bounds mid-drag) — the drag still works via the listeners below without it.
      // Some environments reject capture for a pointerId they don't consider "active"
      // (observed with programmatically-dispatched PointerEvents in particular).
    }
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    const drag = dragState.current;
    if (!drag) return;
    const delta = e.clientX - drag.startX;
    if (Math.abs(delta) > 4) drag.moved = true;
    const next = Math.min(0, Math.max(-revealWidth, drag.startOffset + delta));
    // Mirrored onto the ref, not just React state: handlePointerUp reads this value,
    // and reading `offset` (the closure/state variable) there instead would risk
    // seeing a stale pre-drag value if pointerup fires before React has re-rendered
    // since the last pointermove — e.g. a fast flick where the whole gesture lands
    // within one batched update. The ref is always synchronously current.
    drag.lastOffset = next;
    setOffset(next);
  }

  function handlePointerUp() {
    const drag = dragState.current;
    dragState.current = null;
    if (!drag) {
      setDragging(false);
      return;
    }
    if (!drag.moved) {
      // A tap, not a drag: close if it was already open *before this gesture started*
      // (drag.startOffset, not the possibly-stale `isOpen` closure), otherwise it's a
      // real tap on the content.
      setDragging(false);
      if (drag.startOffset < 0) {
        snapTo(0);
      } else {
        onTap?.();
      }
      return;
    }
    snapTo(drag.lastOffset <= -revealWidth * OPEN_THRESHOLD_RATIO ? -revealWidth : 0);
  }

  return (
    <div className={cx('relative overflow-hidden border-b border-hairline', className)}>
      {actions && actions.length > 0 && (
        <div
          className="absolute inset-y-0 right-0 flex"
          style={{ width: revealWidth }}
          aria-hidden={!isOpen}
        >
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              tabIndex={isOpen ? 0 : -1}
              onFocus={() => setOffset(-revealWidth)}
              onClick={() => {
                action.onTrigger();
                snapTo(0);
              }}
              aria-label={action.label}
              style={{ width: ACTION_WIDTH }}
              className={cx(
                'flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium',
                action.tone === 'danger'
                  ? 'bg-accent-warn text-bg'
                  : 'bg-surface-raised text-ink',
              )}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      )}
      <div
        role="presentation"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={() => {
          // Pointer handlers already cover taps; this guards the case where a row has
          // no actions at all, so pointer capture never engages and onTap must still fire.
          if (!actions || actions.length === 0) onTap?.();
        }}
        className={cx('relative bg-bg', !dragging && 'transition-transform duration-200 ease-out')}
        style={{ transform: `translateX(${offset}px)`, touchAction: actions?.length ? 'pan-y' : undefined }}
      >
        {children}
      </div>
    </div>
  );
}
