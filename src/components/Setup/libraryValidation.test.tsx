import axios from 'axios';
import { JSDOM } from 'jsdom';
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IntlProvider } from 'react-intl';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Setup from './index';

const mocks = vi.hoisted(() => ({
  router: {
    pathname: '/setup',
    asPath: '/setup',
    isReady: true,
    query: {},
    push: vi.fn(),
    replace: vi.fn(),
  },
  user: { id: 1, permissions: 2 },
  revalidate: vi.fn(async () => undefined),
  hasPermission: () => true,
}));
vi.mock('@app/assets/services/emby.svg', () => ({ default: () => null }));
vi.mock('@app/assets/services/jellyfin.svg', () => ({ default: () => null }));
vi.mock('@app/assets/services/plex.svg', () => ({ default: () => null }));
vi.mock('next/router', () => ({ useRouter: () => mocks.router }));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@app/hooks/useSettings', () => ({
  default: () => ({
    currentSettings: { initialized: false, mediaServerType: 1, locale: 'en' },
  }),
}));
vi.mock('@app/hooks/useLocale', () => ({
  default: () => ({ locale: 'en' }),
}));
vi.mock('@app/hooks/useUser', () => ({
  Permission: { ADMIN: 2 },
  useUser: () => ({
    user: mocks.user,
    loading: false,
    revalidate: mocks.revalidate,
    hasPermission: mocks.hasPermission,
  }),
}));
vi.mock('@app/components/AppDataWarning', () => ({ default: () => null }));
vi.mock('@app/components/Common/ImageFader', () => ({ default: () => null }));
vi.mock('@app/components/Common/PageTitle', () => ({ default: () => null }));
vi.mock('@app/components/Common/Tooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@app/components/Layout/LanguagePicker', () => ({
  default: () => null,
}));
vi.mock('@app/components/Setup/SetupConnectionsGuide', () => ({
  default: () => null,
}));
vi.mock('@app/components/TransportSecurityNotice', () => ({
  default: function TransportReadiness({
    onReadinessChange,
  }: {
    onReadinessChange: (ready: boolean) => void;
  }) {
    useEffect(() => onReadinessChange(true), [onReadinessChange]);
    return null;
  },
}));
vi.mock('axios', () => ({
  default: { get: vi.fn(), isCancel: () => false },
}));

let dom: JSDOM;
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/setup',
  });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(axios.get).mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
  vi.unstubAllGlobals();
});

const renderSetup = async () => {
  await act(async () => {
    root.render(
      <IntlProvider locale="en">
        <SWRConfig
          value={{
            provider: () => new Map(),
            fetcher: async () => [],
          }}
        >
          <Setup />
        </SWRConfig>
      </IntlProvider>
    );
  });
};

describe('setup library validation', () => {
  it('checks once and remains idle across state updates', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { libraries: [{ id: '1', name: 'Movies', enabled: true }] },
    });
    await renderSetup();
    expect(axios.get).toHaveBeenCalledTimes(1);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(axios.get).toHaveBeenCalledTimes(1);
    const next = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Continue'
    );
    expect(next?.disabled).toBe(false);
  });

  it('stops after a failed read and retries without retoggling libraries', async () => {
    vi.mocked(axios.get)
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValue({
        data: { libraries: [{ id: '1', name: 'Movies', enabled: true }] },
      });
    await renderSetup();
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain(
      'Your library selections have been kept.'
    );
    const retry = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Retry'
    );
    expect(retry).toBeDefined();
    await act(async () => retry?.click());
    expect(axios.get).toHaveBeenCalledTimes(2);
    expect(container.textContent).not.toContain(
      'Could Not Check Selected Libraries'
    );
    expect(
      [...container.querySelectorAll('button')].find(
        (button) => button.textContent === 'Continue'
      )?.disabled
    ).toBe(false);
  });
});
