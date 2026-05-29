import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { Plus, Pencil, Trash2, FileSpreadsheet, Search, ChevronLeft } from 'lucide-react';
import { useIsMobileLayout } from '@/hooks/useMediaQuery';
import { downloadApiFile } from '@/lib/exportFile';
import { api } from '@/api/client';
import { usePropertyStore } from '@/store/propertyStore';
import { useI18n } from '@/i18n/useI18n';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/modals/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { MonthPeriodRangePicker } from '@/components/ui/MonthPeriodRangePicker';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { monthSelectOptions } from '@/i18n/months';
import styles from './TenantsContractsPage.module.css';

type FilterTab = 'all' | 'active' | 'expiring';
type SortMode = 'newest' | 'oldest' | 'name' | 'debt';

type TenantRow = {
  id: number;
  name: string;
  status: string;
  legal_type?: string;
  unp?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  legal_address?: string;
  activity_type?: string;
  comment?: string;
};

type OverviewRow = {
  rowKey: string;
  tenantId: number;
  tenantName: string;
  tenantStatus: string;
  tenantUnp?: string;
  tenantPhone?: string;
  contractId: number | null;
  contractNumber: string | null;
  contractDate: string | null;
  startDate: string | null;
  endDate: string | null;
  contractStatus: string | null;
  rateWithoutVat: number | null;
  vatRate: number | null;
  debt: number;
  rooms: string[];
  area?: number;
};

const EMPTY_FORM = {
  name: '',
  legalType: 'other',
  unp: '',
  contactPerson: '',
  phone: '',
  email: '',
  legalAddress: '',
  activityType: '',
  comment: '',
  status: 'active',
};

const LEGAL_TYPES = [
  { value: 'ip', labelKey: 'tenants.legalIp' },
  { value: 'ooo', labelKey: 'tenants.legalOoo' },
  { value: 'chp', labelKey: 'tenants.legalChp' },
  { value: 'physical', labelKey: 'tenants.legalPhysical' },
  { value: 'other', labelKey: 'tenants.legalOther' },
] as const;

const TENANT_STATUSES = [
  { value: 'active', labelKey: 'tenants.statusActive' },
  { value: 'debtor', labelKey: 'tenants.statusDebtor' },
  { value: 'archived', labelKey: 'tenants.statusArchived' },
] as const;

function tenantToForm(t: TenantRow) {
  return {
    name: t.name || '',
    legalType: t.legal_type || 'other',
    unp: t.unp || '',
    contactPerson: t.contact_person || '',
    phone: t.phone || '',
    email: t.email || '',
    legalAddress: t.legal_address || '',
    activityType: t.activity_type || '',
    comment: t.comment || '',
    status: t.status || 'active',
  };
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU');
}

function formatMoney(n: number) {
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function matchesTenantSearch(row: OverviewRow, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const parts = [
    row.tenantName,
    row.tenantUnp,
    row.tenantPhone,
    row.contractNumber,
    ...(row.rooms ?? []),
  ]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());
  return parts.some((s) => s.includes(q));
}

function statusBadgeKey(row: OverviewRow): string {
  if (row.tenantStatus === 'debtor') return 'debt';
  if (!row.contractStatus) {
    if (row.tenantStatus === 'archived') return 'technical';
    return 'occupied';
  }
  const map: Record<string, string> = {
    active: 'occupied',
    expiring: 'negotiation',
    draft: 'reserved',
    terminated: 'not_available',
    completed: 'technical',
  };
  return map[row.contractStatus] || 'free';
}

