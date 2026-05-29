import type { Column, SortDirection } from '@/components/data/DataTable';

export function accessorsFromColumns<T>(columns: Column<T>[]): Record<string, SortAccessor<T>> {
  const acc: Record<string, SortAccessor<T>> = {};
  for (const col of columns) {
    if (!col.sortable) continue;
    if (col.sortValue) {
      acc[col.key] = { get: col.sortValue, type: col.sortType };
    } else {
      acc[col.key] = {
        get: (row) => {
          const raw = (row as Record<string, unknown>)[col.key];
          if (raw == null) return null;
          if (typeof raw === 'string' || typeof raw === 'number') return raw;
          return String(raw);
        },
        type: col.sortType,
      };
    }
  }
  return acc;
}

export type SortType = 'string' | 'number' | 'date';

export type SortAccessor<T> = {
  get: (row: T) => string | number | null | undefined;
  type?: SortType;
};

export function compareValues(a: unknown, b: unknown, type: SortType = 'string'): number {
  if (a == null && b == null) return 0;
  if (a == null || a === '') return 1;
  if (b == null || b === '') return -1;

  if (type === 'number') {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isNaN(na) && Number.isNaN(nb)) return 0;
    if (Number.isNaN(na)) return 1;
    if (Number.isNaN(nb)) return -1;
    return na - nb;
  }

  if (type === 'date') {
    const ta = new Date(String(a)).getTime();
    const tb = new Date(String(b)).getTime();
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return ta - tb;
  }

  return String(a).localeCompare(String(b), 'ru', { numeric: true, sensitivity: 'base' });
}

export function sortRows<T>(
  rows: T[],
  sortKey: string | null,
  direction: SortDirection,
  accessors: Record<string, SortAccessor<T>>,
  tieBreaker?: (a: T, b: T) => number
): T[] {
  if (!rows.length || !sortKey) return rows;
  const accessor = accessors[sortKey];
  if (!accessor) return rows;

  const copy = [...rows];
  const type = accessor.type ?? 'string';
  copy.sort((a, b) => {
    let cmp = compareValues(accessor.get(a), accessor.get(b), type);
    if (cmp === 0 && tieBreaker) cmp = tieBreaker(a, b);
    return direction === 'asc' ? cmp : -cmp;
  });
  return copy;
}
