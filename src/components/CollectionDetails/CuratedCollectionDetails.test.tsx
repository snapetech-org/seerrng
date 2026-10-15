import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { IntlProvider } from 'react-intl';
import { afterEach, expect, it, vi } from 'vitest';
import CuratedCollectionDetails from './CuratedCollectionDetails';

const state = vi.hoisted(() => ({
  retryRatings: vi.fn(),
  retryPosters: vi.fn(),
  push: vi.fn(),
  loadingPosters: false,
  musicServices: [
    { id: 8, name: 'Lidarr-MP3', is4k: false, isDefault: true },
    { id: 10, name: 'Lidarr-FLAC', is4k: false, isDefault: false },
  ],
  collection: {
    name: 'Test Collection',
    overview: 'Artist overview.',
    backdropPath: '/artist-backdrop.jpg',
    posterPath: 'https://assets.fanart.tv/fanart/artist.jpg',
    sourceUrl: 'https://musicbrainz.org',
    parts: [
      {
        id: 'studio',
        title: 'Studio',
        releaseDate: '1998',
        genres: ['pop'],
        primaryType: 'Album',
        secondaryTypes: [],
        mediaInfo: { id: 1, ratingKeyMp3: '1' },
      },
      {
        id: 'live',
        title: 'Live',
        releaseDate: '2000',
        genres: ['rock'],
        primaryType: 'Album',
        secondaryTypes: ['Live', 'Compilation'],
        mediaInfo: { id: 2, ratingKeyMp3: '2' },
      },
    ],
  },
}));
vi.mock('next/router', () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock('next/dynamic', async () => {
  const ReactModule = await import('react');
  return {
    default: () =>
      function MockRequestModal({
        type,
        tmdbId,
        mbId,
        collectionId,
        initialSelectedIds,
        initialFormat,
        initialMusicServerId,
        onCancel,
      }: {
        type?: string;
        tmdbId?: number;
        mbId?: string;
        collectionId?: string;
        initialSelectedIds?: string[];
        initialFormat?: 'mp3' | 'flac';
        initialMusicServerId?: number;
        onCancel?: () => void;
      }) {
        return ReactModule.createElement(
          'div',
          {
            'data-testid': 'request-modal',
            'data-type': collectionId
              ? initialFormat
                ? 'musiccollection'
                : 'tvcollection'
              : type,
            'data-id': collectionId ?? mbId ?? tmdbId,
            'data-selected': initialSelectedIds?.join(','),
            'data-format': initialFormat,
            'data-server-id': initialMusicServerId,
          },
          ReactModule.createElement(
            'button',
            {
              type: 'button',
              'data-testid': 'cancel-queued-request',
              onClick: onCancel,
            },
            'Cancel queued request'
          )
        );
      },
  };
});
vi.mock('swr', () => ({
  default: (key: string) => ({
    data: key?.includes('collection-catalog')
      ? state.collection
      : key?.includes('/api/v1/service/lidarr')
        ? state.musicServices
        : undefined,
  }),
}));
vi.mock('@app/hooks/useCollectionAvailability', () => ({
  default: () => ({}),
}));
vi.mock('@app/hooks/useUser', () => ({
  Permission: {
    MANAGE_BLOCKLIST: 'manage-blocklist',
    REQUEST: 'request',
    REQUEST_TV: 'request-tv',
    REQUEST_MUSIC: 'request-music',
    REQUEST_4K: 'request-4k',
    REQUEST_4K_TV: 'request-4k-tv',
  },
  useUser: () => ({ hasPermission: () => true }),
}));
vi.mock('@app/hooks/useSettings', () => ({
  default: () => ({ currentSettings: { series4kEnabled: false } }),
}));
vi.mock('@app/hooks/useToasts', () => ({
  default: () => ({ addToast: vi.fn() }),
}));
vi.mock('@app/hooks/useCuratedRatings', () => ({
  default: () => ({
    members: [],
    loading: false,
    complete: false,
    retry: state.retryRatings,
  }),
}));
vi.mock('@app/hooks/useCuratedPosters', () => ({
  default: () => ({
    posters: {},
    complete: false,
    loading: state.loadingPosters,
    retry: state.retryPosters,
  }),
}));
vi.mock('@app/components/Common/CachedImage', () => ({ default: () => null }));
vi.mock('@app/components/Common/PageTitle', () => ({ default: () => null }));
vi.mock(
  '@app/components/CollectionDetails/CollectionAssociationsButton',
  () => ({
    default: () => null,
  })
);
vi.mock('@app/components/MediaDetails/MediaDetailArtwork', () => ({
  default: ({ src, type }: { src: string; type: string }) => (
    <div data-testid="artist-backdrop" data-src={src} data-type={type} />
  ),
}));
vi.mock('@app/components/MediaDetails/MediaQualitySelect', () => ({
  default: () => null,
}));
vi.mock('@app/components/MediaDetails/MusicRatings', () => ({
  default: () => null,
}));
vi.mock('./CollectionRatings', () => ({ default: () => null }));
vi.mock('./DiscographyRequestActions', () => ({
  default: ({ items }: { items: { id: string }[] }) => (
    <output data-testid="discography-request">
      {items.map((item) => item.id).join(',')}
    </output>
  ),
}));
vi.mock('./CollectionOverview', () => ({ default: () => null }));
vi.mock('./CuratedGenreLinks', () => ({ default: () => null }));
vi.mock('./CollectionPlayOnDeviceButton', () => ({
  default: ({
    mediaIds,
    disabledReason,
  }: {
    mediaIds: number[];
    disabledReason?: string;
  }) => (
    <button
      data-testid="device"
      disabled={!!disabledReason}
      title={disabledReason}
    >
      {mediaIds.join(',')}
    </button>
  ),
}));
vi.mock('@app/components/Common/MediaServerPlayButton', () => ({
  default: ({
    collectionMediaIds,
    disabled,
    disabledReason,
  }: {
    collectionMediaIds: number[];
    disabled: boolean;
    disabledReason?: string;
  }) => (
    <button data-testid="play" disabled={disabled} title={disabledReason}>
      {collectionMediaIds.join(',')}
    </button>
  ),
}));
vi.mock('./CollectionServerActions', () => ({
  default: ({ visibleItemIds = [] }: { visibleItemIds?: string[] }) => (
    <output data-testid="add" className="collection-server-actions">
      <span data-visible-item-ids={visibleItemIds.join(',')}>
        Add Collection
      </span>
    </output>
  ),
}));
vi.mock('@app/components/Common/ThreeItemScroll', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock('./CuratedMemberCard', () => ({
  default: ({
    part,
    selected,
    toggle,
  }: {
    part: { id: string };
    selected: boolean;
    toggle: () => void;
  }) => (
    <button data-member={part.id} aria-pressed={selected} onClick={toggle}>
      {part.id}
    </button>
  ),
}));
vi.mock('@app/components/Discover/FilterPanel/CompactFilterSelect', () => ({
  FilterResetButton: ({
    label,
    onClick,
  }: {
    label: string;
    onClick: () => void;
  }) => <button onClick={onClick}>{label}</button>,
  CompactSelect: ({
    label,
    value,
    options,
    onChange,
  }: {
    label: string;
    value: string;
    options: { label: string; value: string }[];
    onChange: (value: string) => void;
  }) => (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));
afterEach(() => vi.unstubAllGlobals());
it('opens the series collection requester with the selected series', async () => {
  const dom = new JSDOM('<html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('Element', dom.window.Element);
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.getElementById('root')!);
  const originalParts = state.collection.parts;
  state.collection.parts = [
    { ...originalParts[0], id: '123', title: 'First Series' },
    { ...originalParts[1], id: '456', title: 'Second Series' },
  ];

  try {
    await act(async () =>
      root.render(
        <IntlProvider locale="en">
          <CuratedCollectionDetails kind="tv" id="series-collection" />
        </IntlProvider>
      )
    );
    await act(async () => {
      document
        .querySelector<HTMLButtonElement>(
          '[data-testid="format-request-control"]'
        )
        ?.click();
    });

    const modal = document.querySelector('[data-testid="request-modal"]');
    expect(modal?.getAttribute('data-type')).toBe('tvcollection');
    expect(modal?.getAttribute('data-id')).toBe('series-collection');
    expect(modal?.getAttribute('data-selected')).toBe('123,456');
  } finally {
    await act(async () => root.unmount());
    state.collection.parts = originalParts;
  }
});
it('keeps playback scoped to shown selections while Add Collection ignores the selection circles', async () => {
  const dom = new JSDOM('<html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('Element', dom.window.Element);
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.getElementById('root')!);
  const output = (name: string) =>
    document.querySelector(`[data-testid="${name}"]`)?.textContent;
  const addVisibleIds = () =>
    document
      .querySelector('[data-testid="add"] [data-visible-item-ids]')
      ?.getAttribute('data-visible-item-ids');
  const click = async (label: string) =>
    act(async () => {
      const button = [...document.querySelectorAll('button')].find(
        (button) => button.textContent === label
      )!;
      button.click();
    });
  const clickTestId = async (testId: string) =>
    act(async () => {
      (
        document.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement
      ).click();
    });
  const filter = async (label: string, value: string) =>
    act(async () => {
      const select = document.querySelector(
        `select[aria-label="${label}"]`
      ) as HTMLSelectElement;
      select.value = value;
      select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
  try {
    await act(async () =>
      root.render(
        <IntlProvider locale="en">
          <CuratedCollectionDetails kind="music" id="artist" />
        </IntlProvider>
      )
    );
    expect(output('add')).toBe('Add Collection');
    expect(addVisibleIds()).toBe('studio');
    expect(document.querySelector('[data-member="live"]')).toBeNull();
    expect(
      (
        document.querySelector(
          'select[aria-label="Release Type"]'
        ) as HTMLSelectElement
      ).value
    ).toBe('Album');
    expect(
      document.querySelector('.music-collection-load-status')?.textContent
    ).toBe('Selection 1/2');
    state.loadingPosters = true;
    await act(async () =>
      root.render(
        <IntlProvider locale="en">
          <CuratedCollectionDetails kind="music" id="artist" />
        </IntlProvider>
      )
    );
    expect(
      document
        .querySelector('.music-collection-load-status')
        ?.getAttribute('aria-busy')
    ).toBe('true');
    state.loadingPosters = false;
    await act(async () =>
      root.render(
        <IntlProvider locale="en">
          <CuratedCollectionDetails kind="music" id="artist" />
        </IntlProvider>
      )
    );
    expect(
      document.querySelector('.music-collection-load-status')?.textContent
    ).toBe('Selection 1/2');
    expect(
      document.querySelectorAll(
        '.music-collection-action-row .app-button-association'
      )
    ).toHaveLength(2);
    const musicActions = document.querySelector(
      '.music-collection-primary-action-row'
    );
    const selectionActions = document.querySelector(
      '.music-collection-action-row'
    );
    expect(musicActions).not.toBeNull();
    expect(selectionActions).not.toBeNull();
    expect(
      !!(
        musicActions!.compareDocumentPosition(selectionActions!) &
        window.Node.DOCUMENT_POSITION_FOLLOWING
      )
    ).toBe(true);
    expect(musicActions?.textContent).not.toContain('Request Discography');
    expect(musicActions?.textContent).toContain('MP3');
    expect(musicActions?.textContent).toContain('FLAC');
    const types = document.querySelector('select[aria-label="Release Type"]')!;
    expect(types.querySelectorAll('option')).toHaveLength(18);
    await click('Clear Filters');
    expect(document.querySelectorAll('[data-member]')).toHaveLength(2);
    await click('Select All');
    await filter('Release Type', 'Live');
    expect(state.retryRatings).toHaveBeenCalled();
    expect(state.retryPosters).toHaveBeenCalled();
    expect(output('add')).toBe('Add Collection');
    expect(addVisibleIds()).toBe('live');
    await click('MP3');
    expect(
      document
        .querySelector('[data-testid="request-modal"]')
        ?.getAttribute('data-type')
    ).toBe('musiccollection');
    expect(
      document
        .querySelector('[data-testid="request-modal"]')
        ?.getAttribute('data-id')
    ).toBe('artist');
    expect(
      document
        .querySelector('[data-testid="request-modal"]')
        ?.getAttribute('data-selected')
    ).toBe('live');
    expect(
      document
        .querySelector('[data-testid="request-modal"]')
        ?.getAttribute('data-format')
    ).toBe('mp3');
    await clickTestId('cancel-queued-request');
    await click('FLAC');
    expect(
      document
        .querySelector('[data-testid="request-modal"]')
        ?.getAttribute('data-format')
    ).toBe('flac');
    await clickTestId('cancel-queued-request');
    await filter('Release Type', 'Compilation');
    expect(output('add')).toBe('Add Collection');
    expect(addVisibleIds()).toBe('live');
    expect(output('play')).toBe('2');
    expect(output('device')).toBe('2');
    expect(document.querySelector('[data-member="studio"]')).toBeNull();
    await click('Clear Selection');
    expect(output('add')).toBe('Add Collection');
    expect(
      document.querySelector<HTMLButtonElement>(
        '[data-testid="format-request-option-mp3"]'
      )?.disabled
    ).toBe(true);
    await click('Select All');
    expect(output('add')).toBe('Add Collection');
    await filter('Genres', 'pop');
    expect(output('add')).toBe('Add Collection');
    expect(addVisibleIds()).toBe('');
    expect(output('play')).toBe('');
    expect(document.querySelector('[role="status"]')?.textContent).toBe(
      'No items match these filters.'
    );
    await click('Clear Filters');
    expect(output('add')).toBe('Add Collection');
    expect(document.querySelectorAll('[data-member]')).toHaveLength(2);
    expect(addVisibleIds()).toBe('studio,live');
    state.collection.parts[1].mediaInfo = { id: 2, ratingKeyMp3: '' };
    await click('Select All');
    expect(
      document.querySelector<HTMLButtonElement>('[data-testid="play"]')
        ?.disabled
    ).toBe(true);
    expect(
      document.querySelector<HTMLButtonElement>('[data-testid="device"]')
        ?.disabled
    ).toBe(true);
    expect(
      document.querySelector('[data-testid="play"]')?.getAttribute('title')
    ).toBe('Not all selected titles are available in this quality.');
    await click('Clear Selection');
    await click('studio');
    expect(
      document.querySelector<HTMLButtonElement>('[data-testid="play"]')
        ?.disabled
    ).toBe(false);
    expect(
      document.querySelector<HTMLButtonElement>('[data-testid="device"]')
        ?.disabled
    ).toBe(false);
    expect(output('play')).toBe('1');
    await click('Select All');
    expect(output('add')).toBe('Add Collection');
    await filter('Release Type', 'Album');
    expect(output('add')).toBe('Add Collection');
    expect(document.querySelector('[data-member="live"]')).toBeNull();
    await click('Clear Filters');
    expect(output('add')).toBe('Add Collection');
    await click('Select All');
    expect(output('add')).toBe('Add Collection');
    await filter('Release Year', '1998');
    expect(output('add')).toBe('Add Collection');
    expect(addVisibleIds()).toBe('studio');
    await click('Clear Filters');
    expect(output('add')).toBe('Add Collection');
    await act(async () =>
      root.render(
        <IntlProvider locale="en">
          <CuratedCollectionDetails kind="tv" id="series" />
        </IntlProvider>
      )
    );
    expect(document.querySelector('.music-collection-filter-row')).toBeNull();
    expect(document.querySelector('.music-collection-action-row')).toBeNull();
    expect(document.querySelectorAll('[data-member]')).toHaveLength(2);
    await act(async () =>
      root.render(
        <IntlProvider locale="en">
          <CuratedCollectionDetails kind="music" id="another-artist" />
        </IntlProvider>
      )
    );
    expect(
      (
        document.querySelector(
          'select[aria-label="Release Type"]'
        ) as HTMLSelectElement
      ).value
    ).toBe('Album');
    expect(document.querySelector('[data-member="live"]')).toBeNull();
    await act(async () =>
      root.render(
        <IntlProvider locale="en">
          <CuratedCollectionDetails
            kind="music"
            id="discography-artist"
            discographyArtist=""
          />
        </IntlProvider>
      )
    );
    expect(document.querySelector('h1')?.textContent).toBe('Test Discography');
    expect(
      document
        .querySelector('article > [data-testid="artist-backdrop"]')
        ?.getAttribute('data-src')
    ).toBe(state.collection.posterPath);
    expect(
      document
        .querySelector('[data-testid="artist-backdrop"]')
        ?.getAttribute('data-type')
    ).toBe('music');
    expect(
      document.querySelector('.collection-summary-size-value')?.textContent
    ).toBe('2');
    expect(document.querySelector('.discography-ratings')).not.toBeNull();
    await click('Select All');
    expect(output('discography-request')).toBe('studio');
    expect(
      document
        .querySelector('.discography-ratings')
        ?.nextElementSibling?.classList.contains('discography-selection-row')
    ).toBe(true);
    expect(
      document
        .querySelector('.discography-selection-row')
        ?.nextElementSibling?.classList.contains('music-collection-filter-row')
    ).toBe(true);
    expect(document.querySelector('[data-testid="play"]')).toBeNull();
    expect(document.querySelector('[data-testid="device"]')).toBeNull();
    expect(document.querySelector('[data-testid="add"]')).toBeNull();
    expect(
      document.querySelector('.music-collection-filter-row')
    ).not.toBeNull();
    expect(document.querySelector('[data-member="live"]')).toBeNull();
    await click('Clear Filters');
    expect(
      [...document.querySelectorAll('[data-member]')].map((element) =>
        element.getAttribute('data-member')
      )
    ).toEqual(['studio', 'live']);
    await click('Clear Selection');
    expect(
      document.querySelectorAll('[data-member][aria-pressed="true"]')
    ).toHaveLength(0);
    await click('Select All');
    expect(
      document.querySelectorAll('[data-member][aria-pressed="true"]')
    ).toHaveLength(2);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
