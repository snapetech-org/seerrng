import { Permission } from '@server/lib/permissions';

type OidcProvisioningPolicy = {
  allowedEmailDomains?: unknown;
  groupClaim?: unknown;
  allowedGroups?: unknown;
  roleClaim?: unknown;
  roleMappings?: unknown;
};

const normalizeDomain = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;

  const domain = value.trim().toLowerCase().replace(/\.$/, '');
  if (
    !domain ||
    domain.length > 253 ||
    domain
      .split('.')
      .some(
        (label) =>
          label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
      )
  ) {
    return undefined;
  }

  return domain;
};

const claimStrings = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }
  return [];
};

/**
 * Optional admission allowlists apply only to first-time account creation.
 * Each configured list is a required gate; domains match exactly, and group
 * claims may be either a string or an array of strings.
 */
export const isOidcProvisioningAllowed = (
  provider: OidcProvisioningPolicy,
  email: string,
  claims: Record<string, unknown>
): boolean => {
  if (provider.allowedEmailDomains !== undefined) {
    if (
      !Array.isArray(provider.allowedEmailDomains) ||
      provider.allowedEmailDomains.length === 0
    ) {
      return false;
    }

    const emailDomain = normalizeDomain(
      email.slice(email.lastIndexOf('@') + 1)
    );
    const allowedDomains = provider.allowedEmailDomains.map(normalizeDomain);
    if (
      !emailDomain ||
      allowedDomains.some((domain) => domain === undefined) ||
      !allowedDomains.includes(emailDomain)
    ) {
      return false;
    }
  }

  if (provider.allowedGroups !== undefined) {
    if (
      !Array.isArray(provider.allowedGroups) ||
      provider.allowedGroups.length === 0 ||
      provider.allowedGroups.some(
        (group) => typeof group !== 'string' || group.trim() === ''
      )
    ) {
      return false;
    }

    const groupClaim =
      provider.groupClaim === undefined ? 'groups' : provider.groupClaim;
    if (typeof groupClaim !== 'string' || groupClaim.trim() === '') {
      return false;
    }

    const claimValues = claimStrings(claims[groupClaim.trim()]);
    if (
      !claimValues.some((group) =>
        (provider.allowedGroups as string[]).includes(group)
      )
    ) {
      return false;
    }
  }

  return true;
};

/**
 * Return undefined when role mapping is not configured. When configured,
 * unrecognized or malformed claims fall back to the normal user defaults.
 */
export const getOidcRolePermissions = (
  provider: OidcProvisioningPolicy,
  claims: Record<string, unknown>,
  defaultPermissions: number
): number | undefined => {
  if (provider.roleClaim === undefined && provider.roleMappings === undefined) {
    return undefined;
  }

  if (
    typeof provider.roleClaim !== 'string' ||
    provider.roleClaim.trim() === '' ||
    !Array.isArray(provider.roleMappings) ||
    provider.roleMappings.some(
      (mapping) =>
        !mapping ||
        typeof mapping !== 'object' ||
        typeof (mapping as { value?: unknown }).value !== 'string' ||
        (mapping as { value: string }).value.trim() === '' ||
        !['user', 'admin'].includes(
          (mapping as { role?: unknown }).role as string
        )
    )
  ) {
    return defaultPermissions;
  }

  const values = claimStrings(claims[provider.roleClaim.trim()]);
  const mappings = provider.roleMappings as {
    value: string;
    role: 'user' | 'admin';
  }[];

  if (
    mappings.some(
      (mapping) => mapping.role === 'admin' && values.includes(mapping.value)
    )
  ) {
    return Permission.ADMIN;
  }

  // A known user role and an unknown value both receive the normal SeerrNG
  // defaults. This prevents an unmapped provider value from granting access.
  return defaultPermissions;
};
