import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { IntlProvider } from 'react-intl';
import { afterEach, expect, it, vi } from 'vitest';
import FormatRequestControl from './index';
vi.mock('@app/hooks/useUpstreamTheme', () => ({ default: () => true }));
vi.mock('@app/components/Common/Tooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
afterEach(() => vi.unstubAllGlobals());
it('keeps every book/recording format available in dialogs instead of hiding it in an entry menu', () => {
  vi.stubGlobal('React', React);
  const html = renderToStaticMarkup(
    <IntlProvider locale="en">
      <FormatRequestControl
        options={[
          { id: 'ebook', label: 'Book', selected: true, onClick: () => {} },
          {
            id: 'audiobook',
            label: 'Audiobook',
            disabled: true,
            onClick: () => {},
          },
        ]}
      />
    </IntlProvider>
  );
  expect(html).toContain('data-testid="format-request-option-ebook"');
  expect(html).toContain('data-testid="format-request-option-audiobook"');
  expect(html).toContain('aria-pressed="true"');
  expect(html).not.toContain('upstream-request-control');
});
