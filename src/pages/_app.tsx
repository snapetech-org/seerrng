import ButtonHelp from '@app/components/Common/ButtonHelp';
import Layout from '@app/components/Layout';
import LoadingBar from '@app/components/LoadingBar';
import PWAHeader from '@app/components/PWAHeader';
import { InteractionProvider } from '@app/context/InteractionContext';
import { LanguageContext } from '@app/context/LanguageContext';
import { NativeRuntimeProvider } from '@app/context/NativeRuntimeContext';
import { SettingsProvider } from '@app/context/SettingsContext';
import { SetupConnectionsProvider } from '@app/context/SetupConnectionsContext';
import { ThemeProvider } from '@app/context/ThemeContext';
import { UserContext } from '@app/context/UserContext';
import useSettings from '@app/hooks/useSettings';
import { loadLocaleMessages } from '@app/i18n/locale/loadLocaleMessages.generated';
// organize-imports-ignore: CSS import order keeps role styles after Tailwind base styles.
import '@app/styles/globals.css';
import '@app/styles/crossMedia.css';
import '@app/styles/interfaceThemes/shared.css';
import { getLocaleDirection } from '@app/utils/localeDirection';
import {
  getFormatRegionFromLocale,
  getRegionalFormatLocale,
} from '@app/utils/formatLocale';
import { setLocaleHintCookie } from '@app/utils/localeHint';
import {
  BLOCKLIST_NAVIGATION_COUNT_KEY,
  isBlocklistMutationRequest,
} from '@app/utils/blocklistNavigation';
import { polyfillIntl } from '@app/utils/polyfillIntl';
import '@fontsource-variable/inter';
import { resolveAcceptLanguage, type AvailableLocale } from '@server/types/languages';
import axios from 'axios';
import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { useEffect, useRef, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { IntlProvider } from 'react-intl';
import { mutate, SWRConfig } from 'swr';

const ServiceWorkerSetup = dynamic(
  () => import('@app/components/ServiceWorkerSetup'),
  { ssr: false }
);
const StatusChecker = dynamic(() => import('@app/components/StatusChecker'), {
  ssr: false,
});

const isPathPrefix = (pathname: string, prefix: string): boolean =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

const loadLocaleData = loadLocaleMessages;

type MessagesType = Record<string, string>;
// English defaults live on each message descriptor; avoid bundling the full
// catalogue into the shared app entry.
const emptyMessages: MessagesType = {};

// Reads settings from context (populated client-side by SettingsProvider)
// to set the document title and PWA meta tags.
const AppHead = () => {
  const { currentSettings } = useSettings();

  return (
    <Head>
      <title>{currentSettings.applicationTitle}</title>
      <PWAHeader applicationTitle={currentSettings.applicationTitle} />
    </Head>
  );
};

const CoreApp = ({ Component, pageProps, router }: AppProps) => {
  let component: React.ReactNode;
  const [loadedMessages, setMessages] = useState<MessagesType>(emptyMessages);
  const [currentLocale, setLocale] = useState<AvailableLocale>('en');
  const [activeLocale, setActiveLocale] = useState<AvailableLocale>('en');
  const [formatRegion, setFormatRegion] = useState<string | null>(null);
  const loadedLocale = useRef<AvailableLocale>('en');

  useEffect(() => {
    polyfillIntl();
  }, []);

  useEffect(() => {
    if (
      isPathPrefix(router.pathname, '/login') ||
      isPathPrefix(router.pathname, '/setup') ||
      isPathPrefix(router.pathname, '/resetpassword')
    ) {
      const browserLanguages = navigator.languages.length
        ? navigator.languages
        : [navigator.language];
      const browserLocale = resolveAcceptLanguage(browserLanguages.join(','));
      setLocale(browserLocale);
      setLocaleHintCookie(browserLocale);
      setFormatRegion(getFormatRegionFromLocale(browserLanguages[0] ?? ''));
    }
  }, [router.pathname]);

  useEffect(() => {
    const interceptorId = axios.interceptors.response.use((response) => {
      if (
        isBlocklistMutationRequest(response.config.method, response.config.url)
      ) {
        void mutate(BLOCKLIST_NAVIGATION_COUNT_KEY);
      }

      return response;
    });

    return () => axios.interceptors.response.eject(interceptorId);
  }, []);

  useEffect(() => {
    if (currentLocale === loadedLocale.current) {
      return;
    }

    if (currentLocale === 'en') {
      loadedLocale.current = 'en';
      setMessages(emptyMessages);
      setActiveLocale('en');
      document.documentElement.lang = 'en';
      document.documentElement.dir = getLocaleDirection('en');
      return;
    }

    let active = true;
    void loadLocaleData(currentLocale)
      .then((localeMessages) => {
        if (!active) {
          return;
        }
        loadedLocale.current = currentLocale;
        setMessages(localeMessages);
        setActiveLocale(currentLocale);
        document.documentElement.lang = currentLocale;
        document.documentElement.dir = getLocaleDirection(currentLocale);
      })
      .catch(() => {
        // Keep the current catalog and document metadata together when a chunk fails.
        if (active) {
          setLocale(loadedLocale.current);
        }
      });

    return () => {
      active = false;
    };
  }, [currentLocale]);

  if (
    isPathPrefix(router.pathname, '/login') ||
    isPathPrefix(router.pathname, '/setup') ||
    isPathPrefix(router.pathname, '/resetpassword')
  ) {
    component = <Component {...pageProps} />;
  } else {
    component = (
      <Layout>
        <Component {...pageProps} />
      </Layout>
    );
  }

  return (
    <SWRConfig
      value={{
        fetcher: (url) => axios.get(url).then((res) => res.data),
        revalidateOnFocus: false,
        focusThrottleInterval: 30000,
        dedupingInterval: 30000,
        keepPreviousData: true,
      }}
    >
      <LanguageContext.Provider
        value={{
          locale: activeLocale,
          requestedLocale: currentLocale,
          formatRegion,
          setLocale,
          setFormatRegion,
        }}
      >
        <IntlProvider
          locale={getRegionalFormatLocale(activeLocale, formatRegion)}
          defaultLocale="en"
          messages={activeLocale === 'en' ? emptyMessages : loadedMessages}
        >
          <LoadingBar />
          <ThemeProvider>
            <SettingsProvider>
              <InteractionProvider>
                <Head>
                  <meta
                    name="viewport"
                    content="initial-scale=1, viewport-fit=cover, width=device-width"
                  />
                </Head>
                <AppHead />
                <StatusChecker />
                <ServiceWorkerSetup />
                <UserContext>
                  <SetupConnectionsProvider>
                    <NativeRuntimeProvider>{component}</NativeRuntimeProvider>
                  </SetupConnectionsProvider>
                </UserContext>
                <ButtonHelp key={router.asPath} />
                <Toaster
                  position="top-right"
                  toastOptions={{ duration: 4000 }}
                  containerStyle={{
                    zIndex: 10000,
                    paddingTop: 'env(safe-area-inset-top)',
                  }}
                />
              </InteractionProvider>
            </SettingsProvider>
          </ThemeProvider>
        </IntlProvider>
      </LanguageContext.Provider>
    </SWRConfig>
  );
};

export default CoreApp;
