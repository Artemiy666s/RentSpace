import { useState, useMemo } from 'react';

import { useQuery } from '@tanstack/react-query';

import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';

import { api } from '@/api/client';

import { usePropertyStore } from '@/store/propertyStore';

import { useI18n } from '@/i18n/useI18n';

import { useRoomStatusLabels } from '@/i18n/roomStatus';

import { DataTable, type Column } from '@/components/data/DataTable';
import { TableSortBar } from '@/components/data/TableSortBar';
import { useTableSort } from '@/hooks/useTableSort';
import { accessorsFromColumns } from '@/lib/tableSort';
import listingStyles from '@/styles/listingPage.module.css';

import { downloadApiFile } from '@/lib/exportFile';

import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { StatusBadge } from '@/components/ui/StatusBadge';

import styles from './ManagerDataPage.module.css';



type TabId =

  | 'rooms'

  | 'tenants'

  | 'contracts'

  | 'charges'

  | 'payments'

  | 'rent-register'

  | 'plan-fact'

  | 'expenses';



export function ManagerDataPage() {

  const { t } = useI18n();

  const statusLabels = useRoomStatusLabels();

  const [tab, setTab] = useState<TabId>('rooms');

  const { propertyId, setPropertyId } = usePropertyStore();

  const [search, setSearch] = useState('');

  const [year, setYear] = useState(new Date().getFullYear());

  const [month, setMonth] = useState(new Date().getMonth() + 1);



  const TABS = useMemo(

    () =>

      [

        { id: 'rooms' as const, label: t('managerData.tabs.rooms'), endpoint: '/manager/data/rooms' },

        { id: 'tenants' as const, label: t('managerData.tabs.tenants'), endpoint: '/manager/data/tenants' },

        { id: 'contracts' as const, label: t('managerData.tabs.contracts'), endpoint: '/manager/data/contracts' },

        { id: 'charges' as const, label: t('managerData.tabs.charges'), endpoint: '/manager/data/charges' },

        { id: 'payments' as const, label: t('managerData.tabs.payments'), endpoint: '/manager/data/payments' },

        { id: 'rent-register' as const, label: t('managerData.tabs.rentRegister'), link: '/rent-register' },

        { id: 'plan-fact' as const, label: t('managerData.tabs.planFact'), link: '/plan-fact' },

        { id: 'expenses' as const, label: t('managerData.tabs.expenses'), link: '/expenses' },

      ] as const,

    [t]

  );



  const { data: properties } = useQuery({

    queryKey: ['properties'],

    queryFn: () => api.get('/properties').then((r) => r.data.data),

  });

  const pid = propertyId || properties?.[0]?.id;



  const activeTab = TABS.find((tb) => tb.id === tab)!;

  const endpoint = 'endpoint' in activeTab ? activeTab.endpoint : null;

  const isDataTab = !!endpoint;



  const { data: rows = [], isLoading } = useQuery({

    queryKey: ['manager-data', tab, pid, search, year, month],

    queryFn: () =>

      api

        .get(endpoint!, {

          params: {

            propertyId: pid,

            search: search || undefined,

            year,

            month,

          },

        })

        .then((r) => r.data.data),

    enabled: !!pid && isDataTab,

  });



  const roomCols: Column<Record<string, unknown>>[] = [

    { key: 'n', title: '№', sortable: true, sortValue: (r) => r.roomNumber, render: (r) => r.roomNumber },

    { key: 'obj', title: t('common.object'), sortable: true, sortValue: (r) => r.propertyName, render: (r) => r.propertyName },

    { key: 'b', title: t('common.building'), sortable: true, sortValue: (r) => r.buildingName, render: (r) => r.buildingName },

    { key: 'f', title: t('common.floor'), sortable: true, sortValue: (r) => r.floorName, render: (r) => r.floorName },

    { key: 'a', title: t('common.area'), sortable: true, sortType: 'number', sortValue: (r) => r.area, render: (r) => `${r.area} ${t('common.sqm')}` },

    { key: 'ra', title: t('common.rentable'), sortable: true, sortType: 'number', sortValue: (r) => r.rentableArea, render: (r) => `${r.rentableArea} ${t('common.sqm')}` },

    {
      key: 's',
      title: t('common.status'),
      render: (r) => (
        <StatusBadge status={String(r.status)}>
          {statusLabels[String(r.status)] || String(r.status)}
        </StatusBadge>
      ),
    },

    { key: 't', title: t('common.tenant'), sortable: true, sortValue: (r) => r.tenantName, render: (r) => r.tenantName || t('common.dash') },

    { key: 'c', title: t('common.contract'), sortable: true, sortValue: (r) => r.contractNumber, render: (r) => r.contractNumber || t('common.dash') },

    { key: 'rate', title: t('common.rateWithVatShort'), sortable: true, sortType: 'number', sortValue: (r) => r.rateWithVat, render: (r) => (r.rateWithVat ? Number(r.rateWithVat).toFixed(2) : t('common.dash')) },

    { key: 'ch', title: t('common.accrued'), sortable: true, sortType: 'number', sortValue: (r) => r.chargedMonth, render: (r) => Number(r.chargedMonth || 0).toFixed(2) },

    { key: 'debt', title: t('common.debt'), sortable: true, sortType: 'number', sortValue: (r) => r.debt, render: (r) => Number(r.debt || 0).toFixed(2) },

    {

      key: 'act',

      title: t('common.actions'),

      render: (r) => (

        <Link to={`/map?room=${r.id}`} onClick={(e) => e.stopPropagation()}>{t('common.open')}</Link>

      ),

    },

  ];



  const tenantCols: Column<Record<string, unknown>>[] = [

    { key: 'name', title: t('common.nameLabel'), sortable: true, sortValue: (r) => r.name, render: (r) => r.name },

    { key: 'lt', title: t('common.legalForm'), sortable: true, sortValue: (r) => r.legalType, render: (r) => r.legalType },

    { key: 'unp', title: t('common.unp'), sortable: true, sortValue: (r) => r.unp, render: (r) => r.unp || t('common.dash') },

    { key: 'phone', title: t('common.phone'), sortable: true, sortValue: (r) => r.phone, render: (r) => r.phone || t('common.dash') },

    { key: 'st', title: t('common.status'), sortable: true, sortValue: (r) => r.status, render: (r) => r.status },

    { key: 'cnt', title: t('common.contractsCount'), sortable: true, sortType: 'number', sortValue: (r) => r.activeContracts, render: (r) => r.activeContracts },

  ];



  const contractCols: Column<Record<string, unknown>>[] = [

    { key: 'num', title: t('common.contract'), sortable: true, sortValue: (r) => r.contractNumber, render: (r) => r.contractNumber },

    { key: 't', title: t('common.tenant'), sortable: true, sortValue: (r) => r.tenantName, render: (r) => r.tenantName },

    { key: 'rooms', title: t('nav.rooms'), sortable: true, sortValue: (r) => r.rooms, render: (r) => r.rooms },

    { key: 'area', title: t('common.area'), sortable: true, sortType: 'number', sortValue: (r) => r.totalArea, render: (r) => `${r.totalArea} ${t('common.sqm')}` },

    { key: 'start', title: t('common.start'), sortable: true, sortType: 'date', sortValue: (r) => r.startDate, render: (r) => r.startDate },

    { key: 'end', title: t('common.end'), sortable: true, sortType: 'date', sortValue: (r) => r.endDate, render: (r) => r.endDate || t('common.dash') },

    { key: 'st', title: t('common.status'), sortable: true, sortValue: (r) => r.status, render: (r) => r.status },

  ];



  const chargeCols: Column<Record<string, unknown>>[] = [

    { key: 't', title: t('common.tenant'), sortable: true, sortValue: (r) => r.tenantName, render: (r) => r.tenantName },

    { key: 'c', title: t('common.contract'), sortable: true, sortValue: (r) => r.contractNumber, render: (r) => r.contractNumber },

    { key: 'r', title: t('common.room'), sortable: true, sortValue: (r) => r.roomNumber, render: (r) => r.roomNumber || t('common.dash') },

    { key: 'a', title: t('common.amountWithVat'), sortable: true, sortType: 'number', sortValue: (r) => r.amountWithVat, render: (r) => Number(r.amountWithVat).toFixed(2) },

    { key: 'p', title: t('common.period'), sortable: true, sortValue: (r) => `${r.periodYear}-${r.periodMonth}`, render: (r) => `${r.periodMonth}.${r.periodYear}` },

    { key: 'st', title: t('common.status'), sortable: true, sortValue: (r) => r.status, render: (r) => r.status },

  ];



  const paymentCols: Column<Record<string, unknown>>[] = [

    { key: 't', title: t('common.tenant'), sortable: true, sortValue: (r) => r.tenantName, render: (r) => r.tenantName },

    { key: 'a', title: t('common.amount'), sortable: true, sortType: 'number', sortValue: (r) => r.amount, render: (r) => Number(r.amount).toFixed(2) },

    { key: 'd', title: t('common.date'), sortable: true, sortType: 'date', sortValue: (r) => r.paymentDate, render: (r) => r.paymentDate },

    { key: 'type', title: t('common.type'), sortable: true, sortValue: (r) => r.paymentType, render: (r) => r.paymentType },

    { key: 'p', title: t('common.period'), sortable: true, sortValue: (r) => `${r.periodYear}-${r.periodMonth}`, render: (r) => `${r.periodMonth}.${r.periodYear}` },

  ];



  const columnsMap: Record<string, Column<Record<string, unknown>>[]> = {

    rooms: roomCols,

    tenants: tenantCols,

    contracts: contractCols,

    charges: chargeCols,

    payments: paymentCols,

  };

  const activeColumns = columnsMap[tab] || roomCols;
  const accessors = useMemo(() => accessorsFromColumns(activeColumns), [activeColumns]);
  const sortOptions = useMemo(() => {
    if (tab === 'payments') {
      return { dateKey: 'd', nameKey: 't', defaultSortKey: 'd', defaultDirection: 'desc' as const };
    }
    if (tab === 'contracts') {
      return { dateKey: 'start', nameKey: 't', defaultSortKey: 'start', defaultDirection: 'desc' as const };
    }
    if (tab === 'tenants') return { nameKey: 'name' };
    if (tab === 'charges') return { nameKey: 't' };
    return { nameKey: tab === 'rooms' ? 'n' : 't' };
  }, [tab]);
  const { sortedRows, sortKey, sortDirection, handleSort, applyPreset, activePreset } = useTableSort(
    rows as Record<string, unknown>[],
    accessors,
    sortOptions
  );



  const canExport = tab === 'charges' || tab === 'payments';

  const exportExcel = () => {
    if (!pid) return;
    if (tab === 'charges') {
      downloadApiFile('/rent-charges/export/xlsx', { propertyId: pid, year, month }, `rent-charges-${year}-${month}.xlsx`);
      return;
    }
    if (tab === 'payments') {
      downloadApiFile('/payments/export/xlsx', { propertyId: pid, year, month }, `payments-${year}-${month}.xlsx`);
    }
  };



  return (

    <div className={styles.page}>

      <header className={styles.header}>

        <h1>{t('managerData.title')}</h1>

        {isDataTab && (

          <Button variant="secondary" onClick={exportExcel} disabled={!canExport}>

            {t('common.exportExcel')}

          </Button>

        )}

      </header>

      <div className={styles.tabs}>

        {TABS.map((tb) => (

          <button

            key={tb.id}

            type="button"

            className={tab === tb.id ? styles.tabActive : ''}

            onClick={() => setTab(tb.id)}

          >

            {tb.label}

          </button>

        ))}

      </div>

      <div
        className={`${styles.toolbar} ${
          isDataTab && (tab === 'charges' || tab === 'payments') ? styles.toolbarWithPeriod : ''
        }`}
      >
        {isDataTab && (
          <label className={styles.searchWrap}>
            <Search size={18} className={styles.searchIcon} aria-hidden />
            <input
              type="search"
              className={styles.searchInput}
              placeholder={t('tenants.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t('tenants.searchPlaceholder')}
            />
          </label>
        )}

        <Select
          fullWidth
          className={styles.toolbarSelect}
          value={String(pid ?? '')}
          onChange={(v) => setPropertyId(Number(v))}
          options={
            properties?.map((p: { id: number; name: string }) => ({
              value: String(p.id),
              label: p.name,
            })) ?? []
          }
        />

        {isDataTab && (tab === 'charges' || tab === 'payments') && (
          <div className={styles.periodInputs}>
            <input
              type="number"
              className={styles.periodInput}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              aria-label={t('tenants.year')}
            />
            <input
              type="number"
              min={1}
              max={12}
              className={styles.periodInput}
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              aria-label={t('tenants.month')}
            />
          </div>
        )}

        {isDataTab && (
          <TableSortBar
            inline
            className={styles.toolbarSort}
            value={activePreset}
            onChange={applyPreset}
            showDatePresets={tab === 'payments' || tab === 'charges' || tab === 'contracts'}
          />
        )}
      </div>

      {isDataTab && <p className={listingStyles.sortHint}>{t('tableSort.columnHint')}</p>}



      {!isDataTab && 'link' in activeTab && (

        <CardLink tab={activeTab} t={t} />

      )}



      {isDataTab && (

        isLoading ? (

          <p>{t('common.loading')}</p>

        ) : (

          <DataTable

            columns={activeColumns}

            rows={sortedRows}

            rowKey={(r) => Number(r.id) || String(r.contractNumber)}

            onRowClick={(r) => {

              if (tab === 'rooms' && r.id) window.location.href = `/map?room=${r.id}`;

            }}

            sortKey={sortKey}

            sortDirection={sortDirection}

            onSort={handleSort}

          />

        )

      )}

    </div>

  );

}



function CardLink({ tab, t }: { tab: { label: string; link: string }; t: (key: string, params?: Record<string, string | number>) => string }) {

  return (

    <div className={styles.linkCard}>

      <p>{t('common.sectionOpensElsewhere', { label: tab.label })}</p>

      <Link to={tab.link}>

        <Button variant="primary">{t('common.openSection', { label: tab.label })}</Button>

      </Link>

    </div>

  );

}

