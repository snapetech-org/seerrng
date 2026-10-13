import defineMessages from '@app/utils/defineMessages';
import {
  readSessionStorageValue,
  removeSessionStorageValue,
  writeSessionStorageValue,
} from '@app/utils/localStorage';
import { parseOidcAuthorizationRedirect } from '@app/utils/oidcRedirect';
import { getSafeRedirect } from '@app/utils/urlValidationHelper';
import { ApiErrorCode } from '@server/constants/error';
import axios, { isAxiosError } from 'axios';
import type { IntlShape } from 'react-intl';

const messages = defineMessages('utils.oidc', {
  oidcLoginError: 'An error occurred while logging in with {provider}.',
  oidcProviderDiscoveryFailed:
    'Failed to connect to {provider}. Please try again later.',
  oidcAuthorizationFailed:
    'Authorization with {provider} failed. Please try again.',
  oidcMissingEmail:
    'Unable to create account. No email address was provided by {provider}.',
  oidcUnauthorized: 'You do not have permission to sign in with {provider}.',
  oidcAccountAlreadyLinked:
    'This {provider} account is already linked to another user.',
});

const OIDC_PROVIDER_KEY = 'oidc-provider';
const OIDC_REDIRECT_KEY = 'oidc-login-redirect';

export class OidcCallbackRequestState<T> {
  private pending = new Map<string, Promise<T>>();

  public run(key: string, operation: () => Promise<T>): Promise<T> {
    const pending = this.pending.get(key);
    if (pending) {
      return pending;
    }

    const promise = operation();
    this.pending.set(key, promise);
    const clear = () => {
      if (this.pending.get(key) === promise) {
        this.pending.delete(key);
      }
    };
    void promise.then(clear, clear);
    return promise;
  }
}

const oidcCallbackRequests = new OidcCallbackRequestState<
  { type: 'success' } | { type: 'error'; errorCode: string | undefined }
>();

export function getOidcErrorMessage(
  errorCode: string | undefined,
  providerName: string,
  intl: IntlShape
): string {
  const values = { provider: providerName };
  switch (errorCode) {
    case ApiErrorCode.OidcProviderDiscoveryFailed:
      return intl.formatMessage(messages.oidcProviderDiscoveryFailed, values);
    case ApiErrorCode.OidcAuthorizationFailed:
      return intl.formatMessage(messages.oidcAuthorizationFailed, values);
    case ApiErrorCode.OidcMissingEmail:
      return intl.formatMessage(messages.oidcMissingEmail, values);
    case ApiErrorCode.OidcAccountAlreadyLinked:
      return intl.formatMessage(messages.oidcAccountAlreadyLinked, values);
    case ApiErrorCode.Unauthorized:
      return intl.formatMessage(messages.oidcUnauthorized, values);
    default:
      return intl.formatMessage(messages.oidcLoginError, values);
  }
}

/**
 * Initiates the OIDC login flow by fetching the authorization URL from the
 * server and redirecting the browser to the OIDC provider. Stores the provider
 * slug and validated return path in sessionStorage so the callback page can
 * identify the provider and resume the original destination.
 */
export async function initiateOidcLogin(
  providerSlug: string,
  returnUrl: string,
  redirectTo?: string
): Promise<void> {
  const res = await axios.get<{ redirectUrl: string }>(
    `/api/v1/auth/oidc/login/${encodeURIComponent(providerSlug)}`,
    { params: { returnUrl } }
  );
  const redirectUrl = parseOidcAuthorizationRedirect(res.data.redirectUrl);
  if (
    !writeSessionStorageValue(OIDC_PROVIDER_KEY, providerSlug) ||
    !writeSessionStorageValue(OIDC_REDIRECT_KEY, getSafeRedirect(redirectTo))
  ) {
    clearOidcLoginState();
    throw new Error('OIDC login requires browser session storage.');
  }
  window.location.href = redirectUrl;
}

/**
 * Returns the provider slug stored by initiateOidcLogin.
 */
export function getOidcProviderSlug(): string | null {
  return readSessionStorageValue(OIDC_PROVIDER_KEY) ?? null;
}

/** Returns the validated destination stored before the OIDC round-trip. */
export function getOidcLoginRedirect(): string {
  return getSafeRedirect(readSessionStorageValue(OIDC_REDIRECT_KEY));
}

/** Clears the temporary state stored by initiateOidcLogin. */
export function clearOidcLoginState(): void {
  removeSessionStorageValue(OIDC_PROVIDER_KEY);
  removeSessionStorageValue(OIDC_REDIRECT_KEY);
}

/**
 * Processes the OIDC authorization code callback by posting the current URL
 * (which contains the code and any state params) to the server.
 */
export async function processOidcCallback(
  providerSlug: string
): Promise<
  { type: 'success' } | { type: 'error'; errorCode: string | undefined }
> {
  const params = new URLSearchParams(window.location.search);
  const errorParam = params.get('error');
  if (errorParam != null) {
    return { type: 'error', errorCode: ApiErrorCode.OidcAuthorizationFailed };
  }

  const callbackUrl = window.location.href;
  return oidcCallbackRequests.run(
    `${providerSlug}\0${callbackUrl}`,
    async () => {
      try {
        await axios.post(
          `/api/v1/auth/oidc/callback/${encodeURIComponent(providerSlug)}`,
          { callbackUrl }
        );
        return { type: 'success' } as const;
      } catch (e) {
        return {
          type: 'error',
          errorCode: isAxiosError(e) ? e.response?.data?.error : undefined,
        } as const;
      }
    }
  );
}
