import { useCallback, useEffect, useMemo } from 'react';
import { usePreferencesStore } from '@/store/preferencesStore';
import { translate } from './translate';
import type { Locale } from './types';

export function useI18n() {
  const locale = usePreferencesStore((s) => s.locale);
  const setLocale = usePreferencesStore((s) => s.setLocale);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale]
  );

  useEffect(() => {
    document.documentElement.lang = locale === 'be' ? 'be' : locale;
  }, [locale]);

  return useMemo(() => ({ t, locale, setLocale }), [t, locale, setLocale]);
}

export function getRoleLabel(t: (key: string) => string, role?: string | null): string {
  if (!role) return '';
  const key = `roles.${role}`;
  const label = t(key);
  return label === key ? role : label;
}
