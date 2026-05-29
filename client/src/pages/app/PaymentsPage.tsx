import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Plus } from 'lucide-react';
import { api } from '@/api/client';
import { usePropertyStore } from '@/store/propertyStore';
import { useI18n } from '@/i18n/useI18n';
import { useTableSort } from '@/hooks/useTableSort';
import { accessorsFromColumns } from '@/lib/tableSort';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { DataTable, type Column } from '@/components/data/DataTable';
import { TableSortBar } from '@/components/data/TableSortBar';
import tableStyles from '@/components/data/DataTable.module.css';
import { Modal } from '@/components/modals/Modal';
import { Input } from '@/components/ui/Input';
import { downloadApiFile } from '@/lib/exportFile';
import { PaymentEditModal, type PaymentRow } from '@/features/finance/PaymentEditModal';
import listingStyles from '@/styles/listingPage.module.css';

export function PaymentsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { propertyId } = usePropertyStore();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<PaymentRow | null>(null);
  const [form, setForm] = useState({ tenantId: '', amount: '', paymentDate: '', paymentType: 'rent' });

  const { data: properties } = useQuery({
    queryKey: ['properties'],
    queryFn: () => api.get('/properties').then((r) => r.data.data),
  });
  const pid = propertyId || properties?.[0]?.id;

  const { data: payments, isLoading } = useQuery({
    queryKey: ['payments', pid],
    queryFn: () => api.get('/payments', { params: { propertyId: pid } }).then((r) => r.data.data as PaymentRow[]),
    enabled: !!pid,
  });

  const { data: tenants } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => api.get('/tenants').then((r) => r.data.data),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post('/payments', {
        propertyId: pid,
        tenantId: Number(form.tenantId),
        amount: Number(form.amount),
        paymentDate: form.paymentDate,
        paymentType: form.paymentType,
        periodYear: new Date(form.paymentDate).getFullYear(),
        periodMonth: new Date(form.paymentDate).getMonth() + 1,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      setOpen(false);
    },
  });

  const columns: Column<PaymentRow>[] = useMemo(
    () => [
      {
        key: 'date',
        title: t('common.date'),
        width: '18%',
        sortable: true,
        sortType: 'date',
        sortValue: (r) => String(r.payment_date).slice(0, 10),
        render: (r) => String(r.payment_date).slice(0, 10),
      },
      {
        key: 'tenant',
        title: t('common.tenant'),
        width: '34%',
        sortable: true,
        sortValue: (r) => r.tenant_name,
        render: (r) => r.tenant_name,
      },
      {
        key: 'amount',
        title: (
          <span className={tableStyles.thWithUnit}>
            <span>{t('common.amount')}</span>
            <span className={tableStyles.thUnit}>{t('common.currencyByn')}</span>
          </span>
        ),
        width: '26%',
        align: 'right',
        sortable: true,
        sortType: 'number',
        sortValue: (r) => r.amount,
        render: (r) => <span className={tableStyles.numValue}>{Number(r.amount).toFixed(2)}</span>,
      },
      {
        key: 'type',
        title: t('common.type'),
        width: '22%',
        sortable: true,
        sortValue: (r) => r.payment_type,
        render: (r) => r.payment_type,
      },
    ],
    [t]
  );

  const accessors = useMemo(() => accessorsFromColumns(columns), [columns]);
  const { sortedRows, sortKey, sortDirection, handleSort, applyPreset, activePreset } = useTableSort(
    payments,
    accessors,
    { dateKey: 'date', nameKey: 'tenant', defaultSortKey: 'date', defaultDirection: 'desc' }
  );

  const exportExcel = () => {
    if (!pid) return;
    downloadApiFile('/payments/export/xlsx', { propertyId: pid }, `payments.xlsx`);
  };

  return (
    <div className={listingStyles.page}>
      <div className={listingStyles.pageHead}>
        <h1>{t('payments.title')}</h1>
        <div className={listingStyles.pageActions}>
          <Button variant="secondary" onClick={exportExcel} disabled={!pid}>
            <FileSpreadsheet size={18} /> {t('common.exportExcel')}
          </Button>
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus size={18} /> {t('payments.add')}
          </Button>
        </div>
      </div>

      <div className={listingStyles.toolbar}>
        <TableSortBar value={activePreset} onChange={applyPreset} />
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

      <PaymentEditModal payment={selected} open={!!selected} onClose={() => setSelected(null)} />

      <Modal open={open} title={t('common.newPayment')} onClose={() => setOpen(false)}>
        <Select
          fullWidth
          label={t('common.tenant')}
          required
          value={form.tenantId}
          onChange={(tenantId) => setForm({ ...form, tenantId })}
          options={[
            { value: '', label: t('common.selectPlaceholder') },
            ...(tenants?.map((tn: { id: number; name: string }) => ({
              value: String(tn.id),
              label: tn.name,
            })) ?? []),
          ]}
        />
        <Input
          label={t('common.amount')}
          required
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
        />
        <Input
          label={t('common.date')}
          type="date"
          required
          value={form.paymentDate}
          onChange={(e) => setForm({ ...form, paymentDate: e.target.value })}
        />
        <Button variant="primary" fullWidth onClick={() => create.mutate()}>
          {t('common.save')}
        </Button>
      </Modal>
    </div>
  );
}
