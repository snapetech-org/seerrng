import type {
  ChaptarrEditionCard,
  ReadarrBookLookupResult,
} from '@server/api/servarr/readarr';

/** Samples are public HTTPS media; never interpret executable or credential URLs. */
export const normalizeSampleUrl = (value: unknown): string | undefined => {
  if (
    typeof value !== 'string' ||
    value.length > 2048 ||
    /[\\\x00-\x20]/.test(value)
  )
    return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
};

export type BookFormat = 'ebook' | 'audiobook';

/** A materially different edition or performance, in comparable terms. */
export interface EditionCard {
  /** Provider edition id used as the request's preferredEditionId. */
  id: string;
  /** Companion-local edition id, when the library already knows it. */
  localEditionId?: number;
  /** False when the catalog lacks the provider identity needed for a request. */
  requestable?: boolean;
  title: string;
  format: BookFormat;
  language?: string;
  narrators: string[];
  production: 'solo' | 'full-cast' | 'unknown';
  abridged: 'abridged' | 'unabridged' | 'unknown';
  durationSeconds?: number;
  publisher?: string;
  releaseDate?: string;
  imageUrl?: string;
  /** Optional preview explicitly supplied by the catalog. */
  sampleUrl?: string;
  editionLabel?: string;
  /** The edition the library currently tracks. */
  selected: boolean;
  /** A file for this exact edition exists. */
  owned: boolean;
  /** Fields the catalog did not provide, so the UI says "unknown". */
  unknownFields: string[];
}

export interface EditionComparison {
  format: BookFormat;
  editions: EditionCard[];
  /** True when the companion can track a second performance next to the first. */
  supportsAlongside: boolean;
  source: 'library' | 'lookup' | 'none';
}

const FULL_CAST = /full[-\s]?cast|dramati[sz]ed|multi[-\s]?cast|ensemble/i;
const ABRIDGED = /\babridged\b/i;
const UNABRIDGED = /\bunabridged\b/i;

export const classifyProduction = (
  narrators: string[],
  ...hints: (string | undefined)[]
): EditionCard['production'] => {
  if (hints.some((hint) => hint && FULL_CAST.test(hint))) return 'full-cast';
  if (narrators.length === 1) return 'solo';
  if (narrators.length >= 6) return 'full-cast';
  return 'unknown';
};

export const classifyAbridgement = (
  ...hints: (string | undefined)[]
): EditionCard['abridged'] => {
  const text = hints.filter(Boolean).join(' ');
  if (UNABRIDGED.test(text)) return 'unabridged';
  if (ABRIDGED.test(text)) return 'abridged';
  return 'unknown';
};

const unknownFieldsFor = (card: Omit<EditionCard, 'unknownFields'>) => {
  const unknown: string[] = [];
  if (card.format === 'audiobook') {
    if (!card.narrators.length) unknown.push('narrators');
    if (card.production === 'unknown') unknown.push('production');
    if (card.abridged === 'unknown') unknown.push('abridged');
    if (!card.durationSeconds) unknown.push('duration');
  }
  if (!card.language) unknown.push('language');
  if (!card.releaseDate) unknown.push('releaseDate');
  return unknown;
};

const withUnknown = (
  card: Omit<EditionCard, 'unknownFields'>
): EditionCard => ({
  ...card,
  unknownFields: unknownFieldsFor(card),
});

export const cardFromCatalog = (
  edition: ChaptarrEditionCard,
  format: BookFormat
): EditionCard =>
  withUnknown({
    id: edition.foreignEditionId ?? String(edition.editionId),
    localEditionId: edition.editionId,
    requestable: Boolean(edition.foreignEditionId?.trim()),
    title: edition.title,
    format,
    language: edition.language,
    narrators: edition.narrators ?? [],
    production: edition.production ?? 'unknown',
    abridged: edition.abridged ?? 'unknown',
    durationSeconds: edition.durationSeconds,
    publisher: edition.publisher,
    releaseDate: edition.releaseDate,
    imageUrl: edition.imageUrl,
    sampleUrl: normalizeSampleUrl(edition.sampleUrl),
    editionLabel: edition.editionLabel?.trim().slice(0, 160) || undefined,
    selected: edition.monitored,
    owned: edition.owned,
  });

export type LookupEdition = NonNullable<
  ReadarrBookLookupResult['editions']
>[number] &
  Partial<{
    title: string;
    language: string;
    narrators: string[];
    narratorNames: string[];
    durationSeconds: number;
    publisher: string;
    releaseDate: string;
    sampleUrl: string;
    previewUrl: string;
    subtitle: string;
    disambiguation: string;
    editionInfo: string;
    format: string;
    isEbook: boolean;
    images: { url?: string; remoteUrl?: string }[];
  }>;

export const cardFromLookup = (
  edition: LookupEdition,
  format: BookFormat
): EditionCard => {
  const narrators = edition.narratorNames?.length
    ? edition.narratorNames
    : (edition.narrators ?? []);
  const hints = [
    edition.title,
    edition.subtitle,
    edition.disambiguation,
    edition.editionInfo,
  ];
  return withUnknown({
    id: edition.foreignEditionId,
    title: edition.title ?? '',
    format,
    language: edition.language,
    narrators,
    production: classifyProduction(narrators, ...hints),
    abridged: classifyAbridgement(...hints),
    durationSeconds:
      edition.durationSeconds ??
      edition.audioSeconds ??
      edition.audiobookDuration,
    publisher: edition.publisher,
    releaseDate: edition.releaseDate,
    sampleUrl: normalizeSampleUrl(edition.sampleUrl ?? edition.previewUrl),
    editionLabel: edition.editionInfo?.trim().slice(0, 160) || undefined,
    imageUrl: edition.images?.[0]?.remoteUrl ?? edition.images?.[0]?.url,
    selected: edition.monitored === true,
    owned: false,
  });
};
