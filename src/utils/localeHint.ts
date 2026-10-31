import type { AvailableLocale } from '@server/types/languages';

const localeHintCookieName = 'seerrng-locale';

/** Store a display-only locale hint for the next server-rendered document. */
export const setLocaleHintCookie = (locale: AvailableLocale): void => {
  if (typeof document === 'undefined') return;

  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie =
    localeHintCookieName +
    '=' +
    encodeURIComponent(locale) +
    '; Path=/; Max-Age=31536000; SameSite=Lax' +
    secure;
};