export function TenantsContractsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { propertyId } = usePropertyStore();
  const [filter, setFilter] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('newest');
  const [fromMonth, setFromMonth] = useState('');
  const [fromYear, setFromYear] = useState('');
  const [toMonth, setToMonth] = useState('');
  const [toYear, setToYear] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const isMobile = useIsMobileLayout();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const year = new Date().getFullYear();
  const monthOptions = useMemo(() => monthSelectOptions(t), [t]);

  const filterOptions = useMemo(
    () => [
      { value: 'all', label: t('common.allTenants') },
      { value: 'active', label: t('common.activeContracts') },
      { value: 'expiring', label: t('common.forRenewal') },
    ],
    [t]
  );

  const sortOptions = useMemo(
    () => [
      { value: 'newest', label: t('tableSort.newest') },
      { value: 'oldest', label: t('tableSort.oldest') },
      { value: 'name', label: t('tableSort.nameAsc') },
      { value: 'debt', label: t('tenants.sortDebt') },
    ],
    [t]
  );

  const { data: properties } = useQuery({
    queryKey: ['properties'],
    queryFn: () => api.get('/properties').then((r) => r.data.data),
  });
  const pid = propertyId || properties?.[0]?.id;

  const {
    data: rows,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['tenants-overview', pid, filter, sort, fromMonth, fromYear, toMonth, toYear, year],
    queryFn: () =>
      api
        .get('/tenants/overview', {
          params: {
            propertyId: pid,
            tab: filter,
            sort,
            year,
            ...(fromMonth && fromYear ? { fromMonth, fromYear } : {}),
            ...(toMonth && toYear ? { toMonth, toYear } : {}),
          },
        })
        .then((r) => r.data.data as OverviewRow[]),
    enabled: !!pid,
  });

  const filteredRows = useMemo(() => {
    if (!rows?.length) return rows ?? [];
    return rows.filter((row) => matchesTenantSearch(row, search));
  }, [rows, search]);

  const selectedRow = rows?.find((r) => r.rowKey === selectedKey) ?? null;
  const selectedTenantId = selectedRow?.tenantId ?? null;

  const { data: detail } = useQuery({
    queryKey: ['tenant', selectedTenantId],
    queryFn: () => api.get(`/tenants/${selectedTenantId}`).then((r) => r.data.data),
    enabled: !!selectedTenantId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = { ...form, name: form.name.trim() };
      if (editingId) {
        return api.put(`/tenants/${editingId}`, body).then((r) => r.data.data);
      }
      return api.post('/tenants', body).then((r) => r.data.data);
    },
    onSuccess: (data: { id?: number }) => {
      qc.invalidateQueries({ queryKey: ['tenants-overview'] });
      qc.invalidateQueries({ queryKey: ['tenants'] });
      if (data?.id) setSelectedKey(`t-${data.id}`);
      else if (editingId) {
        qc.invalidateQueries({ queryKey: ['tenant', editingId] });
        setSelectedKey((k) => k ?? `t-${editingId}`);
      }
      setModalOpen(false);
      setFormError(null);
      setActionMsg(t('tenants.saved'));
      setTimeout(() => setActionMsg(null), 3000);
    },
    onError: (err: AxiosError<{ error?: string }>) => {
      setFormError(err.response?.data?.error || t('common.profileSaveFailed'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/tenants/${id}`),
    onSuccess: (_res, id) => {
      qc.invalidateQueries({ queryKey: ['tenants-overview'] });
      qc.invalidateQueries({ queryKey: ['tenants'] });
      if (selectedTenantId === id) {
        setSelectedKey(null);
      }
      setActionMsg(t('tenants.deleted'));
      setTimeout(() => setActionMsg(null), 3000);
    },
    onError: (err: AxiosError<{ error?: string }>) => {
      const msg = err.response?.data?.error || '';
      window.alert(msg.includes('договор') ? t('tenants.deleteBlocked') : msg || t('common.noData'));
    },
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (tenantId: number) => {
    const fromDetail = detail?.tenant?.id === tenantId ? (detail.tenant as TenantRow) : null;
    const fromList = rows?.find((r) => r.tenantId === tenantId);
    if (fromDetail) {
      setEditingId(tenantId);
      setForm(tenantToForm(fromDetail));
    } else if (fromList) {
      setEditingId(tenantId);
      setForm({
        ...EMPTY_FORM,
        name: fromList.tenantName,
        status: fromList.tenantStatus,
        unp: fromList.tenantUnp || '',
        phone: fromList.tenantPhone || '',
      });
      api.get(`/tenants/${tenantId}`).then((r) => {
        setForm(tenantToForm(r.data.data.tenant as TenantRow));
      });
    }
    setFormError(null);
    setModalOpen(true);
  };

  const handleDelete = (tenantId: number, name: string) => {
    if (!window.confirm(t('tenants.deleteConfirm', { name }))) return;
    deleteMutation.mutate(tenantId);
  };

  const tenantStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      active: t('tenants.statusActive'),
      debtor: t('tenants.statusDebtor'),
      archived: t('tenants.statusArchived'),
    };
    return map[status] || status;
  };

  const contractStatusLabel = (status: string | null) => {
    if (!status) return t('common.dash');
    const map: Record<string, string> = {
      active: t('tenants.contractActive'),
      expiring: t('tenants.contractExpiring'),
      draft: t('tenants.contractDraft'),
      terminated: t('tenants.contractTerminated'),
      completed: t('tenants.contractCompleted'),
    };
    return map[status] || status;
  };

  const rowStatusLabel = (row: OverviewRow) => {
    if (row.tenantStatus === 'debtor') return tenantStatusLabel('debtor');
    if (!row.contractStatus) return tenantStatusLabel(row.tenantStatus);
    if (row.tenantStatus === 'archived') return tenantStatusLabel('archived');
    return contractStatusLabel(row.contractStatus);
  };

  const periodValue = { fromMonth, fromYear, toMonth, toYear };

  const setPeriodValue = (next: typeof periodValue) => {
    setFromMonth(next.fromMonth);
    setFromYear(next.fromYear);
    setToMonth(next.toMonth);
    setToYear(next.toYear);
  };

  const exportExcel = () => {
    if (!pid) return;
    downloadApiFile(
      '/tenants/overview/export/xlsx',
      {
        propertyId: pid,
        tab: filter,
        sort,
        year,
        ...(fromMonth && fromYear ? { fromMonth, fromYear } : {}),
        ...(toMonth && toYear ? { toMonth, toYear } : {}),
      },
      `tenants-contracts-${year}.xlsx`
    );
  };

  const contractLabel = (row: OverviewRow) => {
    if (!row.contractNumber) return t('tenants.noContract');
    const date = formatDate(row.contractDate);
    return date ? `${row.contractNumber} ${t('tenants.contractFrom', { date })}` : row.contractNumber;
  };

  const periodLabel = (row: OverviewRow) => {
    const start = formatDate(row.startDate);
    const end = formatDate(row.endDate);
    if (start && end) return `${start} — ${end}`;
    if (start) return `${t('tenants.fromDate')} ${start}`;
    return t('common.dash');
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <h1>{t('tenants.title')}</h1>
        <div className={styles.pageActions}>
          <Button variant="secondary" onClick={exportExcel} disabled={!pid}>
            <FileSpreadsheet size={18} /> {t('common.exportExcel')}
          </Button>
          <Button variant="primary" onClick={openCreate}>
            <Plus size={18} /> {t('tenants.addTenant')}
          </Button>
        </div>
      </div>
      {actionMsg && <p className={styles.success}>{actionMsg}</p>}

      <div className={styles.toolbar}>
        <label className={styles.searchWrap}>
          <Search size={18} className={styles.searchIcon} aria-hidden />
          <input
            type="search"
            className={styles.searchInput}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedKey(null);
              setMobileShowDetail(false);
            }}
            placeholder={t('tenants.searchPlaceholder')}
            aria-label={t('tenants.searchPlaceholder')}
          />
        </label>
        <Select
          className={styles.toolbarFilter}
          fullWidth
          aria-label={t('tenants.filterLabel')}
          value={filter}
          onChange={(v) => {
            setFilter(v as FilterTab);
            setSelectedKey(null);
          }}
          options={filterOptions}
        />
        <Select
          className={styles.toolbarSort}
          fullWidth
          aria-label={t('tenants.sortLabel')}
          value={sort}
          onChange={(v) => setSort(v as SortMode)}
          options={sortOptions}
        />
        <MonthPeriodRangePicker
          className={styles.toolbarPeriod}
          fullWidth
          value={periodValue}
          onChange={setPeriodValue}
          monthOptions={monthOptions}
          placeholder={t('tenants.pickPeriod')}
          panelTitle={t('tenants.periodFilter')}
          fromHint={t('tenants.periodFrom')}
          toHint={t('tenants.periodTo')}
          monthPlaceholder={t('tenants.pickMonth')}
          yearPlaceholder={t('tenants.year')}
          applyLabel={t('tenants.periodApply')}
          clearLabel={t('tenants.clearPeriod')}
          aria-label={t('tenants.periodFilter')}
        />
      </div>

      <div
        className={`${styles.grid} ${isMobile && mobileShowDetail && selectedKey ? styles.gridDetailOnly : ''} ${isMobile && !mobileShowDetail ? styles.gridListOnly : ''}`}
      >
        <Card className={styles.list}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('common.tenant')}</th>
                <th>{t('common.contract')}</th>
                <th>{t('tenants.period')}</th>
                <th>{t('common.debt')}</th>
                <th>{t('common.status')}</th>
                <th className={styles.actionsCol}>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6}>{t('common.loading')}</td>
                </tr>
              )}
              {isError && !isLoading && (
                <tr>
                  <td colSpan={6}>
                    {(error as AxiosError<{ error?: string }>)?.response?.data?.error ||
                      t('tenants.loadError')}{' '}
                    <button type="button" className={styles.retryBtn} onClick={() => refetch()}>
                      ↻
                    </button>
                  </td>
                </tr>
              )}
              {!isLoading && !isError && rows?.length === 0 && (
                <tr>
                  <td colSpan={6}>{t('common.noData')}</td>
                </tr>
              )}
              {!isLoading && !isError && rows && rows.length > 0 && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={6}>{t('tenants.noSearchResults')}</td>
                </tr>
              )}
              {!isLoading &&
                !isError &&
                filteredRows.map((row) => (
                  <tr
                    key={row.rowKey}
                    className={selectedKey === row.rowKey ? styles.selected : ''}
                    onClick={() => {
                      setSelectedKey(row.rowKey);
                      if (isMobile) setMobileShowDetail(true);
                    }}
                  >
                    <td className={styles.tenantCell}>
                      <span className={styles.tenantName}>{row.tenantName}</span>
                      {row.tenantUnp && <span className={styles.sub}>{row.tenantUnp}</span>}
                    </td>
                    <td>{contractLabel(row)}</td>
                    <td>{periodLabel(row)}</td>
                    <td className={row.debt > 0 ? styles.debt : ''}>
                      {row.contractId ? `${formatMoney(row.debt)} ${t('common.currencyByn')}` : t('common.dash')}
                    </td>
                    <td>
                      <StatusBadge status={statusBadgeKey(row)}>{rowStatusLabel(row)}</StatusBadge>
                    </td>
                    <td className={styles.actionsCol} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        title={t('tenants.editTenant')}
                        onClick={() => openEdit(row.tenantId)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                        title={t('tenants.deleteTenant')}
                        onClick={() => handleDelete(row.tenantId, row.tenantName)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>

        <Card className={styles.card}>
          {selectedRow ? (
            <>
              {isMobile && (
                <button
                  type="button"
                  className={styles.mobileBack}
                  onClick={() => setMobileShowDetail(false)}
                >
                  <ChevronLeft size={18} />
                  {t('common.backToList')}
                </button>
              )}
              <div className={styles.detailHead}>
                <h2>{selectedRow.tenantName}</h2>
                <div className={styles.detailActions}>
                  <Button variant="secondary" onClick={() => openEdit(selectedRow.tenantId)}>
                    <Pencil size={16} /> {t('tenants.editTenant')}
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => handleDelete(selectedRow.tenantId, selectedRow.tenantName)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 size={16} /> {t('tenants.deleteTenant')}
                  </Button>
                </div>
              </div>

              <dl className={styles.meta}>
                <dt>{t('common.status')}</dt>
                <dd>
                  <StatusBadge status={statusBadgeKey(selectedRow)}>{rowStatusLabel(selectedRow)}</StatusBadge>
                </dd>
                {selectedRow.tenantPhone && (
                  <>
                    <dt>{t('common.phone')}</dt>
                    <dd>{selectedRow.tenantPhone}</dd>
                  </>
                )}
                <dt>{t('common.contract')}</dt>
                <dd>{contractLabel(selectedRow)}</dd>
                <dt>{t('tenants.period')}</dt>
                <dd>{periodLabel(selectedRow)}</dd>
                <dt>{t('common.debt')}</dt>
                <dd className={selectedRow.debt > 0 ? styles.debt : ''}>
                  {selectedRow.contractId
                    ? `${formatMoney(selectedRow.debt)} ${t('common.currencyByn')}`
                    : t('common.dash')}
                </dd>
                {selectedRow.rooms.length > 0 && (
                  <>
                    <dt>{t('nav.rooms')}</dt>
                    <dd>{selectedRow.rooms.join(', ')}</dd>
                  </>
                )}
              </dl>

              {detail?.contracts && detail.contracts.length > 1 && (
                <section className={styles.moreContracts}>
                  <h3>{t('tenants.otherContracts')}</h3>
                  <ul>
                    {detail.contracts
                      .filter((c: { id: number }) => c.id !== selectedRow.contractId)
                      .map((c: { id: number; contract_number: string; status: string; start_date: string }) => (
                        <li key={c.id}>
                          {c.contract_number} — {contractStatusLabel(c.status)} ({formatDate(c.start_date)})
                        </li>
                      ))}
                  </ul>
                </section>
              )}
            </>
          ) : (
            <p className={styles.empty}>{t('tenants.selectTenant')}</p>
          )}
        </Card>
      </div>

      <Modal
        open={modalOpen}
        title={editingId ? t('tenants.editTenant') : t('tenants.newTenant')}
        onClose={() => setModalOpen(false)}
      >
        <div className={styles.form}>
          <Input
            label={t('common.fullName')}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Select
            label={t('tenants.legalType')}
            fullWidth
            value={form.legalType}
            onChange={(legalType) => setForm({ ...form, legalType })}
            options={LEGAL_TYPES.map((lt) => ({ value: lt.value, label: t(lt.labelKey) }))}
          />
          {editingId && (
            <Select
              label={t('common.status')}
              fullWidth
              value={form.status}
              onChange={(status) => setForm({ ...form, status })}
              options={TENANT_STATUSES.map((s) => ({ value: s.value, label: t(s.labelKey) }))}
            />
          )}
          <Input label={t('tenants.unp')} value={form.unp} onChange={(e) => setForm({ ...form, unp: e.target.value })} />
          <Input
            label={t('tenants.contactPerson')}
            value={form.contactPerson}
            onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
          />
          <Input label={t('common.phone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input
            label={t('common.email')}
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            label={t('tenants.activityType')}
            value={form.activityType}
            onChange={(e) => setForm({ ...form, activityType: e.target.value })}
          />
          <Input
            label={t('tenants.legalAddress')}
            value={form.legalAddress}
            onChange={(e) => setForm({ ...form, legalAddress: e.target.value })}
          />
          <Input
            label={t('tenants.comment')}
            value={form.comment}
            onChange={(e) => setForm({ ...form, comment: e.target.value })}
          />
          {formError && <p className={styles.formError}>{formError}</p>}
          <div className={styles.formActions}>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={!form.name.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
