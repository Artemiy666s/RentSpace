import type { Locale, TranslationTree } from './types';
import { be } from './locales/be';
import { en } from './locales/en';
import { ru } from './locales/ru';

const catalogs: Record<Locale, TranslationTree> = { ru, en, be };

function getByPath(tree: TranslationTree, path: string): string | undefined {
  const parts = path.split('.');
  let cur: TranslationValue | undefined = tree;
  for (const part of parts) {
    if (cur == null || typeof cur === 'string') return undefined;
    cur = cur[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = params[key];
    return v !== undefined ? String(v) : `{{${key}}}`;
  });
}

export function translate(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>
): string {
  const text = getByPath(catalogs[locale], key) ?? getByPath(catalogs.ru, key);
  if (!text) return key;
  return interpolate(text, params);
}
