import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { SavedConnectionHost } from '../components/SavedConnectionHost';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';

type Provider = 'slskdn' | 'readmeabook';
const names = { slskdn: 'Soulseek', readmeabook: 'ReadMeABook' };
interface Settings {
  enabled: boolean;
  hostname: string;
  port: number;
  useSsl: boolean;
  baseUrl: string;
  searchFilter?: string;
  apiKeyConfigured: boolean;
}
interface TestResult {
  version?: string;
  features?: Record<'wishlist' | 'libraryHealth' | 'songId', boolean>;
}
const textFields = [
  ['hostname', 'Hostname or IP Address', 255],
  ['baseUrl', 'URL Base', 512],
  ['searchFilter', 'Search Filter', 512],
] as const;
const features = [
  ['wishlist', 'Track Requests'],
  ['libraryHealth', 'Album Fixes'],
  ['songId', 'SongID'],
] as const;

const approvalsPath = '/readmeabook/admin/requests';
const dashboardSections = [
  ['metrics', 'Metrics'],
  ['activeDownloads', 'Active Downloads'],
  ['recentRequests', 'Recent Requests'],
] as const;

interface Approval {
  id: number;
  title: string;
  author?: string;
  user: { username?: string; email?: string } | null;
}

function ReadMeABookOperations() {
  const { t } = useLumenLocale();
  const approvals = useApi<Approval[]>(approvalsPath);
  const dashboard = useApi<
    Partial<Record<(typeof dashboardSections)[number][0], unknown>>
  >('/readmeabook/admin/dashboard');
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function decide(id: number, action: 'approve' | 'deny') {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    const generation = sessionGeneration();
    try {
      await api(`${approvalsPath}/${id}/${action}`, { method: 'POST' });
      if (generation !== sessionGeneration()) return;
      approvals.reload();
      dashboard.refresh();
    } catch (failure) {
      if (generation === sessionGeneration())
        setError(
          failure instanceof ApiError
            ? failure.message
            : t(
                'lumen.requestService.approvalFailed',
                'Could not update the audiobook request.'
              )
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <Section
        title={t(
          'lumen.requestService.approvals',
          'Audiobook Requests Awaiting Approval'
        )}
      >
        <ServiceNote
          what={t('lumen.requestService.approvalWhat', 'audiobook approvals')}
          title={t(
            'lumen.requestService.approvalLoadError',
            'Couldn’t load audiobook approvals'
          )}
          retryLabel={t('lumen.requestService.retry', 'Retry')}
          error={approvals.error}
          retry={approvals.reload}
        />
        {error && (
          <p className="note" role="alert">
            {error}
          </p>
        )}
        {!approvals.data && !approvals.error && (
          <p className="note" role="status">
            {t(
              'lumen.requestService.loadingApprovals',
              'Loading audiobook requests…'
            )}
          </p>
        )}
        {approvals.data?.length === 0 && (
          <p className="note">
            {t(
              'lumen.requestService.noApprovals',
              'No audiobook requests are waiting for approval.'
            )}
          </p>
        )}
        <div className="setlist">
          {approvals.data?.map(({ id, title, author, user }) => (
            <div className="set cfg-row" key={id}>
              <span>
                <b>{title}</b>
                <small>
                  {[author, user?.username || user?.email]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              </span>
              <div className="toolbar">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy}
                  aria-label={t(
                    'lumen.requestService.approveTitle',
                    'Approve {title}',
                    { title }
                  )}
                  onClick={() => void decide(id, 'approve')}
                >
                  {t('lumen.requestService.approve', 'Approve')}
                </button>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  disabled={busy}
                  aria-label={t(
                    'lumen.requestService.denyTitle',
                    'Deny {title}',
                    { title }
                  )}
                  onClick={() => void decide(id, 'deny')}
                >
                  {t('lumen.requestService.deny', 'Deny')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </Section>
      <Section
        title={t('lumen.requestService.dashboard', 'Acquisition Dashboard')}
      >
        <ServiceNote
          what={t(
            'lumen.requestService.dashboardWhat',
            'the acquisition dashboard'
          )}
          title={t(
            'lumen.requestService.dashboardLoadError',
            'Couldn’t load the acquisition dashboard'
          )}
          retryLabel={t('lumen.requestService.retry', 'Retry')}
          error={dashboard.error}
          retry={dashboard.reload}
        />
        {!dashboard.data && !dashboard.error && (
          <p className="note" role="status">
            {t(
              'lumen.requestService.loadingDashboard',
              'Loading the acquisition dashboard…'
            )}
          </p>
        )}
        {dashboard.data &&
          dashboardSections.map(([key, label]) => (
            <details className="adv" key={key}>
              <summary>
                {t(`lumen.requestService.dashboard.${key}`, label)}
              </summary>
              <textarea
                aria-label={label}
                className="cfg-json"
                readOnly
                value={JSON.stringify(dashboard.data?.[key] ?? null, null, 2)}
              />
            </details>
          ))}
      </Section>
    </>
  );
}

function Connection({
  provider,
  initial,
}: {
  provider: Provider;
  initial: Settings;
}) {
  const { t } = useLumenLocale();
  const name = names[provider];
  const endpoint = `/settings/${provider}`;
  const soulseek = provider === 'slskdn';
  const secretLabel = soulseek ? 'API Key' : 'API Token';
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [apiKey, setApiKey] = useState('');
  const [clearApiKey, setClearApiKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<TestResult>();
  const pending = useRef(false);
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(saved) || !!apiKey || clearApiKey;
  const credentials =
    !!draft.hostname.trim() &&
    !clearApiKey &&
    (apiKey.trim() || saved.apiKeyConfigured);
  const validPort =
    Number.isInteger(draft.port) && draft.port >= 1 && draft.port <= 65535;

  function clearFeedback() {
    setResult(undefined);
    setError('');
    setNotice('');
  }

  function update(patch: Partial<Settings>) {
    setDraft((current) => ({ ...current, ...patch }));
    clearFeedback();
  }

  function reset(next: Settings) {
    setDraft(next);
    setApiKey('');
    setClearApiKey(false);
    clearFeedback();
  }

  async function submit(test: boolean) {
    if (
      pending.current ||
      (!test && !dirty) ||
      !validPort ||
      ((test || draft.enabled) && !credentials)
    )
      return;
    pending.current = true;
    setBusy(true);
    clearFeedback();
    const generation = sessionGeneration();
    const { enabled, hostname, port, useSsl, baseUrl, searchFilter } = draft;
    const body = JSON.stringify({
      enabled,
      hostname: hostname.trim(),
      port,
      useSsl,
      baseUrl,
      ...(soulseek ? { searchFilter } : {}),
      clearApiKey,
      ...(apiKey ? { apiKey } : {}),
    });
    try {
      if (test) {
        const response = await api<TestResult>(endpoint + '/test', {
          method: 'POST',
          body,
        });
        if (generation === sessionGeneration()) setResult(response);
      } else {
        const response = await api<Settings>(endpoint, { method: 'PUT', body });
        if (generation !== sessionGeneration()) return;
        const readback = await api<Settings>(endpoint);
        if (generation !== sessionGeneration()) return;
        const expected = {
          enabled,
          hostname: hostname.trim(),
          port,
          useSsl,
          baseUrl: baseUrl.trim()
            ? `/${baseUrl.trim().replace(/^\/+|\/+$/g, '')}`
            : '',
          ...(soulseek ? { searchFilter: searchFilter?.trim() ?? '' } : {}),
          apiKeyConfigured: clearApiKey
            ? false
            : apiKey
              ? true
              : saved.apiKeyConfigured,
        };
        const confirmed = Object.entries(expected).every(
          ([field, value]) =>
            response[field as keyof Settings] === value &&
            readback[field as keyof Settings] === value
        );
        if (!confirmed) {
          setError(
            t(
              'lumen.requestService.saveFailed',
              'Could not save {name} settings.',
              { name }
            )
          );
          return;
        }
        setSaved(readback);
        reset(readback);
        setNotice(
          t('lumen.requestService.saved', '{name} settings saved.', { name })
        );
      }
    } catch (failure) {
      if (generation === sessionGeneration())
        setError(
          failure instanceof ApiError
            ? failure.message
            : test
              ? t(
                  'lumen.requestService.testFailed',
                  'Could not test the {name} connection.',
                  { name }
                )
              : t(
                  'lumen.requestService.saveFailed',
                  'Could not save {name} settings.',
                  { name }
                )
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <Section
        title={t(
          soulseek
            ? 'lumen.requestService.soulseekConnection'
            : 'lumen.requestService.readmeConnection',
          soulseek ? 'slskdN Connection' : 'ReadMeABook Connection'
        )}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit(false);
          }}
        >
          {soulseek && (
            <p className="note">
              {t(
                'lumen.requestService.soulseekHelp',
                'Use a read-write slskdN API key for track requests. SongID requires an administrator key.'
              )}
            </p>
          )}
          <div className="setlist">
            <SavedConnectionHost
              disabled={busy}
              onSelect={(hostname) => update({ hostname })}
            />
            <label className="set cfg-row">
              <span>
                {t(
                  'lumen.requestService.enableRequests',
                  'Enable {name} Requests',
                  { name }
                )}
              </span>
              <input
                type="checkbox"
                disabled={busy}
                checked={draft.enabled}
                onChange={(event) => update({ enabled: event.target.checked })}
              />
            </label>
            {textFields
              .filter(([key]) => soulseek || key !== 'searchFilter')
              .map(([key, label, length]) => (
                <label className="set cfg-row" key={key}>
                  <span>{t(`lumen.requestService.field.${key}`, label)}</span>
                  <input
                    className="cfg-input"
                    maxLength={length}
                    disabled={busy}
                    value={draft[key] ?? ''}
                    onChange={(event) => update({ [key]: event.target.value })}
                  />
                </label>
              ))}
            <label className="set cfg-row">
              <span>{t('lumen.requestService.port', 'Port')}</span>
              <input
                className="cfg-input"
                type="number"
                min={1}
                max={65535}
                required
                disabled={busy}
                value={draft.port || ''}
                onChange={(event) =>
                  update({ port: Number(event.target.value) })
                }
              />
            </label>
            <label className="set cfg-row">
              <span>{t('lumen.requestService.https', 'Use HTTPS')}</span>
              <input
                type="checkbox"
                disabled={busy}
                checked={draft.useSsl}
                onChange={(event) => update({ useSsl: event.target.checked })}
              />
            </label>
            <label className="set cfg-row">
              <span>{secretLabel}</span>
              <input
                className="cfg-input"
                type="password"
                autoComplete="new-password"
                maxLength={soulseek ? 2048 : 4096}
                disabled={busy || clearApiKey}
                value={apiKey}
                placeholder={
                  saved.apiKeyConfigured
                    ? t('lumen.requestService.savedKey', 'Saved key')
                    : undefined
                }
                onChange={(event) => {
                  setApiKey(event.target.value);
                  clearFeedback();
                }}
              />
            </label>
            {saved.apiKeyConfigured && (
              <label className="set cfg-row">
                <span>
                  {t('lumen.requestService.removeSaved', 'Remove Saved')}{' '}
                  {t(
                    `lumen.requestService.secret.${soulseek ? 'key' : 'token'}`,
                    secretLabel
                  )}
                </span>
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={clearApiKey}
                  onChange={(event) => {
                    setClearApiKey(event.target.checked);
                    clearFeedback();
                  }}
                />
              </label>
            )}
          </div>
          {draft.enabled && !credentials && (
            <p className="note">
              {t(
                'lumen.requestService.credentialsRequired',
                'An enabled connection requires a hostname and {credential}.',
                {
                  credential: t(
                    `lumen.requestService.secret.${soulseek ? 'key' : 'token'}`,
                    secretLabel
                  ).toLowerCase(),
                }
              )}
            </p>
          )}
          {result && (
            <div className="note" role="status">
              <p>
                {soulseek
                  ? t(
                      'lumen.requestService.soulseekConnected',
                      'Connected to slskdN {version}.',
                      { version: result.version ?? '' }
                    )
                  : t(
                      'lumen.requestService.readmeConnected',
                      'Connected to ReadMeABook.'
                    )}
              </p>
              {result.features &&
                features.map(([key, label]) => (
                  <p key={key}>
                    {t(`lumen.requestService.feature.${key}`, label)}{' '}
                    {result.features?.[key]
                      ? t('lumen.requestService.available', 'available')
                      : t('lumen.requestService.unavailable', 'unavailable')}
                    .
                  </p>
                ))}
            </div>
          )}
          {notice && (
            <p className="note" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="note" role="alert">
              {error}
            </p>
          )}
          <div className="toolbar">
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={busy || !validPort || !credentials}
              onClick={() => void submit(true)}
            >
              {t('lumen.requestService.test', 'Test Connection')}
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={
                busy || !dirty || !validPort || (draft.enabled && !credentials)
              }
            >
              {t('lumen.requestService.save', 'Save Changes')}
            </button>
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={busy || !dirty}
              onClick={() => reset(saved)}
            >
              {t('lumen.requestService.discard', 'Discard Changes')}
            </button>
          </div>
        </form>
      </Section>
      {!soulseek && saved.enabled && <ReadMeABookOperations />}
    </>
  );
}

export default function AdminRequestService({
  provider,
}: {
  provider: Provider;
}) {
  const { t } = useLumenLocale();
  const name = names[provider];
  const settings = useApi<Settings>(`/settings/${provider}`);
  return (
    <>
      <h1>{t('lumen.requestService.title', '{name} Settings', { name })}</h1>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/admin">
          {t('lumen.admin.title', 'Administration')}
        </Link>
      </div>
      <ServiceNote
        what={t('lumen.requestService.settingsWhat', '{name} settings', {
          name,
        })}
        title={t(
          'lumen.requestService.settingsLoadError',
          'Couldn’t load {name} settings',
          { name }
        )}
        retryLabel={t('lumen.requestService.retry', 'Retry')}
        error={settings.error}
        retry={settings.reload}
      />
      {settings.data ? (
        <Connection provider={provider} initial={settings.data} />
      ) : (
        !settings.error && (
          <p className="note" role="status">
            {t('lumen.requestService.loading', 'Loading {name} settings…', {
              name,
            })}
          </p>
        )
      )}
    </>
  );
}
