import { JSDOM } from 'jsdom';
import { act, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { IntlProvider } from 'react-intl';
import { afterEach, expect, it, vi } from 'vitest';
import DiscoveryModeTabs from './DiscoveryModeTabs';

const { router } = vi.hoisted(() => ({
  router: {
    isReady: true,
    asPath: '/discover/tv',
    events: { on: vi.fn(), off: vi.fn() },
  },
}));
vi.mock('next/router', () => ({ useRouter: () => router }));
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
    href: string | { pathname: string; query: Record<string, string> };
    children: ReactNode;
  }) => (
    <a
      {...props}
      href={
        typeof href === 'string'
          ? href
          : `${href.pathname}?${new URLSearchParams(href.query)}`
      }
    >
      {children}
    </a>
  ),
}));
vi.mock('@app/hooks/useUser', () => ({
  Permission: { REQUEST: 1, REQUEST_ADULT: 2 },
  useUser: () => ({ hasPermission: () => true }),
}));
vi.mock('@app/components/Discover/FilterPanel/CompactFilterSelect', () => ({
  getFilterToggleButtonClass: () => 'app-filter-toggle',
}));
afterEach(() => {
  router.isReady = true;
  vi.unstubAllGlobals();
});

it('blocks fallback navigation until the nested discovery route is hydrated', async () => {
  const dom = new JSDOM('<div id="root"></div>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.getElementById('root')!;
  const root = createRoot(container);
  const render = () =>
    root.render(
      <IntlProvider locale="en">
        <DiscoveryModeTabs selected="discover" mediaType="tv" />
      </IntlProvider>
    );
  router.isReady = false;
  router.asPath = '/discover/tv/genre/18?sortBy=popularity.desc&page=2';
  try {
    await act(async () => render());
    const tab = container.querySelector<HTMLAnchorElement>(
      '[data-testid="discovery-mode-tab-swipe"]'
    )!;
    const click = new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    tab.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(tab.getAttribute('aria-disabled')).toBe('true');
    router.isReady = true;
    await act(async () => render());
    expect(tab.getAttribute('aria-disabled')).toBe('false');
    expect(
      new URL(tab.href, 'http://localhost').searchParams.get('returnTo')
    ).toBe(router.asPath);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});

it('uses the current nested route and filters after a discovery route update', async () => {
  const dom = new JSDOM('<div id="root"></div>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.getElementById('root')!;
  const root = createRoot(container);
  const render = () =>
    root.render(
      <IntlProvider locale="en">
        <DiscoveryModeTabs selected="discover" mediaType="tv" />
      </IntlProvider>
    );
  try {
    await act(async () => render());
    router.asPath = '/discover/tv/genre/18?sortBy=popularity.desc&page=2';
    await act(async () => render());
    const href = container
      .querySelector('[data-testid="discovery-mode-tab-swipe"]')
      ?.getAttribute('href');
    expect(
      new URL(href!, 'http://localhost').searchParams.get('returnTo')
    ).toBe(router.asPath);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
