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
import { useLumenLocale } from '../i18n';
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
  const { t } = useLumenLocale();
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
    <Section title={t('lumen.setup.reviewSetup', 'Review Setup')}>
      <ServiceNote
        what={t('lumen.setup.savedLibraries', 'saved media libraries')}
        error={connection.error}
        retry={connection.reload}
      />
      {enabled?.length ? (
        <>
          <p className="note">
            {t('lumen.setup.enabledLibraries', 'Enabled Media Libraries')}
          </p>
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
          {t(
            'lumen.setup.libraryRequired',
            'Enable at least one media library before finishing setup.'
          )}
        </p>
      ) : !connection.error ? (
        <p className="note" role="status">
          {t(
            'lumen.setup.checkingLibraries',
            'Checking saved media libraries…'
          )}
        </p>
      ) : null}
      <dl className="setlist">
        <div className="set">
          <dt>{t('lumen.setup.downloadClients', 'Download Clients')}</dt>
          <dd>
            {enabledClients === undefined
              ? downloads.error
                ? t('lumen.setup.unavailable', 'Unavailable')
                : t('lumen.setup.checking', 'Checking…')
              : t('lumen.setup.enabledCount', '{count} enabled', {
                  count: enabledClients,
                })}
          </dd>
        </div>
        <div className="set">
          <dt>{t('lumen.setup.prowlarr', 'Prowlarr')}</dt>
          <dd>
            {prowlarr.data
              ? prowlarr.data.hostname && prowlarr.data.apiKeyConfigured
                ? t('lumen.setup.configured', 'Configured')
                : t('lumen.setup.notConfigured', 'Not configured')
              : prowlarr.error
                ? t('lumen.setup.unavailable', 'Unavailable')
                : t('lumen.setup.checking', 'Checking…')}
          </dd>
        </div>
      </dl>
      <ServiceNote
        what={t('lumen.setup.savedDownloadClients', 'saved download clients')}
        error={downloads.error}
        retry={downloads.reload}
      />
      <ServiceNote
        what={t('lumen.setup.savedProwlarr', 'saved Prowlarr settings')}
        error={prowlarr.error}
        retry={prowlarr.reload}
      />
      <details className="adv">
        <summary>
          {t('lumen.setup.reviewRequestServices', 'Review Request Services')}
        </summary>
        {requestServices.map(([provider, label]) => (
          <SetupEditor key={provider} label={label}>
            <RequestServiceReview provider={provider} label={label} />
          </SetupEditor>
        ))}
      </details>
      <p className="note">
        {t(
          'lumen.setup.optionalServices',
          'Request services, download clients, and Prowlarr are optional.'
        )}
      </p>
    </Section>
  );
}
const requestServices = [
  ['radarr', 'Radarr', ['movie']],
  ['sonarr', 'Sonarr', ['tv']],
  ['readarr', 'Book and Audiobook Services', ['ebook', 'audiobook']],
  ['lazylibrarian', 'LazyLibrarian', ['ebook', 'audiobook', 'magazine']],
  ['lidarr', 'Lidarr', ['music']],
  ['mylar', 'Mylar', ['comic']],
  ['kapowarr', 'Kapowarr', ['comic']],
  ['backissue', 'BackIssue', ['comic']],
  ['sportarr', 'Sportarr', ['sports']],
  ['whisparr', 'Whisparr', ['adult']],
] as const;

const setupServiceGroups: Record<
  string,
  { key: string; label: string; categories: string[] }
> = {
  video: {
    key: 'videoGroup',
    label: 'Movies and Series',
    categories: ['movie', 'tv'],
  },
  reading: {
    key: 'readingGroup',
    label: 'Books, Audiobooks, Comics, and Magazines',
    categories: ['ebook', 'audiobook', 'comic', 'magazine'],
  },
  music: { key: 'musicGroup', label: 'Music', categories: ['music'] },
  other: {
    key: 'otherGroup',
    label: 'Sports and Adult',
    categories: ['sports', 'adult'],
  },
};

