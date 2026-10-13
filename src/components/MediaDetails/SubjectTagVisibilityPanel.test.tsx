import { getSubjectTagVisibilityStorageKey } from '@app/hooks/useSubjectTagVisibility';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { IntlProvider } from 'react-intl';
import { afterEach, expect, it, vi } from 'vitest';
import SubjectTagVisibilityPanel from './SubjectTagVisibilityPanel';

const state = vi.hoisted(() => ({ userId: 7 }));
vi.mock('@app/hooks/useUser', () => ({
  useUser: () => ({ user: { id: state.userId } }),
}));

let dom: JSDOM | undefined;
let root: Root | undefined;

const panel = (contentId = 'movie-subject-tags') => (
  <IntlProvider locale="en">
    <SubjectTagVisibilityPanel
      contentId={contentId}
      hasTags
      title="Subject Tags"
    >
      <ul id={`${contentId}-list`}>
        <li>Drama</li>
      </ul>
    </SubjectTagVisibilityPanel>
  </IntlProvider>
);

afterEach(async () => {
  const testRoot = root;
  if (testRoot) {
    await act(async () => testRoot.unmount());
    root = undefined;
  }
  dom?.window.close();
  dom = undefined;
  vi.unstubAllGlobals();
  state.userId = 7;
});

it('restores and shares the per-user visibility choice across detail pages', async () => {
  const browser = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: 'http://localhost' }
  );
  dom = browser;
  for (const key of [
    'window',
    'document',
    'Element',
    'Node',
    'HTMLElement',
    'MutationObserver',
    'MouseEvent',
    'KeyboardEvent',
  ]) {
    vi.stubGlobal(
      key,
      key === 'window' ? browser.window : browser.window[key as keyof Window]
    );
  }
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const testRoot = createRoot(document.getElementById('root')!);
  root = testRoot;
  browser.window.localStorage.setItem(
    getSubjectTagVisibilityStorageKey(7),
    'hidden'
  );

  await act(async () => testRoot.render(panel()));
  const toggle = () =>
    document.querySelector(
      'button[aria-controls="movie-subject-tags"]'
    ) as HTMLButtonElement;
  const content = () =>
    document.getElementById('movie-subject-tags') as HTMLDivElement;

  expect(toggle().getAttribute('aria-label')).toBe('Subject tag visibility');
  expect(toggle().getAttribute('aria-pressed')).toBe('false');
  expect(content().hidden).toBe(true);

  await act(async () => toggle().click());
  expect(toggle().getAttribute('aria-pressed')).toBe('true');
  expect(content().hidden).toBe(false);
  expect(
    browser.window.localStorage.getItem(getSubjectTagVisibilityStorageKey(7))
  ).toBe('visible');

  await act(async () => testRoot.render(panel('tv-subject-tags')));
  expect(
    document
      .querySelector('button[aria-controls="tv-subject-tags"]')
      ?.getAttribute('aria-pressed')
  ).toBe('true');
  expect(document.getElementById('tv-subject-tags')?.hidden).toBe(false);

  state.userId = 8;
  browser.window.localStorage.setItem(
    getSubjectTagVisibilityStorageKey(8),
    'corrupt-value'
  );
  await act(async () => testRoot.render(panel('other-user-subject-tags')));
  expect(
    document
      .querySelector('button[aria-controls="other-user-subject-tags"]')
      ?.getAttribute('aria-pressed')
  ).toBe('true');
  expect(
    browser.window.localStorage.getItem(getSubjectTagVisibilityStorageKey(8))
  ).toBe('corrupt-value');
});

it('does not expose tags before the browser preference is loaded during hydration', async () => {
  const html = renderToStaticMarkup(panel());

  expect(html).toContain('disabled=""');
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain('hidden=""');
  expect(html).toContain('aria-controls="movie-subject-tags"');
});

it('keeps the empty state visible without showing an unnecessary toggle', () => {
  const html = renderToStaticMarkup(
    <IntlProvider locale="en">
      <SubjectTagVisibilityPanel
        contentId="empty-subject-tags"
        hasTags={false}
        title="Subject Tags"
      >
        <p>No tags available</p>
      </SubjectTagVisibilityPanel>
    </IntlProvider>
  );

  expect(html).toContain('No tags available');
  expect(html).not.toContain('aria-controls="empty-subject-tags"');
});
