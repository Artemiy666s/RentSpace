import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { AxiosError } from 'axios';
import { Key, Pencil, UserRoundPen, Map, ChevronLeft } from 'lucide-react';
import { useIsMobileLayout } from '@/hooks/useMediaQuery';
import { api } from '@/api/client';
import { usePropertyStore } from '@/store/propertyStore';
import { useI18n } from '@/i18n/useI18n';
import { useRoomStatusLabels } from '@/i18n/roomStatus';
import { ROOM_STATUS_ORDER } from '@/constants/roomStatus';
import { useTableSort } from '@/hooks/useTableSort';
import { Select } from '@/components/ui/Select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { RoomEditModal, type RoomListRow } from '@/features/rooms/RoomEditModal';
import { RentOutModal, type RentOutPayload, type RentOutModalMode } from '@/features/manager/RentOutModal';
import { ChangeTenantModal } from '@/features/manager/ChangeTenantModal';
import styles from './RoomsPage.module.css';

type RoomDetails = {
  id: number;
  room_number: string;
  name?: string;
  area: number;
  status: string;
  comment?: string;
  room_type?: string;
  building?: { name: string };
  floor?: { name: string; level_number?: number };
  tenant?: { id: number; name: string; status?: string } | null;
  contract?: {
    id: number;
    contract_number?: string;
    start_date?: string;
    end_date?: string;
    vat_rate?: number;
  } | null;
  rateWithoutVat?: number;
  rateWithVat?: number;
  vatRate?: number;
  monthlyCharged?: number;
  monthlyUtilities?: number;
  monthlyPaid?: number;
  debt?: number;
  negotiation?: { tenant_name?: string; status?: string } | null;
};

function formatRateWithVat(row: RoomListRow, dash: string): string | null {
  const rate = row.contract_rate_without_vat ?? row.current_rate_without_vat;
  if (rate == null) return null;
  const vat = row.vat_rate ?? 20;
  return (Number(rate) * (1 + Number(vat) / 100)).toFixed(2);
}