function SetupRequestServices({
  categories,
}: {
  categories?: PublicSettings['enabledMediaCategories'];
}) {
  const { t } = useLumenLocale();
  const [group, setGroup] = useState('');
  const groupCategories = setupServiceGroups[group]?.categories;
  const recommended = requestServices.filter(([, , keys]) =>
    keys.some((key) => categories?.[key] === true)
  );
  return (
    <>
      <label className="sel" data-layout="stacked-mobile">
        <span>{t('lumen.setup.serviceGroup', 'Service Group')}</span>
        <select
          value={group}
          onChange={(event) => setGroup(event.target.value)}
        >
          <option value="">
            {t('lumen.setup.allRequestServices', 'All Request Services')}
          </option>
          {Object.entries(setupServiceGroups).map(([id, { key, label }]) => (
            <option key={id} value={id}>
              {t(`lumen.setup.${key}`, label)}
            </option>
          ))}
        </select>
      </label>
      {recommended.length > 0 && (
        <p className="note">
          {t(
            'lumen.setup.recommendedFirst',
            'Services for your enabled categories appear first.'
          )}
        </p>
      )}
      {[
        ...recommended,
        ...requestServices.filter((service) => !recommended.includes(service)),
      ].map(([provider, label, keys]) => (
        <SetupEditor
          key={provider}
          label={label}
          hidden={
            !!groupCategories &&
            !keys.some((key) => groupCategories.includes(key))
          }
        >
          <AdminServarr provider={provider} inSetup />
        </SetupEditor>
      ))}
    </>
  );
}

