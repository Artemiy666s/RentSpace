import { useMemo } from 'react';
import { useI18n } from '@/i18n/useI18n';
import { formatDashboardDate } from '@/lib/dashboardCharts';
import type { DashboardPanelId } from '@/lib/dashboardLayout';
import {
  DashboardClickablePanel,
  DashboardClickableRow,
  DashboardPanelLink,
} from '@/features/dashboard/DashboardClickablePanel';
import { SortableBlock } from '@/features/dashboard/SortableBlock';
import { useSortableDnd } from '@/features/dashboard/useSortableDnd';
import { getRoomTypeLabel } from '@/lib/roomTypes';
import type { OperationalDashboardData } from '@/features/dashboard/OperationalDashboardPanels';
import managerStyles from '@/pages/app/ManagerPage.module.css';
import styles from '@/pages/app/DashboardPage.module.css';

type FreeRoomRow = { id: number; room_number: string; area: number };
type ExpiringContractRow = { id: number; contract_number: string; end_date: string };

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

type Props = {
  data?: OperationalDashboardData | null;
  panelOrder: DashboardPanelId[];
  onReorderPanels: (fromId: DashboardPanelId, toId: DashboardPanelId) => void;
  freeRooms?: FreeRoomRow[];
  expiringContracts?: ExpiringContractRow[];
  locale: string;
};

export function DashboardPanelsGrid({
  data,
  panelOrder,
  onReorderPanels,
  freeRooms = [],
  expiringContracts = [],
  locale,
}: Props) {
  const { t } = useI18n();
  const dnd = useSortableDnd();

  const todayTotal = useMemo(
    () => (data?.todayPayments || []).reduce((s, p) => s + Number(p.amount), 0),
    [data?.todayPayments]
  );

  const panelContent: Record<DashboardPanelId, React.ReactNode> = {
    freeRooms: (
      <DashboardClickablePanel to="/rooms">
        <h3 className={styles.panelTitle}>{t('common.freeRoomsReport')}</h3>
        <ul className={styles.list}>
          {freeRooms.length ? (
            freeRooms.map((r) => (
              <li key={r.id}>
                <DashboardClickableRow to="/map">
                  {t('common.roomNo', { no: r.room_number })} — {r.area} {t('common.sqm')}
                </DashboardClickableRow>
              </li>
            ))
          ) : (
            <li className={styles.muted}>{t('common.noData')}</li>
          )}
        </ul>
      </DashboardClickablePanel>
    ),
    contractsRenewal: (
      <DashboardClickablePanel to="/tenants-contracts">
        <h3 className={styles.panelTitle}>{t('common.contractsRenewal')}</h3>
        {expiringContracts.length ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('common.contract')}</th>
                <th>{t('common.contractEnding')}</th>
              </tr>
            </thead>
            <tbody>
              {expiringContracts.map((c) => (
                <tr key={c.id}>
                  <td colSpan={2} style={{ padding: 0, border: 0 }}>
                    <DashboardClickableRow to="/tenants-contracts" className={styles.contractRow}>
                      <span>{c.contract_number}</span>
                      <span>{formatDashboardDate(c.end_date, locale)}</span>
                    </DashboardClickableRow>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={styles.muted}>{t('common.noData')}</p>
        )}
      </DashboardClickablePanel>
    ),
    todayPayments: (
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
    ),
    negotiations: (
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
    ),
    debt: (
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
    ),
    expiringSoon: (
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
    ),
    monthReadiness: (
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
            <li
              className={
                !data.monthReadiness.hasErrors ? managerStyles.okItem : managerStyles.errItem
              }
            >
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
    ),
    activity: (
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
    ),
  };

  return (
    <div className={styles.dashboardGrid}>
      {panelOrder.map((panelId) => {
        const content = panelContent[panelId];
        if (!content) return null;
        const wide = panelId === 'activity';
        return (
          <SortableBlock
            key={panelId}
            id={panelId}
            className={wide ? styles.dashboardGridWide : undefined}
            isDragging={dnd.dragId === panelId}
            isOver={dnd.overId === panelId && dnd.dragId !== panelId}
            onDragStart={dnd.onDragStart}
            onDragEnd={dnd.onDragEnd}
            onDragOver={dnd.onDragOver}
            onDragLeave={dnd.onDragLeave}
            onDrop={(e, targetId) => dnd.onDrop(e, targetId, onReorderPanels)}
          >
            {content}
          </SortableBlock>
        );
      })}
    </div>
  );
}
