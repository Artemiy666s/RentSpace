import { useState, useMemo } from 'react';

import { useQuery } from '@tanstack/react-query';

import { Link } from 'react-router-dom';

import {

  Key,

  LogOut,

  FilePlus,

  CreditCard,

  History,

  MessageSquare,

  RefreshCw,

  Handshake,

  UserRoundPen,

} from 'lucide-react';

import { api } from '@/api/client';

import { useI18n } from '@/i18n/useI18n';

import { useRoomStatusLabels } from '@/i18n/roomStatus';

import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';

import { Card } from '@/components/ui/Card';

import styles from './RoomDetailsPanel.module.css';



const ROOM_TYPE_KEYS: Record<string, string> = {

  retail: 'common.retail',

  office: 'common.office',

  storage: 'common.warehouse',

  food: 'common.food',

  service: 'common.services',

  other: 'common.misc',

};



const TENANT_STATE_KEYS: Record<string, string> = {

  active: 'common.tenantActive',

  negotiation: 'common.tenantNegotiation',

  debt: 'common.tenantDebt',

  inactive: 'common.tenantInactive',

};



export interface RoomDetail {

  id: number;

  room_number: string;

  name?: string;

  area: number;

  rentable_area?: number;

  status: string;

  room_type?: string;

  comment?: string;

  current_rate_without_vat?: number;

  rateWithoutVat?: number;

  rateWithVat?: number;

  vatRate?: number;

  building?: { name: string };

  floor?: { name: string };

  tenant?: { id: number; name: string; status?: string } | null;

  contract?: {

    id: number;

    contract_number: string;

    contract_date?: string;

    start_date: string;

    end_date?: string;

  } | null;

  negotiation?: {

    id?: number;

    tenant_name: string;

    planned_start_date?: string;

    expected_rate_without_vat?: number;

    status: string;

    next_contact_date?: string;

    comment?: string;

  } | null;

  monthlyCharged?: number;

  monthlyUtilities?: number;

  monthlyPaid?: number;

  debt?: number;

}



interface Props {

  room: RoomDetail | null;

  loading?: boolean;

  onRentOut: () => void;

  onChangeTenant?: () => void;

  onVacate: () => void;

  onAddPayment: () => void;

  onChangeStatus?: () => void;

  onNegotiate?: () => void;

  onAddComment?: () => void;

}



