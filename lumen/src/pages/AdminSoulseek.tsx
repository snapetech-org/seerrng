import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import { sessionGeneration } from '../sessionState';

const endpoint = '/settings/slskdn';
interface Settings {
  enabled: boolean;
  hostname: string;
  port: number;
  useSsl: boolean;
  baseUrl: string;
  searchFilter: string;
  apiKeyConfigured: boolean;
}
interface TestResult {
  version: string;
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

function Connection({ initial }: { initial: Settings }) {
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
      searchFilter,
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
        setNotice('Soulseek settings saved.');
      }
    } catch (failure) {
      if (generation === sessionGeneration())
        setError(
          failure instanceof ApiError
            ? failure.message
            : test
              ? 'Could not test the Soulseek connection.'
              : 'Could not save Soulseek settings.'
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Section title="slskdN Connection">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit(false);
        }}
      >
        <p className="note">
          Use a read-write slskdN API key for track requests. SongID requires an
          administrator key.
        </p>
        <div className="setlist">
          <label className="set cfg-row">
            <span>Enable Soulseek Requests</span>
            <input
              type="checkbox"
              disabled={busy}
              checked={draft.enabled}
              onChange={(event) => update({ enabled: event.target.checked })}
            />
          </label>
          {textFields.map(([key, label, length]) => (
            <label className="set cfg-row" key={key}>
              <span>{label}</span>
              <input
                className="cfg-input"
                maxLength={length}
                disabled={busy}
                value={draft[key]}
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
              onChange={(event) => update({ port: Number(event.target.value) })}
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
            <span>API Key</span>
            <input
              className="cfg-input"
              type="password"
              autoComplete="new-password"
              maxLength={2048}
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
              <span>Remove Saved API Key</span>
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
            An enabled connection requires a hostname and API key.
          </p>
        )}
        {result && (
          <div className="note" role="status">
            <p>Connected to slskdN {result.version}.</p>
            {result.features &&
              features.map(([key, label]) => (
                <p key={key}>
                  {label} {result.features?.[key] ? 'available' : 'unavailable'}
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
  );
}

export default function AdminSoulseek() {
  const settings = useApi<Settings>(endpoint);
  return (
    <>
      <h1>Soulseek Settings</h1>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/me">
          Back to Account
        </Link>
      </div>
      <ServiceNote
        what="Soulseek settings"
        error={settings.error}
        retry={settings.reload}
      />
      {settings.data ? (
        <Connection initial={settings.data} />
      ) : (
        !settings.error && (
          <p className="note" role="status">
            Loading Soulseek settings…
          </p>
        )
      )}
    </>
  );
}
