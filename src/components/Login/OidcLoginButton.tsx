import ButtonWithLoader from '@app/components/Common/ButtonWithLoader';
import { buildLoginPath, getSafeReturnPath } from '@app/utils/loginReturn';
import {
  clearOidcReturnState,
  getOidcErrorMessage,
  getOidcProviderSlug,
  getOidcReturnPath,
  initiateOidcLogin,
  processOidcCallback,
} from '@app/utils/oidc';
import { hasOidcCallbackParameters } from '@app/utils/oidcQuery';
import type { PublicOidcProvider } from '@server/lib/settings';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

const getQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

type OidcLoginButtonProps = {
  provider: PublicOidcProvider;
  onError?: (message: string) => void;
};

export default function OidcLoginButton({
  provider,
  onError,
}: OidcLoginButtonProps) {
  const intl = useIntl();
  const router = useRouter();
  const { query } = router;

  const [loading, setLoading] = useState(false);
  const callbackProviderRef = useRef<string | null>(null);

  const redirectToLogin = useCallback(async () => {
    setLoading(true);
    try {
      await initiateOidcLogin(
        provider.slug,
        new URL(window.location.pathname, window.location.origin).toString(),
        getSafeReturnPath(
          `${getQueryValue(query.returnTo) ?? ''}${window.location.hash}`
        ) ?? undefined
      );
    } catch (e) {
      setLoading(false);
      const errorCode = (e as { response?: { data?: { error?: string } } })
        ?.response?.data?.error;
      onError?.(getOidcErrorMessage(errorCode, provider.name, intl));
    }
  }, [provider, intl, onError, query.returnTo]);

  useEffect(
    () => {
      if (!router.isReady) return;

      // OIDC provider has redirected back with an authorization code or error
      const isCallback = hasOidcCallbackParameters(query);
      const callbackProvider =
        callbackProviderRef.current ?? getOidcProviderSlug();

      if (isCallback && callbackProvider === provider.slug) {
        let active = true;
        callbackProviderRef.current = callbackProvider;
        const redirectTo = getOidcReturnPath();
        clearOidcReturnState();
        setLoading(true);

        void processOidcCallback(callbackProvider)
          .then(async (result) => {
            if (!active) {
              return;
            }
            callbackProviderRef.current = null;
            if (result.type === 'success') {
              await router.replace(redirectTo);
            } else {
              await router
                .replace(buildLoginPath(redirectTo))
                .catch(() => undefined);
              if (active) {
                setLoading(false);
                onError?.(
                  getOidcErrorMessage(result.errorCode, provider.name, intl)
                );
              }
            }
          })
          .catch(() => {
            if (active) {
              callbackProviderRef.current = null;
              setLoading(false);
              onError?.(getOidcErrorMessage(undefined, provider.name, intl));
            }
          });

        return () => {
          active = false;
        };
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router.isReady]
  );

  return (
    <ButtonWithLoader
      loading={loading}
      onClick={() => void redirectToLogin()}
      className="min-w-0 flex-grow"
    >
      {/* oxlint-disable-next-line nextjs/no-img-element */}
      <img
        src={provider.logo || '/images/openid.svg'}
        alt={provider.name}
        className="mr-2 max-h-5 w-5"
      />
      <span className="min-w-0 truncate">{provider.name}</span>
    </ButtonWithLoader>
  );
}
