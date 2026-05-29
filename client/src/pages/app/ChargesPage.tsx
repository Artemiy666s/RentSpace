import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet } from 'lucide-react';
import { api } from '@/api/client';
import { usePropertyStore } from '@/store/propertyStore';
import { useI18n } from '@/i18n/useI18n';
import { monthSelectOptions } from '@/i18n/months';
import { useTableSort } from '@/hooks/useTableSort';
import { accessorsFromColumns } from '@/lib/tableSort';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { DataTable, type Column } from '@/components/data/DataTable';
import { TableSortBar } from '@/components/data/TableSortBar';
import tableStyles from '@/components/data/DataTable.module.css';
import { downloadApiFile } from '@/lib/exportFile';
import { ChargeEditModal, type RentChargeRow } from '@/features/finance/ChargeEditModal';
import listingStyles from '@/styles/listingPage.module.css';

function chargeStatusLabel(t: (key: string) => string, status: string) {
  if (status === 'charged') return t('charges.statusCharged');
  if (status === 'cancelled') return t('charges.statusCancelled');
  return status;
}

export function ChargesPage() {
  const { t } = useI18n();
  const { propertyId } = usePropertyStore();
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [selected, setSelected] = useState<RentChargeRow | null>(null);

  const { data: properties } = useQuery({
    queryKey: ['properties'],
    queryFn: () => api.get('/properties').then((r) => r.data.data),
  });
  const pid = propertyId || properties?.[0]?.id;

  const { data: charges, isLoading } = useQuery({
    queryKey: ['rent-charges', pid, year, month],
    queryFn: () =>
      api.get('/rent-charges', { params: { propertyId: pid, year, month } }).then((r) => r.data.data as RentChargeRow[]),
    enabled: !!pid,
  });

  const columns: Column<RentChargeRow>[] = useMemo(
    () => [
      {
        key: 'tenant',
        title: t('common.tenant'),
        width: '28%',
        sortable: true,
        sortValue: (r) => r.tenant_name,
        render: (r) => r.tenant_name,
      },
      {
        key: 'area',
        title: (
          <span className={tableStyles.thWithUnit}>
            <span>{t('common.area')}</span>
            <span className={tableStyles.thUnit}>{t('common.sqm')}</span>
          </span>
        ),
        width: '18%',
        align: 'right',
        sortable: true,
        sortType: 'number',
        sortValue: (r) => r.area,
        render: (r) => <span className={tableStyles.numValue}>{Number(r.area).toFixed(2)}</span>,
      },
      {
        key: 'amount_without_vat',
        title: t('common.withoutVat'),
        width: '18%',
        align: 'right',
        sortable: true,
        sortType: 'number',
        sortValue: (r) => r.amount_without_vat,
        render: (r) => (
          <span className={tableStyles.numValue}>{Number(r.amount_without_vat).toFixed(2)}</span>
        ),
      },
      {
        key: 'amount_with_vat',
        title: t('common.withVat'),
        width: '18%',
        align: 'right',
        sortable: true,
        sortType: 'number',
        sortValue: (r) => r.amount_with_vat,
        render: (r) => (
          <span className={tableStyles.numValue}>{Number(r.amount_with_vat).toFixed(2)}</span>
        ),
      },
      {
        key: 'status',
        title: t('common.status'),
        width: '18%',
        sortable: true,
        sortValue: (r) => chargeStatusLabel(t, r.status),
        render: (r) => chargeStatusLabel(t, r.status),
      },
    ],
    [t]
  );

  const accessors = useMemo(() => accessorsFromColumns(columns), [columns]);
  const { sortedRows, sortKey, sortDirection, handleSort, applyPreset, activePreset } = useTableSort(
    charges,
    accessors,
    { nameKey: 'tenant' }
  );

  const exportExcel = () => {
    if (!pid) return;
    downloadApiFile(
      '/rent-charges/export/xlsx',
      { propertyId: pid, year, month },
      `rent-charges-${year}-${month}.xlsx`
    );
  };

  return (
    <div className={listingStyles.page}>
      <div className={listingStyles.pageHead}>
        <h1>{t('charges.title')}</h1>
        <div className={listingStyles.pageActions}>
          <Button variant="secondary" onClick={exportExcel} disabled={!pid}>
            <FileSpreadsheet size={18} /> {t('common.exportExcel')}
          </Button>
        </div>
      </div>

      <div className={listingStyles.toolbar}>
        <Select
          value={String(month)}
          onChange={(v) => setMonth(Number(v))}
          options={monthSelectOptions(t)}
          aria-label={t('common.monthCol')}
        />
        <input
          type="number"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          aria-label={t('tenants.year')}
        />
        <TableSortBar value={activePreset} onChange={applyPreset} showDatePresets={false} />
      </div>
      <p className={listingStyles.sortHint}>{t('tableSort.columnHint')}</p>

      {isLoading ? (
        <p>{t('common.loading')}</p>
      ) : (
        <DataTable
          columns={columns}
          rows={sortedRows}
          rowKey={(r) => r.id}
          onRowClick={setSelected}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      )}

      <ChargeEditModal charge={selected} open={!!selected} onClose={() => setSelected(null)} />
    </div>
  );
}
