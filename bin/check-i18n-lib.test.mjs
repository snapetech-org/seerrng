import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  classifyCatalogEntry,
  getFallbackEntry,
  getLocalizedEquivalentEntry,
  hasUnreviewedTranslations,
  isSafeSourceRelativePath,
  isValidProvenanceEntry,
  matchesProvenanceFingerprints,
  matchesSourceCallsiteLine,
} from './check-i18n-catalogs-lib.mjs';

const require = createRequire(import.meta.url);
const { getLocaleDifferences } = require('./check-i18n-lib.js');
const { extractCatalogue } = require('./extract-messages-lib.js');
const { parse } = require('@formatjs/icu-messageformat-parser');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fullLocales = [
  'ar',
  'de',
  'es',
  'es_MX',
  'fr',
  'hi',
  'id',
  'ja',
  'ko',
  'pt_BR',
  'vi',
  'zh_Hans',
  'zh_Hant',
];
const requestStatusMessageIds = [
  'bookUnavailable',
  'bookQueueFailed',
  'bookCouldNotAccept',
  'comicUnavailable',
  'comicQueueFailed',
  'comicCouldNotAccept',
  'waitingForApproval',
  'approvedWaitingDispatch',
  'searching',
  'downloading',
  'importing',
  'addingToLibrary',
  'available',
  'unavailable',
  'downloadImportFailed',
  'couldNotComplete',
  'declined',
  'cancelled',
  'noReleaseFound',
  'waitingForUsableRelease',
  'preparingEbook',
  'preparingAudiobook',
  'waitingForBookshelf',
  'preparingBookshelfSearch',
  'requestRetried',
  'approvedForProcessing',
].map((key) => `components.RequestStatus.${key}`);

const sourceFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(filename);
      return /\.tsx?$/.test(entry.name) &&
        !/\.(test|spec|d)\.tsx?$/.test(entry.name)
        ? [filename]
        : [];
    })
    .sort();

const collectMessageContract = (
  nodes,
  contract = { args: new Set(), tags: new Set() }
) => {
  for (const node of nodes) {
    if (node.type === 1) contract.args.add(`${node.value}:argument`);
    else if (node.type >= 2 && node.type <= 4)
      contract.args.add(
        `${node.value}:${['', '', 'number', 'date', 'time'][node.type]}`
      );
    else if (node.type === 5 || node.type === 6) {
      const kind = node.type === 5 ? 'select' : node.pluralType;
      contract.args.add(`${node.value}:${kind}`);
      for (const option of Object.values(node.options))
        collectMessageContract(option.value, contract);
    } else if (node.type === 8) {
      contract.tags.add(node.value);
      collectMessageContract(node.children, contract);
    }
  }
  const argumentTypes = new Map();
  for (const argument of contract.args) {
    const separator = argument.lastIndexOf(':');
    const name = argument.slice(0, separator);
    const type = argument.slice(separator + 1);
    const types = argumentTypes.get(name) ?? new Set();
    types.add(type);
    argumentTypes.set(name, types);
  }
  return {
    args: [...argumentTypes]
      .flatMap(([name, types]) => {
        const effectiveTypes = [...types].filter(
          (type) => type !== 'argument' || types.size === 1
        );
        return effectiveTypes.map((type) => `${name}:${type}`);
      })
      .sort(),
    tags: [...contract.tags].sort(),
  };
};

const inlineCodeValues = (nodes, values = []) => {
  for (const node of nodes) {
    if (node.type === 8 && node.value === 'code') {
      values.push(
        node.children
          .map((child) => {
            if (child.type === 0) return child.value;
            if (child.type === 1) return `{${child.value}}`;
            if (child.type === 7) return '#';
            return '';
          })
          .join('')
      );
    } else if (node.type === 5 || node.type === 6) {
      for (const option of Object.values(node.options))
        inlineCodeValues(option.value, values);
    } else if (node.type === 8) inlineCodeValues(node.children, values);
  }
  return values.sort();
};

const urlTokens = (message) =>
  (message.match(/https?:\/\/[^\s<>]+|\bhttps?\b/gi) ?? []).sort();

