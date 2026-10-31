import path from 'node:path';

const fallbackKey = (domain, id) => `${domain}:${id}`;

export const getFallbackEntry = (fallbackEntries, domain, id) =>
  fallbackEntries.get(fallbackKey(domain, id));

export const getLocalizedEquivalentEntry = (
  equivalentEntries,
  domain,
  locale,
  id
) => equivalentEntries.get(`${domain}:${locale}:${id}`);

export const getProvenanceKey = (domain, locale, id) =>
  `${domain}:${locale}:${id}`;

export const matchesSourceCallsiteLine = ({
  sourceText,
  line,
  defaultMessage,
}) => {
  if (
    typeof sourceText !== 'string' ||
    !Number.isInteger(line) ||
    line < 1 ||
    typeof defaultMessage !== 'string' ||
    !defaultMessage
  ) {
    return false;
  }
  const sourceLine = sourceText.split(/\r?\n/)[line - 1];
  if (sourceLine === undefined) return false;
  const normalizeIndentation = (value) =>
    value
      .replace(/\r/g, '')
      .split('\n')
      .map((part) => part.trimStart())
      .join('\n');
  return normalizeIndentation(sourceLine).includes(
    normalizeIndentation(defaultMessage)
  );
};

export const isSafeSourceRelativePath = (value, sourcePrefix) =>
  typeof value === 'string' &&
  typeof sourcePrefix === 'string' &&
  !path.isAbsolute(value) &&
  value.startsWith(`${sourcePrefix}/`) &&
  !value.split(/[\\/]+/).includes('..') &&
  !value.includes('\\') &&
  path.normalize(value) === value;

export const classifyCatalogEntry = ({
  hasValue,
  value,
  sourceValue,
  hasParentTranslation = false,
  hasFallback = false,
  hasLocalizedEquivalent = false,
  reviewStatus = 'unreviewed',
}) => {
  if (!hasValue) {
    if (hasParentTranslation) return { kind: 'inherited', coverageGap: false };
    if (hasFallback)
      return { kind: 'intentionallyEnglish', coverageGap: false };
    return { kind: 'missing', coverageGap: true };
  }

  if (typeof value !== 'string' || !value.trim()) {
    return { kind: 'empty', coverageGap: true };
  }

  if (value === sourceValue) {
    if (hasFallback)
      return { kind: 'intentionallyEnglish', coverageGap: false };
    const review =
      reviewStatus === 'reviewed' || reviewStatus === 'draft'
        ? reviewStatus
        : 'unreviewed';
    if (hasLocalizedEquivalent)
      return {
        kind: 'localizedEquivalent',
        reviewStatus: review,
        coverageGap: false,
      };
    return {
      kind: 'identicalToEnglish',
      reviewStatus: review,
      coverageGap: review !== 'reviewed',
    };
  }

  return {
    kind: 'translatedDirect',
    reviewStatus:
      reviewStatus === 'reviewed' || reviewStatus === 'draft'
        ? reviewStatus
        : 'unreviewed',
    coverageGap: false,
  };
};

export const isValidProvenanceEntry = (entry) => {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  if (!['client', 'server'].includes(entry.domain)) return false;
  if (typeof entry.locale !== 'string' || !entry.locale) return false;
  if (typeof entry.id !== 'string' || !entry.id) return false;
  if (!['reviewed', 'draft'].includes(entry.status)) return false;
  if (
    ![
      'human-review',
      'machine-draft',
      'upstream-project',
      'community',
    ].includes(entry.provenance)
  ) {
    return false;
  }
  if (!/^[a-f0-9]{64}$/i.test(entry.sourceHash || '')) return false;
  if (!/^[a-f0-9]{64}$/i.test(entry.targetHash || '')) return false;
  if (entry.status === 'reviewed') {
    if (typeof entry.reviewer !== 'string' || !entry.reviewer.trim())
      return false;
    if (
      typeof entry.reviewedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedAt)
    ) {
      return false;
    }
    const reviewedAt = new Date(`${entry.reviewedAt}T00:00:00.000Z`);
    if (
      !Number.isFinite(reviewedAt.getTime()) ||
      reviewedAt.toISOString().slice(0, 10) !== entry.reviewedAt
    ) {
      return false;
    }
  }
  if (
    entry.provenance === 'machine-draft' &&
    (entry.status !== 'draft' ||
      typeof entry.source !== 'string' ||
      !entry.source.trim())
  ) {
    return false;
  }
  if (
    entry.provenance === 'upstream-project' &&
    (typeof entry.source !== 'string' ||
      !entry.source.trim() ||
      typeof entry.license !== 'string' ||
      !entry.license.trim())
  ) {
    return false;
  }
  return true;
};

export const matchesProvenanceFingerprints = (entry, sourceHash, targetHash) =>
  isValidProvenanceEntry(entry) &&
  entry.sourceHash === sourceHash &&
  entry.targetHash === targetHash;

export const hasUnreviewedTranslations = (report) =>
  report.unreviewed > 0 || report.draft > 0;
