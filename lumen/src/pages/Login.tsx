import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { signInWithPlex, useAuth } from '../auth';
import { Icon } from '../icons';

export default function Login() {
  const { refresh } = useAuth();
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
        <p className="sub">Use the same account you use for Plex.</p>
        <button
          className="btn btn-primary login-plex"
          disabled={busy}
          onClick={() => run(signInWithPlex)}
        >
          Continue with Plex
        </button>
        {showLocal ? (
          <form className="login-local" onSubmit={local}>
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <button className="btn btn-tonal" disabled={busy}>
              Sign in
            </button>
          </form>
        ) : (
          <button
            className="btn btn-quiet btn-sm"
            onClick={() => setShowLocal(true)}
          >
            Use an email and password instead
          </button>
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
