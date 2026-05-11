import { en } from './en';

export const translations = en;

type Primitive = string | number | boolean;

export const formatTranslation = (
  template: string,
  values: Record<string, Primitive>,
) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));

