import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import { sessionGeneration } from '../sessionState';

const path = '/settings/prowlarr';

interface Settings {
  hostname: string;
  port: number;
  baseUrl: string;
  useSsl: boolean;
  apiKeyConfigured: boolean;
  searchLimitPerUserPerMinute?: number;
  showIndexerDetails?: boolean;
}

interface Coverage {
  configured?: boolean;
  version?: string;
  totalIndexers?: number;
  enabledSearchableIndexers?: number;
  categories?: Record<string, number>;
  indexers?: {
    id: number;
    name: string;
    enabled: boolean;
    supportsSearch: boolean;
  }[];
  diagnostics?: {
    id?: number;
    name: string;
    success: boolean;
    error?: string;
    status?: number;
  }[];
}

const fields = [
  ['hostname', 'Hostname', 'text'],
  ['port', 'Port', 'number'],
  ['baseUrl', 'Base Path', 'text'],
  ['searchLimitPerUserPerMinute', 'Searches per User per Minute', 'number'],
] as const;

function formSettings(settings: Settings) {
  return {
    hostname: settings.hostname,
    port: String(settings.port ?? 9696),
    baseUrl: settings.baseUrl,
    useSsl: settings.useSsl,
    searchLimitPerUserPerMinute: String(
      settings.searchLimitPerUserPerMinute ?? 12
    ),
    showIndexerDetails: settings.showIndexerDetails ?? false,
    apiKey: '',
    clearApiKey: false,
  };
}

