import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const overrides = JSON.parse(
  await readFile(resolve(root, 'i18n-overrides.json'), 'utf8')
);
const lumenKeyRegistry = JSON.parse(
  await readFile(resolve(root, 'i18n-keys.json'), 'utf8')
);
const locales = JSON.parse(
  await readFile(resolve(root, '../config/i18n/locales.json'), 'utf8')
);
const keys = [
  'components.IssueDetails.allepisodes',
  'components.Persius.loading',
  'components.UserProfile.UserSettings.UserLinkedAccountsSettings.linkIdentityProvider',
  'components.UserProfile.UserSettings.menuClientTokens',
];
const lumenKeys = [
  'lumen.common.done',
  'components.MusicDetails.Layout.artistType',
  'components.MusicDetails.Layout.origin',
  'lumen.tv.selectEntireSeries',
  'lumen.tv.fact.firstAirDate',
  'lumen.tv.fact.seriesType',
  'lumen.account.loading',
  'lumen.account.selectedCount',
  'lumen.admin.back',
  'lumen.admin.dest.requestDefaults',
  'lumen.search.trending',
  'lumen.search.searching',
  'lumen.gameLibrary.privateGameLibrary',
  'lumen.metadata.help.video',
  'lumen.metadata.help.music',
  'lumen.metadata.help.books',
  'lumen.metadata.credential.comicVineApiKey',
  'lumen.metadata.credential.metronToken',
  'lumen.metadata.credential.googleBooksApiKey',
  'lumen.metadata.credential.youtubeApiKey',
  'lumen.metadata.loadingSettings',
  'lumen.metadata.loadFailedTitle',
  'lumen.metadata.credentialsLoadFailedTitle',
  'lumen.quickRequest.title',
  'lumen.quickRequest.entireSeries',
  'lumen.quickRequest.chooseDestination',
  'lumen.quickRequest.chooseQuality',
  'lumen.quickRequest.quotaApproval',
  'lumen.quickRequest.requestApprovalAnyway',
  'lumen.quickRequest.requestAnyway',
  'lumen.cards.preferenceDescription',
  'lumen.cards.outOn',
  'lumen.cards.requestEarly',
  'lumen.cards.ebook',
  'lumen.cards.audiobook',
  'lumen.cards.requestFormat',
  'lumen.cards.requestAnyway',
  'lumen.cards.bookRequested',
  'lumen.cards.requestBookAnywayLabel',
  'lumen.cards.requestBookFormatLabel',
  'lumen.cards.listen',
  'lumen.cards.read',
  'lumen.cards.chooseNarrator',
  'lumen.requestSummary.season',
  'lumen.requestSummary.seasons',
  'lumen.requestSummary.title4k',
  'lumen.requestSummary.requestedSeasons',
  'lumen.requestSummary.submitted',
  'lumen.requestSummary.approvalRequested',
  'lumen.requestSummary.movieRequested',
  'lumen.requestSummary.movieRequested4k',
  'lumen.requestSummary.episodesRequested',
  'lumen.requestEdit.title',
  'lumen.requestEdit.askedBy',
  'lumen.requestEdit.seasons',
  'lumen.requestEdit.requestedEpisodes',
  'lumen.requestEdit.episodeCount',
  'lumen.requestEdit.approve',
  'lumen.requestEdit.save',
  'lumen.requestEdit.saveAndRetry',
  'lumen.requestEdit.approved',
  'lumen.requestEdit.changedAndSent',
  'lumen.requestEdit.changed',
  'lumen.requestEdit.couldNotChange',
  'lumen.gameContent.title',
  'lumen.gameContent.contentToRequest',
  'lumen.gameContent.baseGame',
  'lumen.gameContent.selectedAddons',
  'lumen.gameContent.completeEdition',
  'lumen.gameContent.inLibrary',
  'lumen.gameContent.storyContent',
  'lumen.gameContent.nonStoryContent',
  'lumen.gameContent.contentTypeUnknown',
  'lumen.gameContent.itemsMissing',
  'lumen.gameContent.editionContentsUnknown',
  'lumen.managedPermissions.saved',
  'lumen.managedPermissions.saveFailure',
  'lumen.managedPermissions.loading',
  'lumen.managedPermissions.loadFailure',
  'lumen.managedPermissions.radarrLoadFailure',
  'lumen.managedPermissions.sonarrLoadFailure',
  'lumen.managedPermissions.retry',
  'lumen.managedPermissions.title',
  'lumen.managedPermissions.groupLabel',
  'lumen.managedPermissions.delegationWarning',
  'lumen.managedPermissions.adminWarning',
  'lumen.managedPermissions.ageGate',
  'lumen.managedPermissions.ageGate.default',
  'lumen.managedPermissions.ageGate.restricted',
  'lumen.managedPermissions.ageGate.unrestricted',
  'lumen.managedPermissions.destinationsLabel',
  'lumen.managedPermissions.save',
  'lumen.managedPermissions.confirmTitle',
  'lumen.managedPermissions.confirmBody',
  'lumen.managedPermissions.goBack',
  'lumen.permissions.group.administration',
  'lumen.permissions.group.requests',
  'lumen.permissions.group.auto-approve',
  'lumen.permissions.group.auto-request-from-watchlists',
  'lumen.permissions.group.issues-and-visibility',
  'lumen.permissions.group.other',
];

