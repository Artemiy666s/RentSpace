import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, FileText, Search, X } from 'lucide-react';
import { api } from '@/api/client';
import { usePropertyStore } from '@/store/propertyStore';
import { useI18n } from '@/i18n/useI18n';
import { monthShortLabel } from '@/i18n/months';
import { useTableSort } from '@/hooks/useTableSort';
import { accessorsFromColumns } from '@/lib/tableSort';
import { DataTable, type Column } from '@/components/data/DataTable';
import { TableSortBar } from '@/components/data/TableSortBar';
import listingStyles from '@/styles/listingPage.module.css';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { downloadApiFile } from '@/lib/exportFile';
import { RentRegisterRowModal, type RentRegisterRow } from '@/features/finance/RentRegisterRowModal';
import styles from './RentRegisterPage.module.css';

type MonthAmounts = {
  rent: number;
  paid: number;
  utility: number;
  utilityPaid: number;
};

type RegisterRow = RentRegisterRow & {
  contractNumber?: string;
  months: Record<number, MonthAmounts>;
  total: number;
};

type ViewMode = 'classic' | 'split';

const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

function defaultVisibleMonths(date = new Date()): number[] {
  return [date.getMonth() + 1];
}

function matchesSearch(row: RegisterRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [row.tenantName, row.contractNumber, row.contractLabel]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase())
    .some((v) => v.includes(q));
}

function fmt(n: number | null | undefined): string {
  return n != null ? Number(n).toFixed(2) : '0.00';
}

