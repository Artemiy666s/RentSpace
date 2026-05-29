import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useI18n } from '@/i18n/useI18n';
import { Modal } from '@/components/modals/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import styles from './RentOutModal.module.css';

const LEGAL_TYPE_CODES = [
  { value: 'ip', key: 'common.ip' },
  { value: 'ooo', key: 'common.llc' },
  { value: 'chp', key: 'common.pe' },
  { value: 'individual', key: 'common.individual' },
  { value: 'other', key: 'common.other' },
] as const;

interface Props {
  open: boolean;
  roomId: number | null;
  currentTenantName?: string;
  defaultRate?: number;
  defaultVat?: number;
  onClose: () => void;
  onSaved: () => void;
  onNewContract?: (roomId: number) => void;
}

export function ChangeTenantModal({
  open,
  roomId,
  currentTenantName,
  defaultRate,
  defaultVat,
  onClose,
  onSaved,
  onNewContract,
}: Props) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [tenantId, setTenantId] = useState('');
  const [tenant, setTenant] = useState({
    name: '',
    legalType: 'ooo',
    unp: '',
    contactPerson: '',
    phone: '',
    email: '',
    comment: '',
  });
  const [rateWithoutVat, setRateWithoutVat] = useState('');
  const [vatRate, setVatRate] = useState('20');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: tenants } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => api.get('/tenants').then((r) => r.data.data),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setMode('existing');
    setTenantId('');
    setRateWithoutVat(defaultRate != null ? String(defaultRate) : '');
    setVatRate(String(defaultVat ?? 20));
    setError(null);
  }, [open, defaultRate, defaultVat]);

  const rateWithVat = useMemo(() => {
    const r = Number(rateWithoutVat);
    const v = Number(vatRate);
    if (!r || Number.isNaN(r)) return t('common.dash');
    return (r * (1 + v / 100)).toFixed(2);
  }, [rateWithoutVat, vatRate, t]);

  const handleSave = async () => {
    if (!roomId) return;
    setSaving(true);
    setError(null);
    try {
      if (mode === 'existing' && !tenantId) {
        setError(t('rooms.selectTenantRequired'));
        return;
      }
      if (mode === 'new' && !tenant.name.trim()) {
        setError(t('rooms.tenantNameRequired'));
        return;
      }

      if (mode === 'new') {
        const created = await api.post('/tenants', {
          name: tenant.name.trim(),
          legalType: tenant.legalType,
          unp: tenant.unp || undefined,
          contactPerson: tenant.contactPerson || undefined,
          phone: tenant.phone || undefined,
          email: tenant.email || undefined,
          comment: tenant.comment || undefined,
        });
        const newId = created.data.data.id;
        await api.patch(`/rooms/${roomId}/lease`, {
          tenantId: newId,
          rateWithoutVat: rateWithoutVat.trim() === '' ? undefined : Number(rateWithoutVat),
          vatRate: Number(vatRate) || 20,
        });
      } else {
        await api.patch(`/rooms/${roomId}/lease`, {
          tenantId: Number(tenantId),
          rateWithoutVat: rateWithoutVat.trim() === '' ? undefined : Number(rateWithoutVat),
          vatRate: Number(vatRate) || 20,
        });
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

  return (
    <Modal open={open} title={t('rooms.changeTenantTitle')} onClose={onClose}>
      {currentTenantName && (
        <p className={styles.calc}>
          {t('rooms.currentTenant')}: <strong>{currentTenantName}</strong>
        </p>
      )}

      <div className={styles.modeToggle}>
        <button type="button" className={mode === 'existing' ? styles.active : ''} onClick={() => setMode('existing')}>
          {t('common.existingTenant')}
        </button>
        <button type="button" className={mode === 'new' ? styles.active : ''} onClick={() => setMode('new')}>
          {t('common.createNew')}
        </button>
      </div>

      {mode === 'existing' ? (
        <Select
          label={t('rooms.newTenant')}
          fullWidth
          required
          placeholder={t('common.selectPlaceholder')}
          value={tenantId}
          onChange={setTenantId}
          options={[
            { value: '', label: t('common.selectPlaceholder') },
            ...(tenants?.map((tn: { id: number; name: string }) => ({
              value: String(tn.id),
              label: tn.name,
            })) ?? []),
          ]}
        />
      ) : (
        <>
          <Input
            label={t('common.tenantName')}
            required
            value={tenant.name}
            onChange={(e) => setTenant({ ...tenant, name: e.target.value })}
          />
          <Select
            label={t('common.legalForm')}
            fullWidth
            value={tenant.legalType}
            onChange={(legalType) => setTenant({ ...tenant, legalType })}
            options={LEGAL_TYPE_CODES.map((lt) => ({
              value: lt.value,
              label: t(lt.key),
            }))}
          />
          <Input label={t('common.unp')} value={tenant.unp} onChange={(e) => setTenant({ ...tenant, unp: e.target.value })} />
        </>
      )}

      <Input
        label={t('rooms.rateWithoutVat')}
        type="number"
        step="0.01"
        value={rateWithoutVat}
        onChange={(e) => setRateWithoutVat(e.target.value)}
      />
      <Input label={t('rooms.vatPercent')} type="number" value={vatRate} onChange={(e) => setVatRate(e.target.value)} />
      <p className={styles.calc}>
        {t('common.rateWithVatCalc', { value: rateWithVat })}
      </p>

      {error && <p className={styles.error}>{error}</p>}

      <Button variant="primary" fullWidth onClick={handleSave} disabled={saving || !roomId}>
        {saving ? t('common.saving') : t('rooms.saveTenantChange')}
      </Button>

      {onNewContract && roomId && (
        <Button
          variant="ghost"
          fullWidth
          onClick={() => {
            onClose();
            onNewContract(roomId);
          }}
        >
          {t('rooms.changeWithNewContract')}
        </Button>
      )}
    </Modal>
  );
}
