import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from './api';
import { localeData } from './i18n/localeData.generated';

const english = localeData.find(({ tag }) => tag === 'en')!;
const byTag = new Map(localeData.map((entry) => [entry.tag, entry]));

export type LumenLocale = (typeof localeData)[number]['tag'];
export const lumenLocales = localeData.map(({ tag, nativeName }) => ({
  tag,
  nativeName,
}));

function matchLocale(
  value: string | null | undefined
): LumenLocale | undefined {
  if (!value) return undefined;
  const exact = localeData.find(
    ({ tag }) => tag.toLowerCase() === value.toLowerCase()
  );
  if (exact) return exact.tag;
  const base = value.split(/[-_]/, 1)[0].toLowerCase();
  return localeData.find(({ tag }) => tag.toLowerCase() === base)?.tag;
}

function browserLocale(): LumenLocale {
  for (const candidate of navigator.languages?.length
    ? navigator.languages
    : [navigator.language]) {
    const match = matchLocale(candidate);
    if (match) return match;
  }
  return 'en';
}

type LocaleContextValue = {
  locale: LumenLocale;
  requestedLocale: string | null;
  setLocale: (locale: string | null) => void;
  t: (
    id: string,
    fallback?: string,
    values?: Record<string, string | number>
  ) => string;
};

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'en',
  requestedLocale: null,
  setLocale: () => {},
  t: (_id, fallback) => fallback ?? '',
});

export function useLumenLocale() {
  return useContext(LocaleContext);
}

export function LumenLocaleProvider({
  userId,
  children,
}: {
  userId: number;
  children: ReactNode;
}) {
  const [requestedLocale, setRequestedLocale] = useState<string | null>(null);
  const [locale, setActiveLocale] = useState<LumenLocale>(browserLocale);

  useEffect(() => {
    let live = true;
    void api<{ locale?: string | null }>(`/user/${userId}/settings/main`)
      .then(({ locale: saved }) => {
        if (!live) return;
        const requested = typeof saved === 'string' ? saved : null;
        setRequestedLocale(requested);
        setActiveLocale(matchLocale(requested) ?? browserLocale());
      })
      .catch(() => {
        if (live) {
          setRequestedLocale(null);
          setActiveLocale(browserLocale());
        }
      });
    return () => {
      live = false;
    };
  }, [userId]);

  useEffect(() => {
    const metadata = byTag.get(locale) ?? english;
    document.documentElement.lang = locale;
    document.documentElement.dir = metadata.direction;
  }, [locale]);

  const setLocale = useCallback((requested: string | null) => {
    setRequestedLocale(requested);
    setActiveLocale(matchLocale(requested) ?? browserLocale());
  }, []);
  const t = useCallback(
    (
      id: string,
      fallback?: string,
      values?: Record<string, string | number>
    ) => {
      const active = byTag.get(locale)?.messages as
        Record<string, string> | undefined;
      const message =
        active?.[id] ??
        (english.messages as Record<string, string>)[id] ??
        fallback ??
        id;
      return values
        ? message.replace(/\{([a-zA-Z][\w]*)\}/g, (token, name: string) =>
            Object.prototype.hasOwnProperty.call(values, name)
              ? String(values[name])
              : token
          )
        : message;
    },
    [locale]
  );
  const value = useMemo(
    () => ({ locale, requestedLocale, setLocale, t }),
    [locale, requestedLocale, setLocale, t]
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}
