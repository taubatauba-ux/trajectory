import { Link } from 'react-router-dom';
import { ChevronRightIcon } from '../../components/icons';

interface MoreRow {
  label: string;
  description: string;
  /** Present once the destination is real; absent rows render inert with a part badge. */
  to?: string;
  partLabel?: string;
}

const ROWS: MoreRow[] = [
  { label: 'Period Tracker', description: 'Independent of the nutrition loop', to: '/period-tracker' },
  { label: 'Progress Photos', description: 'Timeline view, tied to check-ins', to: '/progress-photos' },
  { label: 'Settings', description: 'Profile, goals, units, data export/import', to: '/settings' },
];

/** §9.10, §9.11, and §9.12 — Period Tracker, Progress Photos, and Settings — are all
 * real, wired destinations as of Part 6. */
export default function MoreScreen() {
  return (
    <div className="pb-24">
      <h1 className="px-4 pb-2 pt-6 text-lg text-ink">More</h1>
      <div>
        {ROWS.map((row) => {
          const content = (
            <>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-ink">{row.label}</div>
                <div className="mt-0.5 text-xs text-ink-muted">{row.description}</div>
              </div>
              {row.partLabel && (
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-ink-muted">
                  {row.partLabel}
                </span>
              )}
              <ChevronRightIcon size={16} className="shrink-0 text-ink-muted" />
            </>
          );
          const rowClass = 'flex items-center gap-3 border-b border-hairline px-4 py-3.5';
          return row.to ? (
            <Link key={row.label} to={row.to} className={rowClass}>
              {content}
            </Link>
          ) : (
            <div key={row.label} className={`${rowClass} opacity-60`}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
