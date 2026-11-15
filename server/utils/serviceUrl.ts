export const trimTrailingSlashes = (value: string): string => {
  let end = value.length;

  while (end > 0 && value[end - 1] === '/') {
    end -= 1;
  }

  return end === value.length ? value : value.slice(0, end);
};

export const trimSurroundingSlashes = (value: string): string => {
  let start = 0;
  let end = value.length;

  while (start < end && value[start] === '/') {
    start += 1;
  }
  while (end > start && value[end - 1] === '/') {
    end -= 1;
  }

  return start === 0 && end === value.length ? value : value.slice(start, end);
};

export const normalizeUrlBase = (value?: string): string => {
  if (!value) {
    return '';
  }

  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.startsWith('//') ||
    /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ||
    /[\r\n?#]/.test(trimmed)
  ) {
    return '';
  }

  const prefixed = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return trimTrailingSlashes(prefixed);
};

export const normalizeServiceHostname = (value?: string): string => {
  const trimmed = value?.trim() ?? '';

  if (
    !trimmed ||
    trimmed.startsWith('//') ||
    /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ||
    /[\s/@?#\\]/.test(trimmed)
  ) {
    return '';
  }

  try {
    const parsed = new URL(`http://${trimmed}`);
    return parsed.hostname &&
      parsed.pathname === '/' &&
      !parsed.username &&
      !parsed.password
      ? trimmed
      : '';
  } catch {
    return '';
  }
};

/** BookOrbit accepts a pasted service address as well as separate fields. */
export const parseBookOrbitServerAddress = (value: string) => {
  const address = value.trim();
  if (!address || /[\s@?#\\]/.test(address)) return undefined;
  const hasScheme = /^https?:\/\//i.test(address);
  if (!hasScheme && address.includes('://')) return undefined;
  const hostAndPath = hasScheme
    ? address.slice(address.indexOf('//') + 2)
    : address;
  const authority = hostAndPath.split('/')[0];
  if (!authority) return undefined;

  try {
    const url = new URL(hasScheme ? address : `http://${address}`);
    if (url.username || url.password || !url.hostname) return undefined;
    const ssl = url.protocol === 'https:';
    return {
      hostname: url.hostname,
      ...(hasScheme ? { useSsl: ssl } : {}),
      ...(hasScheme || /:\d+$/.test(authority)
        ? { port: Number(url.port || (ssl ? 443 : 80)) }
        : {}),
      ...(hostAndPath.includes('/')
        ? { baseUrl: trimTrailingSlashes(url.pathname) }
        : {}),
    };
  } catch {
    return undefined;
  }
};

export const buildServiceUrl = ({
  useSsl,
  hostname,
  port,
  urlBase,
  path = '',
}: {
  useSsl?: boolean;
  hostname?: string;
  port?: number;
  urlBase?: string;
  path?: string;
}): string =>
  `${useSsl ? 'https' : 'http'}://${normalizeServiceHostname(hostname)}:${
    port ?? ''
  }${normalizeUrlBase(urlBase)}${path}`;