const assertNewClientMessages = () => {
  const extracted = JSON.parse(
    extractCatalogue(sourceFiles(path.join(root, 'src')), root)
  );
  const localeDirectory = path.join(root, 'src/i18n/locale');
  const sourcePath = path.join(localeDirectory, 'en.json');
  const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
  assert.deepEqual(
    source,
    extracted,
    'client English source is extracted from current messages'
  );

  const requiredKeys = [
    ...requestStatusMessageIds,
    'components.RequestStatus.SoftwareRequests.removeFromRequests',
    'components.RequestStatus.SoftwareRequests.removeFromRequestsDescription',
    'components.RequestStatus.SoftwareRequests.removeFromRequestsFailed',
    'components.RequestStatus.SoftwareRequests.removeFromRequestsSuccess',
    'components.RequestStatus.SoftwareRequests.removeFromRequestsTitle',
    'components.RequestStatus.SoftwareRequests.removeFromRequestsTooltip',
    'components.Settings.whisparrEmpty',
    'components.Settings.whisparrLoadError',
    'components.Settings.whisparrLoadErrorHelp',
    'components.Settings.retryWhisparr',
    'pages.profile.advancedTheme.dividerShadowValues',
  ];
  for (const key of requiredKeys)
    assert.ok(Object.hasOwn(source, key), `${key} is in the current source`);

  const parsedSource = new Map(
    requiredKeys.map((id) => [id, parse(source[id])])
  );
  for (const locale of fullLocales) {
    const filename = path.join(localeDirectory, `${locale}.json`);
    const translated = JSON.parse(readFileSync(filename, 'utf8'));

    for (const id of requiredKeys) {
      const sourceMessage = source[id];
      const translatedMessage = translated[id];
      assert.equal(
        typeof translatedMessage,
        'string',
        `${filename}:${id} is a string`
      );
      assert.ok(translatedMessage.trim(), `${filename}:${id} is non-empty`);
      assert.notEqual(
        translatedMessage,
        sourceMessage,
        `${filename}:${id} is translated instead of falling back to English`
      );
      let parsed;
      try {
        parsed = parse(translatedMessage);
      } catch (error) {
        assert.fail(`${filename}:${id} is not valid ICU: ${error.message}`);
      }
      assert.deepEqual(
        collectMessageContract(parsed),
        collectMessageContract(parsedSource.get(id)),
        `${filename}:${id} preserves ICU arguments and rich text`
      );
      assert.deepEqual(
        inlineCodeValues(parsed),
        inlineCodeValues(parsedSource.get(id)),
        `${filename}:${id} preserves inline code values`
      );
      assert.deepEqual(
        urlTokens(translatedMessage),
        urlTokens(sourceMessage),
        `${filename}:${id} preserves URLs and protocol tokens`
      );
    }
  }
};

test('reports stale English message overrides with both values', () => {
  assert.deepEqual(
    getLocaleDifferences(
      JSON.stringify({ 'components.Movie.reportissue': 'Create Issue' }),
      JSON.stringify({ 'components.Movie.reportissue': 'Report an Issue' })
    ),
    [
      {
        key: 'components.Movie.reportissue',
        original: 'Create Issue',
        extracted: 'Report an Issue',
      },
    ]
  );
});

test('fallback authorization is scoped to both catalog domain and message id', () => {
  const fallbacks = new Map([
    ['client:shared.message', { domain: 'client', id: 'shared.message' }],
  ]);

  assert.ok(getFallbackEntry(fallbacks, 'client', 'shared.message'));
  assert.equal(
    getFallbackEntry(fallbacks, 'server', 'shared.message'),
    undefined
  );
});

test('parent translations and approved English fallbacks satisfy coverage', () => {
  assert.deepEqual(
    classifyCatalogEntry({
      hasValue: false,
      sourceValue: 'Search',
      hasParentTranslation: true,
    }),
    { kind: 'inherited', coverageGap: false }
  );
  assert.deepEqual(
    classifyCatalogEntry({
      hasValue: false,
      sourceValue: 'Search',
      hasFallback: true,
    }),
    { kind: 'intentionallyEnglish', coverageGap: false }
  );
});

test('same-spelling target-language equivalents are covered without being fallbacks', () => {
  const equivalents = new Map([
    [
      'client:fr:common.page',
      { domain: 'client', locale: 'fr', id: 'common.page' },
    ],
  ]);
  assert.ok(
    getLocalizedEquivalentEntry(equivalents, 'client', 'fr', 'common.page')
  );
  assert.equal(
    getLocalizedEquivalentEntry(equivalents, 'client', 'de', 'common.page'),
    undefined
  );
  assert.equal(
    getLocalizedEquivalentEntry(equivalents, 'server', 'fr', 'common.page'),
    undefined
  );

  assert.deepEqual(
    classifyCatalogEntry({
      hasValue: true,
      value: 'Page',
      sourceValue: 'Page',
      hasLocalizedEquivalent: true,
      reviewStatus: 'draft',
    }),
    {
      kind: 'localizedEquivalent',
      reviewStatus: 'draft',
      coverageGap: false,
    }
  );
});

