import type { Macros } from '../../types';
import { MacroRing } from '../../components/MacroRing';
import { MacroBar } from '../../components/MacroBar';

interface TodaySummaryProps {
  consumed: Macros;
  target: Macros;
}

/** §9.2: "today's four numbers (kcal, protein, carb, fat), consumed vs. target,
 * tabular-monospace alignment." One ring for the primary kcal number, three bars for
 * the rest — see MacroRing's header comment for why not four rings. */
export function TodaySummary({ consumed, target }: TodaySummaryProps) {
  return (
    <div className="flex flex-col items-center gap-5 px-4 pb-5 pt-6">
      <MacroRing label="calories" current={consumed.kcal} target={target.kcal} />
      <div className="grid w-full grid-cols-3 gap-4">
        <MacroBar label="Protein" current={consumed.proteinG} target={target.proteinG} />
        <MacroBar label="Carbs" current={consumed.carbG} target={target.carbG} />
        <MacroBar label="Fat" current={consumed.fatG} target={target.fatG} />
      </div>
    </div>
  );
}
