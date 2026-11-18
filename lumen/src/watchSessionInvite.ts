const INVITE_TOKEN_KEY = 'seerrng.watch-session.invite-token';
const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const captureWatchSessionInviteTokenFromHash = ():
  string | undefined => {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get('token') ?? undefined;
  if (token && INVITE_TOKEN_PATTERN.test(token)) {
    try {
      window.sessionStorage.setItem(INVITE_TOKEN_KEY, token);
    } catch {
      // The caller can still use the in-memory token during an authenticated visit.
    }
  }
  if (params.has('token')) {
    params.delete('token');
    const remainingHash = params.toString();
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${window.location.search}${remainingHash ? `#${remainingHash}` : ''}`
    );
  }
  return token && INVITE_TOKEN_PATTERN.test(token) ? token : undefined;
};

export const readStoredWatchSessionInviteToken = (): string | undefined => {
  try {
    const token = window.sessionStorage.getItem(INVITE_TOKEN_KEY) ?? undefined;
    return token && INVITE_TOKEN_PATTERN.test(token) ? token : undefined;
  } catch {
    return undefined;
  }
};

export const clearStoredWatchSessionInviteToken = (): void => {
  try {
    window.sessionStorage.removeItem(INVITE_TOKEN_KEY);
  } catch {
    // Storage can be disabled; there is no retained token to clear in that case.
  }
};