export function RoomDetailsPanel({

  room,

  loading,

  onRentOut,

  onChangeTenant,

  onVacate,

  onAddPayment,

  onChangeStatus,

  onNegotiate,

  onAddComment,

}: Props) {

  const { t } = useI18n();

  const statusLabels = useRoomStatusLabels();

  const [tab, setTab] = useState<'info' | 'history'>('info');



  const { data: history, isLoading: historyLoading } = useQuery({

    queryKey: ['room-history', room?.id],

    queryFn: () => api.get(`/rooms/${room!.id}/history`).then((r) => r.data.data),

    enabled: !!room?.id && tab === 'history',

  });



  const roomTypeLabel = useMemo(() => {

    if (!room?.room_type) return t('common.dash');

    const key = ROOM_TYPE_KEYS[room.room_type];

    return key ? t(key) : room.room_type;

  }, [room?.room_type, t]);



  if (loading) return <Card className={styles.panel}><p>{t('common.loading')}</p></Card>;

  if (!room) {

    return (

      <Card className={styles.panel}>

        <p className={styles.empty}>{t('common.selectRoomOnPlan')}</p>

      </Card>

    );

  }



  const rateWoVat = room.rateWithoutVat ?? room.current_rate_without_vat;

  const vat = room.vatRate ?? 20;

  const rateWithVat = room.rateWithVat ?? (rateWoVat ? rateWoVat * (1 + vat / 100) : null);

  const tenantState = room.tenant?.status

    ? (TENANT_STATE_KEYS[room.tenant.status] ? t(TENANT_STATE_KEYS[room.tenant.status]) : room.tenant.status)

    : room.negotiation

      ? t('common.tenantNegotiation')

      : t('common.absent');



  const isFree = room.status === 'free' || room.status === 'ready_for_rent';

  const isOccupied = room.status === 'occupied' || room.status === 'debt';

  const isNegotiation = room.status === 'negotiation';



  const formatRate = (value: number | null | undefined) =>

    value != null ? `${Number(value).toFixed(2)} ${t('common.currencyByn')}/${t('common.sqm')}` : t('common.dash');



  return (

    <Card className={styles.panel}>

      <div className={styles.header}>

        <h2>{t('common.roomTitle', { no: room.room_number })}</h2>

        <StatusBadge status={room.status}>
          {statusLabels[room.status] || room.status}
        </StatusBadge>

      </div>



      <div className={styles.tabs}>

        <button type="button" className={tab === 'info' ? styles.tabActive : ''} onClick={() => setTab('info')}>

          {t('common.data')}

        </button>

        <button type="button" className={tab === 'history' ? styles.tabActive : ''} onClick={() => setTab('history')}>

          <History size={14} /> {t('common.history')}

        </button>

      </div>



      {tab === 'info' && (

        <>

          <dl className={styles.meta}>

            <dt>{t('common.area')}</dt><dd>{room.area} {t('common.sqm')}</dd>

            {room.rentable_area != null && (

              <>

                <dt>{t('common.rentable')}</dt><dd>{room.rentable_area} {t('common.sqm')}</dd>

              </>

            )}

            <dt>{t('common.building')}</dt><dd>{room.building?.name || t('common.dash')}</dd>

            <dt>{t('common.floor')}</dt><dd>{room.floor?.name || t('common.dash')}</dd>

            <dt>{t('common.type')}</dt><dd>{roomTypeLabel}</dd>

            <dt>{t('common.tenant')}</dt><dd>{room.tenant?.name || t('common.dash')}</dd>

            <dt>{t('common.tenantState')}</dt><dd>{tenantState}</dd>

            {room.contract && (

              <>

                <dt>{t('common.contract')}</dt><dd>{room.contract.contract_number}</dd>

                <dt>{t('common.contractDate')}</dt><dd>{room.contract.contract_date || t('common.dash')}</dd>

                <dt>{t('common.rent')}</dt>

                <dd>

                  {room.contract.start_date} — {room.contract.end_date || t('common.indefinite')}

                </dd>

              </>

            )}

            <dt>{t('common.rateWithoutVat')}</dt>

            <dd>{formatRate(rateWoVat)}</dd>

            <dt>{t('common.rateWithVat')}</dt>

            <dd>{formatRate(rateWithVat)}</dd>

            <dt>{t('common.accrued')}</dt><dd>{(room.monthlyCharged ?? 0).toFixed(2)} {t('common.currencyByn')}</dd>

            <dt>{t('common.utilities')}</dt><dd>{(room.monthlyUtilities ?? 0).toFixed(2)} {t('common.currencyByn')}</dd>

            <dt>{t('common.paid')}</dt><dd>{(room.monthlyPaid ?? 0).toFixed(2)} {t('common.currencyByn')}</dd>

            <dt>{t('common.debt')}</dt>

            <dd className={room.debt && room.debt > 0 ? styles.debt : ''}>

              {(room.debt ?? 0).toFixed(2)} {t('common.currencyByn')}

            </dd>

            {room.negotiation && (

              <>

                <dt>{t('roomStatus.negotiation')}</dt><dd>{room.negotiation.tenant_name}</dd>

                <dt>{t('common.plannedMoveIn')}</dt><dd>{room.negotiation.planned_start_date || t('common.dash')}</dd>

                <dt>{t('common.nextContact')}</dt><dd>{room.negotiation.next_contact_date || t('common.dash')}</dd>

              </>

            )}

            {room.comment && (

              <>

                <dt>{t('common.comment')}</dt><dd>{room.comment}</dd>

              </>

            )}

          </dl>



          <div className={styles.actions}>

            {isFree && (

              <Button variant="primary" fullWidth onClick={onRentOut}>

                <Key size={18} /> {t('mapPage.rentOutTitle')}

              </Button>

            )}

            {isFree && onNegotiate && (

              <Button variant="secondary" fullWidth onClick={onNegotiate}>

                <Handshake size={18} /> {t('roomStatus.negotiation')}

              </Button>

            )}

            {isNegotiation && (

              <>

                <Button variant="primary" fullWidth onClick={onRentOut}>

                  <FilePlus size={18} /> {t('common.createContract')}

                </Button>

                {onNegotiate && (

                  <Button variant="secondary" fullWidth onClick={onNegotiate}>

                    {t('common.changeNegotiations')}

                  </Button>

                )}

              </>

            )}

            {isOccupied && (

              <>

                {onChangeTenant && (
                  <Button variant="secondary" fullWidth onClick={onChangeTenant}>
                    <UserRoundPen size={18} /> {t('rooms.changeTenant')}
                  </Button>
                )}

                <Button variant="primary" fullWidth onClick={onAddPayment}>

                  <CreditCard size={18} /> {t('common.addPayment')}

                </Button>

                {room.contract && (

                  <Link to={`/tenants-contracts?contract=${room.contract.id}`}>

                    <Button variant="secondary" fullWidth>

                      <FilePlus size={18} /> {t('common.openContract')}

                    </Button>

                  </Link>

                )}

                <Button variant="secondary" fullWidth onClick={onVacate}>

                  <LogOut size={18} /> {t('common.vacate')}

                </Button>

              </>

            )}

            {room.status === 'debt' && (

              <Button variant="primary" fullWidth onClick={onAddPayment}>

                <CreditCard size={18} /> {t('common.addPayment')}

              </Button>

            )}

            {onChangeStatus && (

              <Button variant="ghost" fullWidth onClick={onChangeStatus}>

                <RefreshCw size={18} /> {t('common.editStatus')}

              </Button>

            )}

            {onAddComment && (

              <Button variant="ghost" fullWidth onClick={onAddComment}>

                <MessageSquare size={18} /> {t('common.comment')}

              </Button>

            )}

          </div>

        </>

      )}



      {tab === 'history' && (

        <div className={styles.history}>

          {historyLoading && <p>{t('common.loadingHistory')}</p>}

          {!historyLoading && (

            <>

              <h4>{t('common.statuses')}</h4>

              <ul className={styles.historyList}>

                {(history?.statusHistory || []).map((h: {

                  id: number;

                  old_status: string;

                  new_status: string;

                  created_at: string;

                  changed_by_name?: string;

                  comment?: string;

                }) => (

                  <li key={h.id}>

                    <strong>{statusLabels[h.new_status] || h.new_status}</strong>

                    <small>

                      {new Date(h.created_at).toLocaleString()}

                      {h.changed_by_name ? ` · ${h.changed_by_name}` : ''}

                    </small>

                    {h.comment && <span>{h.comment}</span>}

                  </li>

                ))}

              </ul>

              <h4>{t('common.contracts')}</h4>

              <ul className={styles.historyList}>

                {(history?.contracts || []).map((c: {

                  id: number;

                  contract_number: string;

                  tenant_name: string;

                  start_date: string;

                  actual_end_date?: string;

                }) => (

                  <li key={c.id}>

                    {c.contract_number} — {c.tenant_name}

                    <small>{c.start_date} — {c.actual_end_date || t('common.active')}</small>

                  </li>

                ))}

              </ul>

            </>

          )}

        </div>

      )}

    </Card>

  );

}

