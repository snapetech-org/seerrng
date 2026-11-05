import net from 'node:net';

export const MAX_ADMIN_LOGIN_NETWORKS_LENGTH = 4096;
export const MAX_ADMIN_LOGIN_NETWORK_COUNT = 100;

type ParsedAdministratorNetworks = {
  blockList: net.BlockList;
  entries: string[];
};

type AdministratorNetworksResult =
  { value: ParsedAdministratorNetworks } | { error: string };

const parseAdministratorNetworks = (
  value: unknown
): AdministratorNetworksResult => {
  if (typeof value !== 'string') {
    return { error: 'Administrator networks must be a string.' };
  }
  if (value.length > MAX_ADMIN_LOGIN_NETWORKS_LENGTH) {
    return {
      error: `Administrator networks must be no more than ${MAX_ADMIN_LOGIN_NETWORKS_LENGTH} characters.`,
    };
  }

  const entries = value
    .split(/[\r\n,]/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length > MAX_ADMIN_LOGIN_NETWORK_COUNT) {
    return {
      error: `Administrator networks may contain at most ${MAX_ADMIN_LOGIN_NETWORK_COUNT} entries.`,
    };
  }

  const blockList = new net.BlockList();
  for (const entry of entries) {
    const separator = entry.indexOf('/');
    if (separator !== -1 && entry.indexOf('/', separator + 1) !== -1) {
      return {
        error: 'Enter each administrator network as an IP address or CIDR.',
      };
    }

    const address = separator === -1 ? entry : entry.slice(0, separator);
    const family = net.isIP(address);
    if (family === 0) {
      return {
        error: 'Enter each administrator network as an IP address or CIDR.',
      };
    }

    const prefixText =
      separator === -1 ? undefined : entry.slice(separator + 1);
    if (prefixText !== undefined && !/^\d+$/u.test(prefixText)) {
      return {
        error: 'Enter each administrator network as an IP address or CIDR.',
      };
    }

    const prefix =
      prefixText === undefined ? (family === 4 ? 32 : 128) : Number(prefixText);
    const maxPrefix = family === 4 ? 32 : 128;
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) {
      return {
        error: 'Enter each administrator network as an IP address or CIDR.',
      };
    }

    try {
      blockList.addSubnet(address, prefix, family === 4 ? 'ipv4' : 'ipv6');
      if (family === 4) {
        // Dual-stack Node listeners may report IPv4 peers as IPv4-mapped IPv6.
        // Mirror the IPv4 rule so the same configured CIDR works for either
        // representation of the client address.
        blockList.addSubnet(`::ffff:${address}`, 96 + prefix, 'ipv6');
      }
    } catch {
      return {
        error: 'Enter each administrator network as an IP address or CIDR.',
      };
    }
  }

  return { value: { blockList, entries } };
};

let cachedSource: string | undefined;
let cachedParsed: AdministratorNetworksResult | undefined;

export const parseAdministratorLoginNetworks = (
  value: unknown
): { value: { entries: string[] } } | { error: string } => {
  const parsed = parseAdministratorNetworks(value);
  return 'error' in parsed
    ? parsed
    : { value: { entries: parsed.value.entries } };
};

export const isClientIpAllowedForAdministratorLogin = (
  clientIp: string | undefined,
  allowedNetworks: string
): boolean => {
  const normalizedIp = clientIp?.trim();
  const family = normalizedIp ? net.isIP(normalizedIp) : 0;
  if (!normalizedIp || family === 0) {
    return false;
  }

  if (cachedSource !== allowedNetworks || !cachedParsed) {
    cachedSource = allowedNetworks;
    cachedParsed = parseAdministratorNetworks(allowedNetworks);
  }

  if ('error' in cachedParsed || cachedParsed.value.entries.length === 0) {
    return false;
  }

  try {
    return cachedParsed.value.blockList.check(
      normalizedIp,
      family === 4 ? 'ipv4' : 'ipv6'
    );
  } catch {
    return false;
  }
};
