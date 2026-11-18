import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import {
  finishQuickConnect,
  QuickConnectCancelled,
  signInWithJellyfin,
  signInWithPlex,
  startQuickConnect,
  useAuth,
} from '../auth';
import { BrandMark } from '../components/brand';
import { fullSeerrUrl } from '../components/Shell';
import { embedded } from '../deployment';
import { usePublicSettings } from '../hooks';
import { mediaServer, services, site } from '../mediaServer';
import { completeOidc, readOidcCallback, startOidcSignIn } from '../oidc';
import { usePrefs } from '../settings';
import { captureWatchSessionInviteTokenFromHash } from '../watchSessionInvite';

type Mode = 'start' | 'server' | 'local' | 'quick';
type Method = 'server' | 'local' | 'quick';

// The way this device last signed in successfully. The next sign-in opens straight to it,
// so a family member picks Jellyfin (or email) once and then just types their password.
const LAST_KEY = 'lumen-last-sign-in';
export function lastSignIn(): Method | null {
  try {
    const v = localStorage.getItem(LAST_KEY);
    return v === 'server' || v === 'local' || v === 'quick' ? v : null;
  } catch {
    return null;
  }
}
function rememberSignIn(m: Method) {
  try {
    localStorage.setItem(LAST_KEY, m);
  } catch {
    // private window or blocked storage: the choice just isn't remembered
  }
}

// SeerrNG answers sign-in failures with codes like INVALID_CREDENTIALS; say it in words
export function friendly(e: unknown, serverName: string): string {
  const msg = e instanceof Error ? e.message : '';
  if (e instanceof ApiError && e.status === 429)
    return 'Too many sign-in attempts. Wait a few minutes and try again.';
  switch (msg) {
    case 'INVALID_CREDENTIALS':
      return 'That username or password isn’t right.';
    case 'INVALID_EMAIL':
      return 'Enter a valid email address.';
    case 'CONNECTION_ERROR':
      return `Couldn’t reach ${serverName}. Try again in a moment.`;
    case 'UNAUTHORIZED':
    case 'Access denied.':
      return 'This account doesn’t have access yet. Ask whoever runs this server to add you.';
    case 'UNKNOWN':
    case '':
      return 'Something went wrong signing in. Try again.';
  }
  return msg;
}

