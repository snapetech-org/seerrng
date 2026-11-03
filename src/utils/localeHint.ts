import { isAvailableLocale, type AvailableLocale } from '@server/types/languages';

const localeHintCookieName = 'seerrng-locale';

export const getLocaleHintCookie = (): AvailableLocale | null => {
  if (typeof document === 'undefined') return null;

  for (const cookie of document.cookie.split(';')) {
    const [name, ...valueParts] = cookie.trim().split('=');
    if (name !== localeHintCookieName) continue;

    try {
      const value = decodeURIComponent(valueParts.join('='));
      return isAvailableLocale(value) ? value : null;
    } catch {
      return null;
    }
  }

  return null;
};

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
