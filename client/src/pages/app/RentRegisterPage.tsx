import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, FileText, X } from 'lucide-react';
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

type RegisterRow = RentRegisterRow & {
  months: Record<number, { rent: number; utility: number }>;
  total: number;
};

const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export function RentRegisterPage() {
  const { t } = useI18n();
  const { propertyId, setPropertyId } = usePropertyStore();
  const [filterBuildingId, setFilterBuildingId] = useState<number | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedMonths, setSelectedMonths] = useState<number[]>(() => [...ALL_MONTHS]);
  const [selectedRow, setSelectedRow] = useState<RegisterRow | null>(null);

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

  const columns: Column<RegisterRow>[] = useMemo(() => {
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
        width: '22%',
        sortable: true,
        sortValue: (r) => r.tenantName,
        render: (r) => r.tenantName,
      },
      {
        key: 'contract',
        title: t('rentRegister.colContract'),
        width: '18%',
        sortable: true,
        sortValue: (r) => r.contractLabel,
        render: (r) => r.contractLabel,
      },
      {
        key: 'area',
        title: t('rentRegister.colArea'),
        align: 'right',
        width: '10%',
        sortable: true,
        sortType: 'number',
        sortValue: (r) => r.area,
        render: (r) => `${r.area} ${t('common.sqm')}`,
      },
      {
        key: 'rate',
        title: t('rentRegister.colRate'),
        align: 'right',
        width: '10%',
        sortable: true,
        sortType: 'number',
        sortValue: (r) => r.rateWithoutVat ?? 0,
        render: (r) => (r.rateWithoutVat != null ? Number(r.rateWithoutVat).toFixed(2) : '—'),
      },
    ];

    const monthColumns = selectedMonths.flatMap((m) => [
      {
        key: `r${m}`,
        title: t('common.rentMonth', { month: monthShortLabel(t, m) }),
        align: 'right' as const,
        sortable: true,
        sortType: 'number' as const,
        sortValue: (r: RegisterRow) => r.months[m]?.rent ?? 0,
        render: (r: RegisterRow) => (r.months[m]?.rent != null ? r.months[m].rent.toFixed(2) : '0.00'),
      },
      {
        key: `u${m}`,
        title: t('common.reimbMonth', { month: monthShortLabel(t, m) }),
        align: 'right' as const,
        sortable: true,
        sortType: 'number' as const,
        sortValue: (r: RegisterRow) => r.months[m]?.utility ?? 0,
        render: (r: RegisterRow) => (r.months[m]?.utility != null ? r.months[m].utility.toFixed(2) : '0.00'),
      },
    ]);

    const totalColumns: Column<RegisterRow>[] = [
      {
        key: 'totalRent',
        title: t('common.totalRent'),
        align: 'right',
        sortable: true,
        sortType: 'number',
        sortValue: (r) => r.totalRent ?? 0,
        render: (r) => (r.totalRent != null ? Number(r.totalRent).toFixed(2) : '0.00'),
      },
      {
        key: 'totalUtil',
        title: t('common.totalReimb'),
        align: 'right',
        sortable: true,
        sortType: 'number',
        sortValue: (r) => r.totalUtil ?? 0,
        render: (r) => (r.totalUtil != null ? Number(r.totalUtil).toFixed(2) : '0.00'),
      },
      {
        key: 'debt',
        title: t('common.debt'),
        align: 'right',
        sortable: true,
        sortType: 'number',
        sortValue: (r) => r.debt,
        render: (r) => r.debt.toFixed(2),
      },
      {
        key: 'status',
        title: t('common.status'),
        width: '10%',
        sortable: true,
        sortValue: (r) => r.status,
        render: (r) => r.status,
      },
    ];

    return [...base, ...monthColumns, ...totalColumns];
  }, [t, selectedMonths]);

  const accessors = useMemo(() => accessorsFromColumns(columns), [columns]);
  const { sortedRows, sortKey, sortDirection, handleSort, applyPreset, activePreset } = useTableSort(
    data?.rows,
    accessors,
    { nameKey: 'tenant' }
  );

  const totals = useMemo(() => {
    const rows = data?.rows ?? [];
    const monthTotals: Record<number, { rent: number; utility: number }> = {};
    for (const m of selectedMonths) {
      monthTotals[m] = rows.reduce(
        (acc, row) => {
          acc.rent += row.months[m]?.rent ?? 0;
          acc.utility += row.months[m]?.utility ?? 0;
          return acc;
        },
        { rent: 0, utility: 0 }
      );
    }
    return {
      monthTotals,
      totalRent: rows.reduce((s, r) => s + (r.totalRent ?? 0), 0),
      totalUtil: rows.reduce((s, r) => s + (r.totalUtil ?? 0), 0),
      debt: rows.reduce((s, r) => s + (r.debt ?? 0), 0),
    };
  }, [data?.rows, selectedMonths]);

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
          {t('rentRegister.loadError')}{' '}
          {(error as Error)?.message || ''}
        </p>
      )}
      <div className={listingStyles.toolbar}>
        <TableSortBar value={activePreset} onChange={applyPreset} showDatePresets={false} />
      </div>
      <p className={listingStyles.sortHint}>{t('tableSort.columnHint')}</p>

      {isLoading ? (
        <p>{t('common.loading')}</p>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={sortedRows}
            rowKey={(r) => r.rowNum}
            onRowClick={setSelectedRow}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={handleSort}
          />
          {sortedRows.length > 0 && (
            <div className={styles.totalsWrap}>
              <table className={styles.totalsTable}>
                <tbody>
                  <tr>
                    <td className={styles.totalsLabel} colSpan={5}>
                      {t('rentRegister.totalRow')}
                    </td>
                    {selectedMonths.flatMap((m) => [
                      <td key={`tr-${m}`} className={styles.totalsNum}>
                        {totals.monthTotals[m]?.rent.toFixed(2)}
                      </td>,
                      <td key={`tu-${m}`} className={styles.totalsNum}>
                        {totals.monthTotals[m]?.utility.toFixed(2)}
                      </td>,
                    ])}
                    <td className={styles.totalsNum}>{totals.totalRent.toFixed(2)}</td>
                    <td className={styles.totalsNum}>{totals.totalUtil.toFixed(2)}</td>
                    <td className={styles.totalsNum}>{totals.debt.toFixed(2)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
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
