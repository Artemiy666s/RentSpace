export type AppBackgroundId = 'gradient' | 'plans' | 'office' | 'city' | 'complex';



export interface AppBackgroundOption {

  id: AppBackgroundId;

  /** CSS background для превью и режима gradient */

  preview: string;

  imageUrl?: string;

}



export const APP_BACKGROUNDS: AppBackgroundOption[] = [

  {

    id: 'gradient',

    preview: 'linear-gradient(135deg, #e8f2fc 0%, #d4e8f8 40%, #eef6ff 100%)',

  },

  {

    id: 'plans',

    preview: 'url(/images/backgrounds/bg-plans.png)',

    imageUrl: '/images/backgrounds/bg-plans.png',

  },

  {

    id: 'office',

    preview: 'url(/images/backgrounds/bg-office.png)',

    imageUrl: '/images/backgrounds/bg-office.png',

  },

  {

    id: 'city',

    preview: 'url(/images/backgrounds/bg-city-light.png)',

    imageUrl: '/images/backgrounds/bg-city-light.png',

  },

  {

    id: 'complex',

    preview: 'url(/images/backgrounds/bg-complex-night.png)',

    imageUrl: '/images/backgrounds/bg-complex-night.png',

  },

];



export const DEFAULT_APP_BACKGROUND: AppBackgroundId = 'gradient';



export function getBackgroundById(id: AppBackgroundId): AppBackgroundOption {

  return APP_BACKGROUNDS.find((b) => b.id === id) ?? APP_BACKGROUNDS[0];

}



/** Day / night pair when «auto by time of day» is enabled */
export const AUTO_DAY_BACKGROUND: AppBackgroundId = 'city';
export const AUTO_NIGHT_BACKGROUND: AppBackgroundId = 'complex';

/** Day theme from 07:00, night from 20:00 (local time) */
export const DAY_START_HOUR = 7;
export const NIGHT_START_HOUR = 20;

export function isNightPeriod(date = new Date()): boolean {
  const hour = date.getHours();
  return hour >= NIGHT_START_HOUR || hour < DAY_START_HOUR;
}

export function resolveEffectiveAppBackgroundId(
  manualId: AppBackgroundId,
  autoByTime: boolean,
  date = new Date()
): AppBackgroundId {
  if (!autoByTime) return manualId;
  return isNightPeriod(date) ? AUTO_NIGHT_BACKGROUND : AUTO_DAY_BACKGROUND;
}

/** Ms until the next day↔night wallpaper switch (for scheduling re-renders) */
export function getMsUntilNextWallpaperChange(now = new Date()): number {
  const next = new Date(now);
  if (isNightPeriod(now)) {
    if (now.getHours() >= NIGHT_START_HOUR) {
      next.setDate(next.getDate() + 1);
    }
    next.setHours(DAY_START_HOUR, 0, 0, 0);
  } else {
    next.setHours(NIGHT_START_HOUR, 0, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }
  }
  return Math.max(1000, next.getTime() - now.getTime());
}

/** Evening / night visualization — use dark UI tokens on top of the wallpaper */
export function isDarkWallpaper(id: AppBackgroundId): boolean {
  return id === 'complex';
}

export function getMainBackgroundStyle(id: AppBackgroundId): Record<string, string> {

  const bg = getBackgroundById(id);

  if (bg.id === 'gradient' || !bg.imageUrl) {

    return { background: bg.preview };

  }

  return {

    backgroundImage: `url(${bg.imageUrl})`,

    backgroundSize: 'cover',

    backgroundPosition: 'center',

    backgroundAttachment: 'fixed',

  };

}

