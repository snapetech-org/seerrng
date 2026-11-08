import { getSettings } from '@server/lib/settings';

// Normalize the names and ISO aliases used by Open Library and book companions.
const groups = [
  ['eng', 'en', 'English'],
  ['spa', 'es', 'Spanish'],
  ['fre', 'fra', 'fr', 'French'],
  ['ger', 'deu', 'de', 'German'],
  ['ita', 'it', 'Italian'],
  ['por', 'pt', 'Portuguese'],
  ['dut', 'nld', 'nl', 'Dutch'],
  ['rus', 'ru', 'Russian'],
  ['chi', 'zho', 'zh', 'Chinese'],
  ['jpn', 'ja', 'Japanese'],
  ['kor', 'ko', 'Korean'],
  ['ara', 'ar', 'Arabic'],
  ['hin', 'hi', 'Hindi'],
  ['pol', 'pl', 'Polish'],
  ['swe', 'sv', 'Swedish'],
  ['nor', 'no', 'Norwegian'],
  ['dan', 'da', 'Danish'],
  ['fin', 'fi', 'Finnish'],
  ['gre', 'ell', 'el', 'Greek'],
  ['heb', 'he', 'Hebrew'],
  ['tur', 'tr', 'Turkish'],
  ['cze', 'ces', 'cs', 'Czech'],
  ['hun', 'hu', 'Hungarian'],
  ['rum', 'ron', 'ro', 'Romanian'],
  ['ukr', 'uk', 'Ukrainian'],
];
const aliases = new Map(
  groups.flatMap(([canonical, ...values]) =>
    [canonical, ...values].map(
      (value) => [value.toLowerCase(), canonical] as const
    )
  )
);
export const normalizeBookLanguage = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || value.length > 128) return undefined;
  const raw = value
    .trim()
    .toLowerCase()
    .replace(/^\/?languages\//, '');
  const alias = aliases.get(raw);
  if (alias) return alias;
  if (!/^[a-z]{3}$/.test(raw)) return undefined;
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(raw) !== raw
      ? raw
      : undefined;
  } catch {
    return undefined;
  }
};
export const parseAllowedBookLanguages = (
  value: unknown
): string[] | undefined => {
  if (!Array.isArray(value) || value.length > 50) return undefined;
  const normalized = value.map(normalizeBookLanguage);
  if (normalized.some((value) => !value)) return undefined;
  return [...new Set(normalized as string[])];
};
export const allowedBookLanguages = (): string[] =>
  getSettings().metadataSettings.allowedBookLanguages ?? [];
export const bookLanguageAllowed = (
  languages: unknown,
  allowed = allowedBookLanguages()
): boolean =>
  !allowed.length ||
  (Array.isArray(languages) &&
    languages.some((language) => {
      const normalized = normalizeBookLanguage(language);
      return !!normalized && allowed.includes(normalized);
    }));
export const bookLanguageQuery = (): string | undefined => {
  const allowed = allowedBookLanguages();
  return allowed.length
    ? `(${allowed.map((code) => `language:${code}`).join(' OR ')})`
    : undefined;
};
