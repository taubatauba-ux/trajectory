import { NavLink } from 'react-router-dom';
import type { ComponentType } from 'react';
import { HomeIcon, TrendingUpIcon, ListChecksIcon, MoreIcon, type IconProps } from '../icons';
import { cx } from '../../lib/cx';

interface Tab {
  to: string;
  label: string;
  Icon: ComponentType<IconProps>;
  end?: boolean;
}

// Check-in (§9.6) is deliberately not a tab here — it's an event-triggered flow
// surfaced via the Dashboard's banner, not a persistent destination (§9.6 itself: "a
// non-blocking banner ... never a forced modal", let alone a permanent nav slot).
const TABS: Tab[] = [
  { to: '/', label: 'Today', Icon: HomeIcon, end: true },
  { to: '/trends', label: 'Trends', Icon: TrendingUpIcon },
  { to: '/habits', label: 'Habits', Icon: ListChecksIcon },
  { to: '/more', label: 'More', Icon: MoreIcon },
];

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-md border-t border-hairline bg-surface">
      {TABS.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cx(
              'flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px]',
              isActive ? 'text-accent' : 'text-ink-muted',
            )
          }
        >
          <Icon size={22} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
