export const MONTH_I18N_KEYS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const;

export function monthShortLabel(t: (key: string) => string, month: number): string {
  const key = MONTH_I18N_KEYS[month - 1];
  return key ? t(`months.${key}`) : String(month);
}

export function monthFullLabel(t: (key: string) => string, month: number): string {
  const key = MONTH_I18N_KEYS[month - 1];
  return key ? t(`months.${key}Full`) : String(month);
}

export function monthSelectOptions(
  t: (key: string, params?: Record<string, string | number>) => string
): { value: string; label: string }[] {
  return MONTH_I18N_KEYS.map((key, i) => ({
    value: String(i + 1),
    label: t(`months.${key}Full`),
  }));
}
