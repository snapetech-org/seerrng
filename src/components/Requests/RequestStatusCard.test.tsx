import RequestItem from '@app/components/RequestList/RequestItem';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { IntlProvider } from 'react-intl';
import { expect, it, vi } from 'vitest';
import Requests, { RequestStatusCard } from './index';

vi.mock('@app/hooks/useRequestStatusScrollRestoration', () => ({
  default: () => {},
}));
vi.mock('@app/components/RequestStatus/SoftwareRequests', () => ({
  default: () => null,
}));
vi.mock('@app/components/Common/Modal', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
}));
vi.mock('@app/hooks/useSearchActivity', () => ({
  useSearchActivityReporter: () => {},
  default: () => false,
}));
const state = vi.hoisted(() => ({
  details: undefined as unknown,
  list: undefined as unknown,
}));
vi.mock('swr', () => ({
  default: (key: string, options?: { fallbackData?: unknown }) => ({
    data: key?.startsWith('/api/v1/book/')
      ? state.details
      : key?.startsWith('/api/v1/request/status?')
        ? state.list
        : options?.fallbackData,
  }),
  useSWRConfig: () => ({ mutate: vi.fn(), cache: new Map() }),
  mutate: vi.fn(),
}));
vi.mock('next/router', () => ({
  useRouter: () => ({
    pathname: '/requests',
    query: {},
    push: vi.fn(),
    replace: vi.fn(),
    isReady: true,
  }),
}));
vi.mock('@app/hooks/useUser', async (original) => ({
  ...(await original<object>()),
  useUser: () => ({
    user: { id: 1, displayName: 'Admin', avatar: '' },
    hasPermission: () => true,
  }),
}));
vi.mock('@app/hooks/useToasts', () => ({
  default: () => ({ addToast: vi.fn() }),
}));
vi.mock('@app/components/Common/Tooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@app/components/Common/CachedImage', () => ({ default: () => null }));

const item = {
  request: {
    id: 42,
    type: 'book',
    status: 2,
    bookFormat: 'both',
    is4k: false,
    createdAt: '2026-11-16T00:00:00Z',
    requestedBy: { id: 1, displayName: 'Reader', avatar: '' },
    media: {
      id: 3,
      mediaType: 'book',
      identifiers: [{ provider: 'openlibrary', value: 'OL123W' }],
    },
  },
  status: {
    stage: 'searching',
    attempt: 1,
    percent: null,
    size: null,
    sizeLeft: null,
    estimatedCompletionTime: null,
    downloadCount: 0,
    downloadId: null,
    service: 'BookOrbit',
    message: 'Waiting for BookOrbit to approve this request.',
    observedAt: '2026-11-16T00:00:00Z',
    isTerminal: false,
    needsAttention: false,
    retryable: false,
  },
  canRemove: false,
};

it('renders a pending BookOrbit request before and after its metadata loads', () => {
  for (const details of [
    undefined,
    {
      id: 'OL123W',
      mediaType: 'book',
      title: 'Fixture book',
      author: 'Fixture author',
      firstPublishYear: 2020,
      subjects: ['Fantasy'],
    },
  ]) {
    state.details = details;
    const html = renderToStaticMarkup(
      <IntlProvider locale="en">
        <RequestStatusCard
          item={item as never}
          isAdminView
          onRetry={async () => {}}
          isRetrying={false}
          onDelete={() => {}}
          isDeleting={false}
          onRemove={() => {}}
          isRemoving={false}
          isHistoryOpen={false}
          onToggleHistory={() => {}}
        />
      </IntlProvider>
    );
    expect(html).toContain('Waiting for BookOrbit');
  }
});

it('renders the request page when its empty status list loads', () => {
  for (const list of [
    undefined,
    {
      pageInfo: { pages: 0, page: 1, pageSize: 10, results: 0 },
      results: [],
      counts: {
        total: 0,
        pending: 0,
        completed: 0,
        incomplete: 0,
        active: 0,
        attention: 0,
        unavailable: 0,
        failed: 0,
      },
    },
  ]) {
    state.list = list;
    expect(
      renderToStaticMarkup(
        <IntlProvider locale="en">
          <Requests />
        </IntlProvider>
      )
    ).toContain('Requests');
  }
});

it('renders book request summaries without TV season relations', () => {
  const request = {
    id: 42,
    type: 'book',
    status: 2,
    bookFormat: 'ebook',
    is4k: false,
    requestedBy: { id: 1, displayName: 'Reader' },
    media: {
      id: 3,
      mediaType: 'book',
      identifiers: [{ provider: 'openlibrary', value: 'OL123W' }],
    },
  };
  expect(() =>
    renderToStaticMarkup(
      <IntlProvider locale="en">
        <RequestItem request={request as never} revalidateList={() => {}} />
      </IntlProvider>
    )
  ).not.toThrow();
});

it('keeps status and deletion available when one request card crashes', async () => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: 'http://localhost/requests',
  });
  for (const name of [
    'window',
    'document',
    'HTMLElement',
    'Element',
    'Node',
    'MutationObserver',
  ]) {
    vi.stubGlobal(
      name,
      name === 'window' ? dom.window : dom.window[name as keyof Window]
    );
  }
  vi.stubGlobal('self', dom.window);
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const root = createRoot(document.getElementById('root')!);
  state.details = {
    mediaType: 'book',
    title: 'Malformed provider book',
    subjects: [null],
  };
  state.list = {
    pageInfo: { pages: 1, page: 1, pageSize: 10, results: 1 },
    results: [
      item,
      {
        ...item,
        request: {
          ...item.request,
          id: 43,
          type: 'movie',
          media: { id: 4, tmdbId: 550, mediaType: 'movie' },
        },
      },
    ],
    counts: {
      total: 1,
      pending: 0,
      completed: 0,
      incomplete: 1,
      active: 1,
      attention: 0,
      unavailable: 0,
      failed: 0,
    },
  };
  try {
    await act(async () =>
      root.render(
        <IntlProvider locale="en">
          <Requests />
        </IntlProvider>
      )
    );
    expect(document.body.textContent).toContain(
      'Request details could not be displayed'
    );
    expect(document.body.textContent).toContain(
      'Waiting for BookOrbit to approve'
    );
    expect(
      document.querySelector('[data-testid="request-status-43"]')
    ).not.toBeNull();
    const button = [...document.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === 'Delete'
    );
    expect(button).toBeDefined();
    await act(async () => button!.click());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    log.mockRestore();
    vi.unstubAllGlobals();
  }
});
