import Button from '@app/components/Common/Button';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createIntl, IntlProvider } from 'react-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { findHelpButton, getButtonHelp } from './buttonHelp';
import ButtonHelp from './index';

vi.mock('@floating-ui/react', () => ({
  autoUpdate: vi.fn(),
  flip: vi.fn(),
  offset: vi.fn(),
  shift: vi.fn(),
  useFloating: () => ({
    refs: { setReference: vi.fn(), setFloating: vi.fn() },
    floatingStyles: {},
    context: {},
  }),
  useRole: () => ({}),
  useInteractions: () => ({
    getFloatingProps: (props: object) => props,
  }),
}));
const intl = createIntl({ locale: 'en' });
let root: Root;
let host: HTMLDivElement;
let dom: JSDOM;
beforeEach(() => {
  // Keep the repository's server setup in Node; install DOM globals only for
  // these component tests (the server crypto setup is not browser-realm safe).
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost',
  });
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
      key === 'window' ? dom.window : dom.window[key as keyof Window]
    );
  }
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = '';
  dom.window.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const button = (markup: string) => {
  const parent = document.createElement('div');
  parent.innerHTML = markup;
  document.body.append(parent);
  return parent.querySelector('button')!;
};
const mount = async () => {
  await act(async () =>
    root.render(
      <IntlProvider locale="en">
        <ButtonHelp />
      </IntlProvider>
    )
  );
};
const hover = async (element: HTMLElement) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    vi.advanceTimersByTime(260);
  });
};

it('prefers specific disabled reasons and meaningful common-action descriptions', () => {
  expect(
    getButtonHelp(
      button(
        '<button disabled data-disabled-reason="There are no requests to delete.">Delete Requests</button>'
      ),
      intl
    )
  ).toBe('There are no requests to delete.');
  expect(getButtonHelp(button('<button>Save Changes</button>'), intl)).toBe(
    'Save your changes.'
  );
  expect(
    getButtonHelp(
      button('<button class="format-request-option">4K</button>'),
      intl
    )
  ).toBe('Request the 4K version of this media.');
  expect(
    getButtonHelp(
      button('<button aria-expanded="true">View Cast</button>'),
      intl
    )
  ).toBe('Hide Cast.');
});

it('excludes SVG logo styles and hidden markup from playback tooltips', () => {
  const target = button(
    '<button aria-labelledby="play-label"><span id="play-label"><svg><style>.plex_svg__cls-1{fill:#fff}</style><title>Plex logo</title></svg><span aria-hidden="true">hidden</span><span>Play on Plex</span></span></button>'
  );
  expect(getButtonHelp(target, intl)).toBe(
    'Open this media in Plex so you can play it there.'
  );
  expect(target.querySelector('svg style')?.textContent).toContain('.plex_svg');
  expect(
    getButtonHelp(button('<button>Play on Device</button>'), intl)
  ).toContain('Choose an active, authorized device');
});
it.each([
  'app-filter-button',
  'app-filter-select-trigger',
  'discover-filter-control',
  'react-select-container',
])('leaves %s filters alone', (className) => {
  const target = button(`<div class="${className}"><button>All</button></div>`);
  expect(findHelpButton(target)).toBeNull();
});
it('does not duplicate an existing tooltip or opt-out control', () => {
  expect(
    findHelpButton(
      button(
        '<span data-app-tooltip-owned="true"><button>Delete</button></span>'
      )
    )
  ).toBeNull();
  expect(
    findHelpButton(button('<button data-button-help="off">Filter</button>'))
  ).toBeNull();
  expect(
    findHelpButton(
      button(
        '<button data-button-help="off">/media/movies/hd 55.25 TB</button>'
      )
    )
  ).toBeNull();
});
it('shows standard help on disabled native buttons without clicking or adding a layout wrapper', async () => {
  const target = button(
    '<button disabled data-disabled-reason="This media is not currently blocklisted.">Remove From Blocklist</button>'
  );
  const parent = target.parentElement;
  const clicked = vi.fn();
  target.addEventListener('click', clicked);
  await mount();
  await hover(target);
  expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(
    'This media is not currently blocklisted.'
  );
  expect(target.parentElement).toBe(parent);
  expect(target.disabled).toBe(true);
  expect(clicked).not.toHaveBeenCalled();
});
it('supports keyboard focus and Escape while preserving existing accessibility descriptions', async () => {
  const target = button('<button aria-describedby="existing">Save</button>');
  await mount();
  await act(async () => target.focus());
  expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(
    'Save your changes.'
  );
  expect(target.getAttribute('aria-describedby')).toContain('existing');
  await act(async () =>
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    )
  );
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  expect(target.getAttribute('aria-describedby')).toBe('existing');
});
it('suppresses legacy browser titles only while help is active, then restores them', async () => {
  const target = button(
    '<button title="Open this service in a new browser tab or window.">Open</button>'
  );
  await mount();
  await hover(target);
  expect(target.hasAttribute('title')).toBe(false);
  expect(document.querySelector('[role="tooltip"]')?.textContent).toContain(
    'new browser tab or window'
  );
  await act(async () =>
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  );
  expect(target.getAttribute('title')).toContain('new browser tab or window');
});
it('dismisses stale help when a button changes state', async () => {
  const target = button('<button>Save</button>');
  await mount();
  await hover(target);
  await act(async () => {
    target.disabled = true;
  });
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
});
it('shared buttons expose descriptive help without native title popups', async () => {
  await act(async () =>
    root.render(
      <Button
        disabled
        disabledReason="Nothing to save."
        title="Save your changes."
      >
        Save
      </Button>
    )
  );
  const target = host.querySelector('button')!;
  expect(target.hasAttribute('title')).toBe(false);
  expect(target.dataset.disabledReason).toBe('Nothing to save.');
  expect(target.dataset.buttonHelp).toBe('Save your changes.');
});
