import {
  MAX_DISCOVER_COMPANIES,
  MAX_DISCOVER_COMPANY_DATA_LENGTH,
  MAX_DISCOVER_COMPANY_LOGO_PATH_LENGTH,
  MAX_DISCOVER_COMPANY_NAME_LENGTH,
  type DiscoverCompanyData,
} from '@server/constants/discover';

export type DiscoverCompanyKind = 'network' | 'studio';
type ParseResult = { value: string } | { error: string };

const labels: Record<
  DiscoverCompanyKind,
  { singular: string; plural: string }
> = {
  network: { singular: 'Network', plural: 'Networks' },
  studio: { singular: 'Studio', plural: 'Studios' },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const hasControlCharacter = (value: string): boolean =>
  Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return (
      codePoint !== undefined &&
      (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))
    );
  });

const isSafeLogoFilename = (value: string): boolean =>
  value !== '.' && value !== '..' && /^[A-Za-z0-9._-]+$/.test(value);

export const isSafeDiscoverCompanyLogoPath = (
  value: unknown,
  kind: DiscoverCompanyKind = 'network'
): value is string => {
  if (
    typeof value !== 'string' ||
    value.length < 2 ||
    value.length > MAX_DISCOVER_COMPANY_LOGO_PATH_LENGTH
  ) {
    return false;
  }

  const tmdbFilename =
    value.startsWith('/') && !value.startsWith('//') ? value.slice(1) : '';
  if (tmdbFilename && isSafeLogoFilename(tmdbFilename)) {
    return true;
  }

  const localLogoPrefix = '/images/company-logos/';
  return (
    kind === 'studio' &&
    value.startsWith(localLogoPrefix) &&
    isSafeLogoFilename(value.slice(localLogoPrefix.length))
  );
};

export const parseDiscoverCompanyList = (
  value: unknown,
  kind: DiscoverCompanyKind
): ParseResult => {
  const { singular, plural } = labels[kind];

  if (typeof value !== 'string') {
    return { error: `${plural} data must be a JSON array.` };
  }

  if (value.length > MAX_DISCOVER_COMPANY_DATA_LENGTH) {
    return {
      error: `${plural} data must be ${MAX_DISCOVER_COMPANY_DATA_LENGTH} characters or fewer.`,
    };
  }

  if (!value.trim()) {
    return { value: '' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { error: `${plural} data must be a valid JSON array.` };
  }

  if (!Array.isArray(parsed)) {
    return { error: `${plural} data must be a JSON array.` };
  }

  if (parsed.length > MAX_DISCOVER_COMPANIES) {
    return {
      error: `${plural} are limited to ${MAX_DISCOVER_COMPANIES} entries.`,
    };
  }

  const seenIds = new Set<number>();
  const companies: DiscoverCompanyData[] = [];

  for (const entry of parsed) {
    if (!isRecord(entry)) {
      return { error: `Each ${singular.toLowerCase()} must be an object.` };
    }

    const { id, logoPath, logoTone } = entry;
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';

    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) {
      return {
        error: `${singular} IDs must be positive safe integers.`,
      };
    }

    if (seenIds.has(id)) {
      return { error: `${singular} IDs must be unique.` };
    }

    if (
      !name ||
      name.length > MAX_DISCOVER_COMPANY_NAME_LENGTH ||
      hasControlCharacter(name)
    ) {
      return {
        error: `${singular} names must be 1 to ${MAX_DISCOVER_COMPANY_NAME_LENGTH} characters.`,
      };
    }

    if (!isSafeDiscoverCompanyLogoPath(logoPath, kind)) {
      return { error: `${singular} logo paths are invalid.` };
    }

    if (
      logoTone !== undefined &&
      logoTone !== 'color' &&
      logoTone !== 'white'
    ) {
      return { error: `${singular} logo tone is invalid.` };
    }

    seenIds.add(id);
    companies.push({
      id,
      name,
      logoPath,
      ...(logoTone === undefined ? {} : { logoTone }),
    });
  }

  return { value: JSON.stringify(companies) };
};

export const readDiscoverCompanyList = (
  value: string | null | undefined,
  defaults: readonly DiscoverCompanyData[],
  kind: DiscoverCompanyKind
): {
  companies: readonly DiscoverCompanyData[];
  usesDefaults: boolean;
  isMalformed: boolean;
} => {
  if (!value?.trim()) {
    return { companies: defaults, usesDefaults: true, isMalformed: false };
  }

  const parsed = parseDiscoverCompanyList(value, kind);
  if ('error' in parsed) {
    return { companies: defaults, usesDefaults: true, isMalformed: true };
  }

  return {
    companies: JSON.parse(parsed.value) as DiscoverCompanyData[],
    usesDefaults: false,
    isMalformed: false,
  };
};
