import { api } from './api';
import { sessionGeneration } from './sessionState';

const STORAGE_KEY = 'lumen-oidc-link';
const STATE = /^[A-Za-z0-9_-]{16,256}$/;

interface Attempt {
  slug: string;
  userId: number;
  state: string;
}

export async function startOidcLink(slug: string, userId: number) {
  const generation = sessionGeneration();
  const path = window.location.pathname;
  const params = new URLSearchParams({ returnUrl: path, returnTo: path });
  const { redirectUrl } = await api<{ redirectUrl: string }>(
    `/auth/oidc/login/${encodeURIComponent(slug)}?${params}`,
    { cache: 'no-store' }
  );
  if (generation !== sessionGeneration())
    throw new Error('The signed-in account changed.');
  const provider = new URL(redirectUrl);
  if (
    !['https:', 'http:'].includes(provider.protocol) ||
    provider.username ||
    provider.password
  ) {
    throw new Error('Invalid authorization destination.');
  }
  const state = provider.searchParams.get('state');
  const callback = provider.searchParams.get('redirect_uri');
  const localCallback = new URL(path, window.location.origin).href;
  const formCallback = new URL(
    `/api/v1/auth/oidc/callback/${encodeURIComponent(slug)}`,
    window.location.origin
  ).href;
  if (
    !state ||
    !STATE.test(state) ||
    (callback !== localCallback && callback !== formCallback)
  ) {
    throw new Error('The SeerrNG application URL must match this site.');
  }
  sessionStorage.removeItem(STORAGE_KEY);
  if (callback === localCallback) {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ slug, userId, state } satisfies Attempt)
    );
  }
  window.location.assign(provider.href);
}

export function readOidcLinkCallback() {
  const url = new URL(window.location.href);
  return url.searchParams.has('code') || url.searchParams.has('error')
    ? url
    : null;
}

export async function completeOidcLink(url: URL, userId: number) {
  const saved = sessionStorage.getItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
  if (!saved || url.searchParams.has('error'))
    throw new Error('Provider authorization did not finish.');
  const attempt = JSON.parse(saved) as Attempt;
  const states = url.searchParams.getAll('state');
  const codes = url.searchParams.getAll('code');
  if (
    attempt.userId !== userId ||
    typeof attempt.slug !== 'string' ||
    states.length !== 1 ||
    states[0] !== attempt.state ||
    !STATE.test(states[0]) ||
    codes.length !== 1 ||
    !codes[0]
  ) {
    throw new Error('Authorization could not be matched to this account.');
  }
  await api<void>(`/auth/oidc/callback/${encodeURIComponent(attempt.slug)}`, {
    method: 'POST',
    body: JSON.stringify({ callbackUrl: url.href }),
  });
}
