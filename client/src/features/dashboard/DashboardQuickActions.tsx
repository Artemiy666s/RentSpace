import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Key,
  LogOut,
  FilePlus,
  CreditCard,
  Wallet,
  Receipt,
  TrendingUp,
  Database,
  FileText,
  type LucideIcon,
} from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import type { DashboardQuickActionId } from '@/lib/dashboardLayout';
import { SortableBlock } from '@/features/dashboard/SortableBlock';
import { useSortableDnd } from '@/features/dashboard/useSortableDnd';
import managerStyles from '@/pages/app/ManagerPage.module.css';
import styles from '@/pages/app/DashboardPage.module.css';

const ACTION_DEFS: Record<
  DashboardQuickActionId,
  { icon: LucideIcon; labelKey: string; to: string }
> = {
  rentOut: { icon: Key, labelKey: 'manager.rentOutRoom', to: '/map' },
  vacate: { icon: LogOut, labelKey: 'manager.vacateRoom', to: '/map' },
  createContract: { icon: FilePlus, labelKey: 'common.createContract', to: '/tenants-contracts' },
  addPayment: { icon: CreditCard, labelKey: 'common.addPayment', to: '/payments' },
  charges: { icon: FileText, labelKey: 'nav.charges', to: '/charges' },
  expenses: { icon: Wallet, labelKey: 'nav.expenses', to: '/expenses' },
  rentRegister: { icon: Receipt, labelKey: 'nav.rentRegister', to: '/rent-register' },
  planFact: { icon: TrendingUp, labelKey: 'nav.planFact', to: '/plan-fact' },
  allData: { icon: Database, labelKey: 'nav.allData', to: '/manager-data' },
};

type Props = {
  actionOrder: DashboardQuickActionId[];
  onReorderActions: (fromId: DashboardQuickActionId, toId: DashboardQuickActionId) => void;
};

export function DashboardQuickActions({ actionOrder, onReorderActions }: Props) {
  const { t } = useI18n();
  const dnd = useSortableDnd();

  const actions = useMemo(
    () =>
      actionOrder.map((id) => {
        const def = ACTION_DEFS[id];
        return {
          id,
          icon: def.icon,
          label: t(def.labelKey),
          to: def.to,
        };
      }),
    [actionOrder, t]
  );

  return (
    <section className={`${managerStyles.actions} ${styles.quickActions}`}>
      <h2>{t('manager.quickActions')}</h2>
      <div className={styles.quickActionsScroll}>
        <div className={styles.quickActionsRow}>
          {actions.map(({ id, icon: Icon, label, to }) => (
            <SortableBlock
              key={id}
              id={id}
              className={styles.quickActionsItem}
              isDragging={dnd.dragId === id}
              isOver={dnd.overId === id && dnd.dragId !== id}
              onDragStart={dnd.onDragStart}
              onDragEnd={dnd.onDragEnd}
              onDragOver={dnd.onDragOver}
              onDragLeave={dnd.onDragLeave}
              onDrop={(e, targetId) => dnd.onDrop(e, targetId, onReorderActions)}
            >
              <Link to={to} className={managerStyles.actionCard}>
                <Icon size={28} />
                <span>{label}</span>
              </Link>
            </SortableBlock>
          ))}
        </div>
      </div>
    </section>
  );
}
