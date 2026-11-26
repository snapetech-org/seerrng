import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
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

test('Music sections and podcast actions are registered and translated', async () => {
  for (const file of ['MusicSections.tsx', 'Podcasts.tsx']) {
    const source = await readFile(
      resolve(root, `src/components/${file}`),
      'utf8'
    );
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    const sourceKeys = new Set();
    const visit = (node) => {
      if (
        ts.isCallExpression(node) &&
        node.arguments.length >= 1 &&
        ts.isStringLiteral(node.arguments[0]) &&
        node.arguments[0].text.startsWith('lumen.')
      ) {
        sourceKeys.add(node.arguments[0].text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    assert.ok(sourceKeys.size > 0, `${file} message keys exist`);
    for (const key of sourceKeys) {
      assert.ok(
        lumenKeyRegistry.includes(key),
        `registered message key: ${key}`
      );
      for (const locale of ['fr', 'ar']) {
        assert.ok(
          overrides[locale][key],
          `${locale} translation exists: ${key}`
        );
      }
    }
  }
});

test('Lumen playlist actions are registered and translated', () => {
  const playlistKeys = [
    'lumen.music.fromPlaylist',
    'lumen.music.fromAMix',
    'lumen.music.playlistRequested',
    'lumen.music.playlistRequestFailed',
    'lumen.music.playlistUnavailable',
    'lumen.music.getAllSongs',
    'lumen.music.getMissingSong',
    'lumen.music.playInAurral',
    'lumen.music.playlistFilter',
    'lumen.music.notInLibrary',
    'lumen.music.onTheWay',
    'lumen.music.showMoreSongs',
    'lumen.music.getPlaylistTitleOne',
    'lumen.music.getPlaylistTitle',
    'lumen.music.getPlaylistSongsBody',
    'lumen.music.getThem',
  ];
  for (const key of playlistKeys) {
    assert.ok(lumenKeyRegistry.includes(key), `registered message key: ${key}`);
    for (const locale of ['fr', 'ar']) {
      assert.ok(overrides[locale][key], `${locale} translation exists: ${key}`);
    }
  }
});

test('Lumen artist discovery labels are registered and translated', () => {
  const discoveryKeys = [
    'lumen.music.recommended',
    'lumen.music.because',
    'lumen.music.becauseYouListen',
    'lumen.music.trendingArtists',
    'lumen.music.playlistsToExplore',
    'lumen.music.playlistGenre',
  ];
  for (const key of discoveryKeys) {
    assert.ok(lumenKeyRegistry.includes(key), `registered message key: ${key}`);
    for (const locale of ['fr', 'ar']) {
      assert.ok(overrides[locale][key], `${locale} translation exists: ${key}`);
    }
  }
});

test('Lumen artist request and follow labels are registered and translated', () => {
  const artistKeys = [
    'lumen.music.since',
    'lumen.music.releaseCount',
    'lumen.music.ownedAlbums',
    'lumen.music.getMissingReleases',
    'lumen.music.getAllReleasesTitle',
    'lumen.music.getAllPlanBody',
    'lumen.music.aurralOneAfterAnother',
    'lumen.music.oneAlbum',
    'lumen.music.albumCount',
    'lumen.music.oneSingleOrEp',
    'lumen.music.albumsAndSmaller',
    'lumen.music.followingToast',
    'lumen.music.followingLabel',
    'lumen.music.followHelp2',
    'lumen.music.getAllFailed',
    'lumen.music.requestedSongs',
    'lumen.music.requestedReleases',
    'lumen.music.someRequestsFailed',
    'lumen.music.getAllPlanFailed',
    'lumen.music.getAllPlanning',
    'lumen.music.skippedCoveredOrUnofficial',
    'lumen.music.getAllNothingNew',
    'lumen.music.oneExtraSong',
    'lumen.music.extraSongsCount',
    'lumen.music.listOfThree',
    'lumen.music.unfollowedToast',
    'lumen.music.followFailed',
    'lumen.music.getSinglesEps',
    'lumen.music.getMoreSongs',
    'lumen.music.artistUnavailable',
    'lumen.music.unknownArtist',
    'lumen.music.allAlbumsOwned',
    'lumen.music.requestingProgress',
    'lumen.music.everythingHad',
    'lumen.music.artistIncomplete',
    'lumen.music.artistIncompleteHelp',
    'lumen.music.seeAllCount',
    'lumen.music.unfollowTitle',
    'lumen.music.unfollowBody',
    'lumen.music.getSongsTitle',
    'lumen.music.getSinglesTitle',
    'lumen.music.fansAlsoLike',
  ];
  for (const key of artistKeys) {
    assert.ok(lumenKeyRegistry.includes(key), `registered message key: ${key}`);
    for (const locale of ['fr', 'ar']) {
      assert.ok(overrides[locale][key], `${locale} translation exists: ${key}`);
    }
  }
});

test('Lumen artist release explanations are registered and translated', () => {
  const releaseKeys = [
    'lumen.music.onAlbumAndMoreReason',
    'lumen.music.onAlbumReason',
    'lumen.music.editionOfReason',
    'lumen.music.promoReason',
    'lumen.music.openRelease',
    'lumen.music.otherReleases',
    'lumen.music.showOtherReleases',
    'lumen.music.hideOtherReleases',
    'lumen.music.otherEditionsTitle',
    'lumen.music.hiddenEditions',
    'lumen.music.hiddenCovered',
    'lumen.music.hiddenUnofficial',
  ];
  for (const key of releaseKeys) {
    assert.ok(lumenKeyRegistry.includes(key), `registered message key: ${key}`);
    for (const locale of ['fr', 'ar']) {
      assert.ok(overrides[locale][key], `${locale} translation exists: ${key}`);
    }
  }
});

test('all literal MusicHome messages are registered and translated', async () => {
  const source = await readFile(
    resolve(root, 'src/components/MusicHome.tsx'),
    'utf8'
  );
  const sourceFile = ts.createSourceFile(
    'MusicHome.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const sourceKeys = new Set();
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      node.arguments.length >= 1 &&
      ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[0].text.startsWith('lumen.')
    ) {
      sourceKeys.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  assert.ok(sourceKeys.size > 0, 'MusicHome message keys exist');
  for (const key of sourceKeys) {
    assert.ok(lumenKeyRegistry.includes(key), `registered message key: ${key}`);
    for (const locale of ['fr', 'ar']) {
      assert.ok(overrides[locale][key], `${locale} translation exists: ${key}`);
    }
  }
});

test('all literal Lumen messages are registered and translated', async () => {
  const sourceRoot = resolve(root, 'src');
  const files = [];
  const collectFiles = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = resolve(directory, entry.name);
      if (entry.isDirectory()) await collectFiles(file);
      else if (/\.[jt]sx?$/.test(entry.name)) files.push(file);
    }
  };
  await collectFiles(sourceRoot);
  const messages = new Set();
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const kind =
      file.endsWith('.tsx') || file.endsWith('.jsx')
        ? ts.ScriptKind.TSX
        : ts.ScriptKind.TS;
    const ast = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      kind
    );
    const visit = (node) => {
      if (
        ts.isCallExpression(node) &&
        node.arguments.length >= 2 &&
        ts.isStringLiteral(node.arguments[0]) &&
        ts.isStringLiteral(node.arguments[1]) &&
        node.arguments[0].text.startsWith('lumen.')
      ) {
        const [keyNode] = node.arguments;
        messages.add(keyNode.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }

  assert.ok(messages.size > 0, 'literal Lumen message keys exist');
  for (const key of messages) {
    assert.ok(lumenKeyRegistry.includes(key), `registered Lumen key: ${key}`);
    for (const locale of ['fr', 'ar']) {
      assert.ok(
        overrides[locale]?.[key],
        `${locale} translation exists: ${key}`
      );
    }
  }
});

test('Lumen administration destination map labels have locale coverage', async () => {
  const source = await readFile(
    resolve(root, 'src/pages/AdminHome.tsx'),
    'utf8'
  );
  const ast = ts.createSourceFile(
    'AdminHome.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  let destinationMap;
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'destinationMessages' &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    )
      destinationMap = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(destinationMap, 'administration destination map exists');
  const keys = destinationMap.properties
    .filter(
      (property) =>
        ts.isPropertyAssignment(property) &&
        ts.isStringLiteral(property.initializer) &&
        property.initializer.text.startsWith('lumen.admin.dest.')
    )
    .map((property) => property.initializer.text);
  assert.ok(keys.length > 0, 'destination labels use locale keys');
  for (const key of keys) {
    assert.ok(lumenKeyRegistry.includes(key), `registered destination: ${key}`);
    for (const locale of ['fr', 'ar'])
      assert.ok(
        overrides[locale]?.[key],
        `${locale} destination exists: ${key}`
      );
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

test('dynamically generated game-library filter keys exist in every shipped locale', async () => {
  const dynamicValues = new Map();
  for (const file of ['src/pages/GameLibrary.tsx', 'src/extras.ts']) {
    const source = await readFile(resolve(root, file), 'utf8');
    const ast = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    function visit(node) {
      if (
        ts.isVariableDeclaration(node) &&
        (node.name.getText(ast) === 'GAME_LABEL' ||
          node.name.getText(ast) === 'PROGRESS') &&
        node.initializer &&
        ts.isObjectLiteralExpression(node.initializer)
      ) {
        for (const property of node.initializer.properties) {
          if (
            ts.isPropertyAssignment(property) &&
            ts.isStringLiteral(property.initializer)
          ) {
            dynamicValues.set(
              property.initializer.text,
              node.name.getText(ast)
            );
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  assert.equal(
    dynamicValues.size,
    9,
    'all game categories and progress states are enumerated'
  );

  const generatedKey = (value) =>
    `lumen.gameLibrary.${value
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .split(/ +/)
      .map((part, index) =>
        index ? part[0].toUpperCase() + part.slice(1) : part.toLowerCase()
      )
      .join('')}`;
  for (const value of dynamicValues.keys()) {
    const key = generatedKey(value);
    assert.ok(lumenKeyRegistry.includes(key), `registered dynamic key: ${key}`);
    for (const locale of ['en', 'fr', 'ar']) {
      assert.equal(
        typeof overrides[locale][key],
        'string',
        `${locale}: ${key}`
      );
      if (locale !== 'en')
        assert.notEqual(
          overrides[locale][key],
          overrides.en[key],
          `${locale}: ${key} is translated`
        );
    }
  }
});

test('dynamic Podcast navigation and search labels exist in every shipped locale', async () => {
  const extras = await readFile(resolve(root, 'src/extras.ts'), 'utf8');
  const shell = await readFile(
    resolve(root, 'src/components/Shell.tsx'),
    'utf8'
  );
  const sources = new Map([
    ['lumen.nav.podcasts', extras],
    ['lumen.shell.searchPodcasts', shell],
    ['lumen.shell.searchSongs', shell],
  ]);
  for (const [key, source] of sources) {
    assert.ok(source.includes(key), `dynamic source references ${key}`);
    assert.ok(lumenKeyRegistry.includes(key), `registered key: ${key}`);
    for (const locale of ['en', 'fr', 'ar']) {
      assert.equal(
        typeof overrides[locale][key],
        'string',
        `${locale}: ${key}`
      );
      if (locale !== 'en' && key !== 'lumen.nav.podcasts') {
        assert.notEqual(
          overrides[locale][key],
          overrides.en[key],
          `${locale}: ${key} is translated`
        );
      }
    }
  }
});

test('Administration home group keys are registered and translated', async () => {
  const source = await readFile(
    resolve(root, 'src/pages/AdminHome.tsx'),
    'utf8'
  );
  const keys = [
    'lumen.admin.home.general',
    'lumen.admin.home.requestsDiscovery',
    'lumen.admin.home.mediaServersReaders',
    'lumen.admin.home.indexersDownloads',
    'lumen.admin.group.tvMovies',
    'lumen.admin.home.booksAudiobooksComics',
    'lumen.admin.group.music',
    'lumen.admin.home.softwareGames',
    'lumen.admin.home.system',
  ];
  for (const key of keys) {
    assert.ok(source.includes(key), `Administration home maps ${key}`);
    assert.ok(lumenKeyRegistry.includes(key), `registered key: ${key}`);
    for (const locale of ['en', 'fr', 'ar']) {
      assert.equal(
        typeof overrides[locale][key],
        'string',
        `${locale}: ${key}`
      );
    }
  }
});

test('Lumen number and list formatting follows the saved interface locale', async () => {
  const sourceRoot = resolve(root, 'src');
  const files = [];
  const collectFiles = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = resolve(directory, entry.name);
      if (entry.isDirectory()) await collectFiles(file);
      else if (/\.[jt]sx?$/.test(entry.name)) files.push(file);
    }
  };
  await collectFiles(sourceRoot);
  const unsafe =
    /new Intl\.(?:DateTimeFormat|NumberFormat|ListFormat|RelativeTimeFormat|DisplayNames)\(\s*undefined|new Intl\.NumberFormat\(\s*\)|\.toLocale(?:String|DateString|TimeString)\(\s*(?:\)|undefined\b)/;
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, unsafe, `${file} uses the saved locale`);
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
