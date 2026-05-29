export type Locale = 'ru' | 'en' | 'be';

export const LOCALES: { id: Locale; label: string }[] = [
  { id: 'ru', label: 'Русский' },
  { id: 'en', label: 'English' },
  { id: 'be', label: 'Беларуская' },
];

export type TranslationValue = string | TranslationTree;
export type TranslationTree = { [key: string]: TranslationValue };
