import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useI18n } from '@/i18n/useI18n';
import { useRoomStatusLabels } from '@/i18n/roomStatus';
import { ROOM_STATUS_ORDER } from '@/constants/roomStatus';
import { Modal } from '@/components/modals/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import styles from './RoomEditModal.module.css';

export interface RoomListRow {
  id: number;
  room_number: string;
  building_name: string;
  floor_name: string;
  area: number;
  status: string;
  tenant_name?: string;
  tenant_id?: number;
  contract_id?: number;
  vat_rate?: number;
  contract_rate_without_vat?: number;
  current_rate_without_vat?: number;
}

interface RoomDetails {
  id: number;
  room_number: string;
  name?: string;
  area: number;
  status: string;
  current_rate_without_vat?: number;
  recommended_rate_without_vat?: number;
  tenant?: { id: number; name: string } | null;
  contract?: { id: number; vat_rate?: number; rate_without_vat?: number } | null;
  rateWithoutVat?: number;
  vatRate?: number;
  building?: { name: string };
  floor?: { name: string };
}

interface Props {
  roomId: number | null;
  onClose: () => void;
  onSaved: () => void;
  onRentOut: (roomId: number, defaultRate?: number) => void;
  onChangeTenant?: (roomId: number) => void;
}

export function RoomEditModal({ roomId, onClose, onSaved, onRentOut, onChangeTenant }: Props) {
  const { t } = useI18n();
  const statusLabels = useRoomStatusLabels();
  const [roomNumber, setRoomNumber] = useState('');
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [status, setStatus] = useState('free');
  const [tenantId, setTenantId] = useState('');
  const [rateWithoutVat, setRateWithoutVat] = useState('');
  const [vatRate, setVatRate] = useState('20');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: room, isLoading } = useQuery({
    queryKey: ['room', roomId],
    queryFn: () => api.get(`/rooms/${roomId}`).then((r) => r.data.data as RoomDetails),
    enabled: !!roomId,
  });

  const { data: tenants } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => api.get('/tenants').then((r) => r.data.data as { id: number; name: string }[]),
    enabled: !!roomId,
  });

  useEffect(() => {
    if (!room) return;
    setRoomNumber(room.room_number ?? '');
    setName(room.name ?? '');
    setArea(String(room.area ?? ''));
    setStatus(room.status ?? 'free');
    const rate =
      room.rateWithoutVat ??
      room.contract?.rate_without_vat ??
      room.current_rate_without_vat ??
      room.recommended_rate_without_vat;
    setRateWithoutVat(rate != null ? String(rate) : '');
    setVatRate(String(room.vatRate ?? room.contract?.vat_rate ?? 20));
    setTenantId(room.tenant?.id ? String(room.tenant.id) : '');
    setError(null);
  }, [room]);

  const rateWithVat = useMemo(() => {
    const r = Number(rateWithoutVat);
    const v = Number(vatRate);
    if (!r || Number.isNaN(r)) return t('common.dash');
    return (r * (1 + v / 100)).toFixed(2);
  }, [rateWithoutVat, vatRate, t]);

  const hasLease = !!room?.contract?.id || !!room?.tenant;

  const handleSave = async () => {
    if (!roomId) return;
    setSaving(true);
    setError(null);
    try {
      const areaNum = Number(area);
      if (!roomNumber.trim()) {
        setError(t('rooms.roomNumberRequired'));
        return;
      }
      if (!areaNum || Number.isNaN(areaNum)) {
        setError(t('rooms.areaRequired'));
        return;
      }

      await api.put(`/rooms/${roomId}`, {
        roomNumber: roomNumber.trim(),
        name: name.trim() || roomNumber.trim(),
        area: areaNum,
        rentableArea: areaNum,
        status,
        currentRate: rateWithoutVat.trim() === '' ? null : Number(rateWithoutVat),
      });

      if (hasLease) {
        const leasePatch: { tenantId?: number; rateWithoutVat?: number; vatRate: number } = {
          vatRate: Number(vatRate) || 20,
        };
        if (tenantId) leasePatch.tenantId = Number(tenantId);
        if (rateWithoutVat.trim() !== '') leasePatch.rateWithoutVat = Number(rateWithoutVat);
        if (leasePatch.tenantId != null || leasePatch.rateWithoutVat != null) {
          await api.patch(`/rooms/${roomId}/lease`, leasePatch);
        }
      }

      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      setError(msg ?? t('mapEditor.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const canRentOut =
    room &&
    !hasLease &&
    ['free', 'ready_for_rent', 'negotiation', 'reserved'].includes(room.status);

  return (
    <Modal
      open={!!roomId}
      title={t('rooms.editTitle', { num: (room?.room_number ?? roomNumber) || '…' })}
      onClose={onClose}
    >
      {isLoading ? (
        <p>{t('common.loading')}</p>
      ) : (
        <>
          <p className={styles.meta}>
            {room?.building?.name} · {room?.floor?.name}
          </p>

          <div className={styles.grid}>
            <Input
              label={t('common.roomNumber')}
              required
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
            />
            <Input
              label={t('common.name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              label={t('common.areaSqm')}
              type="number"
              step="0.01"
              required
              value={area}
              onChange={(e) => setArea(e.target.value)}
            />
            <Select
              label={t('common.status')}
              fullWidth
              value={status}
              onChange={setStatus}
              options={ROOM_STATUS_ORDER.map((k) => ({
                value: k,
                label: statusLabels[k],
              }))}
            />
          </div>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('common.tenant')}</h3>
            {hasLease ? (
              <Select
                label={t('common.tenant')}
                fullWidth
                required
                placeholder={t('common.selectPlaceholder')}
                value={tenantId}
                onChange={setTenantId}
                options={[
                  { value: '', label: t('common.selectPlaceholder') },
                  ...(tenants?.map((tn) => ({
                    value: String(tn.id),
                    label: tn.name,
                  })) ?? []),
                ]}
              />
            ) : (
              <p className={styles.hint}>{t('rooms.noTenantHint')}</p>
            )}
            {canRentOut && (
              <Button
                type="button"
                variant="secondary"
                fullWidth
                onClick={() => {
                  if (roomId) {
                    onClose();
                    onRentOut(
                      roomId,
                      Number(rateWithoutVat) ||
                        room.recommended_rate_without_vat ||
                        room.current_rate_without_vat
                    );
                  }
                }}
              >
                {t('rooms.rentOutAction')}
              </Button>
            )}
            {hasLease && onChangeTenant && roomId && (
              <Button
                type="button"
                variant="secondary"
                fullWidth
                onClick={() => {
                  onClose();
                  onChangeTenant(roomId);
                }}
              >
                {t('rooms.changeTenant')}
              </Button>
            )}
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('common.rateWithVatShort')}</h3>
            <div className={styles.grid}>
              <Input
                label={t('rooms.rateWithoutVat')}
                type="number"
                step="0.01"
                value={rateWithoutVat}
                onChange={(e) => setRateWithoutVat(e.target.value)}
              />
              <Input
                label={t('rooms.vatPercent')}
                type="number"
                step="1"
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
              />
            </div>
            <p className={styles.rateHint}>
              {t('rooms.rateWithVat')}: <strong>{rateWithVat}</strong> {t('common.currencyByn')}
            </p>
          </section>

          {error && <p className={styles.error}>{error}</p>}

          <Button variant="primary" fullWidth onClick={handleSave} disabled={saving}>
            {saving ? t('mapEditor.saving') : t('common.save')}
          </Button>
        </>
      )}
    </Modal>
  );
}
