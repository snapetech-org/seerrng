import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
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
            : 'Could not update the audiobook request.'
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <Section title="Audiobook Requests Awaiting Approval">
        <ServiceNote
          what="audiobook approvals"
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
            Loading audiobook requests…
          </p>
        )}
        {approvals.data?.length === 0 && (
          <p className="note">
            No audiobook requests are waiting for approval.
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
                  aria-label={`Approve ${title}`}
                  onClick={() => void decide(id, 'approve')}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  disabled={busy}
                  aria-label={`Deny ${title}`}
                  onClick={() => void decide(id, 'deny')}
                >
                  Deny
                </button>
              </div>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Acquisition Dashboard">
        <ServiceNote
          what="the acquisition dashboard"
          error={dashboard.error}
          retry={dashboard.reload}
        />
        {!dashboard.data && !dashboard.error && (
          <p className="note" role="status">
            Loading the acquisition dashboard…
          </p>
        )}
        {dashboard.data &&
          dashboardSections.map(([key, label]) => (
            <details className="adv" key={key}>
              <summary>{label}</summary>
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
        setSaved(response);
        reset(response);
        setNotice(`${name} settings saved.`);
      }
    } catch (failure) {
      if (generation === sessionGeneration())
        setError(
          failure instanceof ApiError
            ? failure.message
            : test
              ? `Could not test the ${name} connection.`
              : `Could not save ${name} settings.`
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <Section
        title={soulseek ? 'slskdN Connection' : 'ReadMeABook Connection'}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit(false);
          }}
        >
          {soulseek && (
            <p className="note">
              Use a read-write slskdN API key for track requests. SongID
              requires an administrator key.
            </p>
          )}
          <div className="setlist">
            <label className="set cfg-row">
              <span>Enable {name} Requests</span>
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
                  <span>{label}</span>
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
              <span>Port</span>
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
              <span>Use HTTPS</span>
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
                placeholder={saved.apiKeyConfigured ? 'Saved key' : undefined}
                onChange={(event) => {
                  setApiKey(event.target.value);
                  clearFeedback();
                }}
              />
            </label>
            {saved.apiKeyConfigured && (
              <label className="set cfg-row">
                <span>Remove Saved {secretLabel}</span>
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
              An enabled connection requires a hostname and{' '}
              {secretLabel.toLowerCase()}.
            </p>
          )}
          {result && (
            <div className="note" role="status">
              <p>
                {soulseek
                  ? `Connected to slskdN ${result.version}.`
                  : 'Connected to ReadMeABook.'}
              </p>
              {result.features &&
                features.map(([key, label]) => (
                  <p key={key}>
                    {label}{' '}
                    {result.features?.[key] ? 'available' : 'unavailable'}.
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
              Test Connection
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={
                busy || !dirty || !validPort || (draft.enabled && !credentials)
              }
            >
              Save Changes
            </button>
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={busy || !dirty}
              onClick={() => reset(saved)}
            >
              Discard Changes
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
  const name = names[provider];
  const settings = useApi<Settings>(`/settings/${provider}`);
  return (
    <>
      <h1>{name} Settings</h1>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/me">
          Back to Account
        </Link>
      </div>
      <ServiceNote
        what={`${name} settings`}
        error={settings.error}
        retry={settings.reload}
      />
      {settings.data ? (
        <Connection provider={provider} initial={settings.data} />
      ) : (
        !settings.error && (
          <p className="note" role="status">
            Loading {name} settings…
          </p>
        )
      )}
    </>
  );
}
