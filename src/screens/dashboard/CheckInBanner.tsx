import { Link } from 'react-router-dom';
import { ChevronRightIcon } from '../../components/icons';

interface CheckInBannerProps {
  due: boolean;
}

/** §9.6: "Triggered when EngineResponse.nextCheckIn is today or past, surfaced as a
 * non-blocking banner on the Dashboard (never a forced modal)." The actual check-in
 * flow is Part 4's screen — this links to a placeholder route for now, at the same path
 * Part 4 will fill in, so nothing here needs to change once it lands. */
export function CheckInBanner({ due }: CheckInBannerProps) {
  if (!due) return null;

  return (
    <Link
      to="/check-in"
      className="mx-4 mb-4 flex items-center justify-between gap-3 rounded-md border border-hairline bg-surface-raised px-4 py-3"
    >
      <div>
        <div className="text-sm text-ink">Time for your check-in</div>
        <div className="mt-0.5 text-xs text-ink-muted">
          Confirm your trend and see if your targets should shift.
        </div>
      </div>
      <ChevronRightIcon size={18} className="shrink-0 text-ink-muted" />
    </Link>
  );
}
