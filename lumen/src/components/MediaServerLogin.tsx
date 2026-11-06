import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../api';
import { useAuth, useMediaServerName } from '../auth';

export default function MediaServerLogin({
  disabled,
  onBusyChange,
}: {
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const { settings, refresh } = useAuth();
  const name = useMediaServerName();
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      pending.current?.abort();
    },
    []
  );

  const run = async (operation: (signal: AbortSignal) => Promise<void>) => {
    if (pending.current || disabled) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    onBusyChange(true);
    setError('');
    try {
      await operation(controller.signal);
      if (!controller.signal.aborted) await refresh();
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
        onBusyChange(false);
        setCode('');
      }
    }
  };
  const password = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    void run(async (signal) => {
      await api('/auth/jellyfin', {
        method: 'POST',
        signal,
        body: JSON.stringify({
          username: form.get('username'),
          password: form.get('password'),
          serverType: settings?.mediaServerType,
        }),
      });
    });
  };
  const quickConnect = () =>
    run(async (signal) => {
      const result = await api<{ code: string; secret: string }>(
        '/auth/jellyfin/quickconnect/initiate',
        { method: 'POST', signal }
      );
      if (signal.aborted) return;
      setCode(result.code);
      const deadline = Date.now() + 5 * 60_000;
      while (!signal.aborted && Date.now() < deadline) {
        await new Promise<void>((resolve) => {
          const finish = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', finish);
            resolve();
          };
          const timer = window.setTimeout(finish, 1500);
          signal.addEventListener('abort', finish, { once: true });
        });
        if (signal.aborted) return;
        const check = await api<{ authenticated: boolean }>(
          `/auth/jellyfin/quickconnect/check?${new URLSearchParams({ secret: result.secret })}`,
          { signal }
        );
        if (signal.aborted) return;
        if (check.authenticated) {
          await api('/auth/jellyfin/quickconnect/authenticate', {
            method: 'POST',
            signal,
            body: JSON.stringify({ secret: result.secret }),
          });
          return;
        }
      }
      if (!signal.aborted)
        throw new Error('Quick Connect timed out. Try again.');
    });

  return (
    <>
      {!settings?.jellyfinQuickConnectOnly || name !== 'Jellyfin' ? (
        <form className="login-local" onSubmit={password}>
          <label>
            Username
            <input
              name="username"
              autoComplete="username"
              required
              disabled={busy || disabled}
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              disabled={busy || disabled}
            />
          </label>
          <button className="btn btn-primary" disabled={busy || disabled}>
            Sign in with {name}
          </button>
        </form>
      ) : null}
      {name === 'Jellyfin' && (
        <button
          className="btn btn-tonal"
          disabled={busy || disabled}
          onClick={() => void quickConnect()}
        >
          Use Jellyfin Quick Connect
        </button>
      )}
      {code && (
        <p role="status">
          Enter <strong>{code}</strong> in Jellyfin’s Quick Connect settings.
        </p>
      )}
      {busy && (
        <button
          className="btn btn-quiet btn-sm"
          onClick={() => pending.current?.abort()}
        >
          Cancel sign-in
        </button>
      )}
      {error && (
        <p className="login-err" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
