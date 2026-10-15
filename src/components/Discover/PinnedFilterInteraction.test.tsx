import { JSDOM } from 'jsdom';
import React, { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { IntlProvider } from 'react-intl';
import { SWRConfig } from 'swr';
import { afterEach, expect, it, vi } from 'vitest';
import { PinnedFilterSectionGroup } from './PinnedFilterSection';

const state = vi.hoisted(() => ({
  user: {
    id: 7,
    settings: {
      detailDisclosurePins: { tv: { filters: false, sortBy: false } },
    },
  },
  revalidate: vi.fn().mockResolvedValue(undefined),
  post: vi.fn(),
}));
vi.mock('@app/hooks/useUser', () => ({ useUser: () => state }));
vi.mock('axios', () => ({ default: { post: state.post } }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('Series filter pin buttons drive the real saved-state hook and disclosure component in both directions', async () => {
  const dom = new JSDOM('<div id="root"></div>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('Element', dom.window.Element);
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  state.user.settings.detailDisclosurePins.tv = {
    filters: false,
    sortBy: false,
  };
  let saved = { ...state.user.settings.detailDisclosurePins.tv };
  state.post.mockImplementation(
    async (endpoint: string, patch: Record<string, boolean>) => {
      expect(endpoint).toBe('/api/v1/user/7/settings/detail-disclosures/tv');
      saved = { ...saved, ...patch };
      return { data: { ...saved } };
    }
  );
  const root = createRoot(document.getElementById('root')!);
  const cache = new Map();
  const render = () =>
    root.render(
      <StrictMode>
        <SWRConfig
          value={{
            provider: () => cache,
            revalidateOnMount: false,
            revalidateOnFocus: false,
          }}
        >
          <IntlProvider locale="en">
            <PinnedFilterSectionGroup
              mediaType="tv"
              sections={[
                {
                  section: 'filters',
                  label: 'Filters',
                  children: <span>Filter panel</span>,
                },
                {
                  section: 'sortBy',
                  label: 'Sort By',
                  children: <span>Sort panel</span>,
                },
              ]}
            />
          </IntlProvider>
        </SWRConfig>
      </StrictMode>
    );
  const pin = (section: string) =>
    document.querySelector(
      `section[aria-label="${section}"] button[aria-pressed]`
    ) as HTMLButtonElement;
  const heading = (section: string) =>
    document.querySelector(
      `section[aria-label="${section}"] button[aria-expanded]`
    ) as HTMLButtonElement;
  try {
    await act(async () => render());
    for (const section of ['Filters', 'Sort By']) {
      expect(pin(section).getAttribute('aria-pressed')).toBe('false');
      await act(async () => pin(section).click());
      expect(pin(section).getAttribute('aria-pressed')).toBe('true');
      expect(heading(section).getAttribute('aria-expanded')).toBe('true');
      // Remount simulates a fresh page visit against the saved mocked cache.
      await act(async () => root.render(null));
      await act(async () => render());
      expect(heading(section).getAttribute('aria-expanded')).toBe('true');
      await act(async () => pin(section).click());
      expect(pin(section).getAttribute('aria-pressed')).toBe('false');
      expect(heading(section).getAttribute('aria-expanded')).toBe('false');
    }
    expect(state.post.mock.calls.map((call) => call[1])).toEqual([
      { filters: true },
      { filters: false },
      { sortBy: true },
      { sortBy: false },
    ]);
    expect(state.revalidate).toHaveBeenCalledTimes(4);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
