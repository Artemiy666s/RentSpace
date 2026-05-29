import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { api } from '@/api/client';
import { useI18n } from '@/i18n/useI18n';
import { Modal } from '@/components/modals/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import listingStyles from '@/styles/listingPage.module.css';

export type PaymentRow = {
  id: number;
  tenant_name: string;
  payment_date: string;
  amount: number;
  payment_type: string;
  period_year?: number;
  period_month?: number;
  purpose?: string | null;
  comment?: string | null;
};

type Props = {
  payment: PaymentRow | null;
  open: boolean;
  onClose: () => void;
};

export function PaymentEditModal({ payment, open, onClose }: Props) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [paymentDate, setPaymentDate] = useState('');
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!payment) return;
    const d = payment.payment_date;
    setPaymentDate(typeof d === 'string' ? d.slice(0, 10) : '');
    setAmount(String(payment.amount ?? ''));
    setPurpose(payment.purpose || '');
    setComment(payment.comment || '');
    setError(null);
  }, [payment]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!payment) return;
      return api.put(`/payments/${payment.id}`, {
        paymentDate,
        amount: Number(amount),
        purpose: purpose.trim() || null,
        comment: comment.trim() || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      onClose();
    },
    onError: (err: AxiosError<{ error?: string }>) => {
      setError(err.response?.data?.error || t('common.profileSaveFailed'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!payment) return;
      return api.delete(`/payments/${payment.id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      onClose();
    },
    onError: (err: AxiosError<{ error?: string }>) => {
      setError(err.response?.data?.error || t('common.profileSaveFailed'));
    },
  });

  if (!payment) return null;

  return (
    <Modal open={open} title={payment.tenant_name} onClose={onClose} wide>
      <Input
        label={t('common.date')}
        type="date"
        required
        value={paymentDate}
        onChange={(e) => setPaymentDate(e.target.value)}
      />
      <Input
        label={t('common.amount')}
        type="number"
        step="0.01"
        required
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <Input label={t('payments.purpose')} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
      <Input label={t('common.comment')} value={comment} onChange={(e) => setComment(e.target.value)} />
      <dl className={listingStyles.metaGrid}>
        <dt>{t('common.type')}</dt>
        <dd>{payment.payment_type}</dd>
        {payment.period_month != null && (
          <>
            <dt>{t('common.period')}</dt>
            <dd>
              {payment.period_month}.{payment.period_year}
            </dd>
          </>
        )}
      </dl>
      {error && <p className={listingStyles.formError}>{error}</p>}
      <div className={listingStyles.formActions}>
        <Button
          variant="ghost"
          disabled={deleteMutation.isPending}
          onClick={() => {
            if (!window.confirm(t('payments.deleteConfirm'))) return;
            deleteMutation.mutate();
          }}
        >
          {t('common.delete')}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button variant="primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          {t('common.save')}
        </Button>
      </div>
    </Modal>
  );
}
