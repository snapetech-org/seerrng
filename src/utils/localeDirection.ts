import { getLocaleMetadata } from '@server/types/languages';

export const getLocaleDirection = (locale: string): 'ltr' | 'rtl' =>
  getLocaleMetadata(locale).direction;