export function RentRegisterPage() {
  const { t } = useI18n();
  const { propertyId, setPropertyId } = usePropertyStore();
  const [filterBuildingId, setFilterBuildingId] = useState<number | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedMonths, setSelectedMonths] = useState<number[]>(() => defaultVisibleMonths());
  const [selectedRow, setSelectedRow] = useState<RegisterRow | null>(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('classic');

  const { data: properties } = useQuery({
    queryKey: ['properties'],
    queryFn: () => api.get('/properties').then((r) => r.data.data),
  });
  const pid = propertyId || properties?.[0]?.id;

  const { data: buildings } = useQuery({
    queryKey: ['buildings', pid],
    queryFn: () => api.get(`/properties/${pid}/buildings`).then((r) => r.data.data),
    enabled: !!pid,
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['rent-register', pid, year, filterBuildingId],
    queryFn: () =>
      api
        .get('/manager/rent-register', {
          params: {
            propertyId: pid,
            year,
            ...(filterBuildingId ? { buildingId: filterBuildingId } : {}),
          },
        })
        .then((r) => r.data.data as { rows: RegisterRow[] }),
    enabled: !!pid,
  });

  const addMonth = (month: number) => {
    if (!month || selectedMonths.includes(month)) return;
    setSelectedMonths((prev) => [...prev, month].sort((a, b) => a - b));
  };

  const selectAllMonths = () => {
    setSelectedMonths([...ALL_MONTHS]);
  };

  const removeMonth = (month: number) => {
    setSelectedMonths((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((m) => m !== month);
    });
  };

  const availableMonths = ALL_MONTHS.filter((m) => !selectedMonths.includes(m));

  const filteredRows = useMemo(
    () => (data?.rows ?? []).filter((row) => matchesSearch(row, search)),
    [data?.rows, search]
  );

  const columns: Column<RegisterRow>[] = useMemo(() => {
    const compact = selectedMonths.length > 4;
    const monthW = compact ? '76px' : '100px';
    const base: Column<RegisterRow>[] = [
      {
        key: 'n',
        title: '№',
        width: '48px',
        align: 'center',
        sortable: true,
        sortType: 'number',
        sortValue: (r) => r.rowNum,
        render: (r) => r.rowNum,
      },
      {
        key: 'tenant',
        title: t('rentRegister.colTenant'),
        width: '150px',
        sortable: true,
        sortValue: (r) => r.tenantName,
        render: (r) => r.tenantName,
      },
      {
        key: 'contract',
        title: t('rentRegister.colContract'),
        width: '115px',
        sortable: true,
        sortValue: (r) => r.contractLabel,
        render: (r) => r.contractLabel,
      },
      {
        key: 'area',
        title: t('rentRegister.colArea'),
        align: 'right',
        width: '96px',
        sortable: true,
        sortType: 'number',
        sortValue: (r) => r.area,
        render: (r) => `${r.area} ${t('common.sqm')}`,
      },
      {
        key: 'rate',
        title: t('rentRegister.colRate'),
        align: 'right',
        width: '96px',
        sortable: true,
        sortType: 'number',
        sortValue: (r) => r.rateWithoutVat ?? 0,
        render: (r) => (r.rateWithoutVat != null ? Number(r.rateWithoutVat).toFixed(2) : '—'),
      },
    ];

    const monthColumns = selectedMonths.flatMap((m) => {
      const label = monthShortLabel(t, m);
      return [
        {
          key: `r${m}`,
          title: t('common.rentMonth', { month: label }),
          align: 'right' as const,
          width: monthW,
          sortable: true,
          sortType: 'number' as const,
          sortValue: (r: RegisterRow) => r.months[m]?.rent ?? 0,
          render: (r: RegisterRow) => fmt(r.months[m]?.rent),
        },
        {
          key: `pd${m}`,
          title: t('common.paidMonth', { month: label }),
          align: 'right' as const,
          width: monthW,
          sortable: true,
          sortType: 'number' as const,
          sortValue: (r: RegisterRow) => r.months[m]?.paid ?? 0,
          render: (r: RegisterRow) => fmt(r.months[m]?.paid),
        },
        {
          key: `ut${m}`,
          title: t('common.utilMonth', { month: label }),
          align: 'right' as const,
          width: monthW,
          sortable: true,
          sortType: 'number' as const,
          sortValue: (r: RegisterRow) => r.months[m]?.utility ?? 0,
          render: (r: RegisterRow) => fmt(r.months[m]?.utility),
        },
        {
          key: `up${m}`,
          title: t('common.utilPaidMonth', { month: label }),
          align: 'right' as const,
          width: monthW,
          sortable: true,
          sortType: 'number' as const,
          sortValue: (r: RegisterRow) => r.months[m]?.utilityPaid ?? 0,
          render: (r: RegisterRow) => fmt(r.months[m]?.utilityPaid),
        },
      ];
    });

    const totalColumns: Column<RegisterRow>[] = [
      {
        key: 'debt',
        title: t('common.debt'),
        align: 'right',
        sortable: true,
        sortType: 'number',
        sortValue: (r) => r.debt ?? 0,
        render: (r) => fmt(r.debt),
      },
    ];

    return [...base, ...monthColumns, ...totalColumns];
  }, [t, selectedMonths]);

  const accessors = useMemo(() => accessorsFromColumns(columns), [columns]);
  const { sortedRows, sortKey, sortDirection, handleSort, applyPreset, activePreset } = useTableSort(
    filteredRows,
    accessors,
    { nameKey: 'tenant', debtKey: 'debt' }
  );

  const totals = useMemo(() => {
    const monthTotals: Record<number, MonthAmounts> = {};
    for (const m of selectedMonths) {
      monthTotals[m] = filteredRows.reduce(
        (acc, row) => {
          acc.rent += row.months[m]?.rent ?? 0;
          acc.paid += row.months[m]?.paid ?? 0;
          acc.utility += row.months[m]?.utility ?? 0;
          acc.utilityPaid += row.months[m]?.utilityPaid ?? 0;
          return acc;
        },
        { rent: 0, paid: 0, utility: 0, utilityPaid: 0 }
      );
    }
    return {
      monthTotals,
      area: Math.round(filteredRows.reduce((s, r) => s + Number(r.area || 0), 0) * 100) / 100,
      debt: Math.round(filteredRows.reduce((s, r) => s + (r.debt ?? 0), 0) * 100) / 100,
    };
  }, [filteredRows, selectedMonths]);

  const footerCells = useMemo(() => {
    if (!sortedRows.length) return undefined;
    return columns.map((col) => {
      if (col.key === 'tenant') return t('rentRegister.totalRow');
      if (col.key === 'n' || col.key === 'contract' || col.key === 'area' || col.key === 'rate') {
        return '';
      }
      if (col.key.startsWith('r')) {
        const m = Number(col.key.slice(1));
        return fmt(totals.monthTotals[m]?.rent);
      }
      if (col.key.startsWith('pd')) {
        const m = Number(col.key.slice(2));
        return fmt(totals.monthTotals[m]?.paid);
      }
      if (col.key.startsWith('ut')) {
        const m = Number(col.key.slice(2));
        return fmt(totals.monthTotals[m]?.utility);
      }
      if (col.key.startsWith('up')) {
        const m = Number(col.key.slice(2));
        return fmt(totals.monthTotals[m]?.utilityPaid);
      }
      if (col.key === 'debt') return fmt(totals.debt);
      return '';
    });
  }, [columns, sortedRows.length, totals, t]);

  const exportParams = {
    propertyId: pid,
    year,
    months: selectedMonths.join(','),
    ...(filterBuildingId ? { buildingId: filterBuildingId } : {}),
    full: 'true',
  };

  const exportExcel = () => {
    if (!pid) return;
    downloadApiFile('/manager/rent-register/export/xlsx', exportParams, `rent-register-${year}.xlsx`);
  };

  const exportPdf = () => {
    if (!pid) return;
    downloadApiFile(
      '/manager/month-close/report/pdf',
      { propertyId: pid, year, month: selectedMonths[0] ?? 1 },
      `rent-register-${year}.html`
    );
  };

  const emptyText = search.trim() ? t('rentRegister.noSearchResults') : t('common.noData');

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <h1>{t('rentRegister.title')}</h1>
        <div className={styles.pageActions}>
          <Button variant="secondary" onClick={exportExcel} disabled={!pid}>
            <FileSpreadsheet size={18} /> {t('common.exportExcel')}
          </Button>
          <Button variant="secondary" onClick={exportPdf} disabled={!pid}>
            <FileText size={18} /> {t('common.exportPdf')}
          </Button>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <Select
            value={String(pid ?? '')}
            onChange={(v) => setPropertyId(Number(v))}
            options={
              properties?.map((p: { id: number; name: string }) => ({
                value: String(p.id),
                label: p.name,
              })) ?? []
            }
          />
          <Select
            value={filterBuildingId != null ? String(filterBuildingId) : ''}
            onChange={(v) => setFilterBuildingId(v ? Number(v) : null)}
            options={[
              { value: '', label: t('common.allBuildings') },
              ...(buildings?.map((b: { id: number; name: string }) => ({
                value: String(b.id),
                label: b.name,
              })) ?? []),
            ]}
          />
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
        </div>

        <div className={styles.monthBar}>
          <label className={styles.monthLabel}>{t('rentRegister.months')}:</label>
          <div className={styles.monthChips}>
            {selectedMonths.map((m) => (
              <span key={m} className={styles.monthChip}>
                {monthShortLabel(t, m)}
                {selectedMonths.length > 1 && (
                  <button
                    type="button"
                    className={styles.monthChipRemove}
                    onClick={() => removeMonth(m)}
                    aria-label={t('rentRegister.removeMonth', { month: monthShortLabel(t, m) })}
                  >
                    <X size={14} />
                  </button>
                )}
              </span>
            ))}
          </div>
          {selectedMonths.length < ALL_MONTHS.length && (
            <Select
              className={styles.monthAdd}
              value=""
              placeholder={t('rentRegister.addMonth')}
              onChange={(v) => {
                if (v === 'all') selectAllMonths();
                else if (v) addMonth(Number(v));
              }}
              options={[
                { value: 'all', label: t('rentRegister.allMonths') },
                ...availableMonths.map((m) => ({
                  value: String(m),
                  label: monthShortLabel(t, m),
                })),
              ]}
            />
          )}
        </div>
      </div>

      {isError && (
        <p className={styles.error}>
          {t('rentRegister.loadError')} {(error as Error)?.message || ''}
        </p>
      )}

      <div className={styles.controlsRow}>
        <label className={styles.searchWrap}>
          <Search size={18} className={styles.searchIcon} aria-hidden />
          <input
            type="search"
            className={styles.searchInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('rentRegister.searchPlaceholder')}
            aria-label={t('rentRegister.searchPlaceholder')}
          />
        </label>
        <div className={styles.viewToggle} role="group" aria-label={t('rentRegister.viewLabel')}>
          <button
            type="button"
            className={`${styles.viewBtn} ${viewMode === 'classic' ? styles.viewBtnActive : ''}`}
            onClick={() => setViewMode('classic')}
          >
            {t('rentRegister.viewClassic')}
          </button>
          <button
            type="button"
            className={`${styles.viewBtn} ${viewMode === 'split' ? styles.viewBtnActive : ''}`}
            onClick={() => setViewMode('split')}
          >
            {t('rentRegister.viewSplit')}
          </button>
        </div>
        <TableSortBar
          value={activePreset}
          onChange={applyPreset}
          showDatePresets={false}
          showDebtPresets
        />
      </div>
      <p className={listingStyles.sortHint}>{t('tableSort.columnHint')}</p>

      {isLoading ? (
        <p>{t('common.loading')}</p>
      ) : viewMode === 'split' ? (
        <div className={styles.splitWrap}>
          <table className={`${styles.splitTable} ${styles.splitTableFixed}`}>
            <thead>
              <tr>
                <th rowSpan={2} className={styles.numCol}>
                  №
                </th>
                <th rowSpan={2}>{t('rentRegister.colTenant')}</th>
                <th rowSpan={2}>{t('rentRegister.colContract')}</th>
                <th rowSpan={2} className={styles.numCell}>
                  {t('rentRegister.colArea')}
                </th>
                <th rowSpan={2} className={styles.indicatorCol}>
                  {t('rentRegister.colIndicator')}
                </th>
                {selectedMonths.map((m) => (
                  <th key={m} colSpan={2} className={styles.monthGroup}>
                    {monthShortLabel(t, m)}
                  </th>
                ))}
                <th rowSpan={2} className={styles.numCell}>
                  {t('common.debt')}
                </th>
              </tr>
              <tr>
                {selectedMonths.map((m) => (
                  <Fragment key={m}>
                    <th className={styles.subCol}>{t('rentRegister.chargedShort')}</th>
                    <th className={styles.subCol}>{t('rentRegister.paidShort')}</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={5 + selectedMonths.length * 2 + 1} className={styles.emptyCell}>
                    {emptyText}
                  </td>
                </tr>
              ) : (
                <>
                  <tr className={styles.totalRow}>
                    <td rowSpan={2} className={styles.numCol} />
                    <td rowSpan={2} colSpan={2} className={styles.totalLabel}>
                      {t('rentRegister.totalRow')}
                    </td>
                    <td rowSpan={2} className={styles.numCell}>
                      {totals.area} {t('common.sqm')}
                    </td>
                    <td className={styles.indicatorCell}>{t('rentRegister.indicatorRent')}</td>
                    {selectedMonths.map((m) => (
                      <FragmentMonthValues
                        key={`tr-${m}`}
                        charged={totals.monthTotals[m]?.rent}
                        paid={totals.monthTotals[m]?.paid}
                      />
                    ))}
                    <td rowSpan={2} className={`${styles.numCell} ${styles.debtCell}`}>
                      {fmt(totals.debt)}
                    </td>
                  </tr>
                  <tr className={styles.totalRow}>
                    <td className={styles.indicatorCell}>{t('rentRegister.indicatorUtil')}</td>
                    {selectedMonths.map((m) => (
                      <FragmentMonthValues
                        key={`tu-${m}`}
                        charged={totals.monthTotals[m]?.utility}
                        paid={totals.monthTotals[m]?.utilityPaid}
                      />
                    ))}
                  </tr>
                  {sortedRows.map((row) => (
                    <SplitTenantRows
                      key={row.rowNum}
                      row={row}
                      months={selectedMonths}
                      onClick={() => setSelectedRow(row)}
                      t={t}
                    />
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={sortedRows}
          rowKey={(r) => r.rowNum}
          onRowClick={setSelectedRow}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={handleSort}
          footerCells={footerCells}
          emptyText={emptyText}
        />
      )}

      <RentRegisterRowModal
        row={selectedRow}
        year={year}
        open={!!selectedRow}
        onClose={() => setSelectedRow(null)}
      />
    </div>
  );
}

function FragmentMonthValues({ charged, paid }: { charged?: number; paid?: number }) {
  return (
    <>
      <td className={styles.numCell}>{fmt(charged)}</td>
      <td className={styles.numCell}>{fmt(paid)}</td>
    </>
  );
}

function SplitTenantRows({
  row,
  months,
  onClick,
  t,
}: {
  row: RegisterRow;
  months: number[];
  onClick: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <>
      <tr className={styles.splitRow} onClick={onClick}>
        <td rowSpan={2} className={styles.numCol}>
          {row.rowNum}
        </td>
        <td rowSpan={2} className={styles.tenantCell}>
          {row.tenantName}
        </td>
        <td rowSpan={2} className={styles.contractCell}>
          {row.contractLabel}
        </td>
        <td rowSpan={2} className={styles.numCell}>
          {row.area} {t('common.sqm')}
        </td>
        <td className={styles.indicatorCell}>{t('rentRegister.indicatorRent')}</td>
        {months.map((m) => (
          <FragmentMonthValues key={`r-${m}`} charged={row.months[m]?.rent} paid={row.months[m]?.paid} />
        ))}
        <td rowSpan={2} className={`${styles.numCell} ${styles.debtCell}`}>
          {fmt(row.debt)}
        </td>
      </tr>
      <tr className={`${styles.splitRow} ${styles.splitRowAlt}`} onClick={onClick}>
        <td className={styles.indicatorCell}>{t('rentRegister.indicatorUtil')}</td>
        {months.map((m) => (
          <FragmentMonthValues
            key={`u-${m}`}
            charged={row.months[m]?.utility}
            paid={row.months[m]?.utilityPaid}
          />
        ))}
      </tr>
    </>
  );
}
