import { getFormatRegionFromLocale } from '@app/utils/formatLocale';
import { resolveAcceptLanguage } from '@server/types/languages';

export interface BrowserLocalePreference {
  locale: ReturnType<typeof resolveAcceptLanguage>;
  formatRegion: string | null;
}

export const getBrowserLocalePreference = (): BrowserLocalePreference => {
  const languages =
    typeof navigator === 'undefined'
      ? []
      : navigator.languages?.length
        ? [...navigator.languages]
        : [navigator.language];
  const locale = resolveAcceptLanguage(languages.join(','));

  return {
    locale,
    formatRegion: getFormatRegionFromLocale(languages[0] ?? locale),
  };
};
