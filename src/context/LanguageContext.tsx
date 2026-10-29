import React from 'react';
import {
  localeRegistry,
  type AvailableLocale,
} from '@server/types/languages';

type AvailableLanguageObject = Record<
  AvailableLocale,
  { code: AvailableLocale; display: string }
>;

export const availableLanguages = Object.fromEntries(
  localeRegistry.map(({ tag, nativeName }) => [
    tag,
    { code: tag, display: nativeName },
  ])
) as AvailableLanguageObject;

export interface LanguageContextProps {
  locale: AvailableLocale;
  requestedLocale?: AvailableLocale;
  formatRegion?: string | null;
  children: (locale: string) => React.ReactNode;
  setLocale?: React.Dispatch<React.SetStateAction<AvailableLocale>>;
  setFormatRegion?: React.Dispatch<React.SetStateAction<string | null>>;
}

export const LanguageContext = React.createContext<
  Omit<LanguageContextProps, 'children'>
>({
  locale: 'en',
  formatRegion: null,
});