export default function Login() {
  const { seerrPublicUrl } = usePrefs();
  const { refresh } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const publicSettings = usePublicSettings();
  const providers = publicSettings?.openIdProviders ?? [];
  const [callback] = useState(() =>
    location.pathname === '/login' ? readOidcCallback() : null
  );
  const [loginLinkToken, setLoginLinkToken] = useState(() => {
    const [token, duplicate] = new URLSearchParams(
      location.hash.slice(1)
    ).getAll('loginToken');
    return !duplicate && token && /^[A-Za-z0-9_-]{43}$/.test(token)
      ? token
      : null;
  });
  useEffect(() => {
    const { hash, pathname, search } = window.location;
    const params = new URLSearchParams(hash.slice(1));
    if (!params.has('loginToken')) return;
    params.delete('loginToken');
    const remaining = params.toString();
    window.history.replaceState(
      window.history.state,
      '',
      `${pathname}${search}${remaining ? `#${remaining}` : ''}`
    );
  }, []);
  const callbackWork = useRef<Promise<string> | undefined>(undefined);
  const callbackDelivered = useRef(false);
  const server = mediaServer();
  const plex = server.kind === 'plex';
  const passwordForm = !plex && !server.quickConnectOnly;
  // "loginStyle": "form": the username + password boxes are the sign-in page, with no
  // media server names, for families who don't know or care what Jellyfin is
  const family = site().loginForm && passwordForm && server.serverLogin;
  const [busy, setBusy] = useState(!!callback);
  const [err, setErr] = useState('');
  // nothing to choose between: open the only form straight away
  // The admin's form setting wins; otherwise open the way this device last signed in.
  // (Quick Connect only remembers the start page: a code shouldn't be asked for unprompted.)
  const last = lastSignIn();
  const [mode, setMode] = useState<Mode>(
    family
      ? 'server'
      : !server.serverLogin && server.localLogin
        ? 'local'
        : last === 'server' && passwordForm && server.serverLogin
          ? 'server'
          : last === 'local' && server.localLogin
            ? 'local'
            : 'start'
  );
  const home: Mode = family ? 'server' : 'start';
  const [code, setCode] = useState('');
  const quickRun = useRef(0);
  const quickAbort = useRef<AbortController | null>(null);
  const active = useRef(!!callback);
  useEffect(() => {
    if (!callback) return;
    let live = true;
    if (!callbackWork.current) {
      window.history.replaceState(window.history.state, '', callback.pathname);
      callbackWork.current = completeOidc(callback, null);
    }
    void callbackWork.current
      .then(async (destination) => {
        if (!live || callbackDelivered.current) return;
        callbackDelivered.current = true;
        navigate(destination, { replace: true });
        await refresh();
      })
      .catch(() => {
        if (live)
          setErr('OpenID Connect sign-in could not be completed. Start again.');
      })
      .finally(() => {
        if (live) {
          active.current = false;
          setBusy(false);
        }
      });
    return () => {
      live = false;
    };
  }, [callback, navigate, refresh]);

  async function oidc(slug: string) {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setErr('');
    try {
      if (location.pathname === '/watch-sessions/join')
        captureWatchSessionInviteTokenFromHash();
      await startOidcSignIn(
        slug,
        location.pathname + location.search + window.location.hash
      );
    } catch {
      setErr(
        'Could not start OpenID Connect sign-in. Check the provider configuration and SeerrNG application URL.'
      );
      active.current = false;
      setBusy(false);
    }
  }
  useEffect(
    () => () => {
      quickRun.current++; // leaving the page stops any Quick Connect polling
      quickAbort.current?.abort();
    },
    []
  );

  const run = async (fn: () => Promise<unknown>, method?: Method) => {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setErr('');
    try {
      await fn();
      if (method) rememberSignIn(method);
      await refresh();
    } catch (e) {
      if (!(e instanceof QuickConnectCancelled))
        setErr(friendly(e, server.name));
    } finally {
      active.current = false;
      setBusy(false);
    }
  };
  const useLoginLink = () => {
    if (!loginLinkToken || active.current) return;
    setLoginLinkToken(null);
    void run(() =>
      api('/auth/login-link', {
        method: 'POST',
        body: JSON.stringify({ token: loginLinkToken }),
      })
    );
  };
  const local = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(
      () =>
        api('/auth/local', {
          method: 'POST',
          body: JSON.stringify({
            email: f.get('email'),
            password: f.get('password'),
          }),
        }),
      'local'
    );
  };
  const jellyfin = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(
      () =>
        signInWithJellyfin(
          String(f.get('username') || ''),
          String(f.get('password') || '')
        ),
      'server'
    );
  };
  const quick = () => {
    if (active.current) return;
    const runId = ++quickRun.current;
    const controller = new AbortController();
    quickAbort.current = controller;
    setMode('quick');
    setCode('');
    void run(async () => {
      try {
        const { code: c, secret } = await startQuickConnect(controller.signal);
        if (runId !== quickRun.current) throw new QuickConnectCancelled();
        setCode(c);
        await finishQuickConnect(
          secret,
          () => runId !== quickRun.current,
          controller.signal
        );
      } catch (e) {
        if (runId !== quickRun.current) throw new QuickConnectCancelled();
        if (runId === quickRun.current) setMode(home);
        throw e;
      }
    }, 'quick');
  };
  const cancelQuick = () => {
    quickRun.current++;
    quickAbort.current?.abort();
    setMode(home);
    setCode('');
  };
  const primary = () => {
    if (plex) void run(signInWithPlex);
    else if (passwordForm) setMode('server');
    else quick();
  };

  return (
    <div className="login">
      <div className="login-card">
        <div className="brand">
          <BrandMark />
        </div>
        <h1>
          {services().books
            ? 'Sign in to request movies, series and books'
            : 'Sign in to request movies and series'}
        </h1>
        {server.serverLogin && (
          <p className="sub">
            {family
              ? 'Use the username and password you watch with.'
              : `Use the same account you use for ${server.name}.`}
          </p>
        )}

        {err && (
          <p className="login-err" role="alert">
            {err}
          </p>
        )}

        {loginLinkToken && (
          <button
            className="btn btn-primary login-primary"
            disabled={busy}
            onClick={useLoginLink}
          >
            Continue with sign-in link
          </button>
        )}

        {mode === 'quick' ? (
          <div className="login-quick" aria-live="polite">
            {code ? (
              <>
                <p className="sub">
                  Open {server.name} on a device where you're signed in, go to{' '}
                  <b>Settings → Quick Connect</b> and enter this code:
                </p>
                <output className="login-code">{code}</output>
                <p className="login-wait">Waiting for approval…</p>
              </>
            ) : (
              <p className="login-wait">Getting a code…</p>
            )}
            <button className="btn btn-quiet btn-sm" onClick={cancelQuick}>
              Cancel
            </button>
          </div>
        ) : mode === 'server' ? (
          <form className="login-local" onSubmit={jellyfin}>
            <label>
              {family ? 'Username' : `${server.name} username`}
              <input
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                disabled={busy}
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                disabled={busy}
              />
            </label>
            <button className="btn btn-primary login-primary" disabled={busy}>
              {family ? 'Sign in' : `Sign in with ${server.name}`}
            </button>
            <div className="login-links">
              {server.quickConnect && (
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  disabled={busy}
                  onClick={quick}
                >
                  {family ? 'Sign in with a code' : 'Use Quick Connect instead'}
                </button>
              )}
              {server.forgotPasswordUrl && (
                <a
                  className="btn btn-quiet btn-sm"
                  href={server.forgotPasswordUrl}
                  rel="noreferrer"
                >
                  Forgot password?
                </a>
              )}
            </div>
          </form>
        ) : mode === 'local' ? (
          <form className="login-local" onSubmit={local}>
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="username"
                disabled={busy}
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                disabled={busy}
                required
              />
            </label>
            <button className="btn btn-tonal" disabled={busy}>
              Sign in
            </button>
            {publicSettings?.emailEnabled && (
              <Link className="btn btn-quiet btn-sm" to="/resetpassword">
                Forgot password?
              </Link>
            )}
          </form>
        ) : (
          server.serverLogin && (
            <button
              className="btn btn-primary login-primary"
              disabled={busy}
              onClick={primary}
            >
              Continue with {server.name}
            </button>
          )
        )}

        {mode !== 'quick' &&
          (!server.serverLogin && !server.localLogin
            ? providers.length === 0 && (
                <p className="sub" role="status">
                  Sign-in is disabled. Contact your administrator.
                </p>
              )
            : mode === 'local'
              ? server.serverLogin && (
                  <button
                    className="btn btn-quiet btn-sm"
                    disabled={busy}
                    onClick={() => setMode(home)}
                  >
                    {family
                      ? 'Back'
                      : `Use your ${server.name} account instead`}
                  </button>
                )
              : server.localLogin && (
                  <button
                    className="btn btn-quiet btn-sm"
                    disabled={busy}
                    onClick={() => setMode('local')}
                  >
                    Use an email and password instead
                  </button>
                ))}
        {mode !== 'quick' &&
          providers.map(({ slug, name }) => (
            <button
              key={slug}
              className="btn btn-tonal btn-sm"
              disabled={busy}
              onClick={() => void oidc(slug)}
            >
              Sign in with {name}
            </button>
          ))}
        {embedded && (
          <a className="btn btn-quiet btn-sm" href="/login">
            More sign-in options
          </a>
        )}
        <a className="btn btn-tonal btn-sm" href={fullSeerrUrl(seerrPublicUrl)}>
          Open full SeerrNG
        </a>
        <p className="sub">
          {embedded ? 'Lumen included with SeerrNG' : 'Lumen companion'}
        </p>
      </div>
    </div>
  );
}
