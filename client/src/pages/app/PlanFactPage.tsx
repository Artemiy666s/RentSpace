import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useTableSort } from '@/hooks/useTableSort';
import { TableSortBar } from '@/components/data/TableSortBar';
import listingStyles from '@/styles/listingPage.module.css';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { api } from '@/api/client';
import { usePropertyStore } from '@/store/propertyStore';
import { useAuthStore } from '@/store/authStore';
import { useI18n } from '@/i18n/useI18n';
import { monthShortLabel } from '@/i18n/months';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/modals/Modal';
import { Input } from '@/components/ui/Input';
import { downloadApiFile } from '@/lib/exportFile';
import { parsePfNumberInput } from '@/lib/parsePfNumber';
import styles from './PlanFactPage.module.css';

interface PfCell {
  plan: number | null;
  fact: number | null;
  planEditable?: boolean;
  factEditable?: boolean;
  factAuto?: boolean;
}

interface PfRow {
  code: string;
  name: string;
  unit: string;
  autoFact?: boolean;
  custom?: boolean;
  deletable?: boolean;
  values: Record<number, PfCell>;
}

type EditField = 'plan' | 'fact';

interface EditCell {
  month: number;
  metricCode: string;
  metricName: string;
  unit: string;
  field: EditField;
  value: string;
  factAuto: boolean;
  autoFact: boolean;
}

interface RowEditForm {
  name: string;
  unit: string;
  values: Record<number, { plan: string; fact: string }>;
}

import { PLAN_FACT_EDIT_ROLES, hasRole } from '@/constants/roles';

function formatPfValue(val: number | null, unit: string, dash: string) {
  if (val == null) return dash;
  const n = Number(val);
  if (unit === 'шт.') return String(Math.round(n));
  if (unit === 'м²') return n.toFixed(1);
  return n.toFixed(0);
}

function renderValueCell(
  row: PfRow,
  month: number,
  field: EditField,
  cell: PfCell,
  canEdit: boolean,
  dash: string,
  onEdit: (row: PfRow, month: number, field: EditField, cell: PfCell) => void,
  t: (key: string) => string
) {
  const val = field === 'plan' ? cell.plan : cell.fact;
  const str = formatPfValue(val, row.unit, dash);
  const clickable = canEdit && (field === 'plan' ? cell.planEditable : cell.factEditable);

  return (
    <span
      className={clickable ? styles.editablePart : styles.staticPart}
      onClick={(e) => {
        if (!clickable) return;
        e.stopPropagation();
        onEdit(row, month, field, cell);
      }}
      onKeyDown={(e) => {
        if (clickable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onEdit(row, month, field, cell);
        }
      }}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={
        clickable
          ? field === 'plan'
            ? t('planFact.clickPlan')
            : cell.factAuto
              ? t('planFact.clickFactAuto')
              : t('planFact.clickFact')
          : undefined
      }
    >
      {str}
      {field === 'fact' && cell.factAuto ? <span className={styles.autoBadge}>A</span> : null}
    </span>
  );
}

