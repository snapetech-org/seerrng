import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { IntlProvider } from 'react-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import RelatedTools, { type RelatedToolId } from './index';

const state = vi.hoisted(() => ({
  canRequest: true,
  settings: {
    musicEnabled: false,
    booksEnabled: false,
    comicsEnabled: false,
    softwareEnabled: false,
    romarrEnabled: false,
  },
}));

vi.mock('@app/hooks/useUser', () => ({
  Permission: { REQUEST: 1, ADMIN: 2 },
  useUser: () => ({
    user: undefined,
    hasPermission: (permission: number) => permission === 1 && state.canRequest,
  }),
}));

vi.mock('@app/hooks/useSettings', () => ({
  default: () => ({ currentSettings: state.settings }),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

let dom: JSDOM;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  state.canRequest = true;
  state.settings = {
    musicEnabled: false,
    booksEnabled: false,
    comicsEnabled: false,
    softwareEnabled: false,
    romarrEnabled: false,
  };
  dom = new JSDOM('<div id="root"></div>');
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  root = createRoot(dom.window.document.getElementById('root') as HTMLElement);
});

afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
});

const render = (tools: RelatedToolId[] = ['share', 'following']) =>
  act(async () =>
    root.render(
      <IntlProvider locale="en">
        <RelatedTools tools={tools} />
      </IntlProvider>
    )
  );

it('renders a labelled navigation landmark with one link per tool', async () => {
  await render();
  const nav = dom.window.document.querySelector('nav');
  expect(nav?.getAttribute('aria-label')).toBe('Related Tools');
  const links = [...dom.window.document.querySelectorAll('a')];
  expect(links.map((link) => link.getAttribute('href'))).toEqual([
    '/share',
    '/following',
  ]);
  expect(links[0].textContent).toContain('Share & Identify');
});

it('renders nothing for people who cannot request', async () => {
  state.canRequest = false;
  await render();
  expect(dom.window.document.querySelector('nav')).toBeNull();
  state.canRequest = true;
});

it('shows ROMarr tools without requiring QuestarrNG', async () => {
  state.settings.romarrEnabled = true;
  await render(['gameFinder', 'patches']);

  const links = [...dom.window.document.querySelectorAll('a')];
  expect(links.map((link) => link.getAttribute('href'))).toEqual([
    '/discover/patches',
  ]);
});

it('keeps PC Game Finder tied to QuestarrNG', async () => {
  state.settings.softwareEnabled = true;
  await render(['gameFinder', 'patches']);

  const links = [...dom.window.document.querySelectorAll('a')];
  expect(links.map((link) => link.getAttribute('href'))).toEqual([
    '/discover/games',
  ]);
});
