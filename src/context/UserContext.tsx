import type { User } from '@app/hooks/useUser';
import { useUser } from '@app/hooks/useUser';
import { isAuthenticationError } from '@app/utils/auth';
import { buildLoginPath } from '@app/utils/loginReturn';
import { isPublicAuthPath } from '@app/utils/routeAccess';
import { useRouter } from 'next/dist/client/router';
import { useEffect, useRef } from 'react';

interface UserContextProps {
  initialUser?: User;
  children?: React.ReactNode;
}

/**
 * This UserContext serves the purpose of just preparing the useUser hooks
 * cache on server side render. It also will handle redirecting the user to
 * the login page if their session ever becomes invalid.
 */
export const UserContext = ({ initialUser, children }: UserContextProps) => {
  const { loading, error, revalidate } = useUser({
    initialData: initialUser,
  });
  const router = useRouter();
  const routing = useRef(false);
  const previousPathname = useRef(router.pathname);

  useEffect(() => {
    if (previousPathname.current === router.pathname) {
      return;
    }

    previousPathname.current = router.pathname;
    revalidate();
  }, [router.pathname, revalidate]);

  useEffect(() => {
    if (
      !isPublicAuthPath(router.pathname) &&
      !loading &&
      isAuthenticationError(error) &&
      !routing.current
    ) {
      routing.current = true;
      location.href = buildLoginPath(location.pathname, location.search);
    }
  }, [router, loading, error]);

  return <>{children}</>;
};
