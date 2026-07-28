// §9.8: "Spreadsheet export (CSV: date, weight, kcal, protein, carb, fat) — matches the
// reference app's 'share with a coach' pattern... useful for the user's own external
// analysis regardless." This exports what was actually logged (raw weigh-ins + raw
// daily macro totals), not the Engine's targets — a coach (or the user, later) wants to
// see what happened, not what the Engine was aiming for that day.
import type { Macros, WeighIn } from '../../types';

const CSV_HEADER = ['date', 'weight_kg', 'kcal', 'protein_g', 'carb_g', 'fat_g'] as const;

function csvField(value: string | number | undefined): string {
  if (value === undefined) return '';
  const str = String(value);
  // None of this export's fields can contain a comma/quote/newline (dates and numbers
  // only) but quoting defensively costs nothing and means this function stays correct
  // if a field is ever added that could.
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/**
 * One row per date across the union of weigh-in dates and logged-macro dates, sorted
 * ascending, blank cells where that date has no weigh-in or no log. Rounds weight to 1
 * decimal and macros to whole numbers for a clean, coach-readable sheet — the app's
 * own internal precision is unaffected, this is a display/export-only rounding.
 */
export function buildHistoryCsv(
  weighIns: readonly WeighIn[],
  dailyTotals: ReadonlyMap<string, Macros>,
): string {
  const weightByDate = new Map(weighIns.map((w) => [w.date, w.weightKg]));
  const allDates = new Set<string>([...weightByDate.keys(), ...dailyTotals.keys()]);
  const sortedDates = [...allDates].sort((a, b) => a.localeCompare(b));

  const rows = sortedDates.map((date) => {
    const weight = weightByDate.get(date);
    const totals = dailyTotals.get(date);
    return [
      date,
      weight !== undefined ? Math.round(weight * 10) / 10 : undefined,
      totals ? Math.round(totals.kcal) : undefined,
      totals ? Math.round(totals.proteinG) : undefined,
      totals ? Math.round(totals.carbG) : undefined,
      totals ? Math.round(totals.fatG) : undefined,
    ]
      .map(csvField)
      .join(',');
  });

  return [CSV_HEADER.join(','), ...rows].join('\n');
}

/** Browser-only: triggers a file download via an in-memory Blob URL. Thin and
 * deliberately untested (no meaningful logic to test — it's DOM API calls in sequence);
 * buildHistoryCsv above carries all the actual logic and is what's unit tested. */
export function downloadCsv(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
