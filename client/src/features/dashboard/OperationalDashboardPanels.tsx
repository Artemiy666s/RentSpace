import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Map, CalendarCheck } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DashboardQuickActions } from '@/features/dashboard/DashboardQuickActions';
import {
  DashboardClickablePanel,
  DashboardClickableRow,
  DashboardPanelLink,
} from '@/features/dashboard/DashboardClickablePanel';
import { getRoomTypeLabel } from '@/lib/roomTypes';
import { useI18n } from '@/i18n/useI18n';
import managerStyles from '@/pages/app/ManagerPage.module.css';
import dashStyles from '@/pages/app/DashboardPage.module.css';

function formatFloorLine(
  t: (key: string, vars?: Record<string, string | number>) => string,
  building?: string,
  floorName?: string,
  level?: number
) {
  const parts: string[] = [];
  if (building) parts.push(building);
  if (level != null) parts.push(t('common.floorLevel', { level }));
  else if (floorName) parts.push(floorName);
  return parts.join(' · ') || t('common.dash');
}

export type OperationalDashboardData = {
  todayPayments?: Array<{
    id: number;
    amount: number;
    tenant_name?: string;
    contract_number?: string;
  }>;
  negotiations?: Array<{
    id: number;
    room_number: string;
    tenant_name?: string;
    building_name?: string;
    floor_name?: string;
    level_number?: number;
    room_type?: string;
  }>;
  debtRooms?: Array<{
    id: number;
    room_number: string;
    building_name?: string;
    floor_name?: string;
    level_number?: number;
    room_type?: string;
  }>;
  freeRooms?: Array<{
    id: number;
    room_number: string;
    area: number;
    status: string;
    name?: string;
    room_type?: string;
    building_name?: string;
    floor_name?: string;
    level_number?: number;
  }>;
  expiringSoon?: Array<{
    id: number;
    contract_number: string;
    end_date: string;
    tenant_name?: string;
  }>;
  monthReadiness?: {
    roomsChecked?: boolean;
    chargesGenerated?: boolean;
    utilitiesEntered?: boolean;
    paymentsEntered?: boolean;
    expensesEntered?: boolean;
    hasErrors?: boolean;
    chargesCount?: number;
    utilitiesCount?: number;
    paymentsCount?: number;
    expensesCount?: number;
  } | null;
  activity?: Array<{ id: number; title: string; created_at?: string }>;
};

type Props = {
  data?: OperationalDashboardData | null;
  showQuickActions?: boolean;
  showHeaderActions?: boolean;
  /** Panels are direct children of a parent `.dashboardGrid` (e.g. HomePage). */
  embedInParentGrid?: boolean;
};

