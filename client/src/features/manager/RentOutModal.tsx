import { useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';

import { api } from '@/api/client';

import { useI18n } from '@/i18n/useI18n';

import { Modal } from '@/components/modals/Modal';

import { Input } from '@/components/ui/Input';

import { Select } from '@/components/ui/Select';

import { Button } from '@/components/ui/Button';

import styles from './RentOutModal.module.css';



export interface RentOutPayload {

  tenantId?: number;

  tenant?: {

    name: string;

    legalType: string;

    unp?: string;

    contactPerson?: string;

    phone?: string;

    email?: string;

    comment?: string;

  };

  contractNumber: string;

  contractDate: string;

  startDate: string;

  endDate?: string | null;

  rateWithoutVat: number;

  vatRate: number;

  paymentDay?: number;

  comment?: string;

}



export type RentOutModalMode = 'assign' | 'reassign';

interface Props {

  open: boolean;

  roomId: number | null;

  defaultRate?: number;

  mode?: RentOutModalMode;

  onClose: () => void;

  onSubmit: (payload: RentOutPayload) => void;

  loading?: boolean;

}



const LEGAL_TYPE_CODES = [
  { value: 'ip', key: 'common.ip' },
  { value: 'ooo', key: 'common.llc' },
  { value: 'chp', key: 'common.pe' },
  { value: 'individual', key: 'common.individual' },
  { value: 'other', key: 'common.other' },
] as const;



export function RentOutModal({ open, roomId, defaultRate, mode: rentMode = 'assign', onClose, onSubmit, loading }: Props) {

  const { t } = useI18n();

  const [tenantMode, setTenantMode] = useState<'existing' | 'new'>('existing');

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

  const [contractNumber, setContractNumber] = useState('');

  const [contractDate, setContractDate] = useState('');

  const [startDate, setStartDate] = useState('');

  const [endDate, setEndDate] = useState('');

  const [rateWithoutVat, setRateWithoutVat] = useState(String(defaultRate ?? 21));

  const [vatRate, setVatRate] = useState('20');

  const [paymentDay, setPaymentDay] = useState('10');

  const [comment, setComment] = useState('');



  const { data: tenants } = useQuery({

    queryKey: ['tenants'],

    queryFn: () => api.get('/tenants').then((r) => r.data.data),

    enabled: open,

  });



  const rateWithVat = useMemo(() => {

    const r = Number(rateWithoutVat);

    const v = Number(vatRate);

    if (!r || Number.isNaN(r)) return t('common.dash');

    return (r * (1 + v / 100)).toFixed(2);

  }, [rateWithoutVat, vatRate, t]);



  const handleSubmit = () => {

    if (!roomId) return;

    const payload: RentOutPayload = {

      contractNumber,

      contractDate: contractDate || startDate,

      startDate,

      endDate: endDate || null,

      rateWithoutVat: Number(rateWithoutVat),

      vatRate: Number(vatRate),

      paymentDay: Number(paymentDay) || undefined,

      comment: comment || undefined,

    };

    if (tenantMode === 'existing' && tenantId) {

      payload.tenantId = Number(tenantId);

    } else if (tenantMode === 'new' && tenant.name) {

      payload.tenant = tenant;

    } else return;

    onSubmit(payload);

  };



  return (

    <Modal
      open={open}
      title={rentMode === 'reassign' ? t('rooms.changeWithNewContract') : t('mapPage.rentOutTitle')}
      onClose={onClose}
    >
      {rentMode === 'reassign' && (
        <p className={styles.calc}>{t('rooms.reassignHint')}</p>
      )}

      <div className={styles.modeToggle}>

        <button type="button" className={tenantMode === 'existing' ? styles.active : ''} onClick={() => setTenantMode('existing')}>

          {t('common.existingTenant')}

        </button>

        <button type="button" className={tenantMode === 'new' ? styles.active : ''} onClick={() => setTenantMode('new')}>

          {t('common.createNew')}

        </button>

      </div>



      {tenantMode === 'existing' ? (

        <>

          <Select
            label={t('common.tenant')}
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

        </>

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

          <Input label={t('common.contactPerson')} value={tenant.contactPerson} onChange={(e) => setTenant({ ...tenant, contactPerson: e.target.value })} />

          <Input label={t('common.phone')} value={tenant.phone} onChange={(e) => setTenant({ ...tenant, phone: e.target.value })} />

          <Input label={t('common.email')} value={tenant.email} onChange={(e) => setTenant({ ...tenant, email: e.target.value })} />

        </>

      )}



      <Input
        label={t('common.contractNumber')}
        required
        value={contractNumber}
        onChange={(e) => setContractNumber(e.target.value)}
      />

      <Input label={t('common.contractDate')} type="date" value={contractDate} onChange={(e) => setContractDate(e.target.value)} />

      <Input
        label={t('common.rentStart')}
        type="date"
        required
        value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
      />

      <Input label={t('common.rentEnd')} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />

      <Input
        label={t('common.rateNoVat')}
        required
        value={rateWithoutVat}
        onChange={(e) => setRateWithoutVat(e.target.value)}
      />

      <Input
        label={t('common.vatRate')}
        required
        value={vatRate}
        onChange={(e) => setVatRate(e.target.value)}
      />

      <p className={styles.calc}>{t('common.rateWithVatCalc', { value: rateWithVat })}</p>

      <Input label={t('common.paymentDay')} type="number" min={1} max={28} value={paymentDay} onChange={(e) => setPaymentDay(e.target.value)} />

      <Input label={t('common.comment')} value={comment} onChange={(e) => setComment(e.target.value)} />

      <Button variant="primary" fullWidth onClick={handleSubmit} disabled={loading || !roomId}>

        {t('common.save')}

      </Button>

    </Modal>

  );

}

