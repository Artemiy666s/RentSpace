import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Plus, X, Pencil, Trash2 } from 'lucide-react';
import { api } from '@/api/client';
import { usePropertyStore } from '@/store/propertyStore';
import { useI18n } from '@/i18n/useI18n';
import { monthFullLabel, monthShortLabel } from '@/i18n/months';
import { useTableSort } from '@/hooks/useTableSort';
import { accessorsFromColumns } from '@/lib/tableSort';
import { DataTable, type Column } from '@/components/data/DataTable';
import { TableSortBar } from '@/components/data/TableSortBar';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/modals/Modal';
import { downloadApiFile } from '@/lib/exportFile';
import listingStyles from '@/styles/listingPage.module.css';
import styles from './ExpensesPage.module.css';

const EXPENSE_CATEGORY_CODES = [
  'wood',
  'heating',
  'salary',
  'taxes',
  'cutting',
  'utilities',
  'repair',
  'maintenance',
  'security',
  'cleaning',
  'other',
] as const;

type ExpenseRow = {
  id: number;
  expense_date: string;
  period_month: number;
  period_year: number;
  category: string;
  amount: number;
  description?: string;
};

const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export function ExpensesPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { propertyId, setPropertyId } = usePropertyStore();
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedMonths, setSelectedMonths] = useState<number[]>(() => [new Date().getMonth() + 1]);
  const [open, setOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null);
  const [form, setForm] = useState({
    expenseDate: new Date().toISOString().slice(0, 10),
    periodMonth: new Date().getMonth() + 1,
    category: 'heating',
    amount: '',
    description: '',
  });

  const categories = useMemo(
    () =>
      EXPENSE_CATEGORY_CODES.map((code) => ({
        code,
        label: t(`expenses.categories.${code}`),
      })),
    [t]
  );

  const { data: properties } = useQuery({
    queryKey: ['properties'],
    queryFn: () => api.get('/properties').then((r) => r.data.data),
  });
  const pid = propertyId || properties?.[0]?.id;

  const { data, isLoading } = useQuery({
    queryKey: ['expenses-summary', pid, year],
    queryFn: () =>
      api.get('/manager/expenses/summary', { params: { propertyId: pid, year } }).then((r) => r.data.data),
    enabled: !!pid,
  });

  const addMutation = useMutation({
    mutationFn: () =>
      api.post('/expenses', {
        propertyId: pid,
        expenseDate: form.expenseDate,
        periodYear: year,
        periodMonth: form.periodMonth,
        category: form.category,
        amount: Number(form.amount),
        description: form.description,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses-summary'] });
      setOpen(false);
      setEditingExpenseId(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api.put(`/expenses/${editingExpenseId}`, {
        expenseDate: form.expenseDate,
        periodYear: year,
        periodMonth: form.periodMonth,
        category: form.category,
        amount: Number(form.amount),
        description: form.description,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses-summary'] });
      setOpen(false);
      setEditingExpenseId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/expenses/${editingExpenseId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses-summary'] });
      setOpen(false);
      setEditingExpenseId(null);
    },
  });

  const operations = useMemo(
    () =>
      (data?.operations ?? []).filter((r: ExpenseRow) =>
        selectedMonths.includes(Number(r.period_month))
      ) as ExpenseRow[],
    [data?.operations, selectedMonths]
  );

  const matrixRows = useMemo(
    () =>
      (data?.categories ?? []).map((r: { code: string; label: string; months: Record<number, number> }) => {
        const total = selectedMonths.reduce((sum, m) => sum + Number(r.months[m] ?? 0), 0);
        return { ...r, total };
      }),
    [data?.categories, selectedMonths]
  );

  type MatrixRow = { code: string; label: string; months: Record<number, number>; total: number };

  const matrixCols: Column<MatrixRow>[] = useMemo(
    () => [
      {
        key: 'cat',
        title: t('common.category'),
        width: '16%',
        sortable: true,
        sortValue: (r) => r.label,
        render: (r) => r.label,
      },
      ...selectedMonths.map((month) => ({
        key: `m${month}`,
        title: monthFullLabel(t, month),
        width: `${Math.max(6, Math.floor(70 / Math.max(1, selectedMonths.length)))}%`,
        align: 'right' as const,
        sortable: true,
        sortType: 'number' as const,
        sortValue: (r: MatrixRow) => r.months[month] ?? 0,
        render: (r: MatrixRow) => (r.months[month] ?? 0).toFixed(2),
      })),
      {
        key: 'total',
        title: t('common.totalLabel'),
        width: '14%',
        align: 'right' as const,
        sortable: true,
        sortType: 'number',
        sortValue: (r) => r.total,
        render: (r) => r.total.toFixed(2),
      },
    ],
    [t, selectedMonths]
  );

  const matrixAccessors = useMemo(() => accessorsFromColumns(matrixCols), [matrixCols]);
  const matrixSort = useTableSort(matrixRows, matrixAccessors, { nameKey: 'cat' });

  const opCols: Column<ExpenseRow>[] = useMemo(
    () => [
      {
        key: 'date',
        title: t('common.date'),
        width: '20%',
        sortable: true,
        sortType: 'date',
        sortValue: (r) => String(r.expense_date).slice(0, 10),
        render: (r) => String(r.expense_date).slice(0, 10),
      },
      {
        key: 'cat',
        title: t('common.category'),
        width: '24%',
        sortable: true,
        sortValue: (r) => t(`expenses.categories.${r.category}`),
        render: (r) => t(`expenses.categories.${r.category}`),
      },
      {
        key: 'sum',
        title: t('common.amount'),
        width: '18%',
        align: 'right',
        sortable: true,
        sortType: 'number',
        sortValue: (r) => r.amount,
        render: (r) => Number(r.amount).toFixed(2),
      },
      {
        key: 'period',
        title: t('tenants.month'),
        width: '18%',
        sortable: true,
        sortType: 'number',
        sortValue: (r) => r.period_month,
        render: (r) => monthFullLabel(t, Number(r.period_month)),
      },
      {
        key: 'desc',
        title: t('common.comment'),
        width: '20%',
        sortable: true,
        sortValue: (r) => r.description || '',
        render: (r) => String(r.description || ''),
      },
      {
        key: 'actions',
        title: t('common.actions'),
        width: '16%',
        render: (r) => (
        <div className={listingStyles.pageActions} onClick={(e) => e.stopPropagation()}>
          <Button variant="secondary" onClick={() => openEdit(r)} title={t('expenses.edit')}>
            <Pencil size={14} />
          </Button>
          <Button
            variant="ghost"
            className={styles.dangerBtn}
            onClick={() => {
              if (!window.confirm(t('expenses.deleteConfirm'))) return;
              setEditingExpenseId(Number(r.id));
              deleteMutation.mutate();
            }}
            title={t('common.delete')}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ),
      },
    ],
    [t]
  );

  const opAccessors = useMemo(() => accessorsFromColumns(opCols), [opCols]);
  const opSort = useTableSort(operations, opAccessors, {
    dateKey: 'date',
    nameKey: 'cat',
    defaultSortKey: 'date',
    defaultDirection: 'desc',
  });

  const availableMonths = ALL_MONTHS.filter((m) => !selectedMonths.includes(m));
  const addMonth = (month: number) => {
    if (!month || selectedMonths.includes(month)) return;
    setSelectedMonths((prev) => [...prev, month].sort((a, b) => a - b));
  };
  const removeMonth = (month: number) => {
    setSelectedMonths((prev) => (prev.length <= 1 ? prev : prev.filter((m) => m !== month)));
  };
  const selectAllMonths = () => setSelectedMonths([...ALL_MONTHS]);

  const openCreate = () => {
    setEditingExpenseId(null);
    setForm({
      expenseDate: new Date().toISOString().slice(0, 10),
      periodMonth: selectedMonths[selectedMonths.length - 1] ?? new Date().getMonth() + 1,
      category: 'heating',
      amount: '',
      description: '',
    });
    setOpen(true);
  };

  const openEdit = (row: ExpenseRow) => {
    setEditingExpenseId(Number(row.id));
    setForm({
      expenseDate: String(row.expense_date).slice(0, 10),
      periodMonth: Number(row.period_month) || 1,
      category: String(row.category),
      amount: String(row.amount ?? ''),
      description: String(row.description || ''),
    });
    setOpen(true);
  };

  const exportExcel = () => {
    if (!pid) return;
    downloadApiFile(
      '/expenses/export/xlsx',
      { propertyId: pid, year, months: selectedMonths.join(',') },
      `expenses-${year}.xlsx`
    );
  };

  return (
    <div className={listingStyles.page}>
      <div className={listingStyles.pageHead}>
        <h1>{t('expenses.title')}</h1>
        <div className={listingStyles.pageActions}>
          <Button variant="secondary" onClick={exportExcel} disabled={!pid}>
            <FileSpreadsheet size={18} /> {t('common.exportExcel')}
          </Button>
          <Button variant="primary" onClick={openCreate}>
            <Plus size={18} /> {t('expenses.add')}
          </Button>
        </div>
      </div>

      <div className={listingStyles.toolbar}>
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

      {isLoading ? (
        <p>{t('common.loading')}</p>
      ) : (
        <>
          <h2 className={styles.sectionTitle}>{t('common.summaryByMonth')}</h2>
          <div className={listingStyles.toolbar}>
            <TableSortBar
              value={matrixSort.activePreset}
              onChange={matrixSort.applyPreset}
              showDatePresets={false}
            />
          </div>
          <DataTable
            columns={matrixCols}
            rows={matrixSort.sortedRows}
            rowKey={(r) => r.code}
            sortKey={matrixSort.sortKey}
            sortDirection={matrixSort.sortDirection}
            onSort={matrixSort.handleSort}
          />

          <h2 className={`${styles.sectionTitle} ${styles.tableSpace}`}>{t('common.operations')}</h2>
          <div className={listingStyles.toolbar}>
            <TableSortBar value={opSort.activePreset} onChange={opSort.applyPreset} />
          </div>
          <p className={listingStyles.sortHint}>{t('tableSort.columnHint')}</p>
          <DataTable
            columns={opCols}
            rows={opSort.sortedRows}
            rowKey={(r) => Number(r.id)}
            sortKey={opSort.sortKey}
            sortDirection={opSort.sortDirection}
            onSort={opSort.handleSort}
          />
        </>
      )}

      <Modal
        open={open}
        title={t(editingExpenseId ? 'expenses.edit' : 'common.newExpense')}
        onClose={() => setOpen(false)}
      >
        <Input
          label={t('common.date')}
          type="date"
          required
          value={form.expenseDate}
          onChange={(e) => setForm({ ...form, expenseDate: e.target.value })}
        />
        <Select
          label={t('common.category')}
          fullWidth
          required
          value={form.category}
          onChange={(category) => setForm({ ...form, category })}
          options={categories.map((c) => ({ value: c.code, label: c.label }))}
        />
        <Select
          label={t('tenants.month')}
          fullWidth
          required
          value={String(form.periodMonth)}
          onChange={(v) => setForm({ ...form, periodMonth: Number(v) })}
          options={Array.from({ length: 12 }, (_, i) => ({
            value: String(i + 1),
            label: monthFullLabel(t, i + 1),
          }))}
        />
        <Input
          label={t('common.amount')}
          required
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
        />
        <Input
          label={t('common.comment')}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />

        {editingExpenseId ? (
          <div className={listingStyles.formActions}>
            <Button
              variant="ghost"
              className={styles.dangerBtn}
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (!window.confirm(t('expenses.deleteConfirm'))) return;
                deleteMutation.mutate();
              }}
            >
              {t('common.delete')}
            </Button>
            <Button
              variant="primary"
              disabled={updateMutation.isPending}
              onClick={() => updateMutation.mutate()}
            >
              {t('common.save')}
            </Button>
          </div>
        ) : (
          <Button variant="primary" fullWidth onClick={() => addMutation.mutate()}>
            {t('common.save')}
          </Button>
        )}
      </Modal>
    </div>
  );
}

