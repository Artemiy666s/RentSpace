import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useI18n } from '@/i18n/useI18n';
import { useRoomStatusLabels } from '@/i18n/roomStatus';
import { ROOM_STATUS_COLORS } from '@/constants/roomStatus';
import { Card } from '@/components/ui/Card';
import {
  buildMonthlyChartRows,
  buildChargesPaymentsRows,
  floorOccupancyRows,
} from '@/lib/dashboardCharts';
import type { DashboardChartId } from '@/lib/dashboardLayout';
import { SortableBlock } from '@/features/dashboard/SortableBlock';
import { useSortableDnd } from '@/features/dashboard/useSortableDnd';
import styles from '@/pages/app/DashboardPage.module.css';

type DashboardAnalytics = {
  revenueByMonth?: Array<{ period_month: number; total: number }>;
  paymentsByMonth?: Array<{ period_month: number; total: number }>;
  expensesByMonth?: Array<{ period_month: number; total: number }>;
  occupancyByFloor?: Array<{
    name?: string;
    level_number?: number;
    total_area?: number | string;
    occupied_area?: number | string;
  }>;
  roomsByStatus?: Array<{ status: string; count: number | string }>;
};

function moneyTooltip(value: number | string | undefined, currency: string) {
  const n = Number(value) || 0;
  return `${n.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ${currency}`;
}

type ChartBlockProps = {
  title: string;
  children: React.ReactNode;
  to: string;
};

function ChartBlock({ title, children, to }: ChartBlockProps) {
  return (
    <Link to={to} className={styles.blockAction}>
      <Card className={styles.chartCard}>
        <h3>{title}</h3>
        {children}
      </Card>
    </Link>
  );
}

type Props = {
  data?: DashboardAnalytics | null;
  chartOrder: DashboardChartId[];
  onReorderCharts: (fromId: DashboardChartId, toId: DashboardChartId) => void;
};

export function DashboardAnalyticsCharts({ data, chartOrder, onReorderCharts }: Props) {
  const { t } = useI18n();
  const statusLabels = useRoomStatusLabels();
  const currency = t('common.currencyByn');
  const dnd = useSortableDnd();

  const chargesPaymentsData = useMemo(
    () => buildChargesPaymentsRows(data?.revenueByMonth, data?.paymentsByMonth, t),
    [data?.revenueByMonth, data?.paymentsByMonth, t]
  );

  const expensesData = useMemo(
    () => buildMonthlyChartRows(data?.expensesByMonth, t, 'expenses'),
    [data?.expensesByMonth, t]
  );

  const floorData = useMemo(
    () =>
      floorOccupancyRows(data?.occupancyByFloor, (f) =>
        f.level_number != null
          ? t('common.floorLevel', { level: f.level_number })
          : f.name || t('common.dash')
      ),
    [data?.occupancyByFloor, t]
  );

  const statusPieData = useMemo(() => {
    return (data?.roomsByStatus || [])
      .map((r) => ({
        status: r.status,
        name: statusLabels[r.status] || r.status,
        value: Number(r.count) || 0,
        fill: ROOM_STATUS_COLORS[r.status] || '#8B9CB3',
      }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [data?.roomsByStatus, statusLabels]);

  const tooltipMoney = {
    formatter: (v: number) => moneyTooltip(v, currency),
  };

  const charts: Record<DashboardChartId, React.ReactNode> = {
    chargesVsPayments: (
      <ChartBlock title={t('dashboard.chargesVsPayments')} to="/rent-register">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chargesPaymentsData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#DDE7F0" />
            <XAxis dataKey="monthLabel" tick={{ fontSize: 11 }} interval={0} angle={-35} textAnchor="end" height={52} />
            <YAxis tick={{ fontSize: 11 }} width={56} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
            <Tooltip {...tooltipMoney} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="charged" name={t('dashboard.charged')} fill="#1267E8" radius={[4, 4, 0, 0]} />
            <Bar dataKey="paid" name={t('dashboard.paid')} fill="#28B65A" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartBlock>
    ),
    expensesByMonth: (
      <ChartBlock title={t('dashboard.expensesByMonth')} to="/expenses">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={expensesData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#DDE7F0" />
            <XAxis dataKey="monthLabel" tick={{ fontSize: 11 }} interval={0} angle={-35} textAnchor="end" height={52} />
            <YAxis tick={{ fontSize: 11 }} width={56} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
            <Tooltip {...tooltipMoney} />
            <Bar dataKey="expenses" name={t('nav.expenses')} fill="#E67E22" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartBlock>
    ),
    occupancyByFloor: (
      <ChartBlock title={t('dashboard.occupancyByFloor')} to="/map">
        {floorData.length ? (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={floorData} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#DDE7F0" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="label" width={72} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => `${v}%`} />
              <Bar dataKey="occupancy" name={t('common.occupancy')} fill="#5B8FC9" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className={styles.muted}>{t('common.noData')}</p>
        )}
      </ChartBlock>
    ),
    roomsByStatus: (
      <ChartBlock title={t('dashboard.roomsByStatus')} to="/map">
        {statusPieData.length ? (
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={statusPieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={80}
                paddingAngle={2}
                label={({ name, percent }) =>
                  percent > 0.06 ? `${name} ${(percent * 100).toFixed(0)}%` : ''
                }
                labelLine={false}
              >
                {statusPieData.map((entry) => (
                  <Cell key={entry.status} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number, _n, p) => [String(v), p.payload.name]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <p className={styles.muted}>{t('common.noData')}</p>
        )}
      </ChartBlock>
    ),
  };

  return (
    <section className={styles.chartsSection}>
      <div className={styles.chartsScroll}>
        <div className={styles.chartsGrid}>
          {chartOrder.map((chartId) => {
            const chart = charts[chartId];
            if (!chart) return null;
            return (
              <SortableBlock
                key={chartId}
                id={chartId}
                className={styles.chartsGridItem}
                contentClassName={styles.chartsGridItemInner}
                isDragging={dnd.dragId === chartId}
                isOver={dnd.overId === chartId && dnd.dragId !== chartId}
                onDragStart={dnd.onDragStart}
                onDragEnd={dnd.onDragEnd}
                onDragOver={dnd.onDragOver}
                onDragLeave={dnd.onDragLeave}
                onDrop={(e, targetId) => dnd.onDrop(e, targetId, onReorderCharts)}
              >
                {chart}
              </SortableBlock>
            );
          })}
        </div>
      </div>
    </section>
  );
}
