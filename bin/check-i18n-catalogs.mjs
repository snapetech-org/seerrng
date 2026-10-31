#!/usr/bin/env node
/* eslint-disable no-console */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyCatalogEntry,
  getFallbackEntry,
  getLocalizedEquivalentEntry,
  getProvenanceKey,
  hasUnreviewedTranslations,
  isValidProvenanceEntry,
  matchesProvenanceFingerprints,
} from './check-i18n-catalogs-lib.mjs';

const require = createRequire(import.meta.url);
const { parse } = require('@formatjs/icu-messageformat-parser');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(
  fs.readFileSync(path.join(root, 'config/i18n/locales.json'), 'utf8')
);
const sourceSnapshotPath = path.join(root, 'config/i18n/source-snapshot.json');
const sourceSnapshot = JSON.parse(fs.readFileSync(sourceSnapshotPath, 'utf8'));
if (
  sourceSnapshot.schemaVersion !== 1 ||
  sourceSnapshot.algorithm !== 'sha256' ||
  !sourceSnapshot.client ||
  typeof sourceSnapshot.client !== 'object' ||
  Array.isArray(sourceSnapshot.client) ||
  !sourceSnapshot.server ||
  typeof sourceSnapshot.server !== 'object' ||
  Array.isArray(sourceSnapshot.server)
) {
  throw new Error('Invalid config/i18n/source-snapshot.json schema.');
}
const fallbackPath = path.join(root, 'config/i18n/english-fallbacks.json');
const fallbackManifest = fs.existsSync(fallbackPath)
  ? JSON.parse(fs.readFileSync(fallbackPath, 'utf8'))
  : { schemaVersion: 1, entries: [] };
const equivalentPath = path.join(root, 'config/i18n/locale-equivalents.json');
const equivalentManifest = fs.existsSync(equivalentPath)
  ? JSON.parse(fs.readFileSync(equivalentPath, 'utf8'))
  : { schemaVersion: 1, entries: [] };
const provenancePath = path.join(root, 'config/i18n/catalog-provenance.json');
const provenanceManifest = fs.existsSync(provenancePath)
  ? JSON.parse(fs.readFileSync(provenancePath, 'utf8'))
  : { schemaVersion: 1, entries: [] };
const flags = new Set(process.argv.slice(2));
const strict = flags.has('--strict');
const strictCoverage = flags.has('--strict-coverage');
const strictPlurals = flags.has('--strict-plurals');
const strictReview = flags.has('--strict-review');
const jsonOutput = flags.has('--json');
const problems = [];
const pluralWarnings = [];
const reports = [];
const catalogs = new Map();

