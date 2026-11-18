import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { mediaCategoryLabels } from '../components/MediaCategorySwitches';
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
  categoryMappings?: Record<string, number[]>;
  indexerIdsByCategory?: Record<string, number[]>;
  searchLimitByIndexer?: Record<number, number>;
}

interface Coverage {
  configured?: boolean;
  version?: string;
  totalIndexers?: number;
  enabledSearchableIndexers?: number;
  categories?: Record<string, number>;
  categoryCatalog?: { id: number; name: string; indexerCount: number }[];
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
    categoryMappings: Object.fromEntries(
      Object.entries(settings.categoryMappings ?? {}).map(([key, ids]) => [
        key,
        ids.join(', '),
      ])
    ),
    indexerIdsByCategory: settings.indexerIdsByCategory ?? {},
    searchLimitByIndexer: Object.fromEntries(
      Object.entries(settings.searchLimitByIndexer ?? {}).map(
        ([key, value]) => [key, String(value)]
      )
    ),
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

function categoryIds(text: string) {
  return text.split(',').map((part) => part.trim());
}

function validCategoryIds(text: string) {
  const ids = categoryIds(text);
  return (
    ids.length <= 32 &&
    ids.every(
      (id) => /^\d{1,7}$/.test(id) && Number(id) >= 1 && Number(id) <= 1_000_000
    )
  );
}

function validLimit(value: string) {
  const limit = Number(value);
  return Number.isInteger(limit) && limit >= 1 && limit <= 60;
}

function ConnectionForm({ initial }: { initial: Settings }) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(() => formSettings(initial));
  const [result, setResult] = useState<Coverage>();
  const [openAssignments, setOpenAssignments] = useState<
    Record<string, boolean>
  >({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const pending = useRef(false);
  const coverage = useApi<Coverage>(
    saved.apiKeyConfigured && saved.hostname ? `${path}/coverage` : null
  );
  const port = Number(draft.port);
  const limit = Number(draft.searchLimitPerUserPerMinute);
  const usingSavedConnection =
    draft.hostname === saved.hostname &&
    port === saved.port &&
    draft.baseUrl === saved.baseUrl &&
    draft.useSsl === saved.useSsl &&
    !draft.apiKey &&
    !draft.clearApiKey;
  const inventory =
    result ?? (usingSavedConnection ? coverage.data : undefined);
  const indexers = inventory?.indexers ?? [];
  const defaultIndexerIds = indexers
    .filter((item) => item.enabled && item.supportsSearch)
    .map(({ id }) => id);
  const names = new Map(indexers.map(({ id, name }) => [id, name]));
  const limitIds = [
    ...new Set([
      ...names.keys(),
      ...Object.keys(draft.searchLimitByIndexer).map(Number),
    ]),
  ].sort((a, b) => a - b);
  const mappingsValid = Object.values(draft.categoryMappings).every(
    validCategoryIds
  );
  const assignmentsValid = Object.values(draft.indexerIdsByCategory).every(
    (ids) => ids.length <= 100
  );
  const limitsValid =
    Object.keys(draft.searchLimitByIndexer).length <= 500 &&
    Object.values(draft.searchLimitByIndexer).every(validLimit);
  const valid =
    mappingsValid &&
    assignmentsValid &&
    limitsValid &&
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
    if (
      ['hostname', 'port', 'baseUrl', 'useSsl', 'apiKey', 'clearApiKey'].some(
        (key) => key in patch
      )
    )
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
        hostname: draft.hostname,
        baseUrl: draft.baseUrl,
        useSsl: draft.useSsl,
        showIndexerDetails: draft.showIndexerDetails,
        apiKey: draft.apiKey,
        clearApiKey: draft.clearApiKey,
        port,
        searchLimitPerUserPerMinute: limit,
        ...(Object.keys(draft.categoryMappings).length
          ? {
              categoryMappings: Object.fromEntries(
                Object.entries(draft.categoryMappings).map(([key, text]) => [
                  key,
                  [...new Set(categoryIds(text).map(Number))],
                ])
              ),
            }
          : {}),
        ...(Object.keys(draft.indexerIdsByCategory).length
          ? { indexerIdsByCategory: draft.indexerIdsByCategory }
          : {}),
        ...(Object.keys(draft.searchLimitByIndexer).length ||
        Object.keys(saved.searchLimitByIndexer ?? {}).length
          ? {
              searchLimitByIndexer: Object.fromEntries(
                Object.entries(draft.searchLimitByIndexer).map(
                  ([id, value]) => [id, Number(value)]
                )
              ),
            }
          : {}),
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
          <Section title="Category Mappings">
            <p className="note">
              Enter comma-separated Prowlarr category IDs for each media type.
            </p>
            {!!inventory?.categoryCatalog?.length && (
              <details className="adv">
                <summary>Available Prowlarr Categories</summary>
                <div className="setlist">
                  {inventory.categoryCatalog.map(
                    ({ id, name, indexerCount }) => (
                      <div className="set" key={id}>
                        <b>
                          {id} · {name}
                        </b>
                        <small>{indexerCount} indexers</small>
                      </div>
                    )
                  )}
                </div>
              </details>
            )}
            <div className="setlist">
              {Object.entries(mediaCategoryLabels).map(([key, label]) => (
                <label className="set cfg-row" key={key}>
                  <span>{label} Category IDs</span>
                  <input
                    className="cfg-input"
                    disabled={busy}
                    value={draft.categoryMappings[key] ?? ''}
                    onChange={(event) =>
                      change({
                        categoryMappings: {
                          ...draft.categoryMappings,
                          [key]: event.target.value,
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </Section>
          <Section title="Indexer Assignments">
            <p className="note">
              Choose which indexers can search each media type. With no saved
              assignment, all enabled searchable indexers are used.
            </p>
            {Object.entries(mediaCategoryLabels).map(([key, label]) => {
              const chosen =
                draft.indexerIdsByCategory[key] ?? defaultIndexerIds;
              const ids = [...new Set([...names.keys(), ...chosen])];
              if (!ids.length) return null;
              return (
                <details
                  className="adv"
                  key={key}
                  onToggle={(event) => {
                    const open = event.currentTarget.open;
                    setOpenAssignments((previous) => ({
                      ...previous,
                      [key]: open,
                    }));
                  }}
                >
                  <summary>
                    {label} · {chosen.length} assigned
                  </summary>
                  {openAssignments[key] && (
                    <div
                      className="setlist"
                      role="group"
                      aria-label={`${label} Indexers`}
                    >
                      {ids.map((id) => (
                        <label className="set cfg-row" key={id}>
                          <span>{names.get(id) ?? `Indexer ${id}`}</span>
                          <input
                            type="checkbox"
                            checked={chosen.includes(id)}
                            disabled={busy}
                            onChange={(event) =>
                              change({
                                indexerIdsByCategory: {
                                  ...draft.indexerIdsByCategory,
                                  [key]: event.target.checked
                                    ? [...chosen, id]
                                    : chosen.filter((item) => item !== id),
                                },
                              })
                            }
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </details>
              );
            })}
            {indexers.length === 0 && (
              <p className="note">
                Test or save a connection to load indexer names.
              </p>
            )}
          </Section>
          <Section title="Per-Indexer Search Limits">
            <p className="note">
              Leave a limit blank to use the default. Overrides accept 1–60
              searches per user per minute.
            </p>
            <div className="setlist">
              {limitIds.map((id) => (
                <label className="set cfg-row" key={id}>
                  <span>{names.get(id) ?? `Indexer ${id}`} Search Limit</span>
                  <input
                    className="cfg-input"
                    type="number"
                    min={1}
                    max={60}
                    disabled={busy}
                    placeholder={draft.searchLimitPerUserPerMinute}
                    value={draft.searchLimitByIndexer[id] ?? ''}
                    onChange={(event) => {
                      const next = { ...draft.searchLimitByIndexer };
                      if (event.target.value) next[id] = event.target.value;
                      else delete next[id];
                      change({ searchLimitByIndexer: next });
                    }}
                  />
                </label>
              ))}
            </div>
          </Section>
          {!valid && (
            <p className="note">
              Check the port, search limits, category IDs and indexer
              assignments.
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
