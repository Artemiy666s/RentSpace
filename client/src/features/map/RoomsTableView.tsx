import { useMemo } from 'react';

import { useQuery } from '@tanstack/react-query';

import { api } from '@/api/client';

import { useI18n } from '@/i18n/useI18n';

import { useRoomStatusLabels } from '@/i18n/roomStatus';

import { DataTable, type Column } from '@/components/data/DataTable';
import { TableSortBar } from '@/components/data/TableSortBar';
import { useTableSort } from '@/hooks/useTableSort';
import { accessorsFromColumns } from '@/lib/tableSort';
import listingStyles from '@/styles/listingPage.module.css';

import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import styles from './RoomsTableView.module.css';



export interface RoomTableRow {

  id: number;

  roomNumber: string;

  propertyName: string;

  buildingName: string;

  floorName: string;

  area: number;

  rentableArea: number;

  status: string;

  roomType: string;

  tenantName?: string;

  contractNumber?: string;

  contractDate?: string;

  rentStartDate?: string;

  rentEndDate?: string;

  rateWithoutVat: number;

  rateWithVat: number;

  chargedMonth: number;

  comment?: string;

}



interface Filters {

  propertyId?: number;

  buildingId?: number;

  floorId?: number;

  status?: string;

  search?: string;

  year?: number;

  month?: number;

  freeOnly?: boolean;

  hasDebt?: boolean;

}



interface Props {

  filters: Filters;

  onOpenRoom: (id: number) => void;

  onRentOut?: (id: number) => void;

  onChangeTenant?: (id: number) => void;

}



export function RoomsTableView({ filters, onOpenRoom, onRentOut, onChangeTenant }: Props) {

  const { t } = useI18n();

  const statusLabels = useRoomStatusLabels();



  const {
    data: rows = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['manager-rooms-table', filters],
    queryFn: () =>
      api
        .get('/manager/data/rooms', {
          params: {
            propertyId: filters.propertyId,
            buildingId: filters.buildingId,
            floorId: filters.floorId,
            status: filters.status,
            search: filters.search,
            year: filters.year,
            month: filters.month,
            freeOnly: filters.freeOnly ? 'true' : undefined,
            hasDebt: filters.hasDebt ? 'true' : undefined,
          },
        })
        .then((r) => r.data.data as RoomTableRow[]),
    enabled: !!filters.propertyId && !!filters.floorId,
  });



  const columns: Column<RoomTableRow>[] = useMemo(

    () => [

      { key: 'roomNumber', title: '№', sortable: true, sortValue: (r) => r.roomNumber, render: (r) => r.roomNumber },

      { key: 'building', title: t('common.building'), sortable: true, sortValue: (r) => r.buildingName, render: (r) => r.buildingName },

      { key: 'floor', title: t('common.floor'), sortable: true, sortValue: (r) => r.floorName, render: (r) => r.floorName },

      { key: 'area', title: t('common.area'), sortable: true, sortType: 'number', sortValue: (r) => r.area, render: (r) => `${r.area} ${t('common.sqm')}` },

      { key: 'rentable', title: t('common.rentable'), sortable: true, sortType: 'number', sortValue: (r) => r.rentableArea, render: (r) => `${r.rentableArea} ${t('common.sqm')}` },

      {
        key: 'status',
        title: t('common.status'),
        render: (r) => (
          <StatusBadge status={r.status}>{statusLabels[r.status] || r.status}</StatusBadge>
        ),
      },

      { key: 'tenant', title: t('common.tenant'), sortable: true, sortValue: (r) => r.tenantName, render: (r) => r.tenantName || t('common.dash') },

      { key: 'contract', title: t('common.contract'), sortable: true, sortValue: (r) => r.contractNumber, render: (r) => r.contractNumber || t('common.dash') },

      { key: 'rate', title: t('common.rateWithVatShort'), sortable: true, sortType: 'number', sortValue: (r) => r.rateWithVat, render: (r) => (r.rateWithVat ? `${r.rateWithVat.toFixed(2)}` : t('common.dash')) },

      { key: 'charged', title: t('common.accrued'), sortable: true, sortType: 'number', sortValue: (r) => r.chargedMonth, render: (r) => r.chargedMonth?.toFixed(2) ?? '0' },

      {

        key: 'actions',

        title: t('common.actions'),

        render: (r) => (

          <span onClick={(e) => e.stopPropagation()}>

            <Button variant="ghost" onClick={() => onOpenRoom(r.id)}>

              {t('common.card')}

            </Button>

            {onRentOut && ['free', 'ready_for_rent', 'negotiation', 'reserved'].includes(r.status) && (

              <Button variant="secondary" onClick={() => onRentOut(r.id)}>

                {t('common.rentOut')}

              </Button>

            )}

            {onChangeTenant && ['occupied', 'debt'].includes(r.status) && (

              <Button variant="secondary" onClick={() => onChangeTenant(r.id)}>

                {t('rooms.changeTenant')}

              </Button>

            )}

          </span>

        ),

      },

    ],

    [t, statusLabels, onOpenRoom, onRentOut, onChangeTenant]

  );

  const accessors = useMemo(() => accessorsFromColumns(columns), [columns]);
  const { sortedRows, sortKey, sortDirection, handleSort, applyPreset, activePreset } = useTableSort(
    rows,
    accessors,
    { nameKey: 'roomNumber' }
  );

  if (!filters.floorId) {
    return <p className={styles.hint}>{t('mapPage.selectFloorForTable')}</p>;
  }

  if (isLoading) return <p>{t('common.loadingTable')}</p>;

  if (isError) {
    return (
      <p className={styles.error}>
        {t('mapPage.loadTableFailed')}{' '}
        <button type="button" onClick={() => refetch()}>
          {t('mapPage.retryLoad')}
        </button>
      </p>
    );
  }

  return (
    <>
      <div className={listingStyles.toolbar}>
        <TableSortBar value={activePreset} onChange={applyPreset} showDatePresets={false} />
      </div>
      <p className={listingStyles.sortHint}>{t('tableSort.columnHint')}</p>
      <DataTable
        columns={columns}
        rows={sortedRows}
        rowKey={(r) => r.id}
        onRowClick={(r) => onOpenRoom(r.id)}
        emptyText={t('common.noRoomsByFilter')}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSort={handleSort}
      />
    </>
  );

}