const readCatalog = (domain, locale) => {
  const key = domain + ':' + locale.tag;
  if (catalogs.has(key)) return catalogs.get(key);
  const filename = domain === 'client' ? locale.clientFile : locale.serverFile;
  const directory =
    domain === 'client' ? 'src/i18n/locale' : 'server/i18n/locale';
  const fullPath = path.join(root, directory, filename);
  let value;
  try {
    value = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch (error) {
    throw new Error(fullPath + ': ' + error.message, { cause: error });
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(fullPath + ': expected a JSON object');
  }
  catalogs.set(key, value);
  return value;
};

const addProblem = (domain, locale, id, kind, detail) => {
  problems.push({ domain, locale, id, kind, detail });
};

const collectContract = (
  nodes,
  contract = {
    args: new Set(),
    tags: new Set(),
    code: [],
    plurals: [],
  }
) => {
  for (const node of nodes) {
    if (node.type === 1) contract.args.add(node.value + ':argument');
    else if (node.type >= 2 && node.type <= 4) {
      const kinds = { 2: 'number', 3: 'date', 4: 'time' };
      contract.args.add(node.value + ':' + kinds[node.type]);
    } else if (node.type === 5 || node.type === 6) {
      const kind = node.type === 5 ? 'select' : node.pluralType;
      contract.args.add(node.value + ':' + kind);
      if (node.type === 6) {
        contract.plurals.push({
          name: node.value,
          type: node.pluralType || 'cardinal',
          options: Object.keys(node.options),
        });
      }
      for (const option of Object.values(node.options)) {
        collectContract(option.value, contract);
      }
    } else if (node.type === 8) {
      contract.tags.add(node.value);
      if (node.value === 'code') {
        contract.code.push(
          node.children
            .map((child) => {
              if (child.type === 0) return child.value;
              if (child.type === 1) return '{' + child.value + '}';
              if (child.type === 7) return '#';
              return '';
            })
            .join('')
        );
      }
      collectContract(node.children, contract);
    }
  }

  const argumentTypes = new Map();
  for (const argument of contract.args) {
    const separator = argument.lastIndexOf(':');
    const name = argument.slice(0, separator);
    const type = argument.slice(separator + 1);
    const types = argumentTypes.get(name) || new Set();
    types.add(type);
    argumentTypes.set(name, types);
  }

  return {
    args: [...argumentTypes]
      .flatMap(([name, types]) => {
        const effectiveTypes = [...types].filter(
          (type) => type !== 'argument' || types.size === 1
        );
        return effectiveTypes.map((type) => name + ':' + type);
      })
      .sort(),
    tags: [...contract.tags].sort(),
    code: [...contract.code].sort(),
    plurals: contract.plurals,
  };
};

const urlTokens = (message) =>
  (message.match(/https?:\/\/[^\s<>]+|\bhttps?\b/gi) || []).sort();

const hashSource = (message) =>
  createHash('sha256').update(message, 'utf8').digest('hex');

const provenanceEntries = new Map();
if (
  provenanceManifest.schemaVersion !== 1 ||
  provenanceManifest.defaultStatus !== 'unreviewed' ||
  provenanceManifest.defaultProvenance !== 'legacy-catalog' ||
  !Array.isArray(provenanceManifest.entries)
) {
  throw new Error('Invalid config/i18n/catalog-provenance.json schema.');
}
for (const entry of provenanceManifest.entries) {
  const key =
    entry &&
    typeof entry.domain === 'string' &&
    typeof entry.locale === 'string' &&
    typeof entry.id === 'string'
      ? getProvenanceKey(entry.domain, entry.locale, entry.id)
      : '';
  if (!isValidProvenanceEntry(entry) || !key || provenanceEntries.has(key)) {
    throw new Error('Invalid or duplicate catalog provenance entry.');
  }
  const locale = config.locales.find((item) => item.tag === entry.locale);
  if (!locale || entry.locale === config.baseLocale) {
    throw new Error(
      'Provenance entry uses an unknown or source locale: ' + key
    );
  }
  const sourceLocale = config.locales.find(
    (item) => item.tag === config.baseLocale
  );
  if (!sourceLocale)
    throw new Error('Base locale is missing from the registry.');
  const sourceMessage = readCatalog(entry.domain, sourceLocale)[entry.id];
  const targetMessage = readCatalog(entry.domain, locale)[entry.id];
  if (
    typeof sourceMessage !== 'string' ||
    typeof targetMessage !== 'string' ||
    !targetMessage.trim() ||
    !matchesProvenanceFingerprints(
      entry,
      hashSource(sourceMessage),
      hashSource(targetMessage)
    )
  ) {
    addProblem(
      entry.domain,
      entry.locale,
      entry.id,
      'stale-provenance',
      'Source or target text changed; re-review this message before restoring its provenance.'
    );
    continue;
  }
  provenanceEntries.set(key, entry);
}

const fallbackEntries = new Map();
if (
  fallbackManifest.schemaVersion !== 1 ||
  !Array.isArray(fallbackManifest.entries)
) {
  throw new Error('Invalid config/i18n/english-fallbacks.json schema.');
}
for (const entry of fallbackManifest.entries) {
  if (
    !entry ||
    !['client', 'server'].includes(entry.domain) ||
    typeof entry.id !== 'string' ||
    typeof entry.sourceHash !== 'string' ||
    typeof entry.owner !== 'string' ||
    !entry.owner.trim() ||
    typeof entry.reason !== 'string' ||
    !entry.reason.trim() ||
    typeof entry.expiresOn !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(entry.expiresOn) ||
    !/^[a-f0-9]{64}$/i.test(entry.sourceHash) ||
    fallbackEntries.has(`${entry.domain}:${entry.id}`)
  ) {
    throw new Error('Invalid or duplicate English fallback entry.');
  }
  const expiry = new Date(entry.expiresOn + 'T23:59:59Z').getTime();
  if (!Number.isFinite(expiry) || expiry < Date.now()) {
    throw new Error('Expired English fallback: ' + entry.id);
  }
  fallbackEntries.set(`${entry.domain}:${entry.id}`, entry);
}

const equivalentEntries = new Map();
if (
  equivalentManifest.schemaVersion !== 1 ||
  !Array.isArray(equivalentManifest.entries)
) {
  throw new Error('Invalid config/i18n/locale-equivalents.json schema.');
}
const baseLocale = config.locales.find(
  (locale) => locale.tag === config.baseLocale
);
if (!baseLocale) throw new Error('Base locale is missing from the registry.');
for (const entry of equivalentManifest.entries) {
  const key =
    entry &&
    typeof entry.domain === 'string' &&
    typeof entry.locale === 'string' &&
    typeof entry.id === 'string'
      ? getProvenanceKey(entry.domain, entry.locale, entry.id)
      : '';
  const locale = config.locales.find((item) => item.tag === entry?.locale);
  const callsites = entry?.sourceCallsites;
  if (
    !entry ||
    !['client', 'server'].includes(entry.domain) ||
    !locale ||
    entry.locale === config.baseLocale ||
    typeof entry.id !== 'string' ||
    entry.classification !== 'localized-equivalent' ||
    ![
      'same-spelling-native-equivalent',
      'accepted-media-term',
      'localized-placeholder-template',
    ].includes(entry.equivalenceType) ||
    typeof entry.source !== 'string' ||
    typeof entry.target !== 'string' ||
    typeof entry.sourceHash !== 'string' ||
    typeof entry.targetHash !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(entry.sourceHash) ||
    !/^[a-f0-9]{64}$/i.test(entry.targetHash) ||
    typeof entry.reason !== 'string' ||
    !entry.reason.trim() ||
    typeof entry.expiresOn !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(entry.expiresOn) ||
    !Array.isArray(callsites) ||
    callsites.length === 0 ||
    callsites.some(
      (callsite) =>
        !callsite ||
        typeof callsite.path !== 'string' ||
        !callsite.path.startsWith(
          entry.domain === 'client' ? 'src/' : 'server/'
        ) ||
        !fs.existsSync(path.join(root, callsite.path)) ||
        !Number.isInteger(callsite.line) ||
        callsite.line < 1 ||
        typeof callsite.defaultMessage !== 'string'
    ) ||
    equivalentEntries.has(key)
  ) {
    throw new Error('Invalid or duplicate locale-equivalence entry.');
  }
  const expiry = new Date(entry.expiresOn + 'T23:59:59Z').getTime();
  if (!Number.isFinite(expiry) || expiry < Date.now()) {
    throw new Error('Expired locale-equivalence entry: ' + key);
  }
  if (fallbackEntries.has(`${entry.domain}:${entry.id}`)) {
    throw new Error('Locale equivalence overlaps English fallback: ' + key);
  }
  const sourceMessage = readCatalog(entry.domain, baseLocale)[entry.id];
  const targetMessage = readCatalog(entry.domain, locale)[entry.id];
  if (
    typeof sourceMessage !== 'string' ||
    typeof targetMessage !== 'string' ||
    sourceMessage !== targetMessage ||
    entry.source !== sourceMessage ||
    entry.target !== targetMessage ||
    entry.sourceHash !== hashSource(sourceMessage) ||
    entry.targetHash !== hashSource(targetMessage)
  ) {
    addProblem(
      entry.domain,
      entry.locale,
      entry.id,
      'stale-equivalence',
      'Source or target text changed; re-review this locale-equivalence entry.'
    );
    continue;
  }
  equivalentEntries.set(key, entry);
}

for (const domain of ['client', 'server']) {
  const sourceLocale = config.locales.find(
    (locale) => locale.tag === config.baseLocale
  );
  if (!sourceLocale)
    throw new Error('Base locale is missing from the registry.');
  const source = readCatalog(domain, sourceLocale);
  const sourceEntries = Object.entries(source);
  const sourceIds = new Set(sourceEntries.map(([id]) => id));
  const sourceContracts = new Map();
  const storedHashes = sourceSnapshot[domain];

  for (const [id, message] of sourceEntries) {
    if (
      typeof message === 'string' &&
      storedHashes[id] !== hashSource(message)
    ) {
      addProblem(
        domain,
        config.baseLocale,
        id,
        'stale-source',
        'English source changed; review translations and run pnpm i18n:snapshot.'
      );
    }
  }
  for (const id of Object.keys(storedHashes)) {
    if (!sourceIds.has(id)) {
      addProblem(
        domain,
        config.baseLocale,
        id,
        'stale-source',
        'Message was removed from English source; refresh the source snapshot.'
      );
    }
  }

  for (const [id, message] of sourceEntries) {
    if (typeof message !== 'string' || !message.trim()) {
      addProblem(
        domain,
        config.baseLocale,
        id,
        'invalid-source',
        'Expected a non-empty string.'
      );
      continue;
    }
    try {
      sourceContracts.set(id, collectContract(parse(message)));
    } catch (error) {
      addProblem(
        domain,
        config.baseLocale,
        id,
        'invalid-source-icu',
        error.message
      );
    }
  }

  for (const entry of fallbackManifest.entries) {
    if (entry.domain !== domain) continue;
    if (!sourceIds.has(entry.id)) {
      addProblem(
        domain,
        config.baseLocale,
        entry.id,
        'stale-fallback',
        'Fallback key is not in the English source catalog.'
      );
      continue;
    }
    if (entry.sourceHash !== hashSource(source[entry.id])) {
      addProblem(
        domain,
        config.baseLocale,
        entry.id,
        'stale-fallback',
        'English source changed; re-review or refresh this fallback entry.'
      );
    }
  }

  const findParentTranslation = (locale, id, sourceMessage) => {
    let parentTag = locale.fallback;
    const visited = new Set();
    while (parentTag && parentTag !== config.baseLocale) {
      if (visited.has(parentTag)) break;
      visited.add(parentTag);
      const parent = config.locales.find((item) => item.tag === parentTag);
      if (!parent) break;
      const parentCatalog = readCatalog(domain, parent);
      const message = parentCatalog[id];
      if (
        typeof message === 'string' &&
        message.trim() &&
        message !== sourceMessage
      ) {
        return { locale: parent, message };
      }
      parentTag = parent.fallback;
    }
    return undefined;
  };

  const directory =
    domain === 'client' ? 'src/i18n/locale' : 'server/i18n/locale';
  const registeredFiles = new Set(
    config.locales.map((locale) =>
      domain === 'client' ? locale.clientFile : locale.serverFile
    )
  );
  const inactiveFiles = new Set(
    (config.inactiveCatalogs || []).map((tag) => tag + '.json')
  );
  for (const filename of fs.readdirSync(path.join(root, directory))) {
    if (!filename.endsWith('.json') || registeredFiles.has(filename)) continue;
    if (!inactiveFiles.has(filename)) {
      addProblem(
        domain,
        '-',
        filename,
        'orphan-catalog',
        'Catalog is not registered as selectable or inactive.'
      );
    }
  }

  for (const locale of config.locales) {
    const translated = readCatalog(domain, locale);
    const translatedIds = Object.keys(translated);
    const report = {
      domain,
      locale: locale.tag,
      reviewStatus: locale.reviewStatus,
      total: sourceIds.size,
      translatedDirect: 0,
      reviewed: 0,
      draft: 0,
      unreviewed: 0,
      identicalToEnglish: 0,
      localizedEquivalent: 0,
      intentionallyEnglish: 0,
      missing: 0,
      empty: 0,
      inheritedFromParent: 0,
      coverageGaps: 0,
      extra: 0,
      invalidIcu: 0,
      contractMismatch: 0,
      tokenMismatch: 0,
      pluralWarnings: 0,
    };

    for (const id of translatedIds) {
      if (!sourceIds.has(id)) {
        report.extra++;
        addProblem(
          domain,
          locale.tag,
          id,
          'extra-key',
          'Key is not present in the English source catalog.'
        );
      }
    }

    for (const [id, sourceMessage] of sourceEntries) {
      const hasValue = Object.prototype.hasOwnProperty.call(translated, id);
      const targetMessage = translated[id];
      const fallbackEntry = getFallbackEntry(fallbackEntries, domain, id);
      const localizedEquivalent = getLocalizedEquivalentEntry(
        equivalentEntries,
        domain,
        locale.tag,
        id
      );
      const isSelectableTranslation = locale.tag !== config.baseLocale;
      const parentTranslation =
        isSelectableTranslation && !hasValue
          ? findParentTranslation(locale, id, sourceMessage)
          : undefined;
      const provenance = provenanceEntries.get(
        getProvenanceKey(domain, locale.tag, id)
      );
      const state = classifyCatalogEntry({
        hasValue,
        value: targetMessage,
        sourceValue: sourceMessage,
        hasParentTranslation: Boolean(parentTranslation),
        hasFallback: isSelectableTranslation && Boolean(fallbackEntry),
        hasLocalizedEquivalent:
          isSelectableTranslation && Boolean(localizedEquivalent),
        reviewStatus: provenance?.status,
      });

      if (state.kind === 'missing') {
        report.missing++;
        report.coverageGaps++;
        continue;
      }
      if (state.kind === 'inherited') {
        report.missing++;
        report.inheritedFromParent++;
        const parentProvenance = provenanceEntries.get(
          getProvenanceKey(domain, parentTranslation.locale.tag, id)
        );
        const reviewStatus = parentProvenance?.status || 'unreviewed';
        report[reviewStatus]++;
        continue;
      }
      if (state.kind === 'intentionallyEnglish') {
        report[
          isSelectableTranslation
            ? 'intentionallyEnglish'
            : 'identicalToEnglish'
        ]++;
        continue;
      }
      if (state.kind === 'localizedEquivalent') {
        report.localizedEquivalent++;
        if (isSelectableTranslation) report[state.reviewStatus]++;
      } else if (state.kind === 'empty') {
        report.empty++;
        if (isSelectableTranslation) report.coverageGaps++;
        addProblem(
          domain,
          locale.tag,
          id,
          'empty-value',
          'Catalog value must be a non-empty string.'
        );
        continue;
      } else if (state.kind === 'identicalToEnglish') {
        report.identicalToEnglish++;
        if (isSelectableTranslation) {
          report[state.reviewStatus]++;
          if (state.coverageGap) report.coverageGaps++;
        }
      } else {
        report.translatedDirect++;
        if (isSelectableTranslation) report[state.reviewStatus]++;
      }

      let targetContract;
      try {
        targetContract = collectContract(parse(targetMessage));
      } catch (error) {
        report.invalidIcu++;
        addProblem(domain, locale.tag, id, 'invalid-icu', error.message);
        continue;
      }
      const sourceContract = sourceContracts.get(id);
      if (
        (sourceContract &&
          JSON.stringify(targetContract.args) !==
            JSON.stringify(sourceContract.args)) ||
        JSON.stringify(targetContract.tags) !==
          JSON.stringify(sourceContract.tags)
      ) {
        report.contractMismatch++;
        addProblem(
          domain,
          locale.tag,
          id,
          'icu-contract',
          'Argument names/types or rich-text tags differ from English.'
        );
      }
      if (
        (sourceContract &&
          JSON.stringify(targetContract.code) !==
            JSON.stringify(sourceContract.code)) ||
        JSON.stringify(urlTokens(targetMessage)) !==
          JSON.stringify(urlTokens(sourceMessage))
      ) {
        report.tokenMismatch++;
        addProblem(
          domain,
          locale.tag,
          id,
          'protected-token',
          'Inline code or URL/protocol tokens differ from English.'
        );
      }
      if (locale.tag !== config.baseLocale) {
        for (const plural of targetContract.plurals) {
          const required = new Intl.PluralRules(locale.tag, {
            type: plural.type,
          }).resolvedOptions().pluralCategories;
          const present = plural.options.filter(
            (option) => !option.startsWith('=')
          );
          const missingCategories = required.filter(
            (category) => !present.includes(category)
          );
          if (missingCategories.length) {
            report.pluralWarnings++;
            pluralWarnings.push({
              domain,
              locale: locale.tag,
              id,
              argument: plural.name,
              missingCategories,
            });
          }
        }
      }
    }
    reports.push(report);
  }
}

const hasStructuralProblems = problems.some((problem) =>
  [
    'invalid-source',
    'invalid-source-icu',
    'stale-fallback',
    'stale-provenance',
    'orphan-catalog',
    'extra-key',
    'empty-value',
    'invalid-icu',
    'icu-contract',
    'protected-token',
  ].includes(problem.kind)
);
const hasCoverageGaps = reports.some(
  (report) => report.locale !== config.baseLocale && report.coverageGaps > 0
);
const hasPluralGaps = pluralWarnings.length > 0;
const hasReviewGaps = reports.some(
  (report) =>
    report.locale !== config.baseLocale && hasUnreviewedTranslations(report)
);

if (jsonOutput) {
  console.log(
    JSON.stringify(
      {
        reports,
        problems,
        pluralWarnings,
        provenance: {
          defaultStatus: provenanceManifest.defaultStatus,
          defaultProvenance: provenanceManifest.defaultProvenance,
          explicitOverrides: provenanceEntries.size,
          localeEquivalences: equivalentEntries.size,
        },
      },
      null,
      2
    )
  );
} else {
  for (const report of reports) {
    const percent = report.total
      ? ((report.translatedDirect / report.total) * 100).toFixed(1)
      : '0.0';
    console.log(
      report.domain.padEnd(6) +
        ' ' +
        report.locale.padEnd(6) +
        ' ' +
        String(report.translatedDirect).padStart(5) +
        '/' +
        String(report.total).padEnd(5) +
        ' translated directly (' +
        percent +
        '%); ' +
        report.missing +
        ' missing, ' +
        report.inheritedFromParent +
        ' inherited, ' +
        report.identicalToEnglish +
        ' English-identical, ' +
        report.localizedEquivalent +
        ' same-spelling localized equivalents, ' +
        report.intentionallyEnglish +
        ' approved English fallback, ' +
        report.reviewed +
        ' reviewed, ' +
        report.draft +
        ' draft, ' +
        report.unreviewed +
        ' unreviewed, ' +
        report.coverageGaps +
        ' unaccounted, ' +
        report.pluralWarnings +
        ' plural warnings; ' +
        report.reviewStatus
    );
  }
  if (problems.length) {
    console.error('Catalog issues: ' + problems.length);
    for (const problem of problems.slice(0, 30)) {
      console.error(
        problem.domain +
          ' ' +
          problem.locale +
          ' ' +
          problem.id +
          ' [' +
          problem.kind +
          '] ' +
          problem.detail
      );
    }
    if (problems.length > 30) {
      console.error(
        '... ' +
          (problems.length - 30) +
          ' more; use --json for the complete report.'
      );
    }
  }
  if (pluralWarnings.length) {
    console.log('Plural categories needing review: ' + pluralWarnings.length);
  }
  console.log(
    'Catalog coverage and translation review are tracked separately. ' +
      'Provenance is per message and locale; unrecorded entries remain unreviewed.'
  );
}

const hasStaleMetadata = problems.some(
  (problem) =>
    problem.kind === 'stale-source' ||
    problem.kind === 'stale-fallback' ||
    problem.kind === 'stale-equivalence' ||
    problem.kind === 'stale-provenance'
);

if (
  hasStaleMetadata ||
  (strict && hasStructuralProblems) ||
  (strictCoverage && hasCoverageGaps) ||
  (strictPlurals && hasPluralGaps) ||
  (strictReview && hasReviewGaps)
) {
  process.exitCode = 1;
}
