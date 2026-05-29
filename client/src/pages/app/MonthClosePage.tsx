import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Building2,
  FileText,
  CreditCard,
  Wallet,
  Zap,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';
import { api } from '@/api/client';
import { usePropertyStore } from '@/store/propertyStore';
import { useI18n } from '@/i18n/useI18n';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { monthSelectOptions } from '@/i18n/months';
import { Card } from '@/components/ui/Card';
import { downloadApiFile } from '@/lib/exportFile';
import styles from './MonthClosePage.module.css';

interface CheckResult {
  ok: boolean;
  errors: { message: string; roomId?: number; contractId?: number }[];
  warnings: { message: string }[];
  checklist?: {
    roomsChecked: boolean;
    roomsTotal: number;
    chargesGenerated: boolean;
    chargesCount: number;
    utilitiesEntered: boolean;
    utilitiesCount: number;
    paymentsEntered: boolean;
    paymentsCount: number;
    expensesEntered: boolean;
    expensesCount: number;
    hasErrors: boolean;
  };
}

export function MonthClosePage() {
  const { t, locale } = useI18n();
  const { propertyId, setPropertyId } = usePropertyStore();
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);

  const { data: properties } = useQuery({
    queryKey: ['properties'],
    queryFn: () => api.get('/properties').then((r) => r.data.data),
  });
  const pid = propertyId || properties?.[0]?.id;

  const periodLabel = useMemo(() => {
    const loc = locale === 'be' ? 'be' : locale === 'en' ? 'en' : 'ru';
    const name = new Intl.DateTimeFormat(loc, { month: 'long' }).format(new Date(year, month - 1, 1));
    return `${name} ${year}`;
  }, [year, month, locale]);

  const checkMutation = useMutation({
    mutationFn: () =>
      api.post('/manager/month-close/check', { propertyId: pid, year, month }).then((r) => r.data.data),
    onSuccess: (data) => setCheckResult(data),
  });

  const closeMutation = useMutation({
    mutationFn: () =>
      api.post('/manager/month-close/close', { propertyId: pid, year, month }).then((r) => r.data.data),
    onSuccess: () => checkMutation.mutate(),
  });

  useEffect(() => {
    if (pid) checkMutation.mutate();
  }, [pid, year, month]);

  const cl = checkResult?.checklist;

  const checklistItems = useMemo(
    () =>
      cl
        ? [
            {
              id: 'rooms',
              ok: cl.roomsChecked,
              warn: false,
              title: t('monthClose.roomsChecked'),
              hint: t('monthClose.roomsHint'),
              count: cl.roomsTotal,
              to: '/rooms',
              addTo: '/map',
              icon: Building2,
            },
            {
              id: 'charges',
              ok: cl.chargesGenerated,
              warn: false,
              title: t('monthClose.chargesGenerated'),
              hint: t('monthClose.chargesHint'),
              count: cl.chargesCount,
              to: '/charges',
              addTo: '/charges',
              icon: FileText,
            },
            {
              id: 'utilities',
              ok: cl.utilitiesEntered,
              warn: true,
              title: t('monthClose.utilitiesEntered'),
              hint: t('monthClose.utilitiesHint'),
              count: cl.utilitiesCount,
              to: '/charges',
              addTo: '/charges',
              icon: Zap,
            },
            {
              id: 'payments',
              ok: cl.paymentsEntered,
              warn: true,
              title: t('monthClose.paymentsEntered'),
              hint: t('monthClose.paymentsHint'),
              count: cl.paymentsCount,
              to: '/payments',
              addTo: '/payments',
              icon: CreditCard,
            },
            {
              id: 'expenses',
              ok: cl.expensesEntered,
              warn: true,
              title: t('monthClose.expensesEntered'),
              hint: t('monthClose.expensesHint'),
              count: cl.expensesCount,
              to: '/expenses',
              addTo: '/expenses',
              icon: Wallet,
            },
          ]
        : [],
    [cl, t]
  );

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1>{t('monthClose.title')}</h1>
        <p className={styles.lead}>{t('monthClose.lead')}</p>
      </header>

      <Card className={styles.guide}>
        <h2>{t('monthClose.howItWorks')}</h2>
        <ol className={styles.steps}>
          <li>{t('monthClose.step1')}</li>
          <li>{t('monthClose.step2')}</li>
          <li>{t('monthClose.step3')}</li>
        </ol>
      </Card>

      <Card className={styles.toolbar}>
        <div className={styles.periodRow}>
          <span className={styles.periodLabel}>{t('monthClose.periodLabel')}</span>
          <strong className={styles.periodValue}>{periodLabel}</strong>
        </div>
        <div className={styles.filters}>
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
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year" />
          <Select
            value={String(month)}
            onChange={(v) => setMonth(Number(v))}
            options={monthSelectOptions(t)}
            aria-label="Month"
          />
          <Button variant="primary" onClick={() => checkMutation.mutate()} disabled={checkMutation.isPending}>
            {checkMutation.isPending ? t('monthClose.checking') : t('common.checkMonth')}
          </Button>
          <Button
            variant="surface"
            onClick={() => closeMutation.mutate()}
            disabled={!checkResult?.ok || closeMutation.isPending}
            title={!checkResult?.ok ? t('monthClose.hasErrors') : undefined}
          >
            {closeMutation.isPending ? t('common.saving') : t('common.closeMonth')}
          </Button>
          {checkResult && (
            <>
              <Button
                variant="ghost"
                onClick={() =>
                  downloadApiFile(
                    '/manager/month-close/report/xlsx',
                    { propertyId: pid, year, month },
                    `month-${year}-${month}.xlsx`
                  )
                }
              >
                {t('common.exportExcel')}
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  downloadApiFile(
                    '/manager/month-close/report/pdf',
                    { propertyId: pid, year, month },
                    `month-${year}-${month}.html`
                  )
                }
              >
                {t('common.exportPdf')}
              </Button>
            </>
          )}
        </div>
        {checkMutation.isPending && !cl && <p className={styles.statusHint}>{t('monthClose.checking')}</p>}
        {!checkMutation.isPending && !checkResult && (
          <p className={styles.statusHint}>{t('monthClose.notCheckedYet')}</p>
        )}
      </Card>

      {cl && (
        <>
          <div className={styles.statusBanner}>
            {checkResult?.ok ? (
              <>
                <CheckCircle2 size={22} className={styles.iconOk} />
                <span>{t('monthClose.canCloseMonth')}</span>
              </>
            ) : (
              <>
                <AlertCircle size={22} className={styles.iconFail} />
                <span>{t('monthClose.hasErrors')}</span>
              </>
            )}
          </div>

          <div className={styles.checklistGrid}>
            {checklistItems.map((item) => {
              const Icon = item.icon;
              const stateClass = item.ok ? styles.cardOk : item.warn ? styles.cardWarn : styles.cardFail;
              return (
                <Card key={item.id} className={`${styles.checkCard} ${stateClass}`}>
                  <div className={styles.checkCardHead}>
                    <Icon size={22} />
                    <div>
                      <strong>{item.title}</strong>
                      <span className={styles.checkCount}>{item.count}</span>
                    </div>
                  </div>
                  <p className={styles.checkHint}>{item.hint}</p>
                  <div className={styles.checkActions}>
                    <Link to={item.to}>
                      <Button variant="ghost">{t('monthClose.goEdit')}</Button>
                    </Link>
                    <Link to={item.addTo}>
                      <Button variant="secondary">{t('monthClose.addData')}</Button>
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {checkResult && (checkResult.errors?.length > 0 || checkResult.warnings?.length > 0) && (
        <div className={styles.issues}>
          {checkResult.errors?.length > 0 && (
            <Card className={styles.issueCard}>
              <h2>
                <AlertCircle size={20} /> {t('monthClose.errorsTitle')}
              </h2>
              {checkResult.errors.map((e, i) => (
                <p key={i} className={styles.error}>
                  {e.message}
                  {e.roomId && (
                    <>
                      {' '}
                      —{' '}
                      <Link to={`/map?room=${e.roomId}`}>{t('common.fix')}</Link>
                    </>
                  )}
                  {e.contractId && (
                    <>
                      {' '}
                      — <Link to="/tenants-contracts">{t('common.fix')}</Link>
                    </>
                  )}
                </p>
              ))}
            </Card>
          )}
          {checkResult.warnings?.length > 0 && (
            <Card className={styles.issueCard}>
              <h2>
                <AlertTriangle size={20} /> {t('monthClose.warningsTitle')}
              </h2>
              {checkResult.warnings.map((w, i) => (
                <p key={i} className={styles.warning}>
                  {w.message}
                </p>
              ))}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
