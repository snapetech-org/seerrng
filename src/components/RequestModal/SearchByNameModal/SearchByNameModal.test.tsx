import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { IntlProvider } from 'react-intl';
import { afterEach, expect, it, vi } from 'vitest';
import SearchByNameModal from './index';

const matches = Array.from({ length: 9 }, (_, index) => ({
  tvdbId: index + 1,
  title: `Match ${index + 1}`,
  year: 2000 + index,
}));

vi.mock('swr', () => ({ default: () => ({ data: matches }) }));
vi.mock('@app/components/Common/CachedImage', () => ({
  default: () => null,
}));
vi.mock('@app/components/Common/Modal', () => ({
  default: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

it('shows six matches first and reveals the rest on request', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
  });
  const container = dom.window.document.getElementById('root') as HTMLElement;
  const root = createRoot(container);
  cleanup = () => {
    act(() => root.unmount());
    Object.assign(globalThis, previous);
  };

  await act(async () => {
    root.render(
      <IntlProvider locale="en" messages={{}}>
        <SearchByNameModal
          setTvdbId={vi.fn()}
          tvdbId={undefined}
          closeModal={vi.fn()}
          modalTitle="Title"
          modalSubTitle="Sub"
          tmdbId={1}
        />
      </IntlProvider>
    );
  });

  const countCards = () =>
    container.querySelectorAll('button.container').length;
  expect(countCards()).toBe(6);

  const showAll = Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent?.includes('Show all 9 matches')
  );
  expect(showAll).toBeDefined();

  await act(async () => {
    showAll?.dispatchEvent(
      new dom.window.MouseEvent('click', { bubbles: true })
    );
  });

  expect(countCards()).toBe(9);
  expect(container.textContent).not.toContain('Show all 9 matches');
});
