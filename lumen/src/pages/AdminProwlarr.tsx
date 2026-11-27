import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { mediaCategoryLabels } from '../components/MediaCategorySwitches';
import { SavedConnectionHost } from '../components/SavedConnectionHost';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
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
  ['hostname', 'address', 'Hostname', 'text'],
  ['port', 'port', 'Port', 'number'],
  ['baseUrl', 'basePath', 'Base Path', 'text'],
  [
    'searchLimitPerUserPerMinute',
    'searchesPerUser',
    'Searches per User per Minute',
    'number',
  ],
] as const;

const categoryMessageIds: Record<string, string> = {
  movie: 'movie',
  tv: 'tv',
  ebook: 'ebook',
  audiobook: 'audiobook',
  comic: 'comic',
  magazine: 'magazine',
  music: 'music',
  adult: 'adult',
  retro: 'retro',
  modern: 'modern',
  game: 'game',
  sports: 'sports',
};

function categoryLabel(
  category: string,
  fallback: string,
  t: ReturnType<typeof useLumenLocale>['t']
) {
  const id = categoryMessageIds[category];
  return id ? t(`components.SettingsProwlarr.${id}`, fallback) : fallback;
}

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
  const { locale, t } = useLumenLocale();
  if (coverage.configured === false)
    return (
      <p className="note">
        {t(
          'components.SettingsProwlarr.noConfiguredIndexers',
          'No Prowlarr indexers are configured yet.'
        )}
      </p>
    );
  return (
    <>
      <p className="note">
        {coverage.version
          ? t('lumen.adminProwlarr.version', 'Version {version}.', {
              version: coverage.version,
            }) + ' '
          : ''}
        {t(
          'lumen.adminProwlarr.coverageSummary',
          '{enabled} searchable indexers of {total}.',
          {
            enabled: (coverage.enabledSearchableIndexers ?? 0).toLocaleString(
              locale
            ),
            total: (coverage.totalIndexers ?? 0).toLocaleString(locale),
          }
        )}
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
                    ? t('lumen.adminProwlarr.disabled', 'Disabled')
                    : indexer.supportsSearch
                      ? t('lumen.adminProwlarr.searchEnabled', 'Search enabled')
                      : t(
                          'lumen.adminProwlarr.searchUnavailable',
                          'Search unavailable'
                        )}
                </small>
                {diagnostic && (
                  <small>
                    {diagnostic.success
                      ? t(
                          'components.SettingsProwlarr.diagnosticOk',
                          'Connected'
                        )
                      : t(
                          'components.SettingsProwlarr.diagnosticFailed',
                          'Failed'
                        )}
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

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableValue(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function ConnectionForm({ initial }: { initial: Settings }) {
  const { t } = useLumenLocale();
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
    let writeAcknowledged = false;
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
        setNotice(
          t(
            'lumen.adminProwlarr.connectionTested',
            'Prowlarr connection tested.'
          )
        );
      } else {
        const updated = await api<Settings>(path, { method: 'PUT', body });
        writeAcknowledged = true;
        if (generation !== sessionGeneration()) return;
        const readback = await api<Settings>(path);
        if (generation !== sessionGeneration()) return;
        const expected = {
          hostname: draft.hostname.trim(),
          port,
          baseUrl: draft.baseUrl.trim()
            ? `/${draft.baseUrl.trim().replace(/^\/+|\/+$/g, '')}`
            : '',
          useSsl: draft.useSsl,
          apiKeyConfigured: draft.clearApiKey
            ? false
            : draft.apiKey.trim()
              ? true
              : saved.apiKeyConfigured,
          searchLimitPerUserPerMinute: limit,
          showIndexerDetails: draft.showIndexerDetails,
        };
        const expectedCategoryMappings = { ...(saved.categoryMappings ?? {}) };
        for (const [category, ids] of Object.entries(draft.categoryMappings)) {
          expectedCategoryMappings[category] = [
            ...new Set(categoryIds(ids).map(Number)),
          ];
        }
        const expectedIndexerIds = {
          ...(saved.indexerIdsByCategory ?? {}),
          ...(Object.keys(draft.indexerIdsByCategory).length
            ? draft.indexerIdsByCategory
            : {}),
        };
        const expectedIndexerLimits =
          Object.keys(draft.searchLimitByIndexer).length ||
          Object.keys(saved.searchLimitByIndexer ?? {}).length
            ? Object.fromEntries(
                Object.entries(draft.searchLimitByIndexer).map(
                  ([id, value]) => [id, Number(value)]
                )
              )
            : (saved.searchLimitByIndexer ?? {});
        const confirmed =
          Object.entries(expected).every(
            ([field, value]) =>
              updated[field as keyof Settings] === value &&
              readback[field as keyof Settings] === value
          ) &&
          [updated, readback].every(
            (settings) =>
              stableValue(settings.categoryMappings ?? {}) ===
                stableValue(expectedCategoryMappings) &&
              stableValue(settings.indexerIdsByCategory ?? {}) ===
                stableValue(expectedIndexerIds) &&
              stableValue(settings.searchLimitByIndexer ?? {}) ===
                stableValue(expectedIndexerLimits)
          );
        if (!confirmed) {
          setFailure(
            t(
              'components.SettingsProwlarr.saveFailed',
              'Prowlarr settings could not be saved.'
            )
          );
          return;
        }
        setSaved(readback);
        setDraft(formSettings(readback));
        setResult(undefined);
        coverage.reload();
        setNotice(
          t('components.SettingsProwlarr.saved', 'Prowlarr settings saved.')
        );
      }
    } catch {
      if (generation === sessionGeneration()) {
        setResult(undefined);
        setFailure(
          writeAcknowledged
            ? t(
                'lumen.settings.confirmFailed',
                'The server accepted the change, but Lumen could not confirm the saved state. Keep this form open and retry.'
              )
            : test
              ? t(
                  'components.SettingsProwlarr.testFailed',
                  'Prowlarr connection failed. Check the address and API key.'
                )
              : t(
                  'components.SettingsProwlarr.saveFailed',
                  'Prowlarr settings could not be saved.'
                )
        );
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <Section title={t('lumen.adminProwlarr.connectionHeading', 'Connection')}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit(false);
          }}
        >
          <div className="setlist">
            <SavedConnectionHost
              disabled={busy}
              onSelect={(hostname) => change({ hostname })}
            />
            {fields.map(([key, messageId, fallback, type]) => (
              <label key={key} className="set cfg-row">
                <span>
                  {t(`components.SettingsProwlarr.${messageId}`, fallback)}
                </span>
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
              <span>{t('components.SettingsProwlarr.apiKey', 'API key')}</span>
              <input
                className="cfg-input"
                type="password"
                autoComplete="new-password"
                placeholder={
                  saved.apiKeyConfigured
                    ? t(
                        'lumen.adminProwlarr.savedApiKeyPlaceholder',
                        'Saved key'
                      )
                    : undefined
                }
                value={draft.apiKey}
                disabled={busy || draft.clearApiKey}
                onChange={(event) => change({ apiKey: event.target.value })}
              />
            </label>
            {saved.apiKeyConfigured && (
              <label className="set cfg-row">
                <span>
                  {t(
                    'components.SettingsProwlarr.clearApiKey',
                    'Remove saved API key'
                  )}
                </span>
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
                ['useSsl', t('components.SettingsProwlarr.useSsl', 'Use SSL')],
                [
                  'showIndexerDetails',
                  t(
                    'components.SettingsProwlarr.showIndexerDetails',
                    'Allow indexer names and details in search results'
                  ),
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
          <Section
            title={t(
              'components.SettingsProwlarr.categoryMappingTitle',
              'Category filters'
            )}
          >
            <p className="note">
              {t(
                'components.SettingsProwlarr.categoryMappingDescription',
                'Choose the Prowlarr categories sent with each search.'
              )}
            </p>
            {!!inventory?.categoryCatalog?.length && (
              <details className="adv">
                <summary>
                  {t(
                    'lumen.adminProwlarr.availableCategories',
                    'Available Prowlarr categories'
                  )}
                </summary>
                <div className="setlist picklist catalog">
                  {inventory.categoryCatalog.map(
                    ({ id, name, indexerCount }) => (
                      <div className="set" key={id}>
                        <b>
                          {id} · {name}
                        </b>
                        <small>
                          {t(
                            'components.SettingsProwlarr.indexerCount',
                            'Indexers: {count}',
                            { count: indexerCount }
                          )}
                        </small>
                      </div>
                    )
                  )}
                </div>
              </details>
            )}
            <div className="setlist">
              {Object.entries(mediaCategoryLabels).map(([key, label]) => (
                <label className="set cfg-row" key={key}>
                  <span>
                    {t(
                      'lumen.adminProwlarr.categoryIdsLabel',
                      '{category} Category IDs',
                      {
                        category: categoryLabel(key, label, t),
                      }
                    )}
                  </span>
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
          <Section
            title={t(
              'components.SettingsProwlarr.indexerAssignmentTitle',
              'Indexer Assignments by Media Type'
            )}
          >
            <p className="note">
              {t(
                'components.SettingsProwlarr.indexerAssignmentDescription',
                'Choose which enabled Prowlarr indexers are searched for each media type.'
              )}
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
                    {t(
                      'lumen.adminProwlarr.assignedCount',
                      '{category} · {count} assigned',
                      {
                        category: categoryLabel(key, label, t),
                        count: chosen.length,
                      }
                    )}
                  </summary>
                  {openAssignments[key] && (
                    <div
                      className="setlist picklist"
                      role="group"
                      aria-label={t(
                        'components.SettingsProwlarr.indexerAssignmentSelectLabel',
                        'Indexers for {category}',
                        { category: categoryLabel(key, label, t) }
                      )}
                    >
                      {ids.map((id) => (
                        <label className="set pick" key={id}>
                          <span>
                            {names.get(id) ??
                              t('lumen.adminProwlarr.indexer', 'Indexer {id}', {
                                id,
                              })}
                          </span>
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
          <Section
            title={t(
              'components.SettingsProwlarr.indexerSearchLimits',
              'Search limits'
            )}
          >
            <p className="note">
              {t(
                'components.SettingsProwlarr.indexerSearchLimitsDescription',
                'Limit each user’s searches per minute overall and for each selected indexer.'
              )}
            </p>
            <div className="setlist">
              {limitIds.map((id) => (
                <label className="set cfg-row" key={id}>
                  <span>
                    {t(
                      'lumen.adminProwlarr.searchLimitLabel',
                      '{indexer} Search Limit',
                      {
                        indexer:
                          names.get(id) ??
                          t('lumen.adminProwlarr.indexer', 'Indexer {id}', {
                            id,
                          }),
                      }
                    )}
                  </span>
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
              {t(
                'lumen.adminProwlarr.invalidSettings',
                'Check the port, search limits, category IDs and indexer assignments.'
              )}
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
              {t('components.SettingsProwlarr.save', 'Save Prowlarr settings')}
            </button>
            <button
              className="btn btn-quiet btn-sm"
              type="button"
              disabled={busy || !canTest}
              onClick={() => void submit(true)}
            >
              {t(
                'components.SettingsProwlarr.test',
                'Test connection and inspect coverage'
              )}
            </button>
          </div>
        </form>
      </Section>
      <Section
        title={t(
          'components.SettingsProwlarr.diagnosticTitle',
          'Indexer connection results'
        )}
      >
        <ServiceNote
          error={coverage.error}
          what={t('components.SettingsProwlarr.title', 'Prowlarr indexers')}
          retry={coverage.reload}
        />
        {result || coverage.data ? (
          <Diagnostics coverage={(result ?? coverage.data)!} />
        ) : !saved.apiKeyConfigured || !saved.hostname ? (
          <p className="note">
            {t(
              'components.SettingsProwlarr.noIndexerInventory',
              'Test the Prowlarr connection to load its indexers and assign them by category.'
            )}
          </p>
        ) : (
          !coverage.error && (
            <p className="note" role="status">
              {t('lumen.adminProwlarr.loadingIndexers', 'Loading indexers…')}
            </p>
          )
        )}
      </Section>
    </>
  );
}

export default function AdminProwlarr({
  inSetup = false,
}: { inSetup?: boolean } = {}) {
  const { t } = useLumenLocale();
  const settings = useApi<Settings>(path);
  return (
    <>
      {!inSetup && (
        <header className="ph">
          <h1>{t('components.SettingsProwlarr.title', 'Prowlarr indexers')}</h1>
          <div className="toolbar">
            <Link className="btn btn-quiet btn-sm" to="/admin">
              {t('lumen.admin.title', 'Administration')}
            </Link>
          </div>
        </header>
      )}
      <ServiceNote
        error={settings.error}
        what={t('components.SettingsProwlarr.title', 'Prowlarr indexers')}
        retry={settings.reload}
      />
      {settings.data ? (
        <ConnectionForm initial={settings.data} />
      ) : (
        !settings.error && (
          <p className="note" role="status">
            {t(
              'lumen.adminProwlarr.loadingSettings',
              'Loading Prowlarr settings…'
            )}
          </p>
        )
      )}
    </>
  );
}
