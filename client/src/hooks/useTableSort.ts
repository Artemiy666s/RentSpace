import { useCallback, useMemo, useState } from 'react';
import type { SortDirection } from '@/components/data/DataTable';
import { sortRows, type SortAccessor } from '@/lib/tableSort';

export type SortPresetId = 'default' | 'newest' | 'oldest' | 'nameAsc' | 'nameDesc';

export interface UseTableSortOptions {
  defaultSortKey?: string | null;
  defaultDirection?: SortDirection;
  dateKey?: string;
  nameKey?: string;
}

export function useTableSort<T>(
  rows: T[] | undefined,
  accessors: Record<string, SortAccessor<T>>,
  options: UseTableSortOptions = {}
) {
  const [sortKey, setSortKey] = useState<string | null>(options.defaultSortKey ?? null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(options.defaultDirection ?? 'asc');

  const handleSort = useCallback(
    (key: string) => {
      if (!accessors[key]) return;
      if (sortKey === key) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDirection('asc');
      }
    },
    [accessors, sortKey]
  );

  const applyPreset = useCallback(
    (preset: SortPresetId) => {
      const dateKey = options.dateKey;
      const nameKey = options.nameKey;

      switch (preset) {
        case 'default':
          setSortKey(null);
          setSortDirection('asc');
          break;
        case 'newest':
          if (dateKey && accessors[dateKey]) {
            setSortKey(dateKey);
            setSortDirection('desc');
          }
          break;
        case 'oldest':
          if (dateKey && accessors[dateKey]) {
            setSortKey(dateKey);
            setSortDirection('asc');
          }
          break;
        case 'nameAsc':
          if (nameKey && accessors[nameKey]) {
            setSortKey(nameKey);
            setSortDirection('asc');
          }
          break;
        case 'nameDesc':
          if (nameKey && accessors[nameKey]) {
            setSortKey(nameKey);
            setSortDirection('desc');
          }
          break;
        default:
          break;
      }
    },
    [accessors, options.dateKey, options.nameKey]
  );

  const sortedRows = useMemo(
    () => sortRows(rows ?? [], sortKey, sortDirection, accessors),
    [rows, sortKey, sortDirection, accessors]
  );

  const activePreset = useMemo((): SortPresetId => {
    if (!sortKey) return 'default';
    const dateKey = options.dateKey;
    const nameKey = options.nameKey;
    if (dateKey && sortKey === dateKey && sortDirection === 'desc') return 'newest';
    if (dateKey && sortKey === dateKey && sortDirection === 'asc') return 'oldest';
    if (nameKey && sortKey === nameKey && sortDirection === 'asc') return 'nameAsc';
    if (nameKey && sortKey === nameKey && sortDirection === 'desc') return 'nameDesc';
    return 'default';
  }, [sortKey, sortDirection, options.dateKey, options.nameKey]);

  return {
    sortedRows,
    sortKey,
    sortDirection,
    handleSort,
    applyPreset,
    activePreset,
    setSortKey,
    setSortDirection,
  };
}