export function OperationalDashboardPanels({
  data,
  showQuickActions = true,
  showHeaderActions = false,
  embedInParentGrid = false,
}: Props) {
  const { t } = useI18n();

  const todayTotal = useMemo(
    () =>
      (data?.todayPayments || []).reduce((s, p) => s + Number(p.amount), 0),
    [data?.todayPayments]
  );

  const panels = (
    <>
      <DashboardClickablePanel to="/payments" cardClassName={managerStyles.panel}>
        <div className={managerStyles.panelHead}>
          <h3>{t('manager.todayPayments')}</h3>
          {todayTotal > 0 && (
            <span className={managerStyles.panelBadge}>
              {todayTotal.toFixed(2)} {t('common.currencyByn')}
            </span>
          )}
        </div>
        {data?.todayPayments?.length ? (
          <ul className={managerStyles.ul}>
            {data.todayPayments.map((p) => (
              <li key={p.id}>
                <DashboardClickableRow to="/payments">
                  <strong>
                    {Number(p.amount).toFixed(2)} {t('common.currencyByn')}
                  </strong>
                  <span className={managerStyles.listMeta}>
                    {p.tenant_name
                      ? t('manager.paymentFrom', { name: p.tenant_name })
                      : t('common.dash')}
                    {p.contract_number
                      ? ` · ${t('manager.paymentContract', { no: p.contract_number })}`
                      : ''}
                  </span>
                </DashboardClickableRow>
              </li>
            ))}
          </ul>
        ) : (
          <p className={managerStyles.empty}>{t('manager.noPaymentsToday')}</p>
        )}
        <DashboardPanelLink to="/payments" className={managerStyles.panelLink}>
          {t('manager.viewAllPayments')}
        </DashboardPanelLink>
      </DashboardClickablePanel>

      <DashboardClickablePanel to="/map" cardClassName={managerStyles.panel}>
        <h3>{t('manager.negotiations')}</h3>
        <ul className={managerStyles.ul}>
          {(data?.negotiations?.length ? data.negotiations : []).slice(0, 5).map((n) => (
            <li key={n.id}>
              <DashboardClickableRow to="/map">
                <strong>
                  {t('common.roomNo', { no: n.room_number })}
                  {n.tenant_name ? ` — ${n.tenant_name}` : ''}
                </strong>
                <span className={managerStyles.listMeta}>
                  {formatFloorLine(t, n.building_name, n.floor_name, n.level_number)} ·{' '}
                  {getRoomTypeLabel(t, n.room_type)}
                </span>
              </DashboardClickableRow>
            </li>
          ))}
          {!data?.negotiations?.length && (
            <li className={managerStyles.empty}>{t('manager.noNegotiations')}</li>
          )}
        </ul>
        <DashboardPanelLink to="/map" className={managerStyles.panelLink}>
          {t('manager.viewAllOnMap')}
        </DashboardPanelLink>
      </DashboardClickablePanel>

      <DashboardClickablePanel to="/payments" cardClassName={managerStyles.panel}>
        <h3>{t('common.debt')}</h3>
        <ul className={managerStyles.ul}>
          {(data?.debtRooms || []).slice(0, 5).map((r) => (
            <li key={r.id}>
              <DashboardClickableRow to="/map">
                <strong>{t('common.roomNo', { no: r.room_number })}</strong>
                <span className={managerStyles.listMeta}>
                  {formatFloorLine(t, r.building_name, r.floor_name, r.level_number)} ·{' '}
                  {getRoomTypeLabel(t, r.room_type)}
                </span>
              </DashboardClickableRow>
            </li>
          ))}
          {!data?.debtRooms?.length && (
            <li className={managerStyles.empty}>{t('manager.noDebt')}</li>
          )}
        </ul>
      </DashboardClickablePanel>

      <DashboardClickablePanel to="/tenants-contracts" cardClassName={managerStyles.panel}>
        <h3>{t('manager.expiringContracts')}</h3>
        <ul className={managerStyles.ul}>
          {(data?.expiringSoon || []).slice(0, 5).map((c) => (
            <li key={c.id}>
              <DashboardClickableRow to="/tenants-contracts">
                <strong>{c.contract_number}</strong>
                <span className={managerStyles.listMeta}>
                  {c.tenant_name || t('common.dash')} · {t('common.until')} {c.end_date}
                </span>
              </DashboardClickableRow>
            </li>
          ))}
          {!data?.expiringSoon?.length && (
            <li className={managerStyles.empty}>{t('manager.noExpiring')}</li>
          )}
        </ul>
      </DashboardClickablePanel>

      <DashboardClickablePanel to="/month-close" cardClassName={managerStyles.panel}>
        <h3>{t('manager.monthReadiness')}</h3>
        {data?.monthReadiness ? (
          <ul className={managerStyles.ul}>
            <li className={data.monthReadiness.roomsChecked ? managerStyles.okItem : ''}>
              {t('manager.roomsChecked')}
            </li>
            <li className={data.monthReadiness.chargesGenerated ? managerStyles.okItem : ''}>
              {t('manager.charges')} ({data.monthReadiness.chargesCount})
            </li>
            <li className={data.monthReadiness.utilitiesEntered ? managerStyles.okItem : ''}>
              {t('manager.utilities')} ({data.monthReadiness.utilitiesCount})
            </li>
            <li className={data.monthReadiness.paymentsEntered ? managerStyles.okItem : ''}>
              {t('manager.payments')} ({data.monthReadiness.paymentsCount})
            </li>
            <li className={data.monthReadiness.expensesEntered ? managerStyles.okItem : ''}>
              {t('manager.expenses')} ({data.monthReadiness.expensesCount})
            </li>
            <li className={!data.monthReadiness.hasErrors ? managerStyles.okItem : managerStyles.errItem}>
              {data.monthReadiness.hasErrors ? t('common.hasErrors') : t('common.noErrors')}
            </li>
          </ul>
        ) : (
          <p className={managerStyles.empty}>{t('common.noData')}</p>
        )}
        <DashboardPanelLink to="/month-close" className={managerStyles.panelLink}>
          {t('common.monthCloseArrow')}
        </DashboardPanelLink>
      </DashboardClickablePanel>

      <div className={embedInParentGrid ? dashStyles.dashboardGridWide : managerStyles.panelWide}>
        <DashboardClickablePanel to="/manager-data" cardClassName={managerStyles.panel}>
          <h3>{t('manager.activityFeed')}</h3>
          <ul className={managerStyles.ul}>
            {data?.activity?.map((e) => (
              <li key={e.id}>
                <DashboardClickableRow to="/manager-data">{e.title}</DashboardClickableRow>
              </li>
            ))}
            {!data?.activity?.length && <li className={managerStyles.empty}>{t('common.noData')}</li>}
          </ul>
        </DashboardClickablePanel>
      </div>
    </>
  );

  return (
    <>
      {showHeaderActions && (
        <div className={managerStyles.headerActions}>
          <Link to="/map">
            <Button variant="primary">
              <Map size={18} /> {t('nav.roomMap')}
            </Button>
          </Link>
          <Link to="/month-close">
            <Button variant="surface">
              <CalendarCheck size={18} /> {t('nav.monthClose')}
            </Button>
          </Link>
          <Link to="/map-editor">
            <Button variant="surface">
              <Map size={18} /> {t('nav.mapEditor')}
            </Button>
          </Link>
        </div>
      )}

      {showQuickActions && <DashboardQuickActions />}

      {embedInParentGrid ? panels : <div className={dashStyles.dashboardGrid}>{panels}</div>}
    </>
  );
}
