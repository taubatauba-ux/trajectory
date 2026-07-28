import { describeFlags } from '../../lib/flagLabels';
import { cx } from '../../lib/cx';

interface EngineFlagsBadgesProps {
  flags: string[];
  note?: string;
}

export function EngineFlagsBadges({ flags, note }: EngineFlagsBadgesProps) {
  const infos = describeFlags(flags);
  if (infos.length === 0 && !note) return null;

  return (
    <div className="flex flex-col gap-1.5 px-4 pb-4">
      {note && <p className="text-xs leading-snug text-ink-muted">{note}</p>}
      {infos.map((info) => (
        <div
          key={info.key}
          className={cx(
            'rounded-sm border px-2.5 py-1.5 text-xs leading-snug',
            info.tone === 'caution' && 'border-accent-warn text-accent-warn',
            info.tone === 'dev' && 'border-hairline font-mono text-[11px] text-ink-muted',
            info.tone === 'info' && 'border-hairline text-ink-muted',
          )}
        >
          {info.label}
        </div>
      ))}
    </div>
  );
}
