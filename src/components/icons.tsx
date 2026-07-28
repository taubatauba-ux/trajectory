// Deliberately no icon library dependency (lucide-react, etc.) — a handful of simple
// geometric line icons is all this app needs, and adding an npm dependency here is
// exactly the kind of shared package.json churn worth avoiding while Part 2 is being
// built in parallel (see PROGRESS_REPORT_PART3.md). Every icon takes the same
// `{ size?, className? }` shape and uses `currentColor`, so color is controlled purely
// by the surrounding text color / Tailwind class — no separate color prop to keep in
// sync with the design tokens.
import type { SVGProps } from 'react';

export interface IconProps {
  size?: number;
  className?: string;
}

const base: Partial<SVGProps<SVGSVGElement>> = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export function SearchIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.2" y2="16.2" />
    </svg>
  );
}

export function XIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} aria-hidden="true">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

export function PlusIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function CheckIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} aria-hidden="true">
      <polyline points="4 12.5 9.5 18 20 6" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} aria-hidden="true">
      <polyline points="5 8 12 15 19 8" />
    </svg>
  );
}

export function PencilIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} aria-hidden="true">
      <path d="M4 20.5h4l10.5-10.5a2.83 2.83 0 0 0-4-4L4 16.5v4Z" />
      <line x1="13.5" y1="7" x2="17" y2="10.5" />
    </svg>
  );
}

export function TrashIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} aria-hidden="true">
      <polyline points="4 7 20 7" />
      <path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
      <path d="M8 7v13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7" />
      <line x1="10.5" y1="11" x2="10.5" y2="17" />
      <line x1="13.5" y1="11" x2="13.5" y2="17" />
    </svg>
  );
}

export function StarIcon({ size = 20, className, filled = false }: IconProps & { filled?: boolean }) {
  return (
    <svg
      {...base}
      width={size}
      height={size}
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      aria-hidden="true"
    >
      <path d="M12 3.5 14.6 9l6 .9-4.3 4.2 1 6-5.3-2.8-5.3 2.8 1-6L3.4 9.9l6-.9Z" />
    </svg>
  );
}

export function ScaleIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M7.5 15.5a4.5 4.5 0 0 1 9 0Z" />
      <circle cx="12" cy="9.5" r="1.4" />
    </svg>
  );
}

export function HomeIcon({ size = 22, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} aria-hidden="true">
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}

export function TrendingUpIcon({ size = 22, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} aria-hidden="true">
      <polyline points="4 16 10 10 14 14 20 6" />
      <polyline points="14 6 20 6 20 12" />
    </svg>
  );
}

export function ListChecksIcon({ size = 22, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} aria-hidden="true">
      <polyline points="4 6.5 5.5 8 8 5" />
      <line x1="11" y1="6.5" x2="20" y2="6.5" />
      <polyline points="4 13.5 5.5 15 8 12" />
      <line x1="11" y1="13.5" x2="20" y2="13.5" />
      <polyline points="4 20.5 5.5 22 8 19" />
      <line x1="11" y1="20.5" x2="20" y2="20.5" />
    </svg>
  );
}

export function MoreIcon({ size = 22, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} fill="currentColor" stroke="none" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} aria-hidden="true">
      <polyline points="9 5 16 12 9 19" />
    </svg>
  );
}
