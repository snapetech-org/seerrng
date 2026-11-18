import { useRef, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api';
import { forget } from '../apiCache';
import { isAdministrator, signInWithPlex, useAuth } from '../auth';
import Shell from '../components/Shell';
import { ExtraHeader, ServiceNote } from '../components/extra';
import { friendlyError } from '../errors';
import { useApi, type PublicSettings } from '../hooks';
import AdminMediaLibraries from './AdminMediaLibraries';
import Login from './Login';

export default function Setup() {
  const { user, refresh } = useAuth();
  const settings = useApi<PublicSettings>('/settings/public');
  const [provider, setProvider] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);

  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (failure) {
      setError(friendlyError(failure, 'Setup could not continue.'));
    } finally {
      setBusy(false);
      pending.current = false;
    }
  }

  function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    void run(async () => {
      await api('/auth/jellyfin', {
        method: 'POST',
        body: JSON.stringify({
          username: fields.get('username'),
          password: fields.get('password'),
          email: fields.get('email'),
          hostname: fields.get('hostname'),
          port: Number(fields.get('port')),
          useSsl: fields.has('useSsl'),
          urlBase: fields.get('urlBase'),
          serverType: provider,
        }),
      });
      await refresh();
      settings.reload();
    });
  }

  async function finish() {
    const endpoint = settings.data?.mediaServerType === 1 ? 'plex' : 'jellyfin';
    const connection = await api<{ libraries: { enabled: boolean }[] }>(
      `/settings/${endpoint}`
    );
    if (!connection.libraries?.some((library) => library.enabled)) {
      throw new Error(
        'Enable at least one media library before finishing setup.'
      );
    }
    const result = await api<{ initialized: boolean }>('/settings/initialize', {
      method: 'POST',
    });
    if (!result.initialized)
      throw new Error('The server did not confirm setup completion.');
    forget('/settings/public');
    window.location.replace(import.meta.env.BASE_URL);
  }

  if (settings.data?.initialized === true) return <Navigate to="/" replace />;
  if (!settings.data || user === undefined) {
    return (
      <div className="login">
        <div className="login-card">
          <ServiceNote
            error={settings.error}
            what="setup settings"
            retry={settings.reload}
          />
          {!settings.error && <div className="boot" aria-busy="true" />}
        </div>
      </div>
    );
  }

  if (user) {
    if (!isAdministrator(user.permissions)) {
      return (
        <p className="note" role="alert">
          An administrator must finish setup.
        </p>
      );
    }
    return (
      <Shell>
        <ExtraHeader title="Finish Setup" />
        <AdminMediaLibraries />
        <ServiceNote error={error || null} what="setup" />
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void run(finish)}
        >
          Finish Setup
        </button>
      </Shell>
    );
  }

  if (settings.data.mediaServerType && settings.data.mediaServerType < 4)
    return <Login />;

  return (
    <div className="login">
      <div className="login-card">
        <h1>Set Up SeerrNG</h1>
        {error && (
          <p className="login-err" role="alert">
            {error}
          </p>
        )}
        <label className="sel">
          Media server
          <select
            value={provider}
            disabled={busy}
            onChange={(event) => setProvider(Number(event.target.value))}
          >
            <option value={1}>Plex</option>
            <option value={2}>Jellyfin</option>
            <option value={3}>Emby</option>
          </select>
        </label>
        {provider === 1 ? (
          <button
            className="btn btn-primary login-primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await signInWithPlex();
                await refresh();
                settings.reload();
              })
            }
          >
            Sign in with Plex
          </button>
        ) : (
          <form className="login-local" key={provider} onSubmit={connect}>
            <label>
              Hostname
              <input name="hostname" required />
            </label>
            <label>
              Port
              <input
                name="port"
                type="number"
                min="1"
                max="65535"
                defaultValue="8096"
                required
              />
            </label>
            <label>
              URL base
              <input name="urlBase" />
            </label>
            <label>
              Use HTTPS
              <input name="useSsl" type="checkbox" />
            </label>
            <label>
              Username
              <input name="username" autoComplete="username" required />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
              />
            </label>
            <label>
              Email
              <input name="email" type="email" required />
            </label>
            <button className="btn btn-primary login-primary" disabled={busy}>
              Connect and Sign In
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
