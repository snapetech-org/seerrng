import {
  MediaRequestFailureReason,
  MediaRequestStatus,
  MediaType,
} from '@server/constants/media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { IntlProvider } from 'react-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import RequestBlock from './index';

const state = vi.hoisted(() => ({
  modalProps: null as Record<string, unknown> | null,
}));

vi.mock('next/dynamic', async () => {
  const ReactModule = await import('react');
  return {
    default: () =>
      function RequestModalStub(props: Record<string, unknown>) {
        state.modalProps = props;
        return ReactModule.createElement('div', {
          'data-testid': 'edit-request-modal',
          'data-type': props.type,
          'data-tmdb-id': props.tmdbId,
        });
      },
  };
});

vi.mock('@app/components/Common/Badge', async () => {
  const ReactModule = await import('react');
  return {
    default: ({ children }: { children: React.ReactNode }) =>
      ReactModule.createElement('span', null, children),
  };
});
vi.mock('@app/components/Common/BookFormatBadge', async () => {
  const ReactModule = await import('react');
  return {
    default: ({ children }: { children?: React.ReactNode }) =>
      ReactModule.createElement('span', null, children),
    getRequestedBookFormat: () => 'ebook',
  };
});
vi.mock('@app/components/Common/Button', async () => {
  const ReactModule = await import('react');
  return {
    default: ({
      children,
      onClick,
      disabled,
      as,
      href,
      buttonType,
      'aria-label': ariaLabel,
    }: {
      children: React.ReactNode;
      onClick?: React.MouseEventHandler<HTMLButtonElement>;
      disabled?: boolean;
      as?: string;
      href?: string;
      buttonType?: string;
      'aria-label'?: string;
    }) =>
      ReactModule.createElement(
        as === 'a' ? 'a' : 'button',
        {
          type: as === 'a' ? undefined : 'button',
          href,
          onClick,
          disabled: as === 'a' ? undefined : disabled,
          'aria-label': ariaLabel,
          'data-button-type': buttonType,
        },
        children
      ),
  };
});
vi.mock('@app/components/Common/CachedImage', () => ({
  default: () => null,
}));
vi.mock('@app/components/Common/MediaTypeBadge', async () => {
  const ReactModule = await import('react');
  return {
    default: () => ReactModule.createElement('span'),
    getMediaTypeBadgeType: (type: string) => type,
  };
});
vi.mock('@app/components/Common/Tooltip', () => ({
  default: ({ children }: { children: React.ReactElement }) => children,
}));
vi.mock('@app/hooks/useRequestOverride', () => ({
  default: () => ({}),
}));
vi.mock('@app/hooks/useUser', () => ({
  useUser: () => ({ user: { id: 7 } }),
}));
vi.mock('next/link', async () => {
  const ReactModule = await import('react');
  return {
    default: ({
      children,
      href,
    }: {
      children: React.ReactNode;
      href: string;
    }) => ReactModule.createElement('a', { href }, children),
  };
});

let dom: JSDOM;
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;