function formatMoney(n: number) {
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function RoomsPage() {
  const { t } = useI18n();
  const statusLabels = useRoomStatusLabels();
  const qc = useQueryClient();
  const { propertyId } = usePropertyStore();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [buildingFilter, setBuildingFilter] = useState('');
  const [floorFilter, setFloorFilter] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const isMobile = useIsMobileLayout();
  const [editRoomId, setEditRoomId] = useState<number | null>(null);
  const [rentRoomId, setRentRoomId] = useState<number | null>(null);
  const [rentDefaultRate, setRentDefaultRate] = useState<number | undefined>();
  const [rentModalMode, setRentModalMode] = useState<RentOutModalMode>('assign');
  const [changeTenantRoomId, setChangeTenantRoomId] = useState<number | null>(null);
  const [changeTenantName, setChangeTenantName] = useState<string | undefined>();

  const sortOptions = useMemo(
    () => [
      { value: 'room_number', label: t('tableSort.nameAsc') },
      { value: 'building', label: t('common.building') },
      { value: 'area', label: t('common.area') },
      { value: 'status', label: t('common.status') },
      { value: 'tenant', label: t('common.tenant') },
    ],
    [t]
  );

  const { data: properties } = useQuery({
    queryKey: ['properties'],
    queryFn: () => api.get('/properties').then((r) => r.data.data),
  });
  const pid = propertyId || properties?.[0]?.id;

  useEffect(() => {
    setBuildingFilter('');
    setFloorFilter('');
    setSelectedRoomId(null);
  }, [pid]);

  const { data: buildings } = useQuery({
    queryKey: ['buildings', pid],
    queryFn: () => api.get(`/properties/${pid}/buildings`).then((r) => r.data.data as { id: number; name: string }[]),
    enabled: !!pid,
  });

  const { data: floors } = useQuery({
    queryKey: ['floors', buildingFilter],
    queryFn: () =>
      api.get(`/buildings/${buildingFilter}/floors`).then((r) => r.data.data as { id: number; name: string }[]),
    enabled: !!buildingFilter,
  });

  const {
    data: rooms,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['rooms', pid, search, status, buildingFilter, floorFilter],
    queryFn: () =>
      api
        .get('/rooms', {
          params: {
            propertyId: pid,
            search: search || undefined,
            status: status || undefined,
            buildingId: buildingFilter || undefined,
            floorId: floorFilter || undefined,
          },
        })
        .then((r) => r.data.data as RoomListRow[]),
    enabled: !!pid,
  });

  const accessors = useMemo(
    () => ({
      room_number: { get: (r: RoomListRow) => r.room_number, type: 'string' as const },
      building: { get: (r: RoomListRow) => r.building_name, type: 'string' as const },
      area: { get: (r: RoomListRow) => r.area, type: 'number' as const },
      status: { get: (r: RoomListRow) => statusLabels[r.status] || r.status, type: 'string' as const },
      tenant: { get: (r: RoomListRow) => r.tenant_name || '', type: 'string' as const },
    }),
    [statusLabels]
  );

  const { sortedRows, setSortKey, setSortDirection, sortKey } = useTableSort(rooms, accessors, {
    nameKey: 'room_number',
    defaultSortKey: 'room_number',
    defaultDirection: 'asc',
  });

  const selectedRow = sortedRows.find((r) => r.id === selectedRoomId) ?? null;

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['room', selectedRoomId],
    queryFn: () => api.get(`/rooms/${selectedRoomId}`).then((r) => r.data.data as RoomDetails),
    enabled: !!selectedRoomId,
  });

  const rentOut = useMutation({
    mutationFn: (payload: RentOutPayload & { roomId: number; mode: RentOutModalMode }) => {
      const path =
        payload.mode === 'reassign'
          ? `/rooms/${payload.roomId}/change-tenant`
          : `/rooms/${payload.roomId}/rent-out`;
      const { roomId: _id, mode: _mode, ...body } = payload;
      return api.post(path, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms'] });
      qc.invalidateQueries({ queryKey: ['room'] });
      setRentRoomId(null);
      setRentModalMode('assign');
    },
  });

  const { data: changeTenantRoom } = useQuery({
    queryKey: ['room', changeTenantRoomId],
    queryFn: () => api.get(`/rooms/${changeTenantRoomId}`).then((r) => r.data.data),
    enabled: !!changeTenantRoomId,
  });

  const openRentOut = (row: RoomListRow) => {
    setRentRoomId(row.id);
    setRentDefaultRate(
      Number(row.contract_rate_without_vat) || Number(row.current_rate_without_vat) || undefined
    );
    setRentModalMode('assign');
  };

  const openChangeTenant = (row: RoomListRow) => {
    setChangeTenantRoomId(row.id);
    setChangeTenantName(row.tenant_name);
  };

  const canRentOut = (s: string) => ['free', 'ready_for_rent', 'negotiation', 'reserved'].includes(s);
  const canChangeTenant = (s: string) => ['occupied', 'debt'].includes(s);

  const detailTitle = selectedRow
    ? selectedRow.name
      ? `${t('common.roomNo', { no: selectedRow.room_number })} — ${selectedRow.name}`
      : t('common.roomNo', { no: selectedRow.room_number })
    : '';

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <h1>{t('rooms.title')}</h1>
        <div className={styles.pageActions}>
          <Link to="/map" className={styles.mapLink}>
            {t('common.openOnMap')}
          </Link>
        </div>
      </div>

      <div className={styles.toolbar}>
        <input
          type="search"
          placeholder={t('common.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={styles.searchInput}
          aria-label={t('common.searchPlaceholder')}
        />
        <Select
          fullWidth
          value={buildingFilter}
          onChange={(v) => {
            setBuildingFilter(v);
            setFloorFilter('');
          }}
          options={[
            { value: '', label: t('common.allBuildings') },
            ...(buildings?.map((b) => ({ value: String(b.id), label: b.name })) ?? []),
          ]}
        />
        <Select
          fullWidth
          value={floorFilter}
          onChange={setFloorFilter}
          disabled={!buildingFilter}
          options={[
            { value: '', label: t('common.allFloors') },
            ...(floors?.map((f) => ({ value: String(f.id), label: f.name })) ?? []),
          ]}
        />
        <Select
          fullWidth
          value={status}
          onChange={setStatus}
          options={[
            { value: '', label: t('common.allStatuses') },
            ...ROOM_STATUS_ORDER.map((k) => ({ value: k, label: statusLabels[k] })),
          ]}
        />
        <Select
          fullWidth
          aria-label={t('tableSort.label')}
          value={sortKey || 'room_number'}
          onChange={(v) => {
            setSortKey(v);
            setSortDirection('asc');
          }}
          options={sortOptions}
        />
      </div>

      <div
        className={`${styles.grid} ${isMobile && mobileShowDetail && selectedRoomId ? styles.gridDetailOnly : ''} ${isMobile && !mobileShowDetail ? styles.gridListOnly : ''}`}
      >
        <Card className={styles.list}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>№</th>
                <th>{t('common.building')}</th>
                <th>{t('common.floor')}</th>
                <th className={styles.num}>{t('common.sqm')}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.tenant')}</th>
                <th className={styles.num}>{t('common.rateWithVatShort')}</th>
                <th className={styles.actionsCol}>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={8}>{t('common.loading')}</td>
                </tr>
              )}
              {isError && !isLoading && (
                <tr>
                  <td colSpan={8}>
                    {(error as AxiosError<{ error?: string }>)?.response?.data?.error ||
                      t('common.noData')}{' '}
                    <button type="button" className={styles.iconBtn} onClick={() => refetch()}>
                      ↻
                    </button>
                  </td>
                </tr>
              )}
              {!isLoading && !isError && sortedRows.length === 0 && (
                <tr>
                  <td colSpan={8}>{t('common.noData')}</td>
                </tr>
              )}
              {!isLoading &&
                !isError &&
                sortedRows.map((row) => (
                  <tr
                    key={row.id}
                    className={selectedRoomId === row.id ? styles.selected : ''}
                    onClick={() => {
                      setSelectedRoomId(row.id);
                      if (isMobile) setMobileShowDetail(true);
                    }}
                  >
                    <td className={styles.roomCell}>
                      <span className={styles.roomName}>{row.room_number}</span>
                    </td>
                    <td>{row.building_name}</td>
                    <td>{row.floor_name}</td>
                    <td className={styles.num}>{Number(row.area).toFixed(2)}</td>
                    <td>
                      <StatusBadge status={row.status}>{statusLabels[row.status]}</StatusBadge>
                    </td>
                    <td>{row.tenant_name || t('common.dash')}</td>
                    <td className={styles.num}>
                      {formatRateWithVat(row, t('common.dash')) ?? t('common.dash')}
                    </td>
                    <td className={styles.actionsCol} onClick={(e) => e.stopPropagation()}>
                      {canRentOut(row.status) && (
                        <button
                          type="button"
                          className={styles.iconBtn}
                          title={t('rooms.rentOutAction')}
                          onClick={() => openRentOut(row)}
                        >
                          <Key size={16} />
                        </button>
                      )}
                      {canChangeTenant(row.status) && (
                        <button
                          type="button"
                          className={styles.iconBtn}
                          title={t('rooms.changeTenant')}
                          onClick={() => openChangeTenant(row)}
                        >
                          <UserRoundPen size={16} />
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.iconBtn}
                        title={t('rooms.editRoom', { num: row.room_number })}
                        onClick={() => setEditRoomId(row.id)}
                      >
                        <Pencil size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>

        <Card className={styles.card}>
          {selectedRow ? (
            detailLoading && !detail ? (
              <p className={styles.empty}>{t('common.loading')}</p>
            ) : (
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
                  <div>
                    <h2>{detailTitle}</h2>
                    {detail?.building?.name && (
                      <p className={styles.detailSub}>
                        {detail.building.name}
                        {detail.floor?.name ? ` · ${detail.floor.name}` : ''}
                      </p>
                    )}
                  </div>
                  <div className={styles.detailActions}>
                    <Link to="/map">
                      <Button variant="surface">
                        <Map size={16} /> {t('common.openOnMap')}
                      </Button>
                    </Link>
                    {canRentOut(selectedRow.status) && (
                      <Button variant="primary" onClick={() => openRentOut(selectedRow)}>
                        <Key size={16} /> {t('rooms.rentOutAction')}
                      </Button>
                    )}
                    {canChangeTenant(selectedRow.status) && (
                      <Button variant="secondary" onClick={() => openChangeTenant(selectedRow)}>
                        <UserRoundPen size={16} /> {t('rooms.changeTenant')}
                      </Button>
                    )}
                    <Button variant="secondary" onClick={() => setEditRoomId(selectedRow.id)}>
                      <Pencil size={16} /> {t('rooms.editRoomShort')}
                    </Button>
                  </div>
                </div>

                <dl className={styles.meta}>
                  <dt>{t('common.status')}</dt>
                  <dd>
                    <StatusBadge status={selectedRow.status}>
                      {statusLabels[selectedRow.status]}
                    </StatusBadge>
                  </dd>
                  <dt>{t('common.building')}</dt>
                  <dd>{selectedRow.building_name}</dd>
                  <dt>{t('common.floor')}</dt>
                  <dd>{selectedRow.floor_name}</dd>
                  <dt>{t('common.area')}</dt>
                  <dd>
                    {Number(selectedRow.area).toFixed(2)} {t('common.sqm')}
                  </dd>
                  <dt>{t('common.tenant')}</dt>
                  <dd>{detail?.tenant?.name || selectedRow.tenant_name || t('common.dash')}</dd>
                  {detail?.contract?.contract_number && (
                    <>
                      <dt>{t('common.contract')}</dt>
                      <dd>{detail.contract.contract_number}</dd>
                    </>
                  )}
                  <dt>{t('rooms.rateWithVat')}</dt>
                  <dd>
                    {detail?.rateWithVat != null
                      ? `${formatMoney(detail.rateWithVat)} ${t('common.currencyByn')}`
                      : formatRateWithVat(selectedRow, t('common.dash')) ?? t('common.dash')}
                  </dd>
                  {detail?.negotiation?.tenant_name && (
                    <>
                      <dt>{t('manager.negotiations')}</dt>
                      <dd>{detail.negotiation.tenant_name}</dd>
                    </>
                  )}
                  {detail?.comment && (
                    <>
                      <dt>{t('tenants.comment')}</dt>
                      <dd>{detail.comment}</dd>
                    </>
                  )}
                </dl>

                {detail && (detail.monthlyCharged != null || detail.debt != null) && (
                  <section className={styles.financeBlock}>
                    <h3>{t('rooms.financeMonth')}</h3>
                    <dl className={styles.meta}>
                      {detail.monthlyCharged != null && (
                        <>
                          <dt>{t('nav.charges')}</dt>
                          <dd>
                            {formatMoney(detail.monthlyCharged)} {t('common.currencyByn')}
                          </dd>
                        </>
                      )}
                      {detail.monthlyPaid != null && (
                        <>
                          <dt>{t('nav.payments')}</dt>
                          <dd>
                            {formatMoney(detail.monthlyPaid)} {t('common.currencyByn')}
                          </dd>
                        </>
                      )}
                      {detail.debt != null && (
                        <>
                          <dt>{t('common.debt')}</dt>
                          <dd className={detail.debt > 0 ? styles.debt : ''}>
                            {formatMoney(detail.debt)} {t('common.currencyByn')}
                          </dd>
                        </>
                      )}
                    </dl>
                  </section>
                )}
              </>
            )
          ) : (
            <p className={styles.empty}>{t('rooms.selectRoom')}</p>
          )}
        </Card>
      </div>

      <RoomEditModal
        roomId={editRoomId}
        onClose={() => setEditRoomId(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['rooms'] });
          qc.invalidateQueries({ queryKey: ['room'] });
        }}
        onRentOut={(id, defaultRate) => {
          setEditRoomId(null);
          setRentRoomId(id);
          setRentDefaultRate(defaultRate);
          setRentModalMode('assign');
        }}
        onChangeTenant={(id) => {
          setEditRoomId(null);
          setChangeTenantRoomId(id);
        }}
      />

      <RentOutModal
        open={!!rentRoomId}
        roomId={rentRoomId}
        mode={rentModalMode}
        defaultRate={rentDefaultRate}
        loading={rentOut.isPending}
        onClose={() => {
          setRentRoomId(null);
          setRentModalMode('assign');
        }}
        onSubmit={(payload) => {
          if (rentRoomId) rentOut.mutate({ ...payload, roomId: rentRoomId, mode: rentModalMode });
        }}
      />

      <ChangeTenantModal
        open={!!changeTenantRoomId}
        roomId={changeTenantRoomId}
        currentTenantName={changeTenantName || changeTenantRoom?.tenant?.name}
        defaultRate={changeTenantRoom?.rateWithoutVat ?? changeTenantRoom?.current_rate_without_vat}
        defaultVat={changeTenantRoom?.vatRate}
        onClose={() => setChangeTenantRoomId(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['rooms'] });
          qc.invalidateQueries({ queryKey: ['room'] });
          setChangeTenantRoomId(null);
        }}
        onNewContract={(id) => {
          setChangeTenantRoomId(null);
          setRentRoomId(id);
          setRentModalMode('reassign');
          setRentDefaultRate(
            changeTenantRoom?.rateWithoutVat ?? changeTenantRoom?.current_rate_without_vat
          );
        }}
      />
    </div>
  );
}
