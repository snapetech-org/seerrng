import { parseAdministratorLoginNetworks } from './adminLoginNetworks';

/** Trust identities, never a hop count: alternate direct paths must stay safe. */
export const getTrustedProxyNetworks = (
  configured = process.env.SEERR_TRUSTED_PROXIES ??
    process.env.CLOUDRON_PROXY_IP ??
    '127.0.0.1/8,::1/128'
): string[] => {
  const parsed = parseAdministratorLoginNetworks(configured);
  if ('error' in parsed || !parsed.value.entries.length) {
    throw new Error(
      'SEERR_TRUSTED_PROXIES must contain trusted proxy IP addresses or CIDRs.'
    );
  }
  if (parsed.value.entries.some((entry) => /\/0$/u.test(entry))) {
    throw new Error(
      'SEERR_TRUSTED_PROXIES must not trust the entire Internet.'
    );
  }
  return parsed.value.entries;
};
