import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api } from './api';
import { localeLoaders, localeMetadata } from './i18n/localeData.generated';
import { messages as englishMessages } from './i18n/locales/en.generated';

const byTag = new Map(localeMetadata.map((entry) => [entry.tag, entry]));

export type LumenLocale = (typeof localeMetadata)[number]['tag'];
export const lumenLocales = localeMetadata.map(({ tag, nativeName }) => ({
  tag,
  nativeName,
}));

function matchLocale(
  value: string | null | undefined
): LumenLocale | undefined {
  if (!value) return undefined;
  const exact = localeMetadata.find(
    ({ tag }) => tag.toLowerCase() === value.toLowerCase()
  );
  if (exact) return exact.tag;
  const base = value.split(/[-_]/, 1)[0].toLowerCase();
  return localeMetadata.find(({ tag }) => tag.toLowerCase() === base)?.tag;
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

export function pluralMessage(
  t: LocaleContextValue['t'],
  locale: string,
  id: string,
  count: number,
  singular: string,
  plural: string,
  displayCount?: string | number
) {
  const category = new Intl.PluralRules(locale).select(count);
  return t(`${id}.${category}`, category === 'one' ? singular : plural, {
    count: displayCount ?? new Intl.NumberFormat(locale).format(count),
  });
}

export function LumenLocaleProvider({
  userId,
  children,
}: {
  userId?: number | null;
  children: ReactNode;
}) {
  const [requestedLocale, setRequestedLocale] = useState<string | null>(null);
  const [locale, setActiveLocale] = useState<LumenLocale>('en');
  const [messages, setMessages] =
    useState<Record<string, string>>(englishMessages);
  const localeLoadGeneration = useRef(0);

  const activateLocale = useCallback((requested: string | null) => {
    const next = matchLocale(requested) ?? browserLocale();
    const generation = ++localeLoadGeneration.current;
    const catalog =
      next === 'en'
        ? Promise.resolve({ messages: englishMessages })
        : localeLoaders[next]();
    void catalog
      .then(({ messages: loaded }) => {
        if (localeLoadGeneration.current === generation) {
          setMessages(loaded as Record<string, string>);
          setActiveLocale(next);
        }
      })
      .catch(() => {
        if (localeLoadGeneration.current === generation) {
          setActiveLocale('en');
          setMessages(englishMessages);
        }
      });
  }, []);

  useEffect(() => {
    if (userId == null) {
      setRequestedLocale(null);
      activateLocale(null);
      return;
    }
    let live = true;
    void api<{ locale?: string | null }>(`/user/${userId}/settings/main`)
      .then(({ locale: saved }) => {
        if (!live) return;
        const requested = typeof saved === 'string' ? saved : null;
        setRequestedLocale(requested);
        activateLocale(requested);
      })
      .catch(() => {
        if (live) {
          setRequestedLocale(null);
          activateLocale(null);
        }
      });
    return () => {
      live = false;
    };
  }, [activateLocale, userId]);

  useEffect(() => {
    const metadata = byTag.get(locale) ?? byTag.get('en')!;
    document.documentElement.lang = locale;
    document.documentElement.dir = metadata.direction;
  }, [locale]);

  const setLocale = useCallback(
    (requested: string | null) => {
      setRequestedLocale(requested);
      activateLocale(requested);
    },
    [activateLocale]
  );
  const t = useCallback(
    (
      id: string,
      fallback?: string,
      values?: Record<string, string | number>
    ) => {
      const message =
        messages[id] ??
        englishMessages[id as keyof typeof englishMessages] ??
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
    [locale, messages]
  );
  const value = useMemo(
    () => ({ locale, requestedLocale, setLocale, t }),
    [locale, requestedLocale, setLocale, t]
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}
