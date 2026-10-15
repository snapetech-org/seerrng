import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(path.resolve('package.json'));
const ts = require('typescript');
const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = require('react-dom/client');
const { act } = React;
const sourceRoot = process.env.NATIVE_INTEGRATION_SOURCE_ROOT ?? '.';
let environment;
const wrap = (value) => ({ default: value, __esModule: true });
const Empty = () => null;
const Children = ({ children }) =>
  React.createElement(React.Fragment, null, children);
const intl = {
  formatMessage: (message) => message?.defaultMessage ?? '',
  formatDisplayName: (value) => value,
  formatDate: (value) => value,
};
const common = {
  react: React,
  'react/jsx-runtime': require('react/jsx-runtime'),
  'react-intl': { useIntl: () => intl },
  '@app/utils/defineMessages': wrap((prefix, messages) =>
    Object.fromEntries(
      Object.entries(messages).map(([key, value]) => [
        key,
        { id: `${prefix}.${key}`, defaultMessage: value },
      ])
    )
  ),
  '@app/hooks/useSettings': wrap(() => ({
    currentSettings: environment.settings,
  })),
  '@server/constants/media': {
    MediaStatus: { AVAILABLE: 5, PARTIALLY_AVAILABLE: 4, PROCESSING: 2 },
    MediaType: { TV: 'tv' },
    MediaRequestStatus: {},
  },
  '@app/components/IssueDetails/issueMediaFormat': {
    canReportSeriesIssue: (mediaInfo, canReport4k = false) =>
      [2, 4, 5].includes(mediaInfo?.status) ||
      (canReport4k && [2, 4, 5].includes(mediaInfo?.status4k)),
  },
  '@server/constants/server': {
    MediaServerType: { PLEX: 1, JELLYFIN: 2, EMBY: 3 },
  },
  '@app/components/Common/Button': wrap(
    ({ children, onClick, type, disabled }) =>
      React.createElement('button', { onClick, type, disabled }, children)
  ),
  '@app/components/Common/Tooltip': wrap(Children),
};
function compileModule(relative, dependencies) {
  const source = fs.readFileSync(path.join(sourceRoot, relative), 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const compiledModule = { exports: {} };
  new Function('require', 'module', 'exports', javascript)(
    (name) => dependencies[name] ?? wrap(Empty),
    compiledModule,
    compiledModule.exports
  );
  return compiledModule.exports;
}
const compile = (relative, dependencies) =>
  compileModule(relative, dependencies).default;
const viewerAvailabilityDependencies = compileModule(
  'src/utils/viewerAvailabilityPresentation.ts',
  {
    '@server/constants/availability': {
      OtherUserAvailabilityMode: {
        SHOW: 'show',
        DISTINGUISH: 'distinguish',
        HIDE: 'hide',
      },
    },
    '@server/constants/media': {
      MediaStatus: { AVAILABLE: 5, PARTIALLY_AVAILABLE: 4 },
    },
  }
);
const layoutDependencies = {
  ...common,
  'next/link': wrap(Children),
  '@app/hooks/useWatchStatus': wrap(() => ({
    data: { serverType: environment.settings.mediaServerType },
    isValidating: environment.watchedLoading,
  })),
  '@app/hooks/usePlaybackCatalog': wrap(() => ({
    data: environment.catalog,
    isValidating: environment.catalogLoading,
  })),
  '@app/hooks/useDetailDisclosurePins': wrap(() => ({
    pins: { mediaServer: true },
    togglePinned: () => {},
  })),
  '@app/hooks/useDetailDisclosureOrder': wrap(() => ({
    order: ['cast', 'crew', 'subjectTags', 'details', 'mediaServer'],
    setOrder: () => {},
    canReorder: true,
    preferenceKey: '7:tv',
  })),
  '@app/utils/playbackSelection': {
    resolveCanonicalPlaybackSelection: (availableIds, selectedIds) =>
      availableIds.filter((itemId) => selectedIds.includes(itemId)),
  },
  '@app/utils/viewerAvailabilityPresentation': viewerAvailabilityDependencies,
  '@app/utils/imageCache': { getTmdbPosterImageUrl: () => undefined },
  '@app/utils/subjectTagStyle': { subjectTagTone: () => 'neutral' },
  '@app/components/MediaDetails/subjectTagStyle': {
    subjectTagTone: () => 'neutral',
  },
  '@app/components/MediaDetails/ReorderableDisclosureRow': {
    default: Children,
    OrderedDisclosurePanels: Children,
    __esModule: true,
  },
  '@app/components/MediaDetails/MediaQualitySelect': wrap(
    ({ value, onChange, options }) =>
      React.createElement(
        'select',
        {
          'data-quality': true,
          value,
          onChange: (event) => onChange(event.target.value),
        },
        options.map((option) =>
          React.createElement(
            'option',
            {
              key: option.value,
              value: option.value,
              disabled: option.disabled,
            },
            option.label
          )
        )
      )
  ),
  '@app/components/MediaDetails/SeriesSeasonEpisodeBrowser': wrap(
    ({ selectedItemIds, onSelectionChange }) =>
      React.createElement(
        'div',
        { 'data-selection': JSON.stringify(selectedItemIds) },
        React.createElement(
          'button',
          {
            type: 'button',
            'data-select-episode': true,
            onClick: () => onSelectionChange(['episode-1']),
          },
          'Select episode'
        )
      )
  ),
  '@app/components/Common/PlayOnDeviceButton': wrap(({ itemIds }) =>
    React.createElement('button', {
      type: 'button',
      'data-play-on-device': JSON.stringify(itemIds),
    })
  ),
};
const Layout = compile(
  'src/components/TvDetails/SeriesDetailsLayout.tsx',
  layoutDependencies
);
const nativeControl = (kind) =>
  function NativeControl({ tvId, is4k, onLoadingChange }) {
    environment.nativeProps[kind] = { tvId, is4k, onLoadingChange };
    environment.nativeRenders.push({ kind, tvId, is4k });
    React.useEffect(() => {
      environment.nativeMounts.push(kind);
      return () => {
        environment.nativeUnmounts.push(kind);
        onLoadingChange(false);
      };
    }, [onLoadingChange]);
    return React.createElement('button', { 'data-native': kind }, kind);
  };
const indexDependencies = {
  ...common,
  '@app/components/TvDetails/SeriesDetailsLayout': wrap(Layout),
  '@app/components/MediaDetails/MediaServerWatchlistButton': wrap(
    nativeControl('saved')
  ),
  '@app/components/MediaDetails/MediaServerPlayButton': wrap(({ itemIds }) =>
    React.createElement('button', {
      type: 'button',
      'data-media-server-play': JSON.stringify(itemIds),
    })
  ),
  '@app/components/MediaDetails/MediaServerCollectionButton': wrap(
    nativeControl('collections')
  ),
  '@app/components/Common/LoadingSpinner': {
    PageStatus: ({ active }) =>
      React.createElement('div', { 'data-page-status': String(active) }),
  },
  '@app/hooks/useUser': {
    useUser: () => ({
      user: { id: 7, userType: 1 },
      hasPermission: () => true,
    }),
    Permission: {},
    UserType: { PLEX: 1 },
  },
  '@app/hooks/useToasts': wrap(() => ({ addToast: () => {} })),
  '@app/hooks/useTitleBlocklist': wrap(() => ({
    checking: false,
    setBlocklisted: () => {},
  })),
  '@app/utils/creditHelpers': { sortCrewPriority: (crew) => crew },
  '@app/utils/refreshIntervalHelper': { refreshIntervalHelper: () => 0 },
  '@app/utils/safeUrl': { getSafeHref: (value) => value },
  'next/router': {
    useRouter: () => ({
      query: { tvId: String(environment.data.id) },
      replace: () => {},
    }),
  },
  'next/dynamic': wrap(() => Empty),
  '@heroicons/react/24/outline': new Proxy({}, { get: () => Empty }),
  '@app/i18n/globalMessages': wrap({}),
  swr: wrap((key) => ({
    data: key?.includes('ratingscombined') ? undefined : environment.data,
    isValidating: false,
    mutate: () => {},
  })),
  axios: wrap({
    post: () => {
      throw new Error('Unexpected network write');
    },
    delete: () => {
      throw new Error('Unexpected network write');
    },
  }),
};
const Details = compile(
  'src/components/TvDetails/index.tsx',
  indexDependencies
);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
async function fixture(props = {}) {
  environment = {
    settings: {
      mediaServerType: 1,
      series4kEnabled: true,
      enableSpecialEpisodes: false,
    },
    data: {
      id: 42,
      name: 'Lioness',
      credits: { cast: [], crew: [] },
      createdBy: [],
      networks: [],
      genres: [],
      seasons: [],
      keywords: [],
      episodeRunTime: [],
      spokenLanguages: [],
      originalLanguage: 'en',
      mediaInfo: { id: 21, status: 5, status4k: 5 },
    },
    nativeProps: {},
    nativeRenders: [],
    nativeMounts: [],
    nativeUnmounts: [],
    catalog: { groups: [], serverType: 1 },
    watchedLoading: false,
    catalogLoading: false,
  };
  const env = environment;
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let currentProps = { showRelated: false, showOverview: false, ...props };
  const render = async (changes = {}) => {
    currentProps = { ...currentProps, ...changes };
    await act(async () => {
      root.render(React.createElement(Details, currentProps));
      await tick();
    });
  };
  await render();
  return {
    env,
    container,
    render,
    setBusy: async (kind, value) => {
      await act(async () => {
        env.nativeProps[kind].onLoadingChange(value);
        await tick();
      });
    },
    cleanup: async () => {
      await act(async () => {
        root.unmount();
        await tick();
      });
      container.remove();
    },
  };
}

test('Series native actions receive the real selected quality and current series ID without changing selection layout', async () => {
  const f = await fixture();
  assert.deepEqual(f.env.nativeMounts.sort(), ['collections', 'saved']);
  assert.equal(f.env.nativeProps.saved.tvId, 42);
  assert.equal(f.env.nativeProps.collections.is4k, false);
  const quality = f.container.querySelector('[data-quality]');
  await act(async () => {
    quality.value = '4k';
    quality.dispatchEvent(new window.Event('change', { bubbles: true }));
    await tick();
  });
  assert.equal(f.env.nativeProps.saved.is4k, true);
  assert.equal(f.env.nativeProps.collections.is4k, true);
  assert.equal(
    f.container.querySelector('[data-selection]').dataset.selection,
    '[]'
  );
  for (const role of ['saved-item-action', 'collection-action']) {
    assert.equal(
      f.container.querySelector(`[data-card-part="${role}"]`).className,
      'app-action-row'
    );
  }
  f.env.data = { ...f.env.data, id: 43 };
  await f.render();
  assert.equal(f.env.nativeProps.saved.tvId, 43);
  assert.equal(f.env.nativeProps.collections.tvId, 43);
  await f.cleanup();
});

test('Both native loading sources feed the one page status independently', async () => {
  const f = await fixture();
  const busy = () =>
    f.container.querySelector('[data-page-status]').dataset.pageStatus;
  assert.equal(busy(), 'false');
  await f.setBusy('saved', true);
  assert.equal(busy(), 'true');
  await f.setBusy('collections', true);
  await f.setBusy('saved', false);
  assert.equal(busy(), 'true');
  await f.setBusy('collections', false);
  assert.equal(busy(), 'false');
  f.env.watchedLoading = true;
  await f.render();
  await f.setBusy('saved', true);
  await f.setBusy('saved', false);
  assert.equal(busy(), 'true');
  assert.equal(f.container.querySelectorAll('[data-page-status]').length, 1);
  await f.cleanup();
});

test('Embedded Series testing retains static controls and never mounts native clients', async () => {
  const f = await fixture({ embedded: true });
  assert.deepEqual(f.env.nativeMounts, []);
  assert.deepEqual(f.env.nativeRenders, []);
  assert.equal(f.container.querySelector('[data-native]'), null);
  assert.ok(
    f.container
      .querySelector('[data-card-part="saved-item-action"]')
      .textContent.includes('Add to Watchlist')
  );
  assert.ok(
    f.container
      .querySelector('[data-card-part="collection-action"]')
      .textContent.includes('Add to Collection')
  );
  await f.cleanup();
});

test('Collapsed Media Server content does not mount native clients or start their reads', async () => {
  const f = await fixture({ collapseInformation: true });
  assert.deepEqual(f.env.nativeMounts, []);
  assert.equal(
    f.container.querySelector('#series-media-server-panel').hidden,
    true
  );
  await f.cleanup();
});

test('Changing to embedded content unmounts native clients and clears their loading contribution', async () => {
  const f = await fixture();
  await f.setBusy('collections', true);
  await f.render({ embedded: true });
  assert.deepEqual(f.env.nativeUnmounts.sort(), ['collections', 'saved']);
  assert.equal(f.container.querySelector('[data-native]'), null);
  assert.equal(
    f.container.querySelector('[data-page-status]').dataset.pageStatus,
    'false'
  );
  await f.cleanup();
});

test('Unavailable 4K presentation cannot forward a stale selected 4K value', async () => {
  const f = await fixture();
  const quality = f.container.querySelector('[data-quality]');
  await act(async () => {
    quality.value = '4k';
    quality.dispatchEvent(new window.Event('change', { bubbles: true }));
    await tick();
  });
  f.env.settings = { ...f.env.settings, series4kEnabled: false };
  await f.render();
  assert.equal(f.env.nativeProps.saved.is4k, false);
  assert.equal(f.env.nativeProps.collections.is4k, false);
  await f.cleanup();
});

test('shared selected seasons suppress both media-server playback actions', async () => {
  const f = await fixture();
  f.env.settings = {
    ...f.env.settings,
    otherUsersAvailability: 'distinguish',
  };
  f.env.catalog = {
    serverType: 1,
    groups: [{ index: 1, items: [{ id: 'episode-1' }] }],
  };
  f.env.data = {
    ...f.env.data,
    mediaInfo: {
      ...f.env.data.mediaInfo,
      viewerRequestCoverage: {
        standard: false,
        seasons: [{ seasonNumber: 1, standard: false }],
      },
    },
  };
  await f.render();
  const selectEpisode = f.container.querySelector('[data-select-episode]');
  await act(async () => {
    selectEpisode.click();
    await tick();
  });
  assert.equal(f.container.querySelector('[data-media-server-play]'), null);
  assert.equal(f.container.querySelector('[data-play-on-device]'), null);
  await f.cleanup();
});
