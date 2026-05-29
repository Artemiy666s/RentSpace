import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { api } from '@/api/client';
import { useI18n } from '@/i18n/useI18n';
import { Modal } from '@/components/modals/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import listingStyles from '@/styles/listingPage.module.css';

export type RentChargeRow = {
  id: number;
  tenant_name: string;
  area: number;
  rate_without_vat?: number;
  vat_rate?: number;
  amount_without_vat: number;
  vat_amount?: number;
  amount_with_vat: number;
  status: string;
  period_year: number;
  period_month: number;
  adjustment_reason?: string | null;
};

type Props = {
  charge: RentChargeRow | null;
  open: boolean;
  onClose: () => void;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function ChargeEditModal({ charge, open, onClose }: Props) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [amountWithoutVat, setAmountWithoutVat] = useState('');
  const [amountWithVat, setAmountWithVat] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!charge) return;
    setAmountWithoutVat(String(charge.amount_without_vat ?? ''));
    setAmountWithVat(String(charge.amount_with_vat ?? ''));
    setReason(charge.adjustment_reason || '');
    setError(null);
  }, [charge]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!charge) return;
      const without = Number(amountWithoutVat);
      const withVat = Number(amountWithVat);
      const vatAmount = round2(withVat - without);
      return api.put(`/rent-charges/${charge.id}/adjust`, {
        amountWithoutVat: without,
        vatAmount,
        amountWithVat: withVat,
        adjustmentReason: reason.trim(),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rent-charges'] });
      onClose();
    },
    onError: (err: AxiosError<{ error?: string }>) => {
      setError(err.response?.data?.error || t('common.profileSaveFailed'));
    },
  });

  if (!charge) return null;

  const statusLabel =
    charge.status === 'charged'
      ? t('charges.statusCharged')
      : charge.status === 'cancelled'
        ? t('charges.statusCancelled')
        : charge.status;

  return (
    <Modal open={open} title={charge.tenant_name} onClose={onClose} wide>
      <dl className={listingStyles.metaGrid}>
        <dt>{t('common.period')}</dt>
        <dd>
          {charge.period_month}.{charge.period_year}
        </dd>
        <dt>{t('common.area')}</dt>
        <dd>
          {Number(charge.area).toFixed(2)} {t('common.sqm')}
        </dd>
        <dt>{t('common.status')}</dt>
        <dd>{statusLabel}</dd>
      </dl>
      <Input
        label={t('common.withoutVat')}
        type="number"
        step="0.01"
        required
        value={amountWithoutVat}
        onChange={(e) => {
          const next = e.target.value;
          setAmountWithoutVat(next);
          const vatRate = Number(charge.vat_rate) || 0;
          const n = Number(next);
          if (!Number.isNaN(n) && vatRate > 0) {
            const withVat = round2(n * (1 + vatRate / 100));
            setAmountWithVat(String(withVat));
          }
        }}
      />
      <Input
        label={t('common.withVat')}
        type="number"
        step="0.01"
        required
        value={amountWithVat}
        onChange={(e) => setAmountWithVat(e.target.value)}
      />
      <Input
        label={t('charges.adjustmentReason')}
        required
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {error && <p className={listingStyles.formError}>{error}</p>}
      <div className={listingStyles.formActions}>
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="primary"
          disabled={saveMutation.isPending || !reason.trim()}
          onClick={() => saveMutation.mutate()}
        >
          {t('common.save')}
        </Button>
      </div>
    </Modal>
  );
}