function RequestServiceReview({
  provider,
  label,
}: {
  provider: (typeof requestServices)[number][0];
  label: string;
}) {
  const { t } = useLumenLocale();
  const services = useApi<{ id: number; name: string }[]>(
    `/settings/${provider}`
  );
  if (services.error) {
    return (
      <ServiceNote
        what={t(
          'lumen.setup.savedServiceSettings',
          'saved {service} settings',
          { service: label }
        )}
        error={services.error}
        retry={services.reload}
      />
    );
  }
  if (!services.data)
    return (
      <p className="note" role="status">
        {t('lumen.setup.checkingServices', 'Checking saved services…')}
      </p>
    );
  if (!services.data.length)
    return (
      <p className="note">
        {t('lumen.setup.noServices', 'No services configured.')}
      </p>
    );
  return (
    <ul className="setlist">
      {services.data.map(({ id, name }) => (
        <li key={id} className="set">
          {name}
        </li>
      ))}
    </ul>
  );
}

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
  const { t } = useLumenLocale();
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
              {t('lumen.setup.loadingServices', 'Loading services…')}
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
  const { t } = useLumenLocale();
  const { user, refresh } = useAuth();
  const settings = useApi<PublicSettings>('/settings/public', {
    keepDuringRefresh: true,
  });
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
      setError(
        friendlyError(
          failure,
          t('lumen.setup.couldNotContinue', 'Setup could not continue.')
        )
      );
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
        t(
          'lumen.setup.libraryRequired',
          'Enable at least one media library before finishing setup.'
        )
      );
    }
    const result = await api<{ initialized: boolean }>('/settings/initialize', {
      method: 'POST',
    });
    if (!result.initialized)
      throw new Error(
        t(
          'lumen.setup.completionUnconfirmed',
          'The server did not confirm setup completion.'
        )
      );
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
            what={t('lumen.error.what.setupSettings', 'setup settings')}
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
            ? t(
                'lumen.setup.adminGuideOnly',
                'Only administrators can open the setup guide.'
              )
            : t(
                'lumen.setup.adminMustFinish',
                'An administrator must finish setup.'
              )}
        </p>
      );
    }
    return (
      <Shell>
        <ExtraHeader
          title={
            reopening
              ? t('lumen.setup.setupGuide', 'Setup Guide')
              : t('lumen.setup.finishSetup', 'Finish Setup')
          }
        />
        <nav
          className="toolbar"
          aria-label={t('lumen.setup.setupSteps', 'Setup steps')}
        >
          {activeStep ? (
            setupSteps.map(([id, label]) => (
              <Link
                key={id}
                className="btn btn-quiet btn-sm"
                to={stepLink(id)}
                aria-current={activeStep === id ? 'step' : undefined}
                {...stepNavigation}
              >
                {t(`lumen.setup.step.${id}`, label)}
              </Link>
            ))
          ) : (
            <Link
              className="btn btn-quiet btn-sm"
              to={stepLink(setupSteps[0][0])}
              {...stepNavigation}
            >
              {t('lumen.setup.startGuided', 'Start Guided Setup')}
            </Link>
          )}
          {activeStep && (
            <Link
              className="btn btn-quiet btn-sm"
              to={stepLink()}
              {...stepNavigation}
            >
              {t('lumen.setup.showAllOptions', 'Show All Setup Options')}
            </Link>
          )}
        </nav>
        <div
          className="setup-step"
          hidden={!!activeStep && activeStep !== 'libraries'}
        >
          <AdminMediaLibraries
            mediaServerType={settings.data.mediaServerType}
          />
        </div>
        <details
          className="adv"
          hidden={!!activeStep && activeStep !== 'categories'}
          open={activeStep === 'categories' || undefined}
        >
          <summary>
            {t('lumen.setup.configureCategories', 'Configure Media Categories')}
          </summary>
          <AdminCategories
            inSetup
            onAvailableCategoriesSaved={settings.reload}
          />
        </details>
        <details
          className="adv"
          hidden={!!activeStep && activeStep !== 'services'}
          open={activeStep === 'services' || undefined}
        >
          <summary>
            {t(
              'lumen.setup.configureRequestServices',
              'Configure Request Services'
            )}
          </summary>
          <SetupRequestServices
            categories={settings.data.enabledMediaCategories}
          />
        </details>
        <SetupEditor
          label={t(
            'lumen.setup.configureDownloadClients',
            'Configure Download Clients'
          )}
          active={activeStep === 'downloads' || downloadDirty}
          hidden={!!activeStep && activeStep !== 'downloads' && !downloadDirty}
        >
          <AdminDownloadClients inSetup onDirtyChange={setDownloadDirty} />
        </SetupEditor>
        {downloadDirty && (
          <p className="note" role="status">
            {t(
              'lumen.setup.saveOrDiscardDownloads',
              'Save or discard download client changes before continuing setup.'
            )}
          </p>
        )}
        <SetupEditor
          label={t('lumen.setup.configureProwlarr', 'Configure Prowlarr')}
          active={activeStep === 'indexer'}
          hidden={!!activeStep && activeStep !== 'indexer'}
        >
          <AdminProwlarr inSetup />
        </SetupEditor>
        {activeStep === 'review' && (
          <SetupReview mediaServerType={settings.data.mediaServerType} />
        )}
        <ServiceNote
          error={error || null}
          what={t('lumen.error.what.setup', 'setup')}
        />
        {activeStep && (
          <div className="toolbar">
            {stepIndex > 0 && (
              <Link
                className="btn btn-quiet"
                to={stepLink(setupSteps[stepIndex - 1][0])}
                {...stepNavigation}
              >
                {t('lumen.setup.previousStep', 'Previous Step')}
              </Link>
            )}
            {stepIndex < setupSteps.length - 1 && (
              <Link
                className="btn btn-primary"
                to={stepLink(setupSteps[stepIndex + 1][0])}
                {...stepNavigation}
              >
                {t('lumen.setup.nextStep', 'Next Step')}
              </Link>
            )}
          </div>
        )}
        {reopening ? (
          <Link className="btn btn-primary" to="/admin" {...stepNavigation}>
            {t('lumen.setup.returnToAdmin', 'Return to Administration')}
          </Link>
        ) : (
          <button
            className="btn btn-primary"
            disabled={busy || downloadDirty}
            onClick={() => void run(finish)}
          >
            {t('lumen.setup.finishSetup', 'Finish Setup')}
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
        <h1>{t('lumen.setup.setUpSeerrNG', 'Set Up SeerrNG')}</h1>
        {error && (
          <p className="login-err" role="alert">
            {error}
          </p>
        )}
        <label className="sel">
          {t('lumen.setup.mediaServer', 'Media server')}
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
            {t('lumen.setup.signInPlex', 'Sign in with Plex')}
          </button>
        ) : (
          <form className="login-local" key={provider} onSubmit={connect}>
            <label>
              {t('lumen.setup.hostname', 'Hostname')}
              <input name="hostname" required />
            </label>
            <label>
              {t('lumen.setup.port', 'Port')}
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
              {t('lumen.setup.urlBase', 'URL base')}
              <input name="urlBase" />
            </label>
            <label>
              {t('lumen.setup.useHttps', 'Use HTTPS')}
              <input name="useSsl" type="checkbox" />
            </label>
            <label>
              {t('lumen.setup.username', 'Username')}
              <input name="username" autoComplete="username" required />
            </label>
            <label>
              {t('lumen.setup.password', 'Password')}
              <input
                name="password"
                type="password"
                autoComplete="current-password"
              />
            </label>
            <label>
              {t('lumen.setup.email', 'Email')}
              <input name="email" type="email" required />
            </label>
            <button className="btn btn-primary login-primary" disabled={busy}>
              {t('lumen.setup.connectSignIn', 'Connect and Sign In')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
