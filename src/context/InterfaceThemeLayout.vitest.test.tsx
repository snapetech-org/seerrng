import usePersius from '@app/components/Persius/usePersius';
import { BUILT_IN_INTERFACE_THEME_MANIFESTS } from '@app/utils/interfaceThemeCatalog';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ThemeProvider, useTheme } from './ThemeContext';

const fixture = vi.hoisted(() => ({
  user: {
    id: 1,
    settings: { notificationTypes: {}, interfaceTheme: 'seerrOrig' },
  },
  get: vi.fn(),
  post: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock('@app/hooks/useUser', () => ({
  useUser: () => ({ user: fixture.user, revalidate: fixture.revalidate }),
}));
vi.mock('axios', () => ({ default: { get: fixture.get, post: fixture.post } }));

let dom: JSDOM;
let root: Root;
let theme: ReturnType<typeof useTheme>;
const custom = {
  ...BUILT_IN_INTERFACE_THEME_MANIFESTS.find(
    (item) => item.id === 'persiusNG'
  )!,
  id: 'paper-cinema',
  name: 'Paper Cinema',
};
const Probe = () => {
  theme = useTheme();
  return <span data-layout={usePersius() ? 'persius' : 'classic'} />;
};
const render = async () => {
  await act(async () => {
    root.render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
  });
};

beforeEach(() => {
  dom = new JSDOM(
    '<!doctype html><html><head></head><body><div id="root"></div></body></html>',
    { url: 'http://localhost' }
  );
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('localStorage', dom.window.localStorage);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const append = document.head.append.bind(document.head);
  vi.spyOn(document.head, 'append').mockImplementation((...nodes) => {
    append(...nodes);
    for (const node of nodes) {
      if (typeof node !== 'string' && node.nodeName === 'LINK') {
        queueMicrotask(() => node.dispatchEvent(new dom.window.Event('load')));
      }
    }
  });
  fixture.user = {
    id: 1,
    settings: { notificationTypes: {}, interfaceTheme: 'seerrOrig' },
  };
  fixture.get.mockReset().mockResolvedValue({
    data: { themes: [...BUILT_IN_INTERFACE_THEME_MANIFESTS, custom] },
  });
  fixture.post.mockReset().mockImplementation(async (_url, body) => ({
    data: { interfaceTheme: body.theme },
  }));
  fixture.revalidate.mockReset().mockImplementation(async (update) => {
    fixture.user = update(fixture.user);
    return fixture.user;
  });
  root = createRoot(document.getElementById('root')!);
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  dom.window.close();
  vi.unstubAllGlobals();
});

test('custom IDs can select native Persius composition and load only their own same-origin stylesheet', async () => {
  await render();
  await act(async () => theme.setInterfaceTheme('paper-cinema'));
  expect(fixture.post).toHaveBeenCalledWith(
    '/api/v1/user/1/settings/interface-theme',
    { theme: 'paper-cinema' }
  );
  expect(fixture.user.settings.interfaceTheme).toBe('paper-cinema');
  expect(
    document.querySelector('[data-layout]')?.getAttribute('data-layout')
  ).toBe('persius');
  expect(document.documentElement.dataset.interfaceTheme).toBe('paper-cinema');
  const sheets = document.querySelectorAll<HTMLLinkElement>(
    'link[data-interface-theme-stylesheet]'
  );
  expect(sheets).toHaveLength(1);
  expect(sheets[0].getAttribute('href')).toBe(
    '/api/v1/interface-themes/paper-cinema/theme.css'
  );
  await act(async () => theme.setInterfaceTheme('seerrOrig'));
  expect(
    document.querySelector('[data-layout]')?.getAttribute('data-layout')
  ).toBe('classic');
});

test('restores custom composition from the account; failed saves preserve it', async () => {
  fixture.user.settings.interfaceTheme = 'paper-cinema';
  await render();
  expect(theme.interfaceTheme).toBe('paper-cinema');
  expect(theme.interfaceThemeDefinition.layout).toBe('persius');
  fixture.post.mockRejectedValueOnce(new Error('Save failed'));
  await act(async () => {
    await expect(theme.setInterfaceTheme('seerrNGJ')).rejects.toThrow(
      'Save failed'
    );
  });
  expect(theme.interfaceTheme).toBe('paper-cinema');
  expect(
    document.querySelector('[data-layout]')?.getAttribute('data-layout')
  ).toBe('persius');
  expect(
    document.querySelectorAll('link[data-interface-theme-stylesheet]')
  ).toHaveLength(1);
});
