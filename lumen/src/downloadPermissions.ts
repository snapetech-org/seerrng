import { isAdministrator } from './auth';

export const canManageDownloads = (permissions: unknown): boolean =>
  isAdministrator(permissions) ||
  (typeof permissions === 'number' &&
    Number.isSafeInteger(permissions) &&
    permissions >= 0 &&
    (BigInt(permissions) & 8796093022208n) !== 0n);