test('Lumen account, request, and settings labels are translated in French and Arabic', async () => {
  const english = JSON.parse(
    await readFile(resolve(root, '../src/i18n/locale/en.json'), 'utf8')
  );
  for (const locale of ['fr', 'ar']) {
    assert.ok(locales.locales.some(({ tag }) => tag === locale));
    for (const key of keys) {
      assert.equal(
        typeof english[key],
        'string',
        `English source exists: ${key}`
      );
      assert.ok(overrides[locale][key], `${locale} translation exists: ${key}`);
      assert.notEqual(
        overrides[locale][key],
        english[key],
        `${locale} translation is not an English fallback: ${key}`
      );
    }
  }
});

test('Lumen music playback and preview labels are translated in French and Arabic', async () => {
  const source = await readFile(
    resolve(root, 'src/components/MusicPlayback.tsx'),
    'utf8'
  );
  const musicKeys = new Set(
    [...source.matchAll(/['\"](lumen\.music\.[^'\"]+)['\"]/g)].map(
      ([, key]) => key
    )
  );
  assert.ok(musicKeys.size > 0, 'Music playback message keys exist');
  for (const key of musicKeys) {
    assert.ok(lumenKeyRegistry.includes(key), `registered message key: ${key}`);
  }
  for (const locale of ['fr', 'ar']) {
    for (const key of musicKeys) {
      assert.ok(overrides[locale][key], `${locale} translation exists: ${key}`);
    }
  }
});

test('all Lumen Music page labels are registered and translated', async () => {
  const source = await readFile(resolve(root, 'src/pages/Music.tsx'), 'utf8');
  const sourceFile = ts.createSourceFile(
    'Music.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const musicKeys = new Set();
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      node.arguments.length >= 1 &&
      ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[0].text.startsWith('lumen.music.')
    ) {
      musicKeys.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  assert.ok(musicKeys.size > 0, 'Music page message keys exist');
  for (const key of musicKeys) {
    assert.ok(lumenKeyRegistry.includes(key), `registered message key: ${key}`);
    for (const locale of ['fr', 'ar']) {
      assert.ok(overrides[locale][key], `${locale} translation exists: ${key}`);
    }
  }
});

test('Lumen MusicHome library and download activity labels are translated', async () => {
  const source = await readFile(
    resolve(root, 'src/components/MusicHome.tsx'),
    'utf8'
  );
  const sourceKeys = new Set(
    [...source.matchAll(/['\"](lumen\.music\.[^'\"]+)['\"]/g)].map(
      ([, key]) => key
    )
  );
  const musicHomeKeys = [
    'lumen.music.downloaded',
    'lumen.music.requestStatus.failed',
    'lumen.music.queued',
    'lumen.music.yourRequest',
    'lumen.music.sort.artist',
    'lumen.music.sort.album',
    'lumen.music.sort.released',
    'lumen.music.sort.plays',
    'lumen.music.artists',
    'lumen.music.sortBy',
    'lumen.music.libraryFilter',
    'lumen.music.libraryFilterAlbums',
    'lumen.music.libraryFilterArtists',
    'lumen.music.albumTotal',
    'lumen.music.artistTotal',
    'lumen.music.openInAurral',
    'lumen.music.libraryUnavailable',
    'lumen.music.libraryNoMatch',
    'lumen.music.libraryEmpty',
    'lumen.music.activityUnavailable',
    'lumen.music.downloadingNow',
    'lumen.music.nothingDownloading',
    'lumen.music.upNext',
    'lumen.music.queueEmpty',
    'lumen.music.moreQueued',
    'lumen.music.failedDownloads',
    'lumen.music.recentlyDownloaded',
    'lumen.music.showAllCount',
    'lumen.music.nothingYet',
    'lumen.music.playlist',
    'lumen.music.ownedOfTotal',
    'lumen.music.songsOwned',
    'lumen.music.libraryMoreFailed',
  ];
  for (const key of musicHomeKeys) {
    assert.ok(sourceKeys.has(key), `MusicHome uses message key: ${key}`);
    assert.ok(lumenKeyRegistry.includes(key), `registered message key: ${key}`);
    for (const locale of ['fr', 'ar']) {
      assert.ok(overrides[locale][key], `${locale} translation exists: ${key}`);
    }
  }
});

test('TV detail fact labels use their English, French, and Arabic values', () => {
  const expected = {
    'lumen.tv.fact.firstAirDate': {
      en: 'First Air Date',
      fr: 'Date de première diffusion',
      ar: 'تاريخ العرض الأول',
    },
    'lumen.tv.fact.genres': {
      en: 'Genres',
      fr: 'Genres',
      ar: 'الأنواع',
    },
    'lumen.tv.fact.seriesType': {
      en: 'Series Type',
      fr: 'Type de série',
      ar: 'نوع المسلسل',
    },
  };
  for (const [key, translations] of Object.entries(expected)) {
    for (const [locale, translation] of Object.entries(translations)) {
      assert.equal(overrides[locale][key], translation, `${locale}: ${key}`);
    }
  }
});

test('visible Lumen account, administration, game-library, and metadata labels are translated', () => {
  for (const locale of ['fr', 'ar']) {
    for (const key of lumenKeys) {
      assert.equal(
        typeof overrides.en[key],
        'string',
        `English source exists: ${key}`
      );
      assert.equal(
        typeof overrides[locale][key],
        'string',
        `${locale} translation exists: ${key}`
      );
      assert.notEqual(
        overrides[locale][key],
        overrides.en[key],
        `${locale} translation is not an English fallback: ${key}`
      );
    }
  }
});

test('Lumen includes the localized native user-list menu label', async () => {
  const keys = JSON.parse(
    await readFile(resolve(root, 'i18n-keys.json'), 'utf8')
  );
  assert.ok(keys.includes('components.Layout.Sidebar.users'));
  const english = JSON.parse(
    await readFile(resolve(root, '../src/i18n/locale/en.json'), 'utf8')
  );
  for (const locale of ['fr', 'ar']) {
    const catalog = JSON.parse(
      await readFile(resolve(root, `../src/i18n/locale/${locale}.json`), 'utf8')
    );
    assert.notEqual(
      catalog['components.Layout.Sidebar.users'],
      english['components.Layout.Sidebar.users']
    );
  }
});

test('Lumen title cards reuse native localized media-type labels', async () => {
  const keys = JSON.parse(
    await readFile(resolve(root, 'i18n-keys.json'), 'utf8')
  );
  const keysUnderTest = [
    'components.Search.series',
    'components.Requests.movie',
  ];
  for (const key of keysUnderTest) assert.ok(keys.includes(key));
  for (const locale of ['en', 'fr', 'ar']) {
    const native = JSON.parse(
      await readFile(resolve(root, `../src/i18n/locale/${locale}.json`), 'utf8')
    );
    for (const key of keysUnderTest) assert.equal(typeof native[key], 'string');
  }
});

test('Lumen music details reuse the native English, French, and Arabic labels', async () => {
  const keys = JSON.parse(
    await readFile(resolve(root, 'i18n-keys.json'), 'utf8')
  );
  const english = JSON.parse(
    await readFile(resolve(root, '../src/i18n/locale/en.json'), 'utf8')
  );
  for (const name of ['artistType', 'musicBrainz', 'origin']) {
    const key = `components.MusicDetails.Layout.${name}`;
    assert.ok(keys.includes(key), `${key} is part of Lumen's message catalog`);
    assert.equal(overrides.en[key], english[key]);
    for (const locale of ['fr', 'ar']) {
      const native = JSON.parse(
        await readFile(
          resolve(root, `../src/i18n/locale/${locale}.json`),
          'utf8'
        )
      );
      assert.equal(overrides[locale][key], native[key]);
    }
  }
});

test('Lumen movie release labels reuse native translations', async () => {
  const keys = JSON.parse(
    await readFile(resolve(root, 'i18n-keys.json'), 'utf8')
  );
  for (const name of ['theatrical', 'digital', 'physical']) {
    const key = `components.MovieDetails.Layout.${name}`;
    assert.ok(keys.includes(key), `${key} is part of Lumen's message catalog`);
    for (const locale of ['en', 'fr', 'ar']) {
      const native = JSON.parse(
        await readFile(
          resolve(root, `../src/i18n/locale/${locale}.json`),
          'utf8'
        )
      );
      assert.equal(typeof native[key], 'string');
    }
  }
});

test('All Podcasts source messages are translated in French and Arabic', async () => {
  const registered = JSON.parse(
    await readFile(resolve(root, 'i18n-keys.json'), 'utf8')
  );
  const keys = new Set(
    registered.filter((key) => key.startsWith('lumen.podcasts.'))
  );
  assert.ok(
    keys.size >= 99,
    `Expected all podcast messages, found ${keys.size}`
  );
  keys.add('lumen.music.discover');
  keys.add('lumen.music.activity');
  keys.add('lumen.podcasts.openAbs');
  assert.ok(
    keys.size >= 99,
    `Expected a full Podcasts source scan, found ${keys.size}`
  );
  for (const locale of ['fr', 'ar']) {
    for (const key of keys) {
      assert.equal(
        typeof overrides.en[key],
        'string',
        `English source: ${key}`
      );
      assert.equal(
        typeof overrides[locale][key],
        'string',
        `${locale}: ${key}`
      );
    }
  }
});
