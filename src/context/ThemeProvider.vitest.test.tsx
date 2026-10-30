import type { User } from '@app/hooks/useUser';
import { THEME_PALETTE_IDS } from '@server/utils/themePreference';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ThemeProvider, themePalettes, useTheme } from './ThemeContext';

const fixture = vi.hoisted(() => ({
  user: undefined as User | undefined,
  get: vi.fn(),
  post: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock('@app/hooks/useUser', () => ({
  useUser: () => ({ user: fixture.user, revalidate: fixture.revalidate }),
}));
vi.mock('axios', () => ({ default: { get: fixture.get, post: fixture.post } }));

let root: Root;
let dom: JSDOM;
let container: HTMLDivElement;
let theme: ReturnType<typeof useTheme>;
const Probe = () => {
  theme = useTheme();
  return <span data-palette={theme.palette} />;
};
const render = () =>
  root.render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>
  );
const account = (id: number, palette?: string, interfaceTheme?: string): User =>
  ({
    id,
    settings: {
      notificationTypes: {},
      themePalette: palette,
      interfaceTheme,
    },
  }) as User;

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost',
  });
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
  fixture.user = undefined;
  fixture.get.mockReset().mockResolvedValue({ data: { themes: [] } });
  fixture.post.mockReset();
  fixture.revalidate.mockReset();
  fixture.revalidate.mockImplementation(async (callback) => {
    fixture.user = callback(fixture.user);
    return fixture.user;
  });
  localStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  container.remove();
  dom.window.close();
  vi.unstubAllGlobals();
});

test('all offered themes share the server allowlist', () => {
  expect(themePalettes.map((p) => p.id)).toEqual([...THEME_PALETTE_IDS]);
});

test('new installs use SeerrNG and keep its palette selected in light mode', async () => {
  localStorage.setItem('seerr-theme-palette', 'classic');
  localStorage.setItem('seerr-theme-mode', 'light');
  await act(async () => render());
  expect(theme.palette).toBe('seerr');
  expect(theme.mode).toBe('light');
  fixture.user = account(1);
  await act(async () => render());
  expect(theme.palette).toBe('seerr');
  expect(document.documentElement.dataset.themePalette).toBe('seerr');
  expect(document.documentElement.dataset.themeMode).toBe('light');
  expect(theme.interfaceTheme).toBe('seerrOrig');
  expect(document.documentElement.dataset.interfaceTheme).toBe('seerrOrig');
  const sheets = document.querySelectorAll<HTMLLinkElement>(
    'link[data-interface-theme-stylesheet]'
  );
  expect(sheets).toHaveLength(1);
  expect(sheets[0].getAttribute('href')).toBe(
    '/api/v1/interface-themes/seerrOrig/theme.css'
  );
  expect(fixture.post).not.toHaveBeenCalled();
});

test('an account can change and restore the complete interface profile', async () => {
  fixture.user = account(1, 'seerr', 'seerrOrig');
  await act(async () => render());
  fixture.post.mockResolvedValue({ data: { interfaceTheme: 'seerrNGJ' } });
  await act(async () => theme.setInterfaceTheme('seerrNGJ'));
  expect(fixture.post).toHaveBeenCalledWith(
    '/api/v1/user/1/settings/interface-theme',
    { theme: 'seerrNGJ' }
  );
  expect(theme.interfaceTheme).toBe('seerrNGJ');
  expect(fixture.user?.settings?.interfaceTheme).toBe('seerrNGJ');
  expect(document.documentElement.dataset.interfaceTheme).toBe('seerrNGJ');
  expect(document.documentElement.dataset.themePreset).toBe('john-redesign');
  fixture.user = account(2, 'aurora', 'seerrOrig');
  await act(async () => render());
  expect(theme.interfaceTheme).toBe('seerrOrig');
  expect(document.documentElement.dataset.interfaceTheme).toBe('seerrOrig');
});

test('later logins restore the account choice instead of resetting it or sharing another user choice', async () => {
  localStorage.setItem('seerr-theme-palette', 'classic');
  fixture.user = account(1, 'aurora');
  await act(async () => render());
  expect(theme.palette).toBe('aurora');
  fixture.user = account(2, 'seerr');
  await act(async () => render());
  expect(theme.palette).toBe('seerr');
  fixture.user = account(1, 'aurora');
  await act(async () => render());
  expect(theme.palette).toBe('aurora');
});

test('a logged-in choice is applied only after confirmation and stored in the account cache', async () => {
  fixture.user = account(1, 'seerr');
  await act(async () => render());
  let confirm!: (value: unknown) => void;
  fixture.post.mockImplementation(
    () =>
      new Promise((resolve) => {
        confirm = resolve;
      })
  );
  let save!: Promise<void>;
  await act(async () => {
    save = theme.setPalette('classic');
  });
  expect(theme.palette).toBe('seerr');
  expect(fixture.post).toHaveBeenCalledWith('/api/v1/user/1/settings/theme', {
    palette: 'classic',
  });
  await expect(theme.setPalette('aurora')).rejects.toThrow();
  expect(fixture.post).toHaveBeenCalledTimes(1);
  await act(async () => {
    confirm({ data: { themePalette: 'classic' } });
    await save;
  });
  expect(theme.palette).toBe('classic');
  expect(fixture.user?.settings?.themePalette).toBe('classic');
  expect(localStorage.getItem('seerr-theme-palette')).toBe('classic');
});

test('failed saves preserve the current theme and guest changes are not accepted', async () => {
  await act(async () => render());
  await expect(theme.setPalette('classic')).rejects.toThrow();
  expect(fixture.post).not.toHaveBeenCalled();
  fixture.user = account(1, 'seerr');
  await act(async () => render());
  fixture.post.mockRejectedValue(new Error('save failed'));
  await act(async () => {
    await expect(theme.setPalette('classic')).rejects.toThrow('save failed');
  });
  expect(theme.palette).toBe('seerr');
  expect(fixture.user?.settings?.themePalette).toBe('seerr');
});

test('a delayed save response cannot change the theme after switching accounts', async () => {
  fixture.user = account(1, 'seerr');
  await act(async () => render());
  let confirm!: (value: unknown) => void;
  fixture.post.mockImplementation(
    () =>
      new Promise((resolve) => {
        confirm = resolve;
      })
  );
  const save = theme.setPalette('classic');
  fixture.user = account(2, 'aurora');
  await act(async () => render());
  await act(async () => {
    confirm({ data: { themePalette: 'classic' } });
    await save;
  });
  expect(theme.palette).toBe('aurora');
  expect(fixture.revalidate).not.toHaveBeenCalled();
});
