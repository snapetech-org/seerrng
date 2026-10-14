import {
  storeDiscoverNavigationContext,
  type DiscoverNavigationItem,
} from '@app/utils/discoverNavigation';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IntlProvider } from 'react-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DiscoverDetailNavigation from './index';

const state = vi.hoisted(() => ({
  router: {
    isReady: true,
    query: {} as Record<string, string>,
    push: vi.fn(),
  },
}));

vi.mock('next/router', () => ({ useRouter: () => state.router }));
vi.mock('@app/components/Common/Tooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@app/components/Common/Button', () => ({
  default: ({
    children,
    onClick,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    buttonType?: string;
    buttonSize?: string;
    iconOnly?: boolean;
    'data-testid'?: string;
    'aria-label'?: string;
  }) => (
    <button
      aria-label={props['aria-label']}
      data-testid={props['data-testid']}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  ),
}));

const contextId = 'discover_context_001';
const items: DiscoverNavigationItem[] = [
  { id: 101, mediaType: 'movie' },
  { id: 102, mediaType: 'movie' },
  { id: 103, mediaType: 'movie' },
];

let dom: JSDOM;
let root: Root;

beforeEach(() => {
  dom = new JSDOM('<html><body><div id="root"></div></body></html>', {
    url: 'http://localhost',
  });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  root = createRoot(document.getElementById('root')!);
  state.router.isReady = true;
  state.router.query = {
    discoverContext: contextId,
    movieId: '102',
  };
  state.router.push.mockReset();
  storeDiscoverNavigationContext(contextId, items, items[1]);
});

afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
  vi.unstubAllGlobals();
});

const render = async (id: number) =>
  act(async () =>
    root.render(
      <IntlProvider locale="en">
        <DiscoverDetailNavigation id={id} mediaType="movie" />
      </IntlProvider>
    )
  );

it('navigates to the adjacent result and updates controls for the new route id', async () => {
  await render(102);

  expect(document.querySelector('[data-testid="discover-previous"]')).not.toBe(
    null
  );
  expect(document.querySelector('[data-testid="discover-next"]')).not.toBe(
    null
  );

  await act(async () => {
    document
      .querySelector<HTMLButtonElement>('[data-testid="discover-next"]')!
      .click();
  });
  expect(state.router.push).toHaveBeenCalledWith(
    `/movie/103?discoverContext=${contextId}`,
    `/movie/103?discoverContext=${contextId}`
  );

  state.router.query = { discoverContext: contextId, movieId: '103' };
  await render(103);
  expect(document.querySelector('[data-testid="discover-previous"]')).not.toBe(
    null
  );
  expect(document.querySelector('[data-testid="discover-next"]')).toBeNull();
});

it('does not show navigation for a direct detail route without a stored context', async () => {
  state.router.query = { movieId: '102' };
  await render(102);

  expect(
    document.querySelector('[data-testid="discover-previous"]')
  ).toBeNull();
  expect(document.querySelector('[data-testid="discover-next"]')).toBeNull();
});
