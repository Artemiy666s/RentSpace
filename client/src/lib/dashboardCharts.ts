import { monthShortLabel } from '@/i18n/months';

type MonthRow = { period_month: number; total: number | string };

/** Собирает ряд за 12 месяцев с подписями и нулями для пустых месяцев. */
export function buildMonthlyChartRows(
  rows: MonthRow[] | undefined,
  t: (key: string) => string,
  valueKey: string
) {
  const byMonth = Object.fromEntries(
    (rows || []).map((r) => [r.period_month, Number(r.total) || 0])
  );
  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    return {
      monthNum: m,
      monthLabel: monthShortLabel(t, m),
      [valueKey]: byMonth[m] ?? 0,
    };
  });
}

export function buildChargesPaymentsRows(
  charges: MonthRow[] | undefined,
  payments: MonthRow[] | undefined,
  t: (key: string) => string
) {
  const ch = Object.fromEntries((charges || []).map((r) => [r.period_month, Number(r.total) || 0]));
  const pa = Object.fromEntries((payments || []).map((r) => [r.period_month, Number(r.total) || 0]));
  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    return {
      monthLabel: monthShortLabel(t, m),
      charged: ch[m] ?? 0,
      paid: pa[m] ?? 0,
    };
  });
}

export function formatDashboardDate(iso: string | null | undefined, locale: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString(locale === 'en' ? 'en-GB' : locale === 'be' ? 'be-BY' : 'ru-RU');
}

export function floorOccupancyRows(
  floors:
    | Array<{
        name?: string;
        level_number?: number;
        total_area?: number | string;
        occupied_area?: number | string;
      }>
    | undefined,
  labelFor: (f: { name?: string; level_number?: number }) => string
) {
  return (floors || [])
    .map((f) => {
      const total = Number(f.total_area) || 0;
      const occupied = Number(f.occupied_area) || 0;
      const pct = total > 0 ? Math.round((occupied / total) * 1000) / 10 : 0;
      return { label: labelFor(f), occupancy: pct, totalArea: total };
    })
    .filter((f) => f.totalArea > 0)
    .sort((a, b) => b.occupancy - a.occupancy)
    .slice(0, 12);
}
