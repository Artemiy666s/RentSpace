/** Пустое значение поля (текст, число, дата, select). */
export function isFieldEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'number') return Number.isNaN(value);
  return String(value).trim() === '';
}
