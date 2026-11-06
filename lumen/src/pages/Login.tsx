import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { signInWithPlex, useAuth, useMediaServerName } from '../auth';
import MediaServerLogin from '../components/MediaServerLogin';
import { Icon } from '../icons';

export default function Login() {
  const { refresh, settings, reloadSettings } = useAuth();
  const serverName = useMediaServerName();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [showLocal, setShowLocal] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr('');
    try {
      await fn();
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
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
        <p className="sub">Use your {serverName} or SeerrNG account.</p>
        {settings === undefined ? (
          <p role="status">Loading sign-in options…</p>
        ) : settings === null ? (
          <>
            <p className="login-err" role="alert">
              Couldn’t load sign-in options.
            </p>
            <button
              className="btn btn-tonal"
              onClick={() => void reloadSettings()}
            >
              Retry
            </button>
          </>
        ) : (
          <>
            {settings.mediaServerLogin !== false &&
              settings.mediaServerType !== 4 &&
              (serverName === 'Plex' ? (
                <button
                  className="btn btn-primary login-plex"
                  disabled={busy}
                  onClick={() => run(signInWithPlex)}
                >
                  Continue with Plex
                </button>
              ) : (
                <MediaServerLogin disabled={busy} onBusyChange={setBusy} />
              ))}
            {settings.localLogin !== false &&
              (showLocal ? (
                <form className="login-local" onSubmit={local}>
                  <label>
                    Email
                    <input
                      name="email"
                      type="email"
                      autoComplete="username"
                      required
                      disabled={busy}
                    />
                  </label>
                  <label>
                    Password
                    <input
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      disabled={busy}
                    />
                  </label>
                  <button className="btn btn-tonal" disabled={busy}>
                    Sign in
                  </button>
                </form>
              ) : (
                <button
                  className="btn btn-quiet btn-sm"
                  disabled={busy}
                  onClick={() => setShowLocal(true)}
                >
                  Use an email and password instead
                </button>
              ))}
            {settings.mediaServerLogin === false &&
              settings.localLogin === false && (
                <p role="status">
                  Sign-in is disabled. Contact your administrator.
                </p>
              )}
          </>
        )}
        {err && (
          <p className="login-err" role="alert">
            {err}
          </p>
        )}
      </div>
    </div>
  );
}
