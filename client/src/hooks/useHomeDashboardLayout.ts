import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildLayoutScope,
  layoutStorageKey,
  loadLayoutFromStorage,
  reorderIds,
  saveLayoutToStorage,
  type DashboardChartId,
  type DashboardLayoutState,
  type DashboardPanelId,
  type DashboardQuickActionId,
  type DashboardSectionId,
} from '@/lib/dashboardLayout';

export function useHomeDashboardLayout(
  userId: number | undefined | null,
  options: { showAnalytics: boolean; showOperational: boolean }
) {
  const scope = useMemo(
    () => buildLayoutScope(options),
    [options.showAnalytics, options.showOperational]
  );
  const storageKey = layoutStorageKey(userId);

  const [layout, setLayout] = useState<DashboardLayoutState>(() =>
    loadLayoutFromStorage(storageKey, scope)
  );

  useEffect(() => {
    setLayout(loadLayoutFromStorage(storageKey, scope));
  }, [storageKey, scope]);

  const updateLayout = useCallback(
    (updater: (prev: DashboardLayoutState) => DashboardLayoutState) => {
      setLayout((prev) => {
        const next = updater(prev);
        saveLayoutToStorage(storageKey, next);
        return next;
      });
    },
    [storageKey]
  );

  const reorderSections = useCallback(
    (fromId: DashboardSectionId, toId: DashboardSectionId) => {
      updateLayout((prev) => ({
        ...prev,
        sections: reorderIds(prev.sections, fromId, toId),
      }));
    },
    [updateLayout]
  );

  const reorderCharts = useCallback(
    (fromId: DashboardChartId, toId: DashboardChartId) => {
      updateLayout((prev) => ({
        ...prev,
        charts: reorderIds(prev.charts, fromId, toId),
      }));
    },
    [updateLayout]
  );

  const reorderPanels = useCallback(
    (fromId: DashboardPanelId, toId: DashboardPanelId) => {
      updateLayout((prev) => ({
        ...prev,
        panels: reorderIds(prev.panels, fromId, toId),
      }));
    },
    [updateLayout]
  );

  const reorderQuickActions = useCallback(
    (fromId: DashboardQuickActionId, toId: DashboardQuickActionId) => {
      updateLayout((prev) => ({
        ...prev,
        quickActions: reorderIds(prev.quickActions, fromId, toId),
      }));
    },
    [updateLayout]
  );

  const resetLayout = useCallback(() => {
    const next = loadLayoutFromStorage(null, scope);
    if (storageKey) localStorage.removeItem(storageKey);
    setLayout(next);
  }, [scope, storageKey]);

  return {
    layout,
    reorderSections,
    reorderCharts,
    reorderPanels,
    reorderQuickActions,
    resetLayout,
  };
}
