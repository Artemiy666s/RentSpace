/** Парсинг числа из поля план-факта (пробелы, запятая как десятичный разделитель). */
export function parsePfNumberInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\s/g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
