import type { SonarrSeries } from '@server/api/servarr/sonarr';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type * as ReactIntl from 'react-intl';
import { afterEach, expect, it, vi } from 'vitest';
import SearchByNameModal from './index';

const fixtureState = vi.hoisted(() => ({
  data: [] as SonarrSeries[],
  error: undefined as Error | undefined,
}));

vi.mock('swr', () => ({
  default: () => ({ data: fixtureState.data, error: fixtureState.error }),
}));
vi.mock('react-intl', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactIntl>()),
  useIntl: () => ({
    formatMessage: ({ defaultMessage }: { defaultMessage: string }) =>
      defaultMessage,
  }),
}));
vi.mock('@app/components/Common/Alert', () => ({
  default: ({ title }: { title: React.ReactNode }) => <div>{title}</div>,
}));
vi.mock('@app/components/Common/CachedImage', () => ({
  default: () => null,
}));
vi.mock('@app/components/Common/Modal', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const makeSeries = (id: number) =>
  ({
    tvdbId: id,
    title: `Series ${id}`,
    year: 2020,
    overview: 'Series overview',
  }) as SonarrSeries;

async function withResults(
  data: SonarrSeries[],
  run: (document: Document) => Promise<void>,
  setTvdbId = vi.fn()
) {
  fixtureState.data = data;
  fixtureState.error = undefined;

  const dom = new JSDOM('<div id="root"></div>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

  const root = createRoot(document.getElementById('root')!);
  try {
    await act(async () =>
      root.render(
        <SearchByNameModal
          setTvdbId={setTvdbId}
          tvdbId={undefined}
          closeModal={vi.fn()}
          modalTitle="Choose a Series"
          modalSubTitle="Select the matching series"
          tmdbId={123}
        />
      )
    );
    await run(document);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
}

const resultTitles = (document: Document) =>
  Array.from(document.querySelectorAll('button'))
    .map((button) => button.textContent?.trim() ?? '')
    .map((text) => text.match(/Series \d+/)?.[0])
    .filter((text): text is string => Boolean(text));

it('keeps the initial result list at six when there is no seventh match', async () => {
  await withResults(
    Array.from({ length: 6 }, (_, index) => makeSeries(index + 1)),
    async (document) => {
      expect(resultTitles(document)).toHaveLength(6);
      expect(
        Array.from(document.querySelectorAll('button')).some(
          (button) => button.textContent?.trim() === 'Show More Results'
        )
      ).toBe(false);
    }
  );
});

it('reveals remaining matches without selecting a result', async () => {
  const setTvdbId = vi.fn();
  await withResults(
    Array.from({ length: 8 }, (_, index) => makeSeries(index + 1)),
    async (document) => {
      expect(resultTitles(document)).toEqual([
        'Series 1',
        'Series 2',
        'Series 3',
        'Series 4',
        'Series 5',
        'Series 6',
      ]);

      const showMore = Array.from(document.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Show More Results'
      );
      expect(showMore).toBeDefined();
      await act(async () => showMore!.click());

      expect(resultTitles(document)).toEqual([
        'Series 1',
        'Series 2',
        'Series 3',
        'Series 4',
        'Series 5',
        'Series 6',
        'Series 7',
        'Series 8',
      ]);
      expect(setTvdbId).not.toHaveBeenCalled();
    },
    setTvdbId
  );
});
