import { useEffect, useMemo, useState } from 'react';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { Search } from 'lucide-react';

import { api } from '@/api/client';

import { usePropertyStore } from '@/store/propertyStore';

import { useI18n } from '@/i18n/useI18n';

import { useRoomStatusLabels } from '@/i18n/roomStatus';

import { FloorPlanViewer, type MapRoom } from '@/features/map/FloorPlanViewer';

import { RoomDetailsPanel, type RoomDetail } from '@/features/map/RoomDetailsPanel';

import { RoomLegend } from '@/features/map/RoomLegend';

import { RoomsTableView } from '@/features/map/RoomsTableView';

import { Modal } from '@/components/modals/Modal';

import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

import { Button } from '@/components/ui/Button';

import { RentOutModal, type RentOutPayload, type RentOutModalMode } from '@/features/manager/RentOutModal';
import { ChangeTenantModal } from '@/features/manager/ChangeTenantModal';

import { Card } from '@/components/ui/Card';

import styles from './MapPage.module.css';



export function MapPage() {

  const { t } = useI18n();

  const statusLabels = useRoomStatusLabels();

  const qc = useQueryClient();

  const { propertyId, buildingId, floorId, setPropertyId, setBuildingId, setFloorId } = usePropertyStore();

  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const [search, setSearch] = useState('');

  const [rentModal, setRentModal] = useState(false);
  const [rentModalMode, setRentModalMode] = useState<RentOutModalMode>('assign');
  const [changeTenantModal, setChangeTenantModal] = useState(false);

  const [vacateModal, setVacateModal] = useState(false);

  const [paymentModal, setPaymentModal] = useState(false);

  const [viewMode, setViewMode] = useState<'map' | 'table'>('map');

  const [vacateForm, setVacateForm] = useState({

    endDate: '',

    reason: 'contract_end',

    newStatus: 'free',

    comment: '',

  });

  const [statusModal, setStatusModal] = useState(false);

  const [statusForm, setStatusForm] = useState({ status: 'free', comment: '' });

  const [negotiationModal, setNegotiationModal] = useState(false);

  const [negotiationForm, setNegotiationForm] = useState({

    tenantName: '',

    contactPerson: '',

    phone: '',

    plannedStartDate: '',

    expectedRate: '',

    comment: '',

    nextContactDate: '',

    status: 'initial_interest',

  });

  const [payForm, setPayForm] = useState({ amount: '', paymentDate: '' });



  const { data: properties } = useQuery({

    queryKey: ['properties'],

    queryFn: () => api.get('/properties').then((r) => r.data.data),

  });



  const pid = propertyId || properties?.[0]?.id;

  useEffect(() => {

    if (properties?.[0] && !propertyId) setPropertyId(properties[0].id);

  }, [properties, propertyId, setPropertyId]);



  const { data: buildings } = useQuery({

    queryKey: ['buildings', pid],

    queryFn: () => api.get(`/properties/${pid}/buildings`).then((r) => r.data.data),

    enabled: !!pid,

  });



  const bid = buildingId || buildings?.[0]?.id;

  useEffect(() => {

    if (buildings?.[0] && !buildingId) setBuildingId(buildings[0].id);

  }, [buildings, buildingId, setBuildingId]);



  const { data: floors } = useQuery({

    queryKey: ['floors', bid],

    queryFn: () => api.get(`/buildings/${bid}/floors`).then((r) => r.data.data),

    enabled: !!bid,

  });



  const fid = useMemo(() => {
    if (!floors?.length) return undefined;
    if (floorId && floors.some((f: { id: number }) => f.id === floorId)) return floorId;
    return floors[0].id;
  }, [floors, floorId]);

  useEffect(() => {
    if (!floors?.length || !fid) return;
    if (floorId !== fid) setFloorId(fid);
  }, [floors, floorId, fid, setFloorId]);



  const { data: planData, isLoading: planLoading } = useQuery({

    queryKey: ['floorPlan', fid],

    queryFn: () => api.get(`/floors/${fid}/plan`).then((r) => r.data.data),

    enabled: !!fid,

  });



  const { data: roomDetail, isLoading: roomLoading } = useQuery({

    queryKey: ['room', selectedId],

    queryFn: () => api.get(`/rooms/${selectedId}`).then((r) => r.data.data as RoomDetail),

    enabled: !!selectedId,

  });



  const invalidateRoomQueries = () => {
    qc.invalidateQueries({ queryKey: ['floorPlan'] });
    qc.invalidateQueries({ queryKey: ['room', selectedId] });
    qc.invalidateQueries({ queryKey: ['manager-rooms-table'] });
    qc.invalidateQueries({ queryKey: ['rooms'] });
  };

  const rentMutation = useMutation({

    mutationFn: (payload: RentOutPayload) => {
      const path =
        rentModalMode === 'reassign'
          ? `/rooms/${selectedId}/change-tenant`
          : `/rooms/${selectedId}/rent-out`;
      return api.post(path, payload);
    },

    onSuccess: () => {
      invalidateRoomQueries();
      setRentModal(false);
      setRentModalMode('assign');
    },

  });



  const statusMutation = useMutation({

    mutationFn: () =>

      api.post(`/rooms/${selectedId}/change-status`, {

        status: statusForm.status,

        comment: statusForm.comment,

      }),

    onSuccess: () => {

      qc.invalidateQueries({ queryKey: ['floorPlan'] });

      qc.invalidateQueries({ queryKey: ['room', selectedId] });

      setStatusModal(false);

    },

  });



  const negotiationMutation = useMutation({

    mutationFn: () => {

      const existingId = roomDetail?.negotiation?.id;

      const body = {

        tenantName: negotiationForm.tenantName,

        contactPerson: negotiationForm.contactPerson,

        phone: negotiationForm.phone,

        plannedStartDate: negotiationForm.plannedStartDate || null,

        expectedRateWithoutVat: Number(negotiationForm.expectedRate) || null,

        comment: negotiationForm.comment,

        nextContactDate: negotiationForm.nextContactDate || null,

        status: negotiationForm.status || 'initial_interest',

      };

      if (existingId) {

        return api.put(`/manager/negotiations/${existingId}`, body);

      }

      return api.post(`/manager/rooms/${selectedId}/negotiations`, body);

    },

    onSuccess: () => {

      qc.invalidateQueries({ queryKey: ['floorPlan'] });

      qc.invalidateQueries({ queryKey: ['room', selectedId] });

      setNegotiationModal(false);

    },

  });



  const vacateMutation = useMutation({

    mutationFn: () =>

      api.post(`/rooms/${selectedId}/vacate`, {

        endDate: vacateForm.endDate,

        reason: vacateForm.reason,

        newStatus: vacateForm.newStatus,

        comment: vacateForm.comment,

      }),

    onSuccess: () => {

      qc.invalidateQueries({ queryKey: ['floorPlan'] });

      qc.invalidateQueries({ queryKey: ['room', selectedId] });

      setVacateModal(false);

    },

  });



  const payMutation = useMutation({

    mutationFn: () =>

      api.post('/payments', {

        propertyId: pid,

        tenantId: roomDetail?.tenant?.id,

        contractId: roomDetail?.contract?.id,

        amount: Number(payForm.amount),

        paymentDate: payForm.paymentDate,

        paymentType: 'rent',

        periodYear: new Date().getFullYear(),

        periodMonth: new Date().getMonth() + 1,

      }),

    onSuccess: () => {

      qc.invalidateQueries({ queryKey: ['room', selectedId] });

      setPaymentModal(false);

    },

  });



  const mapRooms: MapRoom[] = (planData?.rooms || []).map((r: MapRoom) => r);

  const floorRoomsMeta = (planData?.floorRooms || []) as {
    id: number;
    status: string;
    area: number;
  }[];

  const metricsSource =
    floorRoomsMeta.length > 0
      ? floorRoomsMeta
      : mapRooms.map((r) => ({ status: r.status, area: r.area }));

  const metrics = {
    total: metricsSource.length,
    occupied: metricsSource.filter((r) => r.status === 'occupied' || r.status === 'debt').length,
    free: metricsSource.filter((r) => r.status === 'free' || r.status === 'ready_for_rent').length,
    shaped: mapRooms.length,
    area: metricsSource.reduce((s, r) => s + Number(r.area || 0), 0),
  };



  const vacateReasonOptions = [

    { value: 'contract_end', label: t('common.contractEnd') },

    { value: 'termination', label: t('common.termination') },

    { value: 'relocation', label: t('common.relocation') },

    { value: 'debt', label: t('common.debt') },

    { value: 'repair', label: t('common.repair') },

    { value: 'other', label: t('common.other') },

  ];



  const vacateStatusOptions = ['free', 'ready_for_rent', 'repair', 'not_available'] as const;

  const changeStatusOptions = ['free', 'ready_for_rent', 'negotiation', 'reserved', 'repair', 'technical', 'not_available'] as const;



  return (

    <div className={styles.page}>

      <header className={styles.toolbar}>

        <h1>{t('mapPage.title')}</h1>

        <div className={styles.selectors}>
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
            value={String(bid ?? '')}
            onChange={(v) => {
              setBuildingId(Number(v));
              setFloorId(null);
            }}
            options={
              buildings?.map((b: { id: number; name: string }) => ({
                value: String(b.id),
                label: b.name,
              })) ?? []
            }
          />
          <Select
            value={String(fid ?? '')}
            onChange={(v) => setFloorId(Number(v))}
            options={
              floors?.map((f: { id: number; name: string }) => ({
                value: String(f.id),
                label: f.name,
              })) ?? []
            }
          />
        </div>

        <div className={styles.search}>

          <Search size={18} />

          <input

            placeholder={t('common.roomOrTenant')}

            value={search}

            onChange={(e) => setSearch(e.target.value)}

          />

        </div>

        <div className={styles.viewToggle}>

          <button type="button" className={viewMode === 'map' ? styles.activeView : ''} onClick={() => setViewMode('map')}>

            {t('common.map')}

          </button>

          <button
            type="button"
            className={viewMode === 'table' ? styles.activeView : ''}
            onClick={() => {
              setStatusFilter(null);
              setViewMode('table');
            }}
          >
            {t('common.table')}
          </button>

        </div>

      </header>

      {viewMode === 'map' && <RoomLegend active={statusFilter} onToggle={setStatusFilter} />}

      <div className={viewMode === 'map' ? styles.grid : styles.gridTable}>

        {viewMode === 'map' ? (

          <Card className={styles.mapCard}>

            {planLoading ? (

              <p>{t('common.loadingPlan')}</p>

            ) : mapRooms.length === 0 ? (

              <p className={styles.hint}>

                {t('common.noZonesOnFloor')}{' '}

                <code>npm run setup:56e</code> {t('common.forBuilding56e')}

              </p>

            ) : (

              <FloorPlanViewer

                rooms={mapRooms}

                planWidth={planData?.plan?.width || 1200}

                planHeight={planData?.plan?.height || 400}

                imageUrl={planData?.plan?.imageUrl}

                selectedRoomId={selectedId}

                statusFilter={statusFilter}

                search={search}

                onSelectRoom={(r) => setSelectedId(r.id)}

              />

            )}

          </Card>

        ) : (

          <Card className={styles.tableCard}>

            {statusFilter && (
              <p className={styles.filterHint}>
                {t('mapPage.activeStatusFilter')}{' '}
                <button type="button" onClick={() => setStatusFilter(null)}>
                  {t('mapPage.clearStatusFilter')}
                </button>
              </p>
            )}
            <RoomsTableView
              filters={{
                propertyId: pid,
                floorId: fid,
                status: statusFilter || undefined,
                search: search.trim() || undefined,
              }}

              onOpenRoom={(id) => {

                setSelectedId(id);

                setViewMode('map');

              }}

              onRentOut={(id) => {
                setSelectedId(id);
                setRentModalMode('assign');
                setRentModal(true);
              }}

              onChangeTenant={(id) => {
                setSelectedId(id);
                setChangeTenantModal(true);
              }}

            />

          </Card>

        )}

        {viewMode === 'map' && (

          <RoomDetailsPanel

            room={roomDetail ?? null}

            loading={roomLoading && !!selectedId}

            onRentOut={() => {
              setRentModalMode('assign');
              setRentModal(true);
            }}

            onChangeTenant={() => setChangeTenantModal(true)}

            onVacate={() => setVacateModal(true)}

            onAddPayment={() => setPaymentModal(true)}

            onChangeStatus={() => {

              setStatusForm({ status: roomDetail?.status || 'free', comment: '' });

              setStatusModal(true);

            }}

            onNegotiate={() => {

              const n = roomDetail?.negotiation;

              setNegotiationForm({

                tenantName: n?.tenant_name || '',

                contactPerson: '',

                phone: '',

                plannedStartDate: n?.planned_start_date || '',

                expectedRate: String(n?.expected_rate_without_vat || ''),

                comment: n?.comment || '',

                nextContactDate: n?.next_contact_date || '',

                status: n?.status || 'initial_interest',

              });

              setNegotiationModal(true);

            }}

            onAddComment={() => {

              setStatusForm({ status: roomDetail?.status || 'free', comment: roomDetail?.comment || '' });

              setStatusModal(true);

            }}

          />

        )}

      </div>

      <div className={styles.metrics}>

        <span>{t('common.total')}: {metrics.total}</span>

        <span>{t('common.rented')}: {metrics.occupied}</span>

        <span>{t('common.free')}: {metrics.free}</span>

        <span>{t('common.floorArea')}: {metrics.area.toFixed(1)} {t('common.sqm')}</span>
        {viewMode === 'map' && metrics.shaped > 0 && metrics.shaped < metrics.total && (
          <span>{t('mapPage.onPlan', { count: metrics.shaped })}</span>
        )}
      </div>



      <RentOutModal

        open={rentModal}

        roomId={selectedId}

        mode={rentModalMode}

        defaultRate={roomDetail?.rateWithoutVat ?? roomDetail?.current_rate_without_vat}

        onClose={() => {
          setRentModal(false);
          setRentModalMode('assign');
        }}

        onSubmit={(payload) => rentMutation.mutate(payload)}

        loading={rentMutation.isPending}

      />

      <ChangeTenantModal
        open={changeTenantModal}
        roomId={selectedId}
        currentTenantName={roomDetail?.tenant?.name}
        defaultRate={roomDetail?.rateWithoutVat ?? roomDetail?.current_rate_without_vat}
        defaultVat={roomDetail?.vatRate}
        onClose={() => setChangeTenantModal(false)}
        onSaved={invalidateRoomQueries}
        onNewContract={(id) => {
          setSelectedId(id);
          setRentModalMode('reassign');
          setRentModal(true);
        }}
      />



      <Modal open={vacateModal} title={t('common.freeRoom')} onClose={() => setVacateModal(false)}>

        <Input
          label={t('common.vacateDate')}
          type="date"
          required
          value={vacateForm.endDate}
          onChange={(e) => setVacateForm({ ...vacateForm, endDate: e.target.value })}
        />

        <Select
          label={t('common.reason')}
          fullWidth
          value={vacateForm.reason}
          onChange={(reason) => setVacateForm({ ...vacateForm, reason })}
          options={vacateReasonOptions.map((o) => ({ value: o.value, label: o.label }))}
        />
        <Select
          label={t('common.statusAfterVacate')}
          fullWidth
          value={vacateForm.newStatus}
          onChange={(newStatus) => setVacateForm({ ...vacateForm, newStatus })}
          options={vacateStatusOptions.map((s) => ({
            value: s,
            label: statusLabels[s] || s,
          }))}
        />

        <Input label={t('common.comment')} value={vacateForm.comment} onChange={(e) => setVacateForm({ ...vacateForm, comment: e.target.value })} />

        <Button variant="primary" fullWidth onClick={() => vacateMutation.mutate()}>{t('common.vacate')}</Button>

      </Modal>



      <Modal open={statusModal} title={t('common.editStatus')} onClose={() => setStatusModal(false)}>

        <Select
          label={t('common.status')}
          fullWidth
          value={statusForm.status}
          onChange={(status) => setStatusForm({ ...statusForm, status })}
          options={changeStatusOptions.map((s) => ({
            value: s,
            label: statusLabels[s] || s,
          }))}
        />

        <Input label={t('common.comment')} value={statusForm.comment} onChange={(e) => setStatusForm({ ...statusForm, comment: e.target.value })} />

        <Button variant="primary" fullWidth onClick={() => statusMutation.mutate()}>{t('common.save')}</Button>

      </Modal>



      <Modal open={negotiationModal} title={t('roomStatus.negotiation')} onClose={() => setNegotiationModal(false)}>

        <Input
          label={t('common.potentialTenant')}
          required
          value={negotiationForm.tenantName}
          onChange={(e) => setNegotiationForm({ ...negotiationForm, tenantName: e.target.value })}
        />

        <Input label={t('common.contactPerson')} value={negotiationForm.contactPerson} onChange={(e) => setNegotiationForm({ ...negotiationForm, contactPerson: e.target.value })} />

        <Input label={t('common.phone')} value={negotiationForm.phone} onChange={(e) => setNegotiationForm({ ...negotiationForm, phone: e.target.value })} />

        <Input label={t('common.desiredMoveIn')} type="date" value={negotiationForm.plannedStartDate} onChange={(e) => setNegotiationForm({ ...negotiationForm, plannedStartDate: e.target.value })} />

        <Input label={t('common.expectedRate')} value={negotiationForm.expectedRate} onChange={(e) => setNegotiationForm({ ...negotiationForm, expectedRate: e.target.value })} />

        <Input label={t('common.nextContact')} type="date" value={negotiationForm.nextContactDate} onChange={(e) => setNegotiationForm({ ...negotiationForm, nextContactDate: e.target.value })} />

        <Input label={t('common.comment')} value={negotiationForm.comment} onChange={(e) => setNegotiationForm({ ...negotiationForm, comment: e.target.value })} />

        <Button variant="primary" fullWidth onClick={() => negotiationMutation.mutate()}>{t('common.save')}</Button>

      </Modal>



      <Modal open={paymentModal} title={t('common.addPayment')} onClose={() => setPaymentModal(false)}>

        <Input
          label={t('common.amount')}
          required
          value={payForm.amount}
          onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
        />

        <Input
          label={t('common.date')}
          type="date"
          required
          value={payForm.paymentDate}
          onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })}
        />

        <Button variant="primary" fullWidth onClick={() => payMutation.mutate()}>{t('common.save')}</Button>

      </Modal>

    </div>

  );

}

