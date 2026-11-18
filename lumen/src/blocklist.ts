import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { isAdministrator, useAuth } from './auth';
import { useApi } from './hooks';

const MANAGE = 268435456n;
const VIEW = 1073741824n;
const CHANGED = 'lumen:blocklist-changed';

function hasPermission(permissions: unknown, mask: bigint) {
  return (
    isAdministrator(permissions) ||
    (typeof permissions === 'number' &&
      Number.isSafeInteger(permissions) &&
      permissions >= 0 &&
      (BigInt(permissions) & mask) !== 0n)
  );
}

export const canManageBlocklist = (permissions: unknown) =>
  hasPermission(permissions, MANAGE);
export const canViewBlocklist = (permissions: unknown) =>
  hasPermission(permissions, MANAGE | VIEW);
export const notifyBlocklistChanged = () =>
  window.dispatchEvent(new Event(CHANGED));

export function useBlocklistNavigation() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const allowed = canViewBlocklist(user?.permissions);
  const { data, error, reload } = useApi<{ count: number }>(
    allowed ? '/blocklist/count' : null
  );
  useEffect(() => {
    if (!allowed) return;
    window.addEventListener('focus', reload);
    window.addEventListener(CHANGED, reload);
    const timer = window.setInterval(reload, 60_000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', reload);
      window.removeEventListener(CHANGED, reload);
    };
  }, [allowed, reload]);

  return (
    allowed && (pathname === '/blocklist' || (!error && (data?.count ?? 0) > 0))
  );
}
