import { isAuthenticationError } from '@app/utils/auth';
import { buildLoginPath } from '@app/utils/loginReturn';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import type { Permission, PermissionCheckOptions } from './useUser';
import { useUser } from './useUser';

const useRouteGuard = (
  permission: Permission | Permission[],
  options?: PermissionCheckOptions
): void => {
  const router = useRouter();
  const { user, error, hasPermission } = useUser();

  useEffect(() => {
    if (!user && isAuthenticationError(error)) {
      router.replace(buildLoginPath(router.asPath));
    } else if (user && !hasPermission(permission, options)) {
      router.push('/');
    }
  }, [user, error, permission, router, hasPermission, options]);
};

export default useRouteGuard;
