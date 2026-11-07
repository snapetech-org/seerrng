import type { TreeSeason } from '@app/components/MediaDetails/SeasonEpisodeTree';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { IntlProvider } from 'react-intl';
import { afterEach, expect, it, vi } from 'vitest';
import UpstreamSeasonPicker from './UpstreamSeasonPicker';
afterEach(() => vi.unstubAllGlobals());
it('keeps disabled episodes out of the original season-table selection payload', async () => {
  const dom = new JSDOM('<div id="root"></div>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.getElementById('root')!);
  const changed = vi.fn();
  const seasons = [
    {
      seasonNumber: 1,
      name: 'Season 1',
      episodeCount: 2,
      episodes: [
        { id: 11, selectable: true, available: false },
        { id: 12, selectable: false, available: false },
      ],
    },
    {
      seasonNumber: 2,
      name: 'Season 2',
      episodeCount: 1,
      episodes: [{ id: 21, selectable: false, available: false }],
    },
  ] as unknown as TreeSeason[];
  try {
    await act(async () =>
      root.render(
        <IntlProvider locale="en">
          <UpstreamSeasonPicker
            seasons={seasons}
            selectedIds={[]}
            disabled={false}
            disabledSeasons={[2]}
            onChange={changed}
          />
        </IntlProvider>
      )
    );
    const inputs = document.querySelectorAll('input');
    expect(inputs).toHaveLength(3);
    expect(inputs[2].disabled).toBe(true);
    await act(async () => inputs[1].click());
    expect(changed).toHaveBeenLastCalledWith([11]);
    changed.mockClear();
    await act(async () => inputs[2].click());
    expect(changed).not.toHaveBeenCalled();
    await act(async () => inputs[0].click());
    expect(changed).toHaveBeenLastCalledWith([11]);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
