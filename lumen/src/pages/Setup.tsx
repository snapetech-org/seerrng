import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { forget } from '../apiCache';
import { isAdministrator, signInWithPlex, useAuth } from '../auth';
import Shell from '../components/Shell';
import { Section } from '../components/cards';
import { ExtraHeader, ServiceNote } from '../components/extra';
import { friendlyError } from '../errors';
import { useApi, type PublicSettings } from '../hooks';
import { invalidatePublicSettings } from '../mediaServer';
import AdminCategories from './AdminCategories';
import AdminMediaLibraries from './AdminMediaLibraries';
import Login from './Login';

const AdminDownloadClients = lazy(() => import('./AdminDownloadClients'));
const AdminProwlarr = lazy(() => import('./AdminProwlarr'));
const AdminServarr = lazy(() => import('./AdminServarr'));
const setupSteps = [
  ['libraries', 'Media Server Libraries'],
  ['categories', 'Media Categories'],
  ['services', 'Request Services'],
  ['downloads', 'Download Clients'],
  ['indexer', 'Prowlarr'],
  ['review', 'Review'],
] as const;

type SetupConnection = {
  libraries?: { id: string; name: string; enabled: boolean }[];
};

function mediaServerSettings(type?: number) {
  return type === 1 ? '/settings/plex' : '/settings/jellyfin';
}

function SetupReview({ mediaServerType }: { mediaServerType?: number }) {
  const connection = useApi<SetupConnection>(
    mediaServerSettings(mediaServerType)
  );
  const enabled = connection.data?.libraries?.filter(
    (library) => library.enabled
  );
  const downloads = useApi<{ clients: { enabled: boolean }[] }>(
    '/settings/download-clients'
  );
  const prowlarr = useApi<{ hostname: string; apiKeyConfigured: boolean }>(
    '/settings/prowlarr'
  );
  const enabledClients = downloads.data?.clients.filter(
    (client) => client.enabled
  ).length;
  return (
    <Section title="Review Setup">
      <ServiceNote
        what="saved media libraries"
        error={connection.error}
        retry={connection.reload}
      />
      {enabled?.length ? (
        <>
          <p className="note">Enabled Media Libraries</p>
          <ul className="setlist">
            {enabled.map(({ id, name }) => (
              <li key={id} className="set">
                {name}
              </li>
            ))}
          </ul>
        </>
      ) : connection.data ? (
        <p className="note">
          Enable at least one media library before finishing setup.
        </p>
      ) : !connection.error ? (
        <p className="note" role="status">
          Checking saved media libraries…
        </p>
      ) : null}
      <dl className="setlist">
        <div className="set">
          <dt>Download Clients</dt>
          <dd>
            {enabledClients === undefined
              ? downloads.error
                ? 'Unavailable'
                : 'Checking…'
              : `${enabledClients} enabled`}
          </dd>
        </div>
        <div className="set">
          <dt>Prowlarr</dt>
          <dd>
            {prowlarr.data
              ? prowlarr.data.hostname && prowlarr.data.apiKeyConfigured
                ? 'Configured'
                : 'Not configured'
              : prowlarr.error
                ? 'Unavailable'
                : 'Checking…'}
          </dd>
        </div>
      </dl>
      <ServiceNote
        what="saved download clients"
        error={downloads.error}
        retry={downloads.reload}
      />
      <ServiceNote
        what="saved Prowlarr settings"
        error={prowlarr.error}
        retry={prowlarr.reload}
      />
      <p className="note">
        Request services, download clients, and Prowlarr are optional.
      </p>
    </Section>
  );
}
const requestServices = [
  ['radarr', 'Radarr'],
  ['sonarr', 'Sonarr'],
  ['readarr', 'Book and Audiobook Services'],
  ['lazylibrarian', 'LazyLibrarian'],
  ['lidarr', 'Lidarr'],
  ['mylar', 'Mylar'],
  ['kapowarr', 'Kapowarr'],
  ['backissue', 'BackIssue'],
  ['sportarr', 'Sportarr'],
  ['whisparr', 'Whisparr'],
] as const;

function SetupEditor({
  label,
  children,
  active = false,
  hidden = false,
}: {
  label: string;
  children: ReactNode;
  active?: boolean;
  hidden?: boolean;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <details
      className="adv"
      hidden={hidden}
      open={active || undefined}
      onToggle={(event) => {
        if (event.currentTarget.open) setOpened(true);
      }}
    >
      <summary>{label}</summary>
      {(active || opened) && (
        <Suspense
          fallback={
            <p className="note" role="status">
              Loading services…
            </p>
          }
        >
          {children}
        </Suspense>
      )}
    </details>
  );
}

