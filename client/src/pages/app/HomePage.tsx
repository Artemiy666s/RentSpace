import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { TrendingUp, Building2, Wallet, AlertCircle, Map, Table2 } from 'lucide-react';
import { api } from '@/api/client';
import { downloadApiFile } from '@/lib/exportFile';
import { usePropertyStore } from '@/store/propertyStore';
import { useAuthStore } from '@/store/authStore';
import { useI18n } from '@/i18n/useI18n';
import { formatPersonalGreeting } from '@/lib/greeting';
import { useHomeDashboardLayout } from '@/hooks/useHomeDashboardLayout';
import type { DashboardSectionId } from '@/lib/dashboardLayout';
import { DashboardAnalyticsCharts } from '@/features/dashboard/DashboardAnalyticsCharts';
import { SortableBlock } from '@/features/dashboard/SortableBlock';
import { useSortableDnd } from '@/features/dashboard/useSortableDnd';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import managerStyles from './ManagerPage.module.css';
import styles from './DashboardPage.module.css';

const ANALYTICS_ROLES = ['owner', 'director', 'org_admin', 'super_admin', 'manager'] as const;
const OPS_HEADER_ROLES = ['director', 'org_admin', 'super_admin'] as const;

export function HomePage() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const role = user?.role;
  const greeting = formatPersonalGreeting(user?.name, locale);
  const { propertyId } = usePropertyStore();

  const showAnalytics = !!(role && (ANALYTICS_ROLES as readonly string[]).includes(role));
  const showOpsHeader = !!(role && (OPS_HEADER_ROLES as readonly string[]).includes(role));

  const { layout, reorderSections, reorderCharts } = useHomeDashboardLayout(user?.id, {
    showAnalytics,
    showOperational: false,
  });

  const sectionDnd = useSortableDnd();

  const { data: properties } = useQuery({
    queryKey: ['properties'],
    queryFn: () => api.get('/properties').then((r) => r.data.data),
  });
  const pid = propertyId || properties?.[0]?.id;

  const dashboardPath = role === 'manager' ? '/dashboard/manager' : '/dashboard/director';

  const { data } = useQuery({
    queryKey: ['dashboard-home', pid, role],
    queryFn: () => api.get(dashboardPath, { params: { propertyId: pid } }).then((r) => r.data.data),
    enabled: !!pid && !!role,
  });

  const subtitle = useMemo(() => {
    if (role === 'manager') return t('manager.homeSubtitle');
    if (role === 'director') {
      return `${t('common.directorDashboard')} · ${t('common.propertyName')}, ${t('common.propertyCity')}`;
    }
    if (role === 'owner' || role === 'org_admin' || role === 'super_admin') {
      return `${t('common.propertyName')}, ${t('common.propertyCity')}`;
    }
    return t('manager.homeSubtitle');
  }, [role, t]);

  const kpis = data?.kpis;

  const cards = [
    {
      label: t('common.totalArea'),
      value: kpis?.totalArea?.toFixed(0) ?? t('common.dash'),
      unit: t('common.sqm'),
      icon: Building2,
      href: '/map',
    },
    {
      label: t('common.occupancy'),
      value: kpis?.occupancy ?? t('common.dash'),
      unit: '%',
      icon: TrendingUp,
      href: '/map',
    },
    {
      label: t('common.rentPerMonth'),
      value: kpis?.rentMonth?.toFixed(0) ?? t('common.dash'),
      unit: t('common.currencyByn'),
      icon: Wallet,
      href: '/rent-register',
    },
    {
      label: t('common.debt'),
      value: kpis?.debt?.toFixed(0) ?? t('common.dash'),
      unit: t('common.currencyByn'),
      icon: AlertCircle,
      href: '/rent-register',
    },
  ];

  const sectionBlocks: Record<DashboardSectionId, React.ReactNode> = {
    kpis: (
      <div className={styles.kpiGrid}>
        {cards.map(({ label, value, unit, icon: Icon, href }) => (
          <button
            key={label}
            type="button"
            className={styles.kpiAction}
            onClick={() => navigate(href)}
            aria-label={label}
          >
            <Card className={styles.kpiCard}>
              <div className={styles.kpiIcon}>
                <Icon size={22} />
              </div>
              <span className={styles.kpiLabel}>{label}</span>
              <strong className={styles.kpiValue}>
                {value} <small>{unit}</small>
              </strong>
            </Card>
          </button>
        ))}
      </div>
    ),
    charts: (
      <DashboardAnalyticsCharts
        data={data}
        chartOrder={layout.charts}
        onReorderCharts={reorderCharts}
      />
    ),
    quickActions: null,
    panels: null,
  };

  return (
    <div className={styles.page}>
      <header className={`${styles.header} ${managerStyles.header}`}>
        <div>
          <h1>{greeting}!</h1>
          <p className={styles.subtitle}>{subtitle}</p>
          {showAnalytics && <p className={styles.layoutHint}>{t('dashboard.layoutHint')}</p>}
        </div>
        <div className={managerStyles.headerActions}>
          {showAnalytics && (
            <Button
              variant="secondary"
              onClick={() => {
                if (!pid) return;
                const year = new Date().getFullYear();
                downloadApiFile(
                  '/manager/rent-register/export/xlsx',
                  { propertyId: pid, year, full: 'true' },
                  `report-${year}.xlsx`
                );
              }}
              disabled={!pid}
            >
              {t('common.exportExcel')}
            </Button>
          )}
          {showOpsHeader && (
            <>
              <Link to="/map">
                <Button variant="primary">
                  <Map size={18} /> {t('nav.roomMap')}
                </Button>
              </Link>
              <Link to="/map-editor">
                <Button variant="surface">
                  <Table2 size={18} /> {t('nav.mapEditor')}
                </Button>
              </Link>
            </>
          )}
          {role === 'manager' && (
            <Link to="/map">
              <Button variant="primary">
                <Map size={18} /> {t('nav.roomMap')}
              </Button>
            </Link>
          )}
        </div>
      </header>

      {showAnalytics && (
        <div className={styles.sectionsStack}>
          {layout.sections.map((sectionId) => {
            const block = sectionBlocks[sectionId];
            if (!block) return null;
            return (
              <SortableBlock
                key={sectionId}
                id={sectionId}
                className={styles.sortableSection}
                isDragging={sectionDnd.dragId === sectionId}
                isOver={sectionDnd.overId === sectionId && sectionDnd.dragId !== sectionId}
                onDragStart={sectionDnd.onDragStart}
                onDragEnd={sectionDnd.onDragEnd}
                onDragOver={sectionDnd.onDragOver}
                onDragLeave={sectionDnd.onDragLeave}
                onDrop={(e, targetId) => sectionDnd.onDrop(e, targetId, reorderSections)}
              >
                {block}
              </SortableBlock>
            );
          })}
        </div>
      )}
    </div>
  );
}
