import type { Locale } from '@/i18n/types';
import { translate } from '@/i18n/translate';

export function getTimeGreeting(locale: Locale, date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return translate(locale, 'greeting.morning');
  if (hour >= 12 && hour < 18) return translate(locale, 'greeting.day');
  if (hour >= 18 && hour < 23) return translate(locale, 'greeting.evening');
  return translate(locale, 'greeting.night');
}

/** Имя для приветствия: «Глебова Инна Михайловна» → «Инна Михайловна» */
export function getGreetingName(fullName?: string | null): string {
  if (!fullName?.trim()) return '';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length >= 3) {
    return `${parts[1]} ${parts[2]}`;
  }
  if (parts.length === 2) {
    return parts[1];
  }
  return parts[0];
}

/** @deprecated Use getGreetingName */
export function getFirstName(fullName?: string | null): string {
  return getGreetingName(fullName);
}

export function formatPersonalGreeting(
  fullName?: string | null,
  locale: Locale = 'ru',
  date = new Date()
): string {
  const greet = getTimeGreeting(locale, date);
  const name = getGreetingName(fullName);
  if (!name) return greet;
  return `${greet}, ${name}`;
}
