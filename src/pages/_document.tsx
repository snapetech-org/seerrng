import type { DocumentContext, DocumentInitialProps } from 'next/document';
import Document, { Head, Html, Main, NextScript } from 'next/document';

import type { JSX } from 'react';

class MyDocument extends Document {
  static async getInitialProps(
    ctx: DocumentContext
  ): Promise<DocumentInitialProps> {
    const initialProps = await Document.getInitialProps(ctx);

    return initialProps;
  }

  render(): JSX.Element {
    return (
      <Html lang="en" dir="ltr" data-interface-theme="seerrOrig">
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
