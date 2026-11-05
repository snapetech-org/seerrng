import { AxiosError } from 'axios';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IntlProvider } from 'react-intl';
import { SWRConfig, type Cache } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useDiscover from './useDiscover';

const state = vi.hoisted(() => ({
  settings: {
    currentSettings: { hideAvailable: false, hideBlocklisted: false },
  },
}));

vi.mock('./useSettings', () => ({ default: () => state.settings }));
vi.mock('./useUser', () => ({
  Permission: { MANAGE_BLOCKLIST: 'MANAGE_BLOCKLIST' },
  useUser: () => ({ user: { id: 1 }, hasPermission: () => false }),
}));
vi.mock('@app/hooks/useToasts', () => ({
  default: () => ({ addToast: vi.fn() }),
}));
vi.mock('next/router', () => ({
  useRouter: () => ({ asPath: '/discover/comics' }),
}));
vi.mock('@app/utils/discoverScrollRestoration', () => ({
  readDiscoverScrollEntry: () => undefined,
}));
vi.mock('@app/utils/swrCache', () => ({
  setPersistentResponse: vi.fn(),
  usePersistentResponse: () => undefined,
}));

let dom: JSDOM;
let root: Root;
let host: HTMLDivElement;
let cache: Cache;
let comicVineConfigured: boolean;
let fetchCount: number;

const ComicsProbe = () => {
  const discover = useDiscover<
    { id: number; mediaType: string },
    { comicVineConfigured?: boolean }
  >(
    '/api/v1/discover/comics',
    { query: '', publisher: '', startYear: '', minIssues: '', maxIssues: '' },
    { revalidateOnMount: true, dedupingInterval: 0 }
  );

  return (
    <>
      <output data-testid="configured">
        {String(discover.firstResultData?.comicVineConfigured)}
      </output>
      <output data-testid="validating">{String(discover.isValidating)}</output>
    </>
  );
};

const DefaultDiscoveryProbe = () => {
  useDiscover<{ id: number; mediaType: string }>('/api/v1/discover/movies', {
    query: '',
  });

  return <output data-testid="default-discovery">mounted</output>;
};

const renderProbe = (
  probe = <ComicsProbe />,
  fetcher?: (url: string) => Promise<unknown>
) =>
  root.render(
    <SWRConfig
      value={{
        provider: () => cache,
        fetcher:
          fetcher ??
          (async () => {
            fetchCount += 1;
            return {
              page: 1,
              totalPages: 0,
              totalResults: 0,
              results: [],
              comicVineConfigured,
            };
          }),
        revalidateOnFocus: false,
        dedupingInterval: 30_000,
      }}
    >
      <IntlProvider locale="en">{probe}</IntlProvider>
    </SWRConfig>
  );

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  cache = new Map();
  comicVineConfigured = false;
  fetchCount = 0;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
  vi.unstubAllGlobals();
});

describe('Discover SWR behavior', () => {
  it('fetches the first page when a discovery consumer uses default options', async () => {
    await act(async () => renderProbe(<DefaultDiscoveryProbe />));

    expect(fetchCount).toBe(1);
  });

  it('rechecks ComicVine configuration when returning after saving the key', async () => {
    await act(async () => renderProbe());
    expect(host.querySelector('[data-testid="configured"]')?.textContent).toBe(
      'false'
    );
    expect(fetchCount).toBe(1);

    await act(async () => root.render(null));
    comicVineConfigured = true;

    await act(async () => renderProbe());

    expect(fetchCount).toBe(2);
    expect(host.querySelector('[data-testid="configured"]')?.textContent).toBe(
      'true'
    );
  });
});

const RecoveryProbe = () => {
  const discover = useDiscover<{ id: number; mediaType: string }>(
    '/api/v1/discover/movies',
    {},
    {
      recoverSinglePageFailure: true,
      randomizeOrder: false,
      dedupingInterval: 0,
    }
  );
  return (
    <>
      <output data-testid="results">
        {discover.titles.map((x) => x.id).join(',')}
      </output>
      <output data-testid="error">{String(!!discover.error)}</output>
      <button onClick={discover.fetchMore}>More</button>
    </>
  );
};
const pageError = (status: number) =>
  new AxiosError(
    'Fixture provider failure',
    'ERR_BAD_RESPONSE',
    undefined,
    undefined,
    { status } as never
  );
const nextPage = async () => {
  await act(async () => {
    host.querySelector('button')!.click();
  });
};

describe('bounded Discover page recovery', () => {
  it('retries and skips only one isolated failed page, then resumes the catalogue', async () => {
    const calls: number[] = [];
    const fetcher = async (url: string) => {
      const page = Number(
        new URL(url, 'http://fixture.test').searchParams.get('page')
      );
      calls.push(page);
      if (page === 2) throw pageError(503);
      return {
        page,
        totalPages: 4,
        totalResults: 4,
        results: [{ id: page, mediaType: 'movie' }],
      };
    };
    await act(async () => renderProbe(<RecoveryProbe />, fetcher));
    await nextPage();
    await nextPage();
    expect(host.querySelector('[data-testid="results"]')?.textContent).toBe(
      '1,3'
    );
    expect(host.querySelector('[data-testid="error"]')?.textContent).toBe(
      'false'
    );
    expect(calls).toEqual([1, 2, 2, 3]);
  });

  it('surfaces consecutive page failures instead of skipping the rest of the feed', async () => {
    const calls: number[] = [];
    await act(async () =>
      renderProbe(<RecoveryProbe />, async (url) => {
        const page = Number(
          new URL(url, 'http://fixture.test').searchParams.get('page')
        );
        calls.push(page);
        if (page > 1) throw pageError(503);
        return {
          page,
          totalPages: 4,
          totalResults: 4,
          results: [{ id: 1, mediaType: 'movie' }],
        };
      })
    );
    await nextPage();
    await nextPage();
    expect(host.querySelector('[data-testid="error"]')?.textContent).toBe(
      'true'
    );
    expect(calls).toEqual([1, 2, 2, 3]);
  });

  for (const status of [401, 403, 429])
    it(`does not retry or hide a ${status} response`, async () => {
      const calls: number[] = [];
      await act(async () =>
        renderProbe(<RecoveryProbe />, async (url) => {
          const page = Number(
            new URL(url, 'http://fixture.test').searchParams.get('page')
          );
          calls.push(page);
          if (page > 1) throw pageError(status);
          return {
            page,
            totalPages: 4,
            totalResults: 4,
            results: [{ id: 1, mediaType: 'movie' }],
          };
        })
      );
      await nextPage();
      expect(host.querySelector('[data-testid="error"]')?.textContent).toBe(
        'true'
      );
      expect(calls).toEqual([1, 2]);
    });

  it('preserves the first-page error without synthesizing an empty successful response', async () => {
    let calls = 0;
    await act(async () =>
      renderProbe(<RecoveryProbe />, async () => {
        calls++;
        throw pageError(503);
      })
    );
    expect(host.querySelector('[data-testid="error"]')?.textContent).toBe(
      'true'
    );
    expect(calls).toBe(1);
  });
});
