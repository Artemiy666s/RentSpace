import type { AppBackgroundId } from '@/constants/appBackgrounds';
import { APP_BACKGROUNDS } from '@/constants/appBackgrounds';
import type { Locale } from './types';
import { translate } from './translate';

export function getLocalizedBackgrounds(locale: Locale) {
  return APP_BACKGROUNDS.map((bg) => ({
    ...bg,
    label: translate(locale, `backgrounds.${bg.id}.label`),
    description: translate(locale, `backgrounds.${bg.id}.desc`),
  }));
}

export type LocalizedBackground = ReturnType<typeof getLocalizedBackgrounds>[number];
