import { isAdministrator } from './auth';

export const canSearchIndexers = (permissions: unknown): boolean =>
  isAdministrator(permissions) ||
  (typeof permissions === 'number' &&
    Number.isSafeInteger(permissions) &&
    permissions >= 0 &&
    (BigInt(permissions) & 16n) !== 0n);
