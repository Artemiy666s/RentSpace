import { create } from 'zustand';

import { persist } from 'zustand/middleware';

import type { AppBackgroundId } from '@/constants/appBackgrounds';

import { DEFAULT_APP_BACKGROUND } from '@/constants/appBackgrounds';

import type { Locale } from '@/i18n/types';



interface PreferencesState {

  appBackgroundId: AppBackgroundId;

  /** When true, wallpaper follows local time (day / night pair) */
  autoWallpaperByTime: boolean;

  locale: Locale;

  setAppBackgroundId: (id: AppBackgroundId) => void;

  setAutoWallpaperByTime: (enabled: boolean) => void;

  setLocale: (locale: Locale) => void;

}



export const usePreferencesStore = create<PreferencesState>()(

  persist(

    (set) => ({

      appBackgroundId: DEFAULT_APP_BACKGROUND,

      autoWallpaperByTime: false,

      locale: 'ru',

      setAppBackgroundId: (id) =>
        set({ appBackgroundId: id, autoWallpaperByTime: false }),

      setAutoWallpaperByTime: (enabled) => set({ autoWallpaperByTime: enabled }),

      setLocale: (locale) => set({ locale }),

    }),

    { name: 'rentspace-preferences' }

  )

);

