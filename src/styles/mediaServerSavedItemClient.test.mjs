import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(path.resolve('package.json'));
const ts = require('typescript');
const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = require('react-dom/client');
const { act } = React;
const sourceRoot = process.env.SAVED_ITEM_TEST_SOURCE_ROOT ?? '.';
const source = fs.readFileSync(
  path.resolve(
    sourceRoot,
    'src/components/MediaDetails/MediaServerWatchlistButton.tsx'
  ),
  'utf8'
);
let environment;
// Exercise the real shared help owner, not a mock native button which bypasses it.
const buttonModule = { exports: {} };
const buttonJavascript = ts.transpileModule(
  fs.readFileSync(
    path.resolve(sourceRoot, 'src/components/Common/Button/index.tsx'),
    'utf8'
  ),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }
).outputText;
new Function('require', 'module', 'exports', buttonJavascript)(
  (id) => {
    if (id === '@app/hooks/useUpstreamTheme')
      return { __esModule: true, default: () => false };
    // The shared Button's CSS module only supplies a class name.
    if (id === './Button.module.css') return { default: { button: 'button' } };
    assert.ok(
      [
        'react',
        'react/jsx-runtime',
        '@heroicons/react/24/outline',
        'tailwind-merge',
      ].includes(id),
      `Unexpected shared Button dependency ${id}`
    );
    return require(id);
  },
  buttonModule,
  buttonModule.exports
);
const useMockSWR = (key, fetcher) => {
  const keyString = JSON.stringify(key);
  const current = React.useRef(keyString);
  current.current = keyString;
  const [state, setState] = React.useState({ isLoading: !!key });
  const load = async () => {
    if (!key) return undefined;
    setState((previous) => ({ ...previous, isValidating: true }));
    try {
      const data = await fetcher(key);
      if (current.current === keyString) setState({ data });
      return data;
    } catch (error) {
      if (current.current === keyString) setState({ error });
      throw error;
    }
  };
  const loadRef = React.useRef(load);
  loadRef.current = load;
  React.useEffect(() => {
    const activeKey = JSON.parse(keyString);
    environment.keys.push(activeKey);
    setState({ isLoading: !!activeKey });
    if (activeKey) void loadRef.current().catch(() => {});
  }, [keyString]);
  return {
    ...state,
    mutate: async (data, options) => {
      if (options?.revalidate === false) {
        environment.mutations.push(data);
        setState({ data });
        return data;
      }
      return load();
    },
  };
};
const deps = {
  react: React,
  'react/jsx-runtime': require('react/jsx-runtime'),
  '@app/components/Common/Button': buttonModule.exports,
  '@app/components/Common/MediaServerIcon': {
    default: ({ mediaServerType, className }) =>
      React.createElement('i', {
        className,
        'data-provider-logo': mediaServerType,
      }),
    getMediaServerName: (type) =>
      ({ 1: 'Plex', 2: 'Jellyfin', 3: 'Emby' })[type],
    __esModule: true,
  },
  '@app/components/Common/Tooltip': {
    default: ({ content, children }) =>
      React.createElement('div', { title: content }, children),
    __esModule: true,
  },
  '@app/components/Common/PageErrorMessage': {
    default: ({ title, description, retry }) =>
      React.createElement(
        'section',
        { role: 'alert' },
        title,
        description,
        React.createElement(
          'button',
          {
            'data-retry': true,
            disabled: retry.busy,
            title: retry.tooltip,
            onClick: retry.onClick,
          },
          'Retry'
        )
      ),
    __esModule: true,
  },
  '@app/hooks/useSettings': {
    default: () => {
      environment.settingsReads++;
      return { currentSettings: { mediaServerType: environment.type } };
    },
    __esModule: true,
  },
  '@app/hooks/useUser': {
    useUser: () => {
      environment.userReads++;
      return {
        user: environment.user,
        loading: false,
        error: environment.userError ?? '',
        revalidate: async () => {
          environment.refreshes++;
          return environment.refresh ? environment.refresh() : environment.user;
        },
      };
    },
  },
  '@app/utils/defineMessages': {
    default: (id, messages) =>
      Object.fromEntries(
        Object.entries(messages).map(([key, defaultMessage]) => [
          key,
          { defaultMessage },
        ])
      ),
    __esModule: true,
  },
  '@server/constants/server': {
    MediaServerType: { PLEX: 1, JELLYFIN: 2, EMBY: 3, NOT_CONFIGURED: 4 },
  },
  'react-intl': {
    useIntl: () => ({
      formatMessage: (message, values = {}) =>
        message.defaultMessage.replace(/\{(\w+)\}/g, (_, key) => values[key]),
    }),
  },
  swr: { default: useMockSWR, __esModule: true },
  axios: {
    default: {
      get: async (url, options) => {
        environment.gets.push(url);
        environment.getOptions.push(options);
        return { data: await environment.get(url) };
      },
      post: async (url, body) => {
        environment.posts.push({ url, body });
        return { data: await environment.post(url, body) };
      },
    },
    __esModule: true,
  },
};
const compiledModule = { exports: {} };
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
}).outputText;
new Function('require', 'module', 'exports', javascript)(
  (id) => {
    assert.ok(id in deps, `Unexpected dependency ${id}`);
    return deps[id];
  },
  compiledModule,
  compiledModule.exports
);
const Component = compiledModule.exports.default;
const status = (saved = false, type = 1) => ({
  serverType: type,
  kind: type === 1 ? 'watchlist' : 'favorites',
  available: true,
  saved,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const fixture = async (props = {}, overrides = {}) => {
  environment = {
    type: 1,
    user: { id: 7, plexId: 9, updatedAt: '2026-10-02T00:00:00Z' },
    keys: [],
    gets: [],
    getOptions: [],
    posts: [],
    mutations: [],
    refreshes: 0,
    userReads: 0,
    settingsReads: 0,
    get: async () => status(),
    post: async (url, body) => status(body.saved),
    ...overrides,
  };
  const env = environment;
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let currentProps = { tvId: 42, is4k: false, ...props };
  const render = async (next = {}) => {
    currentProps = { ...currentProps, ...next };
    await act(async () => {
      root.render(React.createElement(Component, currentProps));
      await tick();
    });
  };
  await render();
  return {
    env,
    container,
    button: () => container.querySelector('button:not([data-retry])'),
    render,
    click: async (
      button = container.querySelector('button:not([data-retry])')
    ) => {
      await act(async () => {
        button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
        await tick();
      });
    },
    settle: async (callback) => {
      await act(async () => {
        callback();
        await tick();
      });
    },
    cleanup: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
};

test('Saved-item cache keys include identity/provider/title/quality but only quality reaches GET', async () => {
  const f = await fixture({ is4k: true });
  try {
    assert.deepEqual(f.env.gets, [
      '/api/v1/tv/42/media-server-saved-item?is4k=true',
    ]);
    assert.deepEqual(f.env.getOptions[0], {
      headers: { 'Cache-Control': 'no-cache' },
    });
    const first = f.env.keys.at(-1);
    assert.equal(first[0], f.env.gets[0]);
    assert.equal(typeof first[1], 'string');
    assert.equal(f.button().textContent, 'Add to Watchlist');
    assert.ok(f.button().classList.contains('app-button-playback'));
    assert.equal(
      f.container
        .querySelector('[data-provider-logo]')
        .getAttribute('data-provider-logo'),
      '1'
    );
    await f.render({ is4k: false });
    assert.notDeepEqual(f.env.keys.at(-1), first);
    assert.equal(
      f.env.gets.at(-1),
      '/api/v1/tv/42/media-server-saved-item?is4k=false'
    );
    f.env.user = { ...f.env.user, updatedAt: '2026-10-02T01:00:00Z' };
    await f.render();
    assert.notEqual(f.env.keys.at(-1)[1], first[1]);
    assert.ok(
      f.env.gets.every(
        (url) =>
          !url.includes('userId=') &&
          !url.includes('token=') &&
          !url.includes('serverType=')
      )
    );
  } finally {
    await f.cleanup();
  }
});

test('Disabled embedded and invalid runtime props mount no hooks or network actions', async () => {
  for (const props of [{ enabled: false }, { tvId: 0 }, { is4k: 'true' }]) {
    const f = await fixture(props);
    try {
      assert.equal(f.container.textContent, '');
      assert.equal(f.env.userReads, 0);
      assert.equal(f.env.settingsReads, 0);
      assert.deepEqual(f.env.gets, []);
      assert.deepEqual(f.env.posts, []);
    } finally {
      await f.cleanup();
    }
  }
});

test('Unavailable/malformed capabilities are disabled; unknown state has no pressed assertion', async () => {
  const f = await fixture(
    {},
    {
      get: async () => ({
        serverType: 1,
        kind: 'watchlist',
        available: false,
        reason: 'account-not-linked',
      }),
    }
  );
  try {
    assert.equal(f.button().disabled, true);
    assert.equal(f.button().hasAttribute('aria-pressed'), false);
    await f.click();
    assert.deepEqual(f.env.posts, []);
    assert.match(
      f.container.querySelector('[title]').title,
      /Link your own Plex/
    );
  } finally {
    await f.cleanup();
  }
  const bad = await fixture(
    {},
    { get: async () => ({ ...status(), saved: undefined }) }
  );
  try {
    assert.equal(bad.button().disabled, true);
    assert.ok(bad.container.querySelector('[role=alert]'));
    assert.deepEqual(bad.env.posts, []);
  } finally {
    await bad.cleanup();
  }
});

test('Shared disabled help preserves each provider own-account and missing-series reason', async () => {
  for (const [type, server] of [
    [1, 'Plex'],
    [2, 'Jellyfin'],
    [3, 'Emby'],
  ]) {
    for (const reason of ['account-not-linked', 'series-not-found']) {
      const f = await fixture(
        {},
        {
          type,
          get: async () => ({
            serverType: type,
            kind: type === 1 ? 'watchlist' : 'favorites',
            available: false,
            reason,
          }),
        }
      );
      try {
        const expected =
          reason === 'account-not-linked'
            ? `Link your own ${server} account before saving this series.`
            : `This series could not be matched in your accessible ${server} catalog.`;
        assert.equal(f.button().disabled, true);
        assert.equal(f.button().getAttribute('data-disabled-reason'), expected);
        assert.equal(f.button().getAttribute('data-button-help'), expected);
        assert.equal(f.button().hasAttribute('title'), false);
        await f.click();
        assert.deepEqual(f.env.posts, []);
      } finally {
        await f.cleanup();
      }
    }
  }
});

test('Shared help follows pending, confirmed and failure states without exposing provider errors', async () => {
  const held = deferred();
  const f = await fixture({}, { get: async () => held.promise });
  try {
    assert.equal(f.button().disabled, true);
    assert.equal(
      f.button().getAttribute('data-disabled-reason'),
      'The Plex saved state is loading or updating.'
    );
    await f.settle(() => held.resolve(status(true)));
    assert.equal(f.button().disabled, false);
    assert.equal(
      f.button().getAttribute('data-button-help'),
      'Remove this entire series from your Plex Watchlist. This does not remove media or change your Seerr watchlist.'
    );
    assert.equal(
      f.button().getAttribute('data-disabled-reason'),
      f.button().getAttribute('data-button-help')
    );
    assert.deepEqual(f.env.posts, []);
  } finally {
    await f.cleanup();
  }
  const failed = await fixture(
    {},
    {
      get: async () => {
        throw new Error('private-token-and-upstream-body');
      },
    }
  );
  try {
    assert.equal(failed.button().disabled, true);
    assert.equal(
      failed.button().getAttribute('data-disabled-reason'),
      'The saved state could not be loaded or updated. Please retry before changing it.'
    );
    assert.equal(
      failed.button().getAttribute('data-button-help'),
      failed.button().getAttribute('data-disabled-reason')
    );
    assert.equal(
      failed.container.innerHTML.includes('private-token-and-upstream-body'),
      false
    );
    await failed.click();
    assert.deepEqual(failed.env.posts, []);
  } finally {
    await failed.cleanup();
  }
});

test('Fresh identity and capability checks precede exact native POST; only confirmation changes label', async () => {
  const held = deferred();
  const activity = [];
  const f = await fixture(
    { is4k: true, onLoadingChange: (busy) => activity.push(busy) },
    {
      type: 2,
      user: { id: 7, jellyfinUsername: 'own-account', updatedAt: '2026-10-02' },
      get: async () => status(false, 2),
      post: async () => held.promise,
    }
  );
  try {
    await f.click();
    assert.equal(f.env.refreshes, 1);
    assert.equal(f.env.gets.length, 2);
    assert.deepEqual(f.env.getOptions, [
      { headers: { 'Cache-Control': 'no-cache' } },
      { headers: { 'Cache-Control': 'no-cache' } },
    ]);
    assert.deepEqual(f.env.posts, [
      {
        url: '/api/v1/tv/42/media-server-saved-item',
        body: { saved: true, is4k: true },
      },
    ]);
    assert.equal(f.button().disabled, true);
    assert.equal(f.button().textContent, 'Add to Favorites');
    await f.click();
    assert.equal(f.env.posts.length, 1);
    await f.settle(() => held.resolve(status(true, 2)));
    assert.equal(f.button().textContent, 'Remove from Favorites');
    assert.equal(f.button().getAttribute('aria-pressed'), 'true');
    assert.ok(activity.includes(true));
    assert.equal(activity.at(-1), false);
  } finally {
    await f.cleanup();
  }
});

test('Plex Remove sends false after fresh reads and changes label only on confirmation', async () => {
  const held = deferred();
  const f = await fixture(
    {},
    {
      get: async () => status(true),
      post: async () => held.promise,
    }
  );
  try {
    assert.equal(f.button().textContent, 'Remove from Watchlist');
    await f.click();
    assert.equal(f.env.refreshes, 1);
    assert.equal(f.env.gets.length, 2);
    assert.ok(
      f.env.getOptions.every(
        (options) => options.headers['Cache-Control'] === 'no-cache'
      )
    );
    assert.deepEqual(f.env.posts, [
      {
        url: '/api/v1/tv/42/media-server-saved-item',
        body: { saved: false, is4k: false },
      },
    ]);
    assert.equal(f.button().disabled, true);
    assert.equal(f.button().textContent, 'Remove from Watchlist');
    await f.settle(() => held.resolve(status(false)));
    assert.equal(f.button().textContent, 'Add to Watchlist');
    assert.equal(f.button().getAttribute('aria-pressed'), 'false');
    assert.equal(f.env.mutations.at(-1).status.saved, false);
  } finally {
    await f.cleanup();
  }
});

test('Fresh already-removed membership skips a write without inverting desired Remove', async () => {
  let reads = 0;
  const f = await fixture({}, { get: async () => status(++reads === 1) });
  try {
    assert.equal(f.button().textContent, 'Remove from Watchlist');
    await f.click();
    assert.equal(reads, 2);
    assert.deepEqual(f.env.posts, []);
    assert.equal(f.button().textContent, 'Add to Watchlist');
    assert.equal(f.button().getAttribute('aria-pressed'), 'false');
  } finally {
    await f.cleanup();
  }
});

test('Plex Remove rejects a valid response that still reports saved membership', async () => {
  const f = await fixture(
    {},
    {
      get: async () => status(true),
      post: async () => status(true),
    }
  );
  try {
    await f.click();
    assert.deepEqual(f.env.posts, [
      {
        url: '/api/v1/tv/42/media-server-saved-item',
        body: { saved: false, is4k: false },
      },
    ]);
    assert.equal(f.button().textContent, 'Remove from Watchlist');
    assert.equal(f.button().getAttribute('aria-pressed'), 'true');
    assert.equal(f.button().disabled, true);
    assert.ok(f.container.querySelector('[role=alert]'));
    assert.deepEqual(f.env.mutations, []);
    await f.click();
    assert.equal(f.env.posts.length, 1, 'failure blocks another mutation');
    const reads = f.env.gets.length;
    await f.click(f.container.querySelector('[data-retry]'));
    assert.equal(f.env.posts.length, 1, 'Retry only reads membership');
    assert.ok(f.env.gets.length > reads);
    assert.equal(f.button().textContent, 'Remove from Watchlist');
    assert.equal(f.button().getAttribute('aria-pressed'), 'true');
    assert.equal(f.button().disabled, false);
    assert.equal(f.container.querySelector('[role=alert]'), null);
  } finally {
    await f.cleanup();
  }
});

test('Failure never asserts saved success and Retry is read-only', async () => {
  const f = await fixture(
    {},
    { post: async () => ({ ...status(), saved: undefined }) }
  );
  try {
    await f.click();
    assert.equal(f.button().textContent, 'Add to Watchlist');
    assert.equal(f.button().disabled, true);
    assert.ok(f.container.querySelector('[role=alert]'));
    const writes = f.env.posts.length;
    const reads = f.env.gets.length;
    await f.click(f.container.querySelector('[data-retry]'));
    assert.equal(f.env.posts.length, writes);
    assert.ok(f.env.gets.length > reads);
    assert.equal(f.button().disabled, false);
    assert.equal(f.container.querySelector('[role=alert]'), null);
  } finally {
    await f.cleanup();
  }
});

test('Changed native linked identity or capability before mutation fails closed', async () => {
  const changed = await fixture(
    {},
    { refresh: async () => ({ id: 7, plexId: 10, updatedAt: '2026-10-02' }) }
  );
  try {
    await changed.click();
    assert.deepEqual(changed.env.posts, []);
    assert.equal(changed.env.gets.length, 1);
    assert.ok(changed.container.querySelector('[role=alert]'));
  } finally {
    await changed.cleanup();
  }
  let read = 0;
  const unavailable = await fixture(
    {},
    {
      get: async () =>
        ++read === 1
          ? status()
          : { serverType: 1, kind: 'watchlist', available: false },
    }
  );
  try {
    await unavailable.click();
    assert.deepEqual(unavailable.env.posts, []);
    assert.ok(unavailable.container.querySelector('[role=alert]'));
  } finally {
    await unavailable.cleanup();
  }
});

test('Late provider/title/quality/user responses cannot mutate the replacement context', async () => {
  for (const change of ['title', 'quality', 'user', 'provider']) {
    const held = deferred();
    const f = await fixture({}, { post: async () => held.promise });
    try {
      await f.click();
      assert.equal(f.env.posts.length, 1);
      if (change === 'user')
        f.env.user = { id: 8, plexId: 10, updatedAt: '2026-10-02' };
      if (change === 'provider') {
        f.env.type = 3;
        f.env.get = async () => status(false, 3);
      }
      await f.render(
        change === 'title'
          ? { tvId: 43 }
          : change === 'quality'
            ? { is4k: true }
            : {}
      );
      await f.settle(() => held.resolve(status(true)));
      assert.equal(f.env.mutations.length, 0);
      assert.equal(f.button().getAttribute('aria-pressed'), 'false');
      assert.equal(
        f.button().textContent,
        change === 'provider' ? 'Add to Favorites' : 'Add to Watchlist'
      );
      assert.equal(f.container.querySelector('[role=alert]'), null);
    } finally {
      await f.cleanup();
    }
  }
});

test('Changing context before preflight completes cannot start a provider write', async () => {
  const held = deferred();
  const f = await fixture({}, { refresh: async () => held.promise });
  try {
    await f.click();
    await f.render({ tvId: 43 });
    await f.settle(() => held.resolve(f.env.user));
    assert.deepEqual(f.env.posts, []);
    assert.equal(f.env.mutations.length, 0);
    assert.equal(f.button().disabled, false);
  } finally {
    await f.cleanup();
  }
});
