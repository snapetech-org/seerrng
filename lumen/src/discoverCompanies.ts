import type { DiscoverCompanyData } from './discoverNetworks';

export type DiscoverCompanyKind = 'network' | 'studio';

const MAX_COMPANIES = 50;
const MAX_NAME_LENGTH = 100;
const MAX_LOGO_PATH_LENGTH = 200;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const hasControlCharacter = (value: string) =>
  Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return (
      codePoint !== undefined &&
      (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))
    );
  });

const isSafeFilename = (value: string) =>
  value !== '.' && value !== '..' && /^[A-Za-z0-9._-]+$/.test(value);

const isSafeLogoPath = (
  value: unknown,
  kind: DiscoverCompanyKind
): value is string => {
  if (
    typeof value !== 'string' ||
    value.length < 2 ||
    value.length > MAX_LOGO_PATH_LENGTH
  ) {
    return false;
  }

  const tmdbFilename =
    value.startsWith('/') && !value.startsWith('//') ? value.slice(1) : '';
  if (tmdbFilename && isSafeFilename(tmdbFilename)) return true;

  const localLogoPrefix = '/images/company-logos/';
  return (
    kind === 'studio' &&
    value.startsWith(localLogoPrefix) &&
    isSafeFilename(value.slice(localLogoPrefix.length))
  );
};

export const parseDiscoverCompanyList = (
  value: unknown,
  kind: DiscoverCompanyKind
): DiscoverCompanyData[] | undefined => {
  if (typeof value !== 'string') return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return;
  }
  if (!Array.isArray(parsed) || parsed.length > MAX_COMPANIES) return;

  const seenIds = new Set<number>();
  const companies: DiscoverCompanyData[] = [];
  for (const entry of parsed) {
    if (!isRecord(entry)) return;
    const { id, logoPath, logoTone } = entry;
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    if (
      typeof id !== 'number' ||
      !Number.isSafeInteger(id) ||
      id < 1 ||
      seenIds.has(id) ||
      !name ||
      name.length > MAX_NAME_LENGTH ||
      hasControlCharacter(name) ||
      !isSafeLogoPath(logoPath, kind) ||
      (logoTone !== undefined && logoTone !== 'color' && logoTone !== 'white')
    ) {
      return;
    }

    seenIds.add(id);
    companies.push({
      id,
      name,
      logoPath,
      ...(logoTone === undefined
        ? {}
        : { logoTone: logoTone as 'color' | 'white' }),
    });
  }
  return companies;
};

export const readDiscoverCompanyList = (
  value: string | null | undefined,
  defaults: readonly DiscoverCompanyData[],
  kind: DiscoverCompanyKind
): { companies: readonly DiscoverCompanyData[]; isMalformed: boolean } => {
  if (!value?.trim()) return { companies: defaults, isMalformed: false };

  const companies = parseDiscoverCompanyList(value, kind);
  return companies
    ? { companies, isMalformed: false }
    : { companies: defaults, isMalformed: true };
};
