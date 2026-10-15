import { MediaStatus } from '@server/constants/media';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IntlProvider } from 'react-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CreateIssueModal from './index';

const state = vi.hoisted(() => ({
  status: 5,
  status4k: 1,
  post: vi.fn(),
}));
vi.mock('axios', () => ({ default: { post: state.post } }));
vi.mock('swr', () => ({
  default: () => ({
    data: {
      id: 123,
      title: 'Test Movie',
      mediaInfo: { id: 42, status: state.status, status4k: state.status4k },
    },
  }),
  mutate: vi.fn(),
}));
vi.mock('@app/hooks/useToasts', () => ({
  default: () => ({ addToast: vi.fn() }),
}));
vi.mock('@app/components/Common/Tooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@app/components/Common/Modal', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock('@app/components/IssueDetails/IssueMediaSummary', () => ({
  default: ({ footer, is4k }: { footer: React.ReactNode; is4k: boolean }) => (
    <section>
      <output data-testid="selected-quality">{is4k ? '4k' : 'hd'}</output>
      {footer}
    </section>
  ),
}));
vi.mock(
  '@app/components/IssueModal/CreateIssueModal/SeriesEpisodeSelector',
  () => ({ default: () => null })
);

let dom: JSDOM;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  state.status = MediaStatus.AVAILABLE;
  state.status4k = MediaStatus.UNKNOWN;
  state.post.mockReset();
  dom = new JSDOM('<!doctype html><html><body></body></html>');
  for (const key of [
    'window',
    'document',
    'Element',
    'Node',
    'HTMLElement',
    'HTMLButtonElement',
    'MutationObserver',
  ]) {
    vi.stubGlobal(
      key,
      key === 'window' ? dom.window : dom.window[key as keyof Window]
    );
  }
  vi.stubGlobal('React', React);
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

const render = async () => {
  await act(async () =>
    root.render(
      <IntlProvider locale="en">
        <CreateIssueModal mediaType="movie" tmdbId={123} />
      </IntlProvider>
    )
  );
};
const quality = (id: string) =>
  host.querySelector<HTMLButtonElement>(
    `[data-testid="format-request-option-${id}"]`
  )!;

it('shares the detail quality control, disables unavailable versions and styles Issue Type yellow', async () => {
  await render();
  expect(host.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe(
    'Quality'
  );
  expect(quality('hd').disabled).toBe(false);
  expect(quality('4k').disabled).toBe(true);
  expect(quality('hd').getAttribute('data-button-help')).toBe(
    'Report an issue with the HD version.'
  );
  expect(
    host.querySelector('.compact-select-warning [aria-label="Issue Type"]')
  ).not.toBeNull();
  await act(async () => quality('4k').click());
  expect(host.querySelector('output')?.textContent).toBe('hd');
  expect(state.post).not.toHaveBeenCalled();
});

it('initially selects 4K when that is the only available copy', async () => {
  state.status = MediaStatus.UNKNOWN;
  state.status4k = MediaStatus.AVAILABLE;
  await render();
  expect(quality('hd').disabled).toBe(true);
  expect(quality('4k').getAttribute('aria-pressed')).toBe('true');
  expect(host.querySelector('output')?.textContent).toBe('4k');
});

it('updates the issue quality when switching available versions without submitting', async () => {
  state.status4k = MediaStatus.AVAILABLE;
  await render();
  await act(async () => quality('4k').click());
  expect(host.querySelector('output')?.textContent).toBe('4k');
  await act(async () => quality('hd').click());
  expect(host.querySelector('output')?.textContent).toBe('hd');
  expect(state.post).not.toHaveBeenCalled();
});

it('keeps the issue quality selectable while the requested copy is processing', async () => {
  state.status = MediaStatus.PROCESSING;
  await render();

  expect(quality('hd').disabled).toBe(false);
  expect(quality('4k').disabled).toBe(true);
  expect(
    host.querySelector<HTMLButtonElement>('[data-testid="modal-ok-button"]')
      ?.disabled
  ).toBe(false);
  expect(state.post).not.toHaveBeenCalled();
});

it('keeps reporting disabled when neither quality is available', async () => {
  state.status = MediaStatus.UNKNOWN;
  await render();
  expect(quality('hd').disabled).toBe(true);
  expect(quality('4k').disabled).toBe(true);
  expect(
    host.querySelector<HTMLButtonElement>('[data-testid="modal-ok-button"]')
      ?.disabled
  ).toBe(true);
  expect(state.post).not.toHaveBeenCalled();
});
