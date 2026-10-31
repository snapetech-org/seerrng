import ButtonWithLoader from '@app/components/Common/ButtonWithLoader';
import defineMessages from '@app/utils/defineMessages';
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
import versionedAsset from '@app/utils/versionedAsset';
import type { PublicOidcProvider } from '@server/lib/settings';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Login.OidcLoginButton', {
  setupGuide: 'Provider setup guide',
  setupGuideLabel:
    '{provider} identity provider setup guide (opens in a new tab)',
});

const getQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const PROVIDER_BRANDS: Record<
  string,
  { icon: string; label?: string; setupUrl: string }
> = {
  google: {
    icon: 'google',
    setupUrl:
      'https://developers.google.com/identity/openid-connect/openid-connect',
  },
  'microsoft-entra': {
    icon: 'microsoft',
    setupUrl:
      'https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc',
  },
  okta: {
    icon: 'okta',
    setupUrl:
      'https://developer.okta.com/docs/guides/implement-grant-type/authcodepkce/main/',
  },
  auth0: {
    icon: 'auth0',
    setupUrl:
      'https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow',
  },
  keycloak: {
    icon: 'keycloak',
    setupUrl: 'https://www.keycloak.org/docs/latest/server_admin/',
  },
  authentik: {
    icon: 'authentik',
    setupUrl:
      'https://docs.goauthentik.io/add-secure-apps/providers/oauth2/create-oauth2-provider/',
  },
  zitadel: {
    icon: 'zitadel',
    setupUrl:
      'https://zitadel.com/docs/guides/integrate/login/oidc/oauth-recommended-flows',
  },
  'amazon-cognito': {
    icon: 'amazon-cognito',
    setupUrl:
      'https://docs.aws.amazon.com/cognito/latest/developerguide/federation-endpoints.html',
  },
  'apple-sign-in': {
    icon: 'apple',
    setupUrl:
      'https://developer.apple.com/documentation/signinwithapple/configuring-your-environment-for-sign-in-with-apple',
  },
  gitlab: {
    icon: 'gitlab',
    setupUrl: 'https://docs.gitlab.com/integration/openid_connect_provider/',
  },
  fusionauth: {
    label: 'FusionAuth',
    icon: 'fusionauth',
    setupUrl: 'https://fusionauth.io/docs/lifecycle/authenticate-users/oauth/',
  },
  onelogin: {
    label: 'OneLogin',
    icon: 'onelogin',
    setupUrl:
      'https://developers.onelogin.com/docs/openid-connect/connect-to-onelogin/',
  },
  pingone: {
    label: 'PingOne',
    icon: 'pingone',
    setupUrl:
      'https://docs.pingidentity.com/pingone/applications/p1_edit_application_oidc.html',
  },
  jumpcloud: {
    label: 'JumpCloud',
    icon: 'jumpcloud',
    setupUrl: 'https://jumpcloud.com/support/sso-with-oidc',
  },
};

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

  const providerSlug = provider.slug.trim().toLowerCase();
  const brand = Object.prototype.hasOwnProperty.call(
    PROVIDER_BRANDS,
    providerSlug
  )
    ? PROVIDER_BRANDS[providerSlug]
    : undefined;
  return (
    <div className="min-w-0 flex-grow">
      <ButtonWithLoader
        loading={loading}
        onClick={() => void redirectToLogin()}
        className="w-full min-w-0"
      >
        {provider.logo ? (
          // oxlint-disable-next-line nextjs/no-img-element
          <img
            src={provider.logo}
            alt=""
            aria-hidden="true"
            className="me-2 max-h-5 w-5"
          />
        ) : brand ? (
          <svg aria-hidden="true" className="me-2 h-5 w-5" viewBox="0 0 24 24">
            <use
              href={`${versionedAsset('/images/oidc-provider-icons.svg')}#oidc-${brand.icon}`}
            />
          </svg>
        ) : (
          // oxlint-disable-next-line nextjs/no-img-element
          <img
            src={versionedAsset('/images/openid.svg')}
            alt=""
            aria-hidden="true"
            className="me-2 max-h-5 w-5"
          />
        )}
        <span className="min-w-0 truncate">{provider.name}</span>
      </ButtonWithLoader>
      <a
        className="mt-1 block text-center text-xs text-gray-400 underline underline-offset-2"
        aria-label={intl.formatMessage(messages.setupGuideLabel, {
          provider: brand?.label ?? provider.name,
        })}
        href={
          brand?.setupUrl ?? 'https://openid.net/developers/how-connect-works/'
        }
        target="_blank"
        rel="noopener noreferrer"
      >
        {intl.formatMessage(messages.setupGuide)}{' '}
        <span aria-hidden="true">↗</span>
      </a>
    </div>
  );
}
