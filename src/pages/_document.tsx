import type { DocumentContext, DocumentInitialProps } from 'next/document';
import Document, { Head, Html, Main, NextScript } from 'next/document';

import { getLocaleDirection } from '@app/utils/localeDirection';
import type { AvailableLocale } from '@server/types/languages';
import {
  isAvailableLocale,
  resolveAcceptLanguage,
} from '@server/types/languages';
import type { JSX } from 'react';

interface MyDocumentProps extends DocumentInitialProps {
  initialLocale: AvailableLocale;
}

const getLocaleHint = (cookieHeader?: string): AvailableLocale | null => {
  for (const cookie of cookieHeader?.split(';') ?? []) {
    const [name, ...valueParts] = cookie.trim().split('=');
    if (name !== 'seerrng-locale') continue;

    try {
      const value = decodeURIComponent(valueParts.join('='));
      return isAvailableLocale(value) ? value : null;
    } catch {
      return null;
    }
  }

  return null;
};

class MyDocument extends Document<MyDocumentProps> {
  static async getInitialProps(
    ctx: DocumentContext
  ): Promise<MyDocumentProps> {
    const initialProps = await Document.getInitialProps(ctx);
    const acceptLanguage = ctx.req?.headers['accept-language'];
    const acceptedLanguages = Array.isArray(acceptLanguage)
      ? acceptLanguage.join(',')
      : (acceptLanguage ?? '');
    const initialLocale =
      getLocaleHint(ctx.req?.headers.cookie) ??
      resolveAcceptLanguage(acceptedLanguages);

    return { ...initialProps, initialLocale };
  }

  render(): JSX.Element {
    const locale = this.props.initialLocale;

    return (
      <Html
        lang={locale}
        dir={getLocaleDirection(locale)}
        data-interface-theme="seerrOrig"
      >
        <Head>
          <link
            id="interface-theme-stylesheet"
            data-interface-theme-stylesheet
            data-interface-theme-id="seerrOrig"
            rel="stylesheet"
            href="/api/v1/interface-themes/seerrOrig/theme.css"
          />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument;
