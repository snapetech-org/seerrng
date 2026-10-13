import {
  MAX_DISCOVER_NETWORK_DATA_LENGTH,
  MAX_DISCOVER_NETWORK_LOGO_PATH_LENGTH,
  MAX_DISCOVER_NETWORK_NAME_LENGTH,
  MAX_DISCOVER_NETWORKS,
  type DiscoverNetworkData,
} from '@server/constants/discover';

type ParseResult = { value: string } | { error: string };

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

export const isSafeDiscoverNetworkLogoPath = (
  value: unknown
): value is string => {
  if (
    typeof value !== 'string' ||
    value.length < 2 ||
    value.length > MAX_DISCOVER_NETWORK_LOGO_PATH_LENGTH ||
    !value.startsWith('/') ||
    value.startsWith('//')
  ) {
    return false;
  }

  const filename = value.slice(1);
  return (
    filename !== '.' && filename !== '..' && /^[A-Za-z0-9._-]+$/.test(filename)
  );
};

export const parseDiscoverNetworkList = (value: unknown): ParseResult => {
  if (typeof value !== 'string') {
    return { error: 'Networks data must be a JSON array.' };
  }

  if (value.length > MAX_DISCOVER_NETWORK_DATA_LENGTH) {
    return {
      error: `Networks data must be ${MAX_DISCOVER_NETWORK_DATA_LENGTH} characters or fewer.`,
    };
  }

  if (!value.trim()) {
    return { value: '' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { error: 'Networks data must be a valid JSON array.' };
  }

  if (!Array.isArray(parsed)) {
    return { error: 'Networks data must be a JSON array.' };
  }

  if (parsed.length > MAX_DISCOVER_NETWORKS) {
    return {
      error: `Networks are limited to ${MAX_DISCOVER_NETWORKS} entries.`,
    };
  }

  const seenIds = new Set<number>();
  const networks: DiscoverNetworkData[] = [];

  for (const entry of parsed) {
    if (!isRecord(entry)) {
      return { error: 'Each network must be an object.' };
    }

    const { id, logoPath, logoTone } = entry;
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';

    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) {
      return { error: 'Network IDs must be positive safe integers.' };
    }

    if (seenIds.has(id)) {
      return { error: 'Network IDs must be unique.' };
    }

    if (
      !name ||
      name.length > MAX_DISCOVER_NETWORK_NAME_LENGTH ||
      hasControlCharacter(name)
    ) {
      return {
        error: `Network names must be 1 to ${MAX_DISCOVER_NETWORK_NAME_LENGTH} characters.`,
      };
    }

    if (!isSafeDiscoverNetworkLogoPath(logoPath)) {
      return { error: 'Network logo paths are invalid.' };
    }

    if (
      logoTone !== undefined &&
      logoTone !== 'color' &&
      logoTone !== 'white'
    ) {
      return { error: 'Network logo tone is invalid.' };
    }

    seenIds.add(id);
    networks.push({
      id,
      name,
      logoPath,
      ...(logoTone === undefined ? {} : { logoTone }),
    });
  }

  return { value: JSON.stringify(networks) };
};

export const readDiscoverNetworkList = (
  value: string | null | undefined,
  defaults: readonly DiscoverNetworkData[]
): {
  networks: readonly DiscoverNetworkData[];
  usesDefaults: boolean;
  isMalformed: boolean;
} => {
  if (!value?.trim()) {
    return { networks: defaults, usesDefaults: true, isMalformed: false };
  }

  const parsed = parseDiscoverNetworkList(value);
  if ('error' in parsed) {
    return { networks: defaults, usesDefaults: true, isMalformed: true };
  }

  return {
    networks: JSON.parse(parsed.value) as DiscoverNetworkData[],
    usesDefaults: false,
    isMalformed: false,
  };
};