test('locale-equivalence evidence must still match its recorded source line and message', () => {
  const sourceText = [
    "const messages = defineMessages('pages', {",
    "  page: 'Page {page}',",
    "  label: 'Search',",
    '});',
  ].join('\n');

  assert.equal(
    matchesSourceCallsiteLine({
      sourceText,
      line: 2,
      defaultMessage: "'Page {page}'",
    }),
    true
  );
  assert.equal(
    matchesSourceCallsiteLine({
      sourceText,
      line: 3,
      defaultMessage: "'Page {page}'",
    }),
    false,
    'a stale line cannot borrow a nearby declaration'
  );
  assert.equal(
    matchesSourceCallsiteLine({
      sourceText,
      line: 2,
      defaultMessage: "'Page {number}'",
    }),
    false,
    'a stale message literal cannot pass the callsite check'
  );
});

test('locale-equivalence source paths stay inside the repository source roots', () => {
  assert.equal(
    isSafeSourceRelativePath('src/components/Details/index.tsx', 'src'),
    true
  );
  assert.equal(isSafeSourceRelativePath('src/../../outside.tsx', 'src'), false);
  assert.equal(isSafeSourceRelativePath('/tmp/escape.tsx', 'src'), false);
  assert.equal(isSafeSourceRelativePath('src\\\\outside.tsx', 'src'), false);
});

test('unlisted English and empty values remain explicit coverage gaps', () => {
  assert.equal(
    classifyCatalogEntry({
      hasValue: true,
      value: 'Search',
      sourceValue: 'Search',
    }).coverageGap,
    true
  );
  assert.equal(
    classifyCatalogEntry({
      hasValue: true,
      value: '   ',
      sourceValue: 'Search',
      hasFallback: true,
    }).kind,
    'empty'
  );
  assert.equal(
    classifyCatalogEntry({
      hasValue: true,
      value: 'Plex',
      sourceValue: 'Plex',
      reviewStatus: 'reviewed',
    }).coverageGap,
    false
  );
});

test('draft translations still require human review', () => {
  const state = classifyCatalogEntry({
    hasValue: true,
    value: 'Rechercher',
    sourceValue: 'Search',
    reviewStatus: 'draft',
  });

  assert.equal(state.reviewStatus, 'draft');
  assert.equal(hasUnreviewedTranslations({ unreviewed: 0, draft: 1 }), true);
  assert.equal(hasUnreviewedTranslations({ unreviewed: 0, draft: 0 }), false);
});

test('catalog review provenance must match a source and target fingerprint', () => {
  const valid = {
    domain: 'client',
    locale: 'fr',
    id: 'common.search',
    sourceHash: 'a'.repeat(64),
    targetHash: 'b'.repeat(64),
    status: 'reviewed',
    provenance: 'human-review',
    reviewer: 'reviewer@example.test',
    reviewedAt: '2026-10-29',
  };

  assert.equal(isValidProvenanceEntry(valid), true);
  assert.equal(
    isValidProvenanceEntry({ ...valid, targetHash: 'changed' }),
    false
  );
  assert.equal(isValidProvenanceEntry({ ...valid, reviewer: '  ' }), false);
  assert.equal(
    isValidProvenanceEntry({ ...valid, reviewedAt: '2026-02-30' }),
    false
  );
  assert.equal(
    matchesProvenanceFingerprints(valid, 'a'.repeat(64), 'b'.repeat(64)),
    true
  );
  assert.equal(
    matchesProvenanceFingerprints(valid, 'c'.repeat(64), 'b'.repeat(64)),
    false
  );
});

test('reports added and removed message keys', () => {
  assert.deepEqual(
    getLocaleDifferences(
      JSON.stringify({ removed: 'Old' }),
      JSON.stringify({ added: 'New' })
    ),
    [
      { key: 'added', original: undefined, extracted: 'New' },
      { key: 'removed', original: 'Old', extracted: undefined },
    ]
  );
});

test('new request-status and advanced-theme messages are translated in every locale', () => {
  assertNewClientMessages();
});
