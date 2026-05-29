import { useMemo } from 'react';
import { usePreferencesStore } from '@/store/preferencesStore';
import type { Locale } from './types';
import { translate } from './translate';

const STATUS_KEYS = [
  'free',
  'ready_for_rent',
  'occupied',
  'negotiation',
  'reserved',
  'debt',
  'repair',
  'technical',
  'not_available',
] as const;

export function getRoomStatusLabels(locale: Locale): Record<string, string> {
  return Object.fromEntries(
    STATUS_KEYS.map((k) => [k, translate(locale, `roomStatus.${k}`)])
  );
}

export function useRoomStatusLabels(): Record<string, string> {
  const locale = usePreferencesStore((s) => s.locale);
  return useMemo(() => getRoomStatusLabels(locale), [locale]);
}
