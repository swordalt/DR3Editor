import { en } from './en';

export const translations = en;

export const LANGUAGE_OPTIONS = [
  { id: 'en', label: 'English' },
] as const;

export type LanguageCode = typeof LANGUAGE_OPTIONS[number]['id'];

type Primitive = string | number | boolean;

export const formatTranslation = (
  template: string,
  values: Record<string, Primitive>,
) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));

