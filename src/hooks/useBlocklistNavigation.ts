import { Permission, useUser } from '@app/hooks/useUser';
import {
  BLOCKLIST_NAVIGATION_COUNT_KEY,
  shouldShowBlocklistNavigation,
} from '@app/utils/blocklistNavigation';
import type { BlocklistCountResponse } from '@server/interfaces/api/blocklistInterfaces';
import { useRouter } from 'next/router';
import useSWR from 'swr';

const useBlocklistNavigation = (): boolean => {
  const { hasPermission } = useUser();
  const router = useRouter();
  const canViewBlocklist = hasPermission(
    [Permission.MANAGE_BLOCKLIST, Permission.VIEW_BLOCKLIST],
    { type: 'or' }
  );
  const { data, error } = useSWR<BlocklistCountResponse>(
    canViewBlocklist ? BLOCKLIST_NAVIGATION_COUNT_KEY : null,
    {
      refreshInterval: 60_000,
      revalidateOnFocus: true,
    }
  );

  return (
    canViewBlocklist &&
    shouldShowBlocklistNavigation({
      count: data?.count,
      hasError: Boolean(error),
      isBlocklistRoute:
        router.pathname === '/blocklist' ||
        router.pathname.startsWith('/blocklist/'),
    })
  );
};

export default useBlocklistNavigation;