export function PlanFactPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const { propertyId, setPropertyId } = usePropertyStore();
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedMonths, setSelectedMonths] = useState<number[]>(() =>
    Array.from({ length: 12 }, (_, i) => i + 1)
  );
  const [editCell, setEditCell] = useState<EditCell | null>(null);
  const [editRow, setEditRow] = useState<PfRow | null>(null);
  const [rowForm, setRowForm] = useState<RowEditForm | null>(null);
  const [renameRow, setRenameRow] = useState<PfRow | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [openAddMetric, setOpenAddMetric] = useState(false);
  const [newMetricName, setNewMetricName] = useState('');
  const [newMetricUnit, setNewMetricUnit] = useState('BYN');
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: properties } = useQuery({
    queryKey: ['properties'],
    queryFn: () => api.get('/properties').then((r) => r.data.data),
  });
  const pid = propertyId || properties?.[0]?.id;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['plan-fact', pid, year],
    queryFn: () =>
      api
        .get('/manager/plan-fact', { params: { propertyId: pid, year } })
        .then((r) => r.data.data as { rows: PfRow[]; months: string[] }),
    enabled: !!pid,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['plan-fact'] });

  const saveCell = useMutation({
    mutationFn: async () => {
      if (!editCell || !pid) throw new Error('missing');
      const payload: Record<string, unknown> = {
        propertyId: pid,
        year,
        month: editCell.month,
        metricCode: editCell.metricCode,
      };
      if (editCell.field === 'plan') {
        const trimmed = editCell.value.trim();
        if (trimmed && parsePfNumberInput(trimmed) === null) throw new Error('invalid');
        payload.planValue = parsePfNumberInput(trimmed);
      } else if (editCell.value.trim() === '' && editCell.autoFact) {
        payload.clearFact = true;
      } else {
        const trimmed = editCell.value.trim();
        if (trimmed && parsePfNumberInput(trimmed) === null) throw new Error('invalid');
        payload.factValue = parsePfNumberInput(trimmed);
      }
      await api.put('/manager/plan-fact/cell', payload);
      return { pid, year };
    },
    onSuccess: async () => {
      try {
        await qc.refetchQueries({ queryKey: ['plan-fact', pid, year] });
      } catch {
        setSaveError(t('planFact.refreshFailed'));
        return;
      }
      setEditCell(null);
      setSaveError(null);
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      if (err.message === 'invalid') {
        setSaveError(t('planFact.invalidNumber'));
        return;
      }
      setSaveError(err.response?.data?.message ?? t('mapEditor.saveFailed'));
    },
  });

  const saveRow = useMutation({
    mutationFn: async () => {
      if (!editRow || !rowForm || !pid) throw new Error('missing');
      const trimmedName = rowForm.name.trim();
      if (trimmedName && trimmedName !== editRow.name) {
        await api.put(`/manager/plan-fact/metrics/${editRow.code}`, {
          propertyId: pid,
          year,
          name: trimmedName,
          ...(editRow.custom ? { unit: rowForm.unit } : {}),
        });
      } else if (editRow.custom) {
        await api.put(`/manager/plan-fact/metrics/${editRow.code}`, {
          propertyId: pid,
          year,
          unit: rowForm.unit,
        });
      }
      const values: Record<number, { plan: string; fact: string }> = {};
      for (const m of selectedMonths) {
        values[m] = rowForm.values[m] ?? { plan: '', fact: '' };
      }
      await api.put('/manager/plan-fact/row', {
        propertyId: pid,
        year,
        metricCode: editRow.code,
        values,
      });
      return { pid, year };
    },
    onSuccess: async () => {
      try {
        await qc.refetchQueries({ queryKey: ['plan-fact', pid, year] });
      } catch {
        setSaveError(t('planFact.refreshFailed'));
        return;
      }
      setEditRow(null);
      setRowForm(null);
      setSaveError(null);
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      if (err.message === 'invalid') {
        setSaveError(t('planFact.invalidNumber'));
        return;
      }
      setSaveError(err.response?.data?.message ?? t('mapEditor.saveFailed'));
    },
  });

  const saveRename = useMutation({
    mutationFn: async () => {
      if (!renameRow || !pid) return;
      const name = renameValue.trim();
      if (!name) throw new Error('empty');
      return api.put(`/manager/plan-fact/metrics/${renameRow.code}`, {
        propertyId: pid,
        year,
        name,
      });
    },
    onSuccess: () => {
      invalidate();
      setRenameRow(null);
      setRenameValue('');
      setSaveError(null);
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setSaveError(err.response?.data?.message ?? t('mapEditor.saveFailed'));
    },
  });

  const addMetric = useMutation({
    mutationFn: async () => {
      if (!pid) return;
      return api.post('/manager/plan-fact/metrics', {
        propertyId: pid,
        year,
        name: newMetricName,
        unit: newMetricUnit,
      });
    },
    onSuccess: () => {
      invalidate();
      setOpenAddMetric(false);
      setNewMetricName('');
      setNewMetricUnit('BYN');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setSaveError(err.response?.data?.message ?? t('mapEditor.saveFailed'));
    },
  });

  const deleteMetric = useMutation({
    mutationFn: async (row: PfRow) => {
      if (!pid) return;
      return api.delete(`/manager/plan-fact/metrics/${row.code}`, { params: { propertyId: pid, year } });
    },
    onSuccess: () => {
      invalidate();
      setEditRow(null);
      setRowForm(null);
      setSaveError(null);
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setSaveError(err.response?.data?.message ?? t('mapEditor.saveFailed'));
    },
  });

  const confirmDeleteRow = (row: PfRow) => {
    const msg = row.custom
      ? t('planFact.deleteMetricConfirm', { name: row.name })
      : t('planFact.deleteBuiltinConfirm', { name: row.name });
    if (!window.confirm(msg)) return;
    deleteMetric.mutate(row);
  };

  const canEdit = hasRole(user?.role, PLAN_FACT_EDIT_ROLES);
  const dash = t('common.dash');
  const rows = data?.rows ?? [];

  const pfAccessors = useMemo(
    () => ({
      name: { get: (r: PfRow) => r.name, type: 'string' as const },
    }),
    []
  );
  const pfSort = useTableSort(rows, pfAccessors, { nameKey: 'name' });
  const displayRows = pfSort.sortedRows;

  const monthLabel = (m: number) => data?.months?.[m - 1] || monthShortLabel(t, m);

  const openEdit = (row: PfRow, month: number, field: EditField, cell: PfCell) => {
    if (!canEdit) return;
    if (field === 'plan' && !cell.planEditable) return;
    if (field === 'fact' && !cell.factEditable) return;
    const raw = field === 'plan' ? cell.plan : cell.fact;
    setSaveError(null);
    setEditCell({
      month,
      metricCode: row.code,
      metricName: row.name,
      unit: row.unit,
      field,
      value: raw != null ? String(raw) : '',
      factAuto: !!cell.factAuto,
      autoFact: !!row.autoFact,
    });
  };

  const openRowEdit = (row: PfRow) => {
    const values: Record<number, { plan: string; fact: string }> = {};
    for (const m of selectedMonths) {
      const c = row.values[m];
      values[m] = {
        plan: c?.plan != null ? String(c.plan) : '',
        fact: c?.fact != null ? String(c.fact) : '',
      };
    }
    setEditRow(row);
    setRowForm({ name: row.name, unit: row.unit, values });
    setSaveError(null);
  };

  const openRename = (row: PfRow) => {
    setRenameRow(row);
    setRenameValue(row.name);
    setSaveError(null);
  };

  const allMonths = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const availableMonths = allMonths.filter((m) => !selectedMonths.includes(m));

  const editTitle =
    editCell?.field === 'plan'
      ? t('planFact.editPlanTitle', {
          name: editCell.metricName,
          month: data?.months?.[editCell.month - 1] ?? editCell.month,
        })
      : t('planFact.editFactTitle', {
          name: editCell?.metricName ?? '',
          month: data?.months?.[(editCell?.month ?? 1) - 1] ?? editCell?.month,
        });

  const valueLabel =
    editCell?.field === 'plan'
      ? t('planFact.planValue', { unit: editCell.unit })
      : t('planFact.factValue', { unit: editCell?.unit ?? '' });

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>{t('planFact.title')}</h1>
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
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
          <Button
            variant="secondary"
            onClick={() =>
              downloadApiFile('/manager/plan-fact/export/xlsx', { propertyId: pid, year }, `plan-fact-${year}.xlsx`)
            }
          >
            {t('common.exportExcel')}
          </Button>
          {canEdit && (
            <Button
              variant="primary"
              onClick={() => {
                setSaveError(null);
                setOpenAddMetric(true);
              }}
            >
              <Plus size={16} /> {t('planFact.addMetric')}
            </Button>
          )}
        </div>
      </header>

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
                  onClick={() => setSelectedMonths((prev) => prev.filter((x) => x !== m))}
                >
                  <X size={14} />
                </button>
              )}
            </span>
          ))}
        </div>
        {selectedMonths.length < 12 && (
          <Select
            className={styles.monthAdd}
            value=""
            placeholder={t('rentRegister.addMonth')}
            onChange={(v) => {
              if (v === 'all') setSelectedMonths(allMonths);
              else if (v) setSelectedMonths((prev) => [...prev, Number(v)].sort((a, b) => a - b));
            }}
            options={[
              { value: 'all', label: t('rentRegister.allMonths') },
              ...availableMonths.map((m) => ({ value: String(m), label: monthShortLabel(t, m) })),
            ]}
          />
        )}
      </div>

      <div className={listingStyles.toolbar}>
        <TableSortBar value={pfSort.activePreset} onChange={pfSort.applyPreset} showDatePresets={false} />
      </div>
      <p className={listingStyles.sortHint}>{t('tableSort.columnHint')}</p>

      {isError ? (
        <p className={styles.error}>
          {(error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
            t('planFact.refreshFailed')}
        </p>
      ) : isLoading ? (
        <p>{t('common.loading')}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.pfTable}>
            <thead>
              <tr>
                <th rowSpan={2} className={styles.indicatorCol}>
                  <button
                    type="button"
                    className={styles.sortableThBtn}
                    onClick={() => pfSort.handleSort('name')}
                  >
                    {t('common.indicator')}
                    {pfSort.sortKey !== 'name' ? (
                      <ArrowUpDown size={14} className={styles.sortIconMuted} aria-hidden />
                    ) : pfSort.sortDirection === 'asc' ? (
                      <ArrowUp size={14} className={styles.sortIconActive} aria-hidden />
                    ) : (
                      <ArrowDown size={14} className={styles.sortIconActive} aria-hidden />
                    )}
                  </button>
                </th>
                {selectedMonths.map((m) => (
                  <th key={`g${m}`} colSpan={2} className={styles.monthGroupHead}>
                    {monthLabel(m)}
                  </th>
                ))}
                <th rowSpan={2} className={styles.actionsCol}>
                  {t('common.actions')}
                </th>
              </tr>
              <tr>
                {selectedMonths.flatMap((m) => [
                  <th key={`${m}-plan`} className={styles.subCol}>
                    {t('common.plan')}
                  </th>,
                  <th key={`${m}-fact`} className={styles.subCol}>
                    {t('common.fact')}
                  </th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {displayRows.length === 0 ? (
                <tr>
                  <td colSpan={1 + selectedMonths.length * 2 + 1} className={styles.emptyCell}>
                    {t('common.noData')}
                  </td>
                </tr>
              ) : (
                displayRows.map((row) => (
                  <tr key={row.code}>
                    <td className={styles.indicatorCell}>
                      <span className={styles.indicatorName}>{row.name}</span>
                      {canEdit && (
                        <button
                          type="button"
                          className={styles.nameEditBtn}
                          onClick={() => openRename(row)}
                          title={t('planFact.renameRow')}
                          aria-label={t('planFact.renameRow')}
                        >
                          <Pencil size={13} />
                        </button>
                      )}
                    </td>
                    {selectedMonths.flatMap((m) => {
                      const cell = row.values[m];
                      return [
                        <td key={`${row.code}-${m}-p`} className={styles.valueCell}>
                          {cell
                            ? renderValueCell(row, m, 'plan', cell, !!canEdit, dash, openEdit, t)
                            : dash}
                        </td>,
                        <td key={`${row.code}-${m}-f`} className={styles.valueCell}>
                          {cell
                            ? renderValueCell(row, m, 'fact', cell, !!canEdit, dash, openEdit, t)
                            : dash}
                        </td>,
                      ];
                    })}
                    <td className={styles.actionsCell}>
                      {canEdit ? (
                        <div className={styles.rowActions}>
                          <Button variant="ghost" onClick={() => openRowEdit(row)} title={t('planFact.editRow')}>
                            <Pencil size={14} />
                          </Button>
                          {row.deletable !== false && (
                            <Button
                              variant="ghost"
                              className={styles.deleteBtn}
                              onClick={() => confirmDeleteRow(row)}
                              title={t('planFact.deleteRow')}
                              disabled={deleteMetric.isPending}
                            >
                              <Trash2 size={14} />
                            </Button>
                          )}
                        </div>
                      ) : (
                        <span className={styles.cellMuted}>{dash}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className={styles.hint}>
        {t('planFact.tableHint')}{' '}
        <span className={styles.autoBadge}>A</span> — {t('planFact.autoBadgeLegend')}
      </p>

      <Modal open={!!editCell} title={editTitle} onClose={() => setEditCell(null)}>
        {editCell?.field === 'fact' && editCell.factAuto && (
          <p className={styles.modalHint}>{t('planFact.factAutoHint')}</p>
        )}
        {editCell?.field === 'fact' && editCell.autoFact && (
          <p className={styles.modalHint}>{t('planFact.clearFactHint')}</p>
        )}
        <Input
          label={valueLabel}
          type="number"
          step={editCell?.unit === 'шт.' ? '1' : editCell?.unit === 'м²' ? '0.1' : '1'}
          value={editCell?.value ?? ''}
          onChange={(e) => setEditCell(editCell ? { ...editCell, value: e.target.value } : null)}
        />
        {saveError && <p className={styles.error}>{saveError}</p>}
        <Button variant="primary" fullWidth onClick={() => saveCell.mutate()} disabled={saveCell.isPending}>
          {t('common.save')}
        </Button>
      </Modal>

      <Modal
        open={!!renameRow}
        title={t('planFact.renameRowTitle')}
        onClose={() => {
          setRenameRow(null);
          setRenameValue('');
        }}
      >
        <Input
          label={t('planFact.metricName')}
          required
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
        />
        {saveError && <p className={styles.error}>{saveError}</p>}
        <Button
          variant="primary"
          fullWidth
          onClick={() => saveRename.mutate()}
          disabled={saveRename.isPending || !renameValue.trim()}
        >
          {t('common.save')}
        </Button>
      </Modal>

      <Modal
        open={!!editRow && !!rowForm}
        title={t('planFact.editRowTitle', { name: editRow?.name ?? '' })}
        onClose={() => {
          setEditRow(null);
          setRowForm(null);
        }}
        wide
      >
        <Input
          label={t('planFact.metricName')}
          required
          value={rowForm?.name ?? ''}
          onChange={(e) => setRowForm((f) => (f ? { ...f, name: e.target.value } : f))}
        />
        {editRow?.custom && (
          <Select
            label={t('planFact.metricUnit')}
            value={rowForm?.unit ?? 'BYN'}
            onChange={(unit) => setRowForm((f) => (f ? { ...f, unit } : f))}
            options={[
              { value: 'BYN', label: 'BYN' },
              { value: 'шт.', label: 'шт.' },
              { value: 'м²', label: 'м²' },
            ]}
          />
        )}
        <div className={styles.rowEditGrid}>
          <div className={styles.rowEditHead}>{t('reports.monthCol')}</div>
          <div className={styles.rowEditHead}>{t('common.plan')}</div>
          <div className={styles.rowEditHead}>{t('common.fact')}</div>
          {selectedMonths.map((m) => (
            <RowEditMonthInputs
              key={m}
              month={m}
              monthLabel={monthLabel(m)}
              plan={rowForm?.values[m]?.plan ?? ''}
              fact={rowForm?.values[m]?.fact ?? ''}
              onPlan={(v) =>
                setRowForm((f) =>
                  f
                    ? {
                        ...f,
                        values: { ...f.values, [m]: { ...f.values[m], plan: v, fact: f.values[m]?.fact ?? '' } },
                      }
                    : f
                )
              }
              onFact={(v) =>
                setRowForm((f) =>
                  f
                    ? {
                        ...f,
                        values: { ...f.values, [m]: { plan: f.values[m]?.plan ?? '', fact: v } },
                      }
                    : f
                )
              }
            />
          ))}
        </div>
        {saveError && <p className={styles.error}>{saveError}</p>}
        <div className={styles.modalActions}>
          {editRow?.deletable !== false && (
            <Button
              variant="ghost"
              className={styles.deleteBtn}
              onClick={() => editRow && confirmDeleteRow(editRow)}
              disabled={deleteMetric.isPending || saveRow.isPending}
            >
              <Trash2 size={16} /> {t('planFact.deleteRow')}
            </Button>
          )}
          <Button variant="primary" fullWidth onClick={() => saveRow.mutate()} disabled={saveRow.isPending}>
            {t('common.save')}
          </Button>
        </div>
      </Modal>

      <Modal open={openAddMetric} title={t('planFact.addMetric')} onClose={() => setOpenAddMetric(false)}>
        <Input
          label={t('planFact.metricName')}
          required
          value={newMetricName}
          onChange={(e) => setNewMetricName(e.target.value)}
        />
        <Select
          label={t('planFact.metricUnit')}
          value={newMetricUnit}
          onChange={setNewMetricUnit}
          options={[
            { value: 'BYN', label: 'BYN' },
            { value: 'шт.', label: 'шт.' },
            { value: 'м²', label: 'м²' },
          ]}
        />
        {saveError && <p className={styles.error}>{saveError}</p>}
        <Button
          variant="primary"
          fullWidth
          onClick={() => addMetric.mutate()}
          disabled={addMetric.isPending || !newMetricName.trim()}
        >
          {t('common.save')}
        </Button>
      </Modal>
    </div>
  );
}

function RowEditMonthInputs({
  monthLabel,
  plan,
  fact,
  onPlan,
  onFact,
}: {
  month: number;
  monthLabel: string;
  plan: string;
  fact: string;
  onPlan: (v: string) => void;
  onFact: (v: string) => void;
}) {
  return (
    <>
      <div className={styles.rowEditMonth}>{monthLabel}</div>
      <Input type="number" value={plan} onChange={(e) => onPlan(e.target.value)} />
      <Input type="number" value={fact} onChange={(e) => onFact(e.target.value)} />
    </>
  );
}
