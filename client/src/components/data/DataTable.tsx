import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import styles from './DataTable.module.css';

export type SortDirection = 'asc' | 'desc';

export interface Column<T> {
  key: string;
  title: ReactNode;
  render?: (row: T) => ReactNode;
  width?: string;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  /** Значение для клиентской сортировки (если не задано — поле row[key]). */
  sortValue?: (row: T) => string | number | null | undefined;
  sortType?: 'string' | 'number' | 'date';
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  emptyText?: string;
  toolbar?: ReactNode;
  sortKey?: string | null;
  sortDirection?: SortDirection;
  onSort?: (key: string) => void;
}

function alignClass(align?: 'left' | 'right' | 'center') {
  if (!align) return undefined;
  return styles[`align${align.charAt(0).toUpperCase()}${align.slice(1)}`];
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyText,
  toolbar,
  sortKey = null,
  sortDirection = 'asc',
  onSort,
}: Props<T>) {
  const { t } = useI18n();
  const empty = emptyText ?? t('common.noData');

  const renderSortIcon = (key: string) => {
    if (sortKey !== key) return <ArrowUpDown size={14} className={styles.sortIconMuted} aria-hidden />;
    return sortDirection === 'asc' ? (
      <ArrowUp size={14} className={styles.sortIconActive} aria-hidden />
    ) : (
      <ArrowDown size={14} className={styles.sortIconActive} aria-hidden />
    );
  };

  return (
    <div>
      {toolbar && <div className={styles.toolbar}>{toolbar}</div>}
      <div className={styles.wrap}>
        <table className={styles.table}>
          <colgroup>
            {columns.map((c) => (
              <col
                key={c.key}
                style={{ width: c.width ?? `${100 / columns.length}%` }}
              />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map((c) => {
                const thAlign = alignClass(c.align);
                if (c.sortable && onSort) {
                  const sortBtnAlign =
                    c.align === 'right'
                      ? styles.sortBtnRight
                      : c.align === 'center'
                        ? styles.sortBtnCenter
                        : styles.sortBtnLeft;
                  return (
                    <th
                      key={c.key}
                      className={`${thAlign ?? styles.alignLeft} ${styles.sortableTh}`.trim()}
                      aria-sort={sortKey === c.key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <button
                        type="button"
                        className={`${styles.sortBtn} ${sortBtnAlign}`}
                        onClick={() => onSort(c.key)}
                      >
                        <span className={styles.sortBtnLabel}>{c.title}</span>
                        {renderSortIcon(c.key)}
                      </button>
                    </th>
                  );
                }
                return (
                  <th
                    key={c.key}
                    className={thAlign ?? styles.alignLeft}
                  >
                    {c.title}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className={styles.empty}>
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  className={onRowClick ? styles.clickable : undefined}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={alignClass(c.align ?? 'left')}>
                      <div
                        className={`${styles.cellInner} ${
                          c.align === 'right'
                            ? styles.cellInnerRight
                            : c.align === 'center'
                              ? styles.cellInnerCenter
                              : styles.cellInnerLeft
                        }`}
                      >
                        {c.render ? c.render(row) : (row as Record<string, unknown>)[c.key] as ReactNode}
                      </div>
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
