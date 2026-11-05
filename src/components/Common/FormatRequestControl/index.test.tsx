import { JSDOM } from 'jsdom';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { IntlProvider } from 'react-intl';
import { afterEach, expect, it, vi } from 'vitest';
import FormatRequestControl from './index';
vi.mock('@app/components/Common/Tooltip', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
afterEach(() => vi.unstubAllGlobals());
it('honors a supplied label and icon for one format while keeping ordinary request text', async () => {
  const dom = new JSDOM('<div id="root"></div>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.getElementById('root')!;
  const root = createRoot(container);
  const click = vi.fn();
  const options = [{ id: 'hd', label: 'HD', onClick: click }];
  try {
    await act(async () =>
      root.render(
        <IntlProvider locale="en">
          <FormatRequestControl
            options={options}
            label="Quality"
            icon={<svg data-testid="quality-icon" />}
          />
        </IntlProvider>
      )
    );
    expect(container.querySelector('button')?.textContent).toBe('QualityHD');
    expect(
      container.querySelector('[data-testid="quality-icon"]')
    ).not.toBeNull();
    await act(async () => container.querySelector('button')?.click());
    expect(click).toHaveBeenCalledOnce();
    await act(async () =>
      root.render(
        <IntlProvider locale="en">
          <FormatRequestControl options={options} />
        </IntlProvider>
      )
    );
    expect(container.querySelector('button')?.textContent).toBe('RequestHD');
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
