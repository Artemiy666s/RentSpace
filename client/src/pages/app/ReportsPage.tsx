import { useState } from 'react';

import { useQuery } from '@tanstack/react-query';

import { api } from '@/api/client';

import { usePropertyStore } from '@/store/propertyStore';

import { useI18n } from '@/i18n/useI18n';

import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { monthSelectOptions } from '@/i18n/months';
import { downloadApiFile } from '@/lib/exportFile';

import { Card } from '@/components/ui/Card';

import styles from './ReportsPage.module.css';



export function ReportsPage() {

  const { t } = useI18n();

  const { propertyId, setPropertyId } = usePropertyStore();

  const [year, setYear] = useState(new Date().getFullYear());

  const [month, setMonth] = useState(new Date().getMonth() + 1);



  const TEMPLATES = [

    { type: 'rent-register', label: t('common.rentByAccountsReport') },

    { type: 'free-rooms', label: t('common.freeRoomsReport') },

  ];



  const { data: properties } = useQuery({

    queryKey: ['properties'],

    queryFn: () => api.get('/properties').then((r) => r.data.data),

  });

  const pid = propertyId || properties?.[0]?.id;



  const { data: planFact, isLoading: planFactLoading } = useQuery({

    queryKey: ['plan-fact', pid, year],

    queryFn: () =>
      api
        .get('/manager/plan-fact', { params: { propertyId: pid, year } })
        .then((r) => r.data.data as { rows: Array<{ code: string; name: string; values: Record<number, { plan: number | null; fact: number | null }> }>; months: string[] }),

    enabled: !!pid,

  });

  const previewRows = (planFact?.rows ?? []).slice(0, 20).map((r) => ({
    key: r.code,
    metric: r.name,
    monthName: planFact?.months?.[month - 1] ?? String(month),
    plan: r.values?.[month]?.plan ?? null,
    fact: r.values?.[month]?.fact ?? null,
  }));

  const exportXlsx = (type: string) => {
    if (!pid) return;
    downloadApiFile(`/reports/${type}/export/xlsx`, { propertyId: pid, year, month }, `report-${type}-${year}-${month}.xlsx`);
  };



  return (

    <div className={styles.page}>

      <h1>{t('reports.title')}</h1>

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

        <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />

        <Select
          value={String(month)}
          onChange={(v) => setMonth(Number(v))}
          options={monthSelectOptions(t)}
        />

      </div>

      <div className={styles.grid}>

        <Card className={styles.templates}>

          <h3>{t('common.templates')}</h3>

          {TEMPLATES.map((tpl) => (

            <div key={tpl.type} className={styles.templateRow}>

              <span>{tpl.label}</span>

              <Button variant="secondary" onClick={() => exportXlsx(tpl.type)}>{t('common.excel')}</Button>

            </div>

          ))}

        </Card>

        <Card className={styles.preview}>

          <h3>{t('reports.planFactPreview')}</h3>

          <table className={styles.table}>

            <thead>

              <tr>

                <th>{t('reports.metric')}</th>

                <th>{t('reports.monthCol')}</th>

                <th>{t('common.plan')}</th>

                <th>{t('common.fact')}</th>

              </tr>

            </thead>

            <tbody>

              {planFactLoading && (
                <tr>
                  <td colSpan={4}>{t('common.loading')}</td>
                </tr>
              )}

              {!planFactLoading && !previewRows.length && (
                <tr>
                  <td colSpan={4}>{t('common.noData')}</td>
                </tr>
              )}

              {previewRows.map((row) => (

                <tr key={row.key}>

                  <td>{row.metric}</td>

                  <td>{row.monthName}</td>

                  <td>{row.plan ?? t('common.dash')}</td>

                  <td>{row.fact ?? t('common.dash')}</td>

                </tr>

              ))}

            </tbody>

          </table>

        </Card>

      </div>

    </div>

  );

}

