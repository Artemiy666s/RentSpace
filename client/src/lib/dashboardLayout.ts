export type DashboardSectionId = 'kpis' | 'charts' | 'quickActions' | 'panels';

export type DashboardChartId =
  | 'chargesVsPayments'
  | 'expensesByMonth'
  | 'occupancyByFloor'
  | 'roomsByStatus';

export type DashboardPanelId =
  | 'freeRooms'
  | 'contractsRenewal'
  | 'todayPayments'
  | 'negotiations'
  | 'debt'
  | 'expiringSoon'
  | 'monthReadiness'
  | 'activity';

export type DashboardQuickActionId =
  | 'rentOut'
  | 'vacate'
  | 'createContract'
  | 'addPayment'
  | 'charges'
  | 'expenses'
  | 'rentRegister'
  | 'planFact'
  | 'allData';

export type DashboardLayoutState = {
  sections: DashboardSectionId[];
  charts: DashboardChartId[];
  panels: DashboardPanelId[];
  quickActions: DashboardQuickActionId[];
};

export const DEFAULT_CHART_ORDER: DashboardChartId[] = [
  'chargesVsPayments',
  'expensesByMonth',
  'occupancyByFloor',
  'roomsByStatus',
];

export const DEFAULT_QUICK_ACTION_ORDER: DashboardQuickActionId[] = [
  'rentOut',
  'vacate',
  'createContract',
  'addPayment',
  'charges',
  'expenses',
  'rentRegister',
  'planFact',
  'allData',
];

export const DEFAULT_PANEL_ORDER_ANALYTICS: DashboardPanelId[] = [
  'freeRooms',
  'contractsRenewal',
];

export const DEFAULT_PANEL_ORDER_OPERATIONAL: DashboardPanelId[] = [
  'todayPayments',
  'negotiations',
  'debt',
  'expiringSoon',
  'monthReadiness',
  'activity',
];

export const DEFAULT_SECTION_ORDER: DashboardSectionId[] = [
  'kpis',
  'charts',
  'quickActions',
  'panels',
];

const STORAGE_PREFIX = 'rentspace-home-layout';

export function layoutStorageKey(userId?: number | null) {
  return userId ? `${STORAGE_PREFIX}-${userId}` : null;
}

export function mergeOrder<T extends string>(
  saved: T[] | undefined,
  defaults: readonly T[],
  allowed: ReadonlySet<T>
): T[] {
  const result: T[] = [];
  const seen = new Set<T>();

  for (const id of saved ?? []) {
    if (allowed.has(id) && !seen.has(id)) {
      result.push(id);
      seen.add(id);
    }
  }

  for (const id of defaults) {
    if (allowed.has(id) && !seen.has(id)) {
      result.push(id);
      seen.add(id);
    }
  }

  return result;
}

export function reorderIds<T extends string>(order: T[], fromId: T, toId: T): T[] {
  const from = order.indexOf(fromId);
  const to = order.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return order;
  const next = [...order];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function buildLayoutScope(options: {
  showAnalytics: boolean;
  showOperational: boolean;
}) {
  const { showAnalytics, showOperational } = options;

  const allowedSections = new Set<DashboardSectionId>();
  if (showAnalytics) {
    allowedSections.add('kpis');
    allowedSections.add('charts');
    allowedSections.add('panels');
  }
  if (showOperational) {
    allowedSections.add('quickActions');
    allowedSections.add('panels');
  }
  if (!showAnalytics && showOperational) {
    allowedSections.delete('kpis');
    allowedSections.delete('charts');
  }

  const allowedCharts = new Set<DashboardChartId>(
    showAnalytics ? DEFAULT_CHART_ORDER : []
  );

  const allowedPanels = new Set<DashboardPanelId>();
  if (showAnalytics) {
    DEFAULT_PANEL_ORDER_ANALYTICS.forEach((id) => allowedPanels.add(id));
  }
  if (showOperational) {
    DEFAULT_PANEL_ORDER_OPERATIONAL.forEach((id) => allowedPanels.add(id));
  }

  const allowedQuickActions = new Set<DashboardQuickActionId>(
    showOperational ? DEFAULT_QUICK_ACTION_ORDER : []
  );

  const defaultSections: DashboardSectionId[] = [];
  if (allowedSections.has('kpis')) defaultSections.push('kpis');
  if (allowedSections.has('charts')) defaultSections.push('charts');
  if (allowedSections.has('quickActions')) defaultSections.push('quickActions');
  if (allowedSections.has('panels')) defaultSections.push('panels');

  const defaultPanels = [
    ...(showAnalytics ? DEFAULT_PANEL_ORDER_ANALYTICS : []),
    ...(showOperational ? DEFAULT_PANEL_ORDER_OPERATIONAL : []),
  ];

  return {
    allowedSections,
    allowedCharts,
    allowedPanels,
    allowedQuickActions,
    defaultSections,
    defaultCharts: [...DEFAULT_CHART_ORDER],
    defaultPanels,
    defaultQuickActions: [...DEFAULT_QUICK_ACTION_ORDER],
  };
}

export function loadLayoutFromStorage(
  key: string | null,
  scope: ReturnType<typeof buildLayoutScope>
): DashboardLayoutState {
  let raw: Partial<DashboardLayoutState> = {};
  if (key) {
    try {
      const text = localStorage.getItem(key);
      if (text) raw = JSON.parse(text) as Partial<DashboardLayoutState>;
    } catch {
      raw = {};
    }
  }

  return {
    sections: mergeOrder(raw.sections, scope.defaultSections, scope.allowedSections),
    charts: mergeOrder(raw.charts, scope.defaultCharts, scope.allowedCharts),
    panels: mergeOrder(raw.panels, scope.defaultPanels, scope.allowedPanels),
    quickActions: mergeOrder(
      raw.quickActions,
      scope.defaultQuickActions,
      scope.allowedQuickActions
    ),
  };
}

export function saveLayoutToStorage(key: string | null, layout: DashboardLayoutState) {
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(layout));
}