beforeEach(() => {
  state.modalProps = null;
  dom = new JSDOM('<!doctype html><body></body>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
  vi.unstubAllGlobals();
});

it('opens the movie edit modal when the detail API omits the request media back-reference', async () => {
  const request = {
    id: 29,
    type: MediaType.MOVIE,
    status: MediaRequestStatus.PENDING,
    requestedBy: { id: 7, displayName: 'Test User', avatar: '' },
    is4k: false,
    createdAt: new Date('2026-10-04T12:00:00.000Z'),
    seasons: [],
    media: undefined,
  } as unknown as MediaRequest;

  await act(async () =>
    root.render(
      <IntlProvider locale="en">
        <RequestBlock
          request={request}
          mediaType={MediaType.MOVIE}
          tmdbId={1234}
        />
      </IntlProvider>
    )
  );

  const editButton = host.querySelector<HTMLButtonElement>(
    'button[data-button-type="warning"]'
  );
  expect(editButton).not.toBeNull();

  await act(async () => editButton!.click());

  expect(
    host.querySelector('[data-testid="edit-request-modal"]')
  ).not.toBeNull();
  expect(state.modalProps).toMatchObject({
    show: true,
    type: 'movie',
    tmdbId: 1234,
    editRequest: request,
  });
});

it('opens the book edit modal from the external detail identity without a media back-reference', async () => {
  const request = {
    id: 30,
    type: MediaType.BOOK,
    status: MediaRequestStatus.PENDING,
    requestedBy: { id: 7, displayName: 'Test User', avatar: '' },
    is4k: false,
    createdAt: new Date('2026-10-04T12:00:00.000Z'),
    seasons: [],
    media: undefined,
    bookFormat: 'audiobook',
  } as unknown as MediaRequest;

  await act(async () =>
    root.render(
      <IntlProvider locale="en">
        <RequestBlock
          request={request}
          mediaType={MediaType.BOOK}
          bookId="OL123W"
        />
      </IntlProvider>
    )
  );

  const editButton = host.querySelector<HTMLButtonElement>(
    'button[data-button-type="warning"]'
  );
  expect(editButton).not.toBeNull();

  await act(async () => editButton!.click());

  expect(
    host.querySelector('[data-testid="edit-request-modal"]')
  ).not.toBeNull();
  expect(state.modalProps).toMatchObject({
    show: true,
    type: MediaType.BOOK,
    bookId: 'OL123W',
    editRequest: request,
  });
});

it('shows active TV season selections without declined history', async () => {
  const request = {
    id: 31,
    type: MediaType.TV,
    status: MediaRequestStatus.APPROVED,
    requestedBy: { id: 7, displayName: 'Test User', avatar: '' },
    is4k: false,
    createdAt: new Date('2026-10-04T12:00:00.000Z'),
    seasons: [
      { id: 1, seasonNumber: 1, status: MediaRequestStatus.COMPLETED },
      { id: 2, seasonNumber: 2, status: MediaRequestStatus.DECLINED },
    ],
    media: undefined,
  } as unknown as MediaRequest;

  await act(async () =>
    root.render(
      <IntlProvider locale="en">
        <RequestBlock
          request={request}
          mediaType={MediaType.TV}
          tmdbId={1234}
        />
      </IntlProvider>
    )
  );

  const seasonSummary = host.querySelector('div.mt-2.flex.flex-col.text-sm');
  expect(seasonSummary?.textContent).toContain('1');
  expect(seasonSummary?.textContent).not.toContain('2');
});

it('explains a TV season mismatch and offers another listing in management', async () => {
  const request = {
    id: 32,
    type: MediaType.TV,
    status: MediaRequestStatus.FAILED,
    failureReason: MediaRequestFailureReason.TVDB_SEASON_MISMATCH,
    requestedBy: { id: 7, displayName: 'Test User', avatar: '' },
    is4k: false,
    createdAt: new Date('2026-10-04T12:00:00.000Z'),
    seasons: [],
    media: undefined,
  } as unknown as MediaRequest;

  await act(async () =>
    root.render(
      <IntlProvider locale="en">
        <RequestBlock
          request={request}
          mediaType={MediaType.TV}
          tmdbId={1234}
          searchTitle="The Office"
        />
      </IntlProvider>
    )
  );

  expect(host.textContent).toContain(
    "This listing's regular-season numbers do not match TVDB."
  );
  expect(host.textContent).toContain('Find Another Listing');
  expect(
    host.querySelector('a[href="/search?query=The%20Office&type=tv"]')
  ).not.toBeNull();
  expect(
    host.querySelector('#request-failure-reason-request-block-32')
  ).not.toBeNull();
});

it('does not show unknown provider failure text in management', async () => {
  const request = {
    id: 33,
    type: MediaType.TV,
    status: MediaRequestStatus.FAILED,
    failureReason: 'provider response included a private endpoint',
    requestedBy: { id: 7, displayName: 'Test User', avatar: '' },
    is4k: false,
    createdAt: new Date('2026-10-04T12:00:00.000Z'),
    seasons: [],
    media: undefined,
  } as unknown as MediaRequest;

  await act(async () =>
    root.render(
      <IntlProvider locale="en">
        <RequestBlock
          request={request}
          mediaType={MediaType.TV}
          tmdbId={1234}
        />
      </IntlProvider>
    )
  );

  expect(host.textContent).not.toContain(
    'provider response included a private endpoint'
  );
  expect(host.textContent).not.toContain('Find Another Listing');
});
