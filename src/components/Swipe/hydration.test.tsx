import type * as DiscoveryModeTabsModule from '@app/components/Discover/DiscoveryModeTabs';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { IntlProvider } from 'react-intl';
import { afterEach, expect, it, vi } from 'vitest';
import Swipe from './index';
const { router, status } = vi.hoisted(() => ({
  router: {
    isReady: false,
    query: {} as Record<string, string>,
    replace: vi.fn(),
    asPath: '/swipe',
    events: { on: vi.fn(), off: vi.fn() },
  },
  status: { aiRanking: false, mediaTypes: ['tv'], bookFormats: [] },
}));
vi.mock('next/router', () => ({ useRouter: () => router }));
vi.mock('swr', () => ({
  default: (key: string) => ({
    data: key === '/api/v1/swipe/status' ? status : undefined,
  }),
  useSWRConfig: () => ({ mutate: vi.fn() }),
}));
vi.mock('@app/hooks/useToasts', () => ({
  default: () => ({ addToast: vi.fn() }),
}));
vi.mock('@app/hooks/useUser', () => ({
  Permission: { REQUEST: 1, REQUEST_ADULT: 2 },
  useUser: () => ({ hasPermission: () => true }),
}));
vi.mock('@app/components/Common/PageTitle', () => ({ default: () => null }));
vi.mock(
  '@app/components/Discover/DiscoveryModeTabs',
  async (importOriginal) => {
    const original = await importOriginal<typeof DiscoveryModeTabsModule>();
    return { ...original, default: () => null };
  }
);
afterEach(() => vi.unstubAllGlobals());
it('waits for router hydration before falling back from an unavailable category', async () => {
  const dom = new JSDOM('<div id="root"></div>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.getElementById('root')!);
  const render = () =>
    root.render(
      <IntlProvider locale="en">
        <Swipe />
      </IntlProvider>
    );
  try {
    await act(async () => render());
    expect(router.replace).not.toHaveBeenCalled();
    router.isReady = true;
    router.query = {
      mediaType: 'tv',
      returnTo: '/discover/tv/genre/18?sortBy=popularity.desc&page=2',
    };
    await act(async () => render());
    expect(router.replace).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
