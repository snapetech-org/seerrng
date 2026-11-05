import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import useMediaFilterPin from './useMediaFilterPin';

const state = vi.hoisted(() => ({
  user: { id: 7, settings: { mediaFilterPins: { books: 'ebook' } } },
  post: vi.fn().mockResolvedValue({}),
  revalidate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@app/hooks/useUser', () => ({ useUser: () => state }));
vi.mock('axios', () => ({ default: { post: state.post } }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('restores once, honors explicit navigation, pins changes, and unpins', async () => {
  const dom = new JSDOM('<div id="root"></div>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.getElementById('root')!);
  const restore = vi.fn();
  let pin!: ReturnType<typeof useMediaFilterPin<'all' | 'ebook' | 'audiobook'>>;
  function Probe({
    explicit = false,
    scope = 'books',
  }: {
    explicit?: boolean;
    scope?: 'books' | 'search';
  }) {
    pin = useMediaFilterPin({
      scope,
      selected: 'all',
      values: ['all', 'ebook', 'audiobook'],
      restore,
      explicit,
    });
    return null;
  }
  try {
    await act(async () => root.render(<Probe />));
    expect(restore).toHaveBeenCalledExactlyOnceWith('ebook');
    await act(async () => root.render(<Probe />));
    expect(restore).toHaveBeenCalledTimes(1);
    await act(async () => pin.select('audiobook'));
    expect(state.post).toHaveBeenLastCalledWith(
      '/api/v1/user/7/settings/media-filter-pins/books',
      { value: 'audiobook' }
    );
    await act(async () => pin.toggle('audiobook'));
    expect(state.post).toHaveBeenLastCalledWith(
      '/api/v1/user/7/settings/media-filter-pins/books',
      { value: 'audiobook' }
    );
    await act(async () => pin.toggle('ebook'));
    expect(state.post).toHaveBeenLastCalledWith(
      '/api/v1/user/7/settings/media-filter-pins/books',
      { value: null }
    );
    restore.mockClear();
    await act(async () => root.render(<Probe key="new-visit" explicit />));
    expect(restore).not.toHaveBeenCalled();
    state.post.mockRejectedValueOnce(new Error('offline'));
    await act(async () => pin.toggle('audiobook'));
    expect(pin.error).toBe(true);
    await act(async () =>
      root.render(<Probe key="unpinned" scope="search" explicit />)
    );
    state.post.mockClear();
    await act(async () => pin.select('audiobook'));
    expect(state.post).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