function Diagnostics({ coverage }: { coverage: Coverage }) {
  if (coverage.configured === false)
    return <p className="note">Prowlarr is unconfigured.</p>;
  return (
    <>
      <p className="note">
        {coverage.version ? `Version ${coverage.version}. ` : ''}
        {coverage.enabledSearchableIndexers ?? 0} searchable indexers of{' '}
        {coverage.totalIndexers ?? 0}.
      </p>
      <div className="setlist">
        {coverage.indexers?.map((indexer) => {
          const diagnostic = coverage.diagnostics?.find(
            ({ id }) => id === indexer.id
          );
          return (
            <div className="set" key={indexer.id}>
              <span>
                <b>{indexer.name}</b>
                <small>
                  {!indexer.enabled
                    ? 'Disabled'
                    : indexer.supportsSearch
                      ? 'Search Enabled'
                      : 'Search Unavailable'}
                </small>
                {diagnostic && (
                  <small>
                    {diagnostic.success
                      ? 'Connection Passed'
                      : 'Connection Failed'}
                    {diagnostic.status ? ` (HTTP ${diagnostic.status})` : ''}
                    {diagnostic.error ? ` · ${diagnostic.error}` : ''}
                  </small>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function ConnectionForm({ initial }: { initial: Settings }) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(() => formSettings(initial));
  const [result, setResult] = useState<Coverage>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const pending = useRef(false);
  const coverage = useApi<Coverage>(
    saved.apiKeyConfigured && saved.hostname ? `${path}/coverage` : null
  );
  const port = Number(draft.port);
  const limit = Number(draft.searchLimitPerUserPerMinute);
  const valid =
    Number.isInteger(port) &&
    port >= 1 &&
    port <= 65535 &&
    Number.isInteger(limit) &&
    limit >= 1 &&
    limit <= 60;
  const dirty = JSON.stringify(draft) !== JSON.stringify(formSettings(saved));
  const canTest =
    valid &&
    !!draft.hostname.trim() &&
    !draft.clearApiKey &&
    (saved.apiKeyConfigured || !!draft.apiKey.trim());

  function change(patch: Partial<typeof draft>) {
    setDraft((previous) => ({ ...previous, ...patch }));
    setResult(undefined);
    setNotice('');
    setFailure('');
  }

  async function submit(test: boolean) {
    if (pending.current || (test ? !canTest : !dirty || !valid)) return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setFailure('');
    setNotice('');
    try {
      const payload = {
        ...draft,
        port,
        searchLimitPerUserPerMinute: limit,
      };
      const body = JSON.stringify(payload);
      if (test) {
        const tested = await api<Coverage>(`${path}/test`, {
          method: 'POST',
          body,
        });
        if (generation !== sessionGeneration()) return;
        setResult(tested);
        setNotice('Prowlarr connection tested.');
      } else {
        const updated = await api<Settings>(path, { method: 'PUT', body });
        if (generation !== sessionGeneration()) return;
        setSaved(updated);
        setDraft(formSettings(updated));
        setResult(undefined);
        coverage.reload();
        setNotice('Prowlarr settings saved.');
      }
    } catch {
      if (generation === sessionGeneration()) {
        setResult(undefined);
        setFailure(
          test
            ? 'Could not test Prowlarr. Check its address and API key.'
            : 'Could not save Prowlarr settings. Try again.'
        );
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <Section title="Connection">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit(false);
          }}
        >
          <div className="setlist">
            {fields.map(([key, label, type]) => (
              <label key={key} className="set cfg-row">
                <span>{label}</span>
                <input
                  className="cfg-input"
                  type={type}
                  value={draft[key]}
                  disabled={busy}
                  onChange={(event) => change({ [key]: event.target.value })}
                />
              </label>
            ))}
            <label className="set cfg-row">
              <span>API Key</span>
              <input
                className="cfg-input"
                type="password"
                autoComplete="new-password"
                placeholder={saved.apiKeyConfigured ? 'Saved key' : undefined}
                value={draft.apiKey}
                disabled={busy || draft.clearApiKey}
                onChange={(event) => change({ apiKey: event.target.value })}
              />
            </label>
            {saved.apiKeyConfigured && (
              <label className="set cfg-row">
                <span>Clear Saved API Key</span>
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={draft.clearApiKey}
                  onChange={(event) =>
                    change({ clearApiKey: event.target.checked })
                  }
                />
              </label>
            )}
            {(
              [
                ['useSsl', 'Use HTTPS'],
                [
                  'showIndexerDetails',
                  'Show Indexer Details in Search Results',
                ],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="set cfg-row">
                <span>{label}</span>
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={draft[key]}
                  onChange={(event) => change({ [key]: event.target.checked })}
                />
              </label>
            ))}
          </div>
          {!valid && (
            <p className="note">
              Use a port from 1 to 65535 and a search limit from 1 to 60.
            </p>
          )}
          {failure && (
            <p className="note" role="alert">
              {failure}
            </p>
          )}
          {notice && (
            <p className="note" role="status">
              {notice}
            </p>
          )}
          <div className="toolbar">
            <button
              className="btn btn-primary btn-sm"
              disabled={busy || !dirty || !valid}
            >
              Save Prowlarr
            </button>
            <button
              className="btn btn-quiet btn-sm"
              type="button"
              disabled={busy || !canTest}
              onClick={() => void submit(true)}
            >
              Test Prowlarr Connection
            </button>
          </div>
        </form>
      </Section>
      <Section title="Indexer Diagnostics">
        <ServiceNote
          error={coverage.error}
          what="Prowlarr inventory"
          retry={coverage.reload}
        />
        {result || coverage.data ? (
          <Diagnostics coverage={(result ?? coverage.data)!} />
        ) : !saved.apiKeyConfigured || !saved.hostname ? (
          <p className="note">
            Save a connection or run a test to load indexers.
          </p>
        ) : (
          !coverage.error && (
            <p className="note" role="status">
              Loading indexers…
            </p>
          )
        )}
      </Section>
    </>
  );
}

export default function AdminProwlarr() {
  const settings = useApi<Settings>(path);
  return (
    <>
      <header className="ph">
        <h1>Prowlarr Settings</h1>
        <div className="toolbar">
          <Link className="btn btn-quiet btn-sm" to="/me">
            Back to Account
          </Link>
        </div>
      </header>
      <ServiceNote
        error={settings.error}
        what="Prowlarr settings"
        retry={settings.reload}
      />
      {settings.data ? (
        <ConnectionForm initial={settings.data} />
      ) : (
        !settings.error && (
          <p className="note" role="status">
            Loading Prowlarr settings…
          </p>
        )
      )}
    </>
  );
}
