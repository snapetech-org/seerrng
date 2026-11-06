import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../api';
import {
  finishQuickConnect,
  QuickConnectCancelled,
  signInWithJellyfin,
  signInWithPlex,
  startQuickConnect,
  useAuth,
} from '../auth';
import { Icon } from '../icons';
import { mediaServer } from '../mediaServer';

type Mode = 'start' | 'server' | 'local' | 'quick';

export default function Login() {
  const { refresh } = useAuth();
  const server = mediaServer();
  const plex = server.kind === 'plex';
  const passwordForm = !plex && !server.quickConnectOnly;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // nothing to choose between: open the only form straight away
  const [mode, setMode] = useState<Mode>(
    !server.serverLogin && server.localLogin ? 'local' : 'start'
  );
  const [code, setCode] = useState('');
  const quickRun = useRef(0);
  const quickAbort = useRef<AbortController | null>(null);
  const active = useRef(false);
  useEffect(
    () => () => {
      quickRun.current++; // leaving the page stops any Quick Connect polling
      quickAbort.current?.abort();
    },
    []
  );

  const run = async (fn: () => Promise<unknown>) => {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setErr('');
    try {
      await fn();
      await refresh();
    } catch (e) {
      if (!(e instanceof QuickConnectCancelled))
        setErr(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      active.current = false;
      setBusy(false);
    }
  };
  const local = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(() =>
      api('/auth/local', {
        method: 'POST',
        body: JSON.stringify({
          email: f.get('email'),
          password: f.get('password'),
        }),
      })
    );
  };
  const jellyfin = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(() =>
      signInWithJellyfin(
        String(f.get('username') || ''),
        String(f.get('password') || '')
      )
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
        if (runId === quickRun.current) setMode('start');
        throw e;
      }
    });
  };
  const cancelQuick = () => {
    quickRun.current++;
    quickAbort.current?.abort();
    setMode('start');
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
          <span className="mark">
            <Icon name="play" size="sm" />
          </span>
          SeerrNG
        </div>
        <h1>Sign in to request movies, series and books</h1>
        {server.serverLogin && (
          <p className="sub">Use the same account you use for {server.name}.</p>
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
              {server.name} username
              <input
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                disabled={busy}
                required
                autoFocus
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
              Sign in with {server.name}
            </button>
            <div className="login-links">
              {server.quickConnect && (
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  disabled={busy}
                  onClick={quick}
                >
                  Use Quick Connect instead
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
          (!server.serverLogin && !server.localLogin ? (
            <p className="sub" role="status">
              Sign-in is disabled. Contact your administrator.
            </p>
          ) : mode === 'local' ? (
            server.serverLogin && (
              <button
                className="btn btn-quiet btn-sm"
                disabled={busy}
                onClick={() => setMode('start')}
              >
                Use your {server.name} account instead
              </button>
            )
          ) : (
            server.localLogin && (
              <button
                className="btn btn-quiet btn-sm"
                disabled={busy}
                onClick={() => setMode('local')}
              >
                Use an email and password instead
              </button>
            )
          ))}
        {err && (
          <p className="login-err" role="alert">
            {err}
          </p>
        )}
      </div>
    </div>
  );
}
