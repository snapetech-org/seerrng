import { isAdministrator } from './auth';

export const canViewFollowing = (permissions: unknown): boolean =>
  isAdministrator(permissions) ||
  (typeof permissions === 'number' &&
    Number.isSafeInteger(permissions) &&
    permissions >= 0 &&
    (BigInt(permissions) & 32n) !== 0n);