export default function Setup() {
  const { user, refresh } = useAuth();
  const settings = useApi<PublicSettings>('/settings/public');
  const [query] = useSearchParams();
  const stepIndex = setupSteps.findIndex(([id]) => id === query.get('step'));
  const activeStep = setupSteps[stepIndex]?.[0];
  const reopening =
    settings.data?.initialized === true && query.get('guide') === '1';
  const [provider, setProvider] = useState(1);
  const [busy, setBusy] = useState(false);
  const [downloadDirty, setDownloadDirty] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);

  useEffect(() => {
    if (!downloadDirty) return;
    function confirmUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = true;
    }
    window.addEventListener('beforeunload', confirmUnload);
    return () => window.removeEventListener('beforeunload', confirmUnload);
  }, [downloadDirty]);

  const stepNavigation = {
    'aria-disabled': downloadDirty || undefined,
    onClick: (event: MouseEvent<HTMLAnchorElement>) => {
      if (downloadDirty) event.preventDefault();
    },
  };

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
      invalidatePublicSettings();
      settings.reload();
    });
  }

  function stepLink(step?: (typeof setupSteps)[number][0]) {
    const params = new URLSearchParams();
    if (reopening) params.set('guide', '1');
    if (step) params.set('step', step);
    return { pathname: '/setup', search: params.toString() };
  }

  async function finish() {
    const connection = await api<SetupConnection>(
      mediaServerSettings(settings.data?.mediaServerType),
      { cache: 'no-store' }
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

  if (settings.data?.initialized === true && !reopening)
    return <Navigate to="/" replace />;
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
          {reopening
            ? 'Only administrators can open the setup guide.'
            : 'An administrator must finish setup.'}
        </p>
      );
    }
    return (
      <Shell>
        <ExtraHeader title={reopening ? 'Setup Guide' : 'Finish Setup'} />
        <nav className="toolbar" aria-label="Setup steps">
          {activeStep ? (
            setupSteps.map(([id, label]) => (
              <Link
                key={id}
                className="btn btn-quiet btn-sm"
                to={stepLink(id)}
                aria-current={activeStep === id ? 'step' : undefined}
                {...stepNavigation}
              >
                {label}
              </Link>
            ))
          ) : (
            <Link
              className="btn btn-quiet btn-sm"
              to={stepLink(setupSteps[0][0])}
              {...stepNavigation}
            >
              Start Guided Setup
            </Link>
          )}
          {activeStep && (
            <Link
              className="btn btn-quiet btn-sm"
              to={stepLink()}
              {...stepNavigation}
            >
              Show All Setup Options
            </Link>
          )}
        </nav>
        <div hidden={!!activeStep && activeStep !== 'libraries'}>
          <AdminMediaLibraries
            mediaServerType={settings.data.mediaServerType}
          />
        </div>
        <details
          className="adv"
          hidden={!!activeStep && activeStep !== 'categories'}
          open={activeStep === 'categories' || undefined}
        >
          <summary>Configure Media Categories</summary>
          <AdminCategories inSetup />
        </details>
        <details
          className="adv"
          hidden={!!activeStep && activeStep !== 'services'}
          open={activeStep === 'services' || undefined}
        >
          <summary>Configure Request Services</summary>
          {requestServices.map(([provider, label]) => (
            <SetupEditor key={provider} label={label}>
              <AdminServarr provider={provider} inSetup />
            </SetupEditor>
          ))}
        </details>
        <SetupEditor
          label="Configure Download Clients"
          active={activeStep === 'downloads' || downloadDirty}
          hidden={!!activeStep && activeStep !== 'downloads' && !downloadDirty}
        >
          <AdminDownloadClients inSetup onDirtyChange={setDownloadDirty} />
        </SetupEditor>
        {downloadDirty && (
          <p className="note" role="status">
            Save or discard download client changes before continuing setup.
          </p>
        )}
        <SetupEditor
          label="Configure Prowlarr"
          active={activeStep === 'indexer'}
          hidden={!!activeStep && activeStep !== 'indexer'}
        >
          <AdminProwlarr inSetup />
        </SetupEditor>
        {activeStep === 'review' && (
          <SetupReview mediaServerType={settings.data.mediaServerType} />
        )}
        <ServiceNote error={error || null} what="setup" />
        {activeStep && (
          <div className="toolbar">
            {stepIndex > 0 && (
              <Link
                className="btn btn-quiet"
                to={stepLink(setupSteps[stepIndex - 1][0])}
                {...stepNavigation}
              >
                Previous Step
              </Link>
            )}
            {stepIndex < setupSteps.length - 1 && (
              <Link
                className="btn btn-primary"
                to={stepLink(setupSteps[stepIndex + 1][0])}
                {...stepNavigation}
              >
                Next Step
              </Link>
            )}
          </div>
        )}
        {reopening ? (
          <Link className="btn btn-primary" to="/admin" {...stepNavigation}>
            Return to Administration
          </Link>
        ) : (
          <button
            className="btn btn-primary"
            disabled={busy || downloadDirty}
            onClick={() => void run(finish)}
          >
            Finish Setup
          </button>
        )}
      </Shell>
    );
  }

  if (reopening && !user) return <Login />;

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
                invalidatePublicSettings();
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
