import { useEffect, useMemo, useState } from 'react';
import type { AppBackgroundId } from '@/constants/appBackgrounds';
import {
  getMsUntilNextWallpaperChange,
  resolveEffectiveAppBackgroundId,
} from '@/constants/appBackgrounds';
import { usePreferencesStore } from '@/store/preferencesStore';

/** Manual choice from settings, or day/night pair when auto mode is on */
export function useEffectiveAppBackgroundId(): AppBackgroundId {
  const manualId = usePreferencesStore((s) => s.appBackgroundId);
  const autoByTime = usePreferencesStore((s) => s.autoWallpaperByTime);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!autoByTime) return;

    let timeoutId = 0;
    const bump = () => setTick((n) => n + 1);

    const scheduleNext = () => {
      timeoutId = window.setTimeout(() => {
        bump();
        scheduleNext();
      }, getMsUntilNextWallpaperChange());
    };

    bump();
    scheduleNext();
    const intervalId = window.setInterval(bump, 60_000);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [autoByTime]);

  return useMemo(
    () => resolveEffectiveAppBackgroundId(manualId, autoByTime),
    [manualId, autoByTime, tick]
  );
}
