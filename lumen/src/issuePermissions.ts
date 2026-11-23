import { isAdministrator } from './auth';

function has(permissions: unknown, mask: bigint) {
  return (
    isAdministrator(permissions) ||
    (typeof permissions === 'number' &&
      Number.isSafeInteger(permissions) &&
      permissions >= 0 &&
      (BigInt(permissions) & mask) !== 0n)
  );
}

export const canReadIssues = (permissions: unknown) =>
  has(permissions, 7340032n);
export const canManageIssues = (permissions: unknown) =>
  has(permissions, 1048576n);
export const canViewIssueReporter = (permissions: unknown) =>
  has(permissions, 3145728n);
export const canCreateIssues = (permissions: unknown) =>
  has(permissions, 5242880n);
