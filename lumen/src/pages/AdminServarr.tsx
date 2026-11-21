import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { SavedConnectionHost } from '../components/SavedConnectionHost';
import { useApi } from '../hooks';
import { sessionGeneration } from '../sessionState';

type Provider =
  | 'radarr'
  | 'sonarr'
  | 'lidarr'
  | 'whisparr'
  | 'readarr'
  | 'lazylibrarian'
  | 'mylar'
  | 'kapowarr'
  | 'backissue'
  | 'sportarr';
const names = {
  radarr: 'Radarr',
  sonarr: 'Sonarr',
  lidarr: 'Lidarr',
  whisparr: 'Whisparr',
  readarr: 'Book and Audiobook',
  lazylibrarian: 'LazyLibrarian',
  mylar: 'Mylar',
  kapowarr: 'Kapowarr',
  backissue: 'BackIssue',
  sportarr: 'Sportarr',
};
const ports = {
  radarr: 7878,
  sonarr: 8989,
  lidarr: 8686,
  whisparr: 6969,
  readarr: 8787,
  lazylibrarian: 5299,
  mylar: 8090,
  kapowarr: 5656,
  backissue: 8787,
  sportarr: 1867,
};
interface Service {
  id?: number;
  name: string;
  hostname: string;
  port: number;
  apiKey: string;
  baseUrl?: string;
  externalUrl?: string;
  useSsl: boolean;
  activeProfileId: number;
  activeProfileName?: string;
  activeDirectory: string;
  rootFolder?: string;
  isDefault?: boolean;
  is4k?: boolean;
  syncEnabled?: boolean;
  preventSearch?: boolean;
  tagRequests?: boolean;
  requestButtonAnimeOnly?: boolean;
  requestButtonLabel?: string;
  downloadQueueSize?: number;
  minimumAvailability?: string;
  activeMetadataProfileId?: number;
  activeMetadataProfileName?: string;
  backend?: 'readarr' | 'bindery' | 'bookorbit';
  serviceType?: 'ebook' | 'audiobook' | 'both';
  bookorbitUsername?: string;
  binderyUserMappings?: Record<string, number>;
  seriesType?: string;
  animeSeriesType?: string;
  activeAnimeProfileId?: number;
  activeAnimeProfileName?: string;
  activeAnimeDirectory?: string;
  activeLanguageProfileId?: number;
  activeAnimeLanguageProfileId?: number;
  defaultMetadataLanguageId?: number | null;
  defaultSeasonType?: string;
  enableSeasonFolders?: boolean;
  monitorNewItems?: string;
  animeTags?: number[];
  tags?: number[];
  syncExcludedTags?: number[];
}
interface Options {
  profiles: { id: number; name: string }[];
  rootFolders: { id: number; path: string }[];
  tags: { id: number; label: string }[];
  languageProfiles?: { id: number; name: string }[] | null;
  metadataProfiles?: { id: number; name: string }[];
  metadataLanguages?: { id: number; name: string }[] | null;
}

interface BookDiagnostic {
  ok: boolean;
  message: string;
  detailMessage?: string;
  provider?: string;
  metadataSource?: string;
  providerNotice?: string;
  legacyWarning?: string;
}

const empty: Service = {
  name: '',
  hostname: '',
  port: 7878,
  apiKey: '',
  useSsl: false,
  activeProfileId: 0,
  activeDirectory: '',
};
const connectionFields = [
  ['name', 'Service Name', 'text'],
  ['hostname', 'Hostname', 'text'],
  ['port', 'Port', 'number'],
  ['baseUrl', 'Base Path', 'text'],
  ['externalUrl', 'External URL', 'url'],
  ['apiKey', 'API Key', 'password'],
] as const;
const flags = [
  ['useSsl', 'Use HTTPS'],
  ['isDefault', 'Default Server'],
  ['is4k', '4K Server'],
  ['syncEnabled', 'Sync Library'],
  ['preventSearch', 'Skip Automatic Search'],
  ['tagRequests', 'Tag Requests'],
  ['requestButtonAnimeOnly', 'Show Request Button for Anime Only'],
] as const;

function ServiceForm({
  provider,
  initial,
  done,
}: {
  provider: Provider;
  initial: Service;
  done: () => void;
}) {
  const name = names[provider];
  const isSportarr = provider === 'sportarr';
  const isSonarr = provider === 'sonarr';
  const video = isSonarr || provider === 'radarr';
  const isBook = provider === 'readarr';
  const isLazyLibrarian = provider === 'lazylibrarian';
  const comicCollector = provider === 'mylar' || provider === 'kapowarr';
  const collector =
    isLazyLibrarian || comicCollector || provider === 'backissue';
  const hasMetadata = provider === 'lidarr' || isBook;
  const endpoint = `/settings/${provider}`;
  const [draft, setDraft] = useState({ ...initial, apiKey: '' });
  const [options, setOptions] = useState<Options>();
  const [mappingText, setMappingText] = useState(() =>
    JSON.stringify(initial.binderyUserMappings ?? {}, null, 2)
  );
  const backend = draft.backend ?? 'readarr';
  const managed = isBook && backend !== 'readarr';
  const usesProfiles = !managed && !collector;
  const bookorbit = backend === 'bookorbit';
  let mappings: Record<string, number> | undefined;
  if (backend === 'bindery') {
    try {
      const parsed = JSON.parse(mappingText);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const entries = Object.entries(parsed);
        if (
          entries.length <= 1000 &&
          entries.every(
            ([source, destination]) =>
              /^[1-9][0-9]{0,9}$/.test(source) &&
              Number(source) <= 2_147_483_647 &&
              typeof destination === 'number' &&
              Number.isSafeInteger(destination) &&
              destination >= 1 &&
              destination <= 2_147_483_647
          )
        )
          mappings = Object.fromEntries(entries) as Record<string, number>;
      }
    } catch {
      // Keep an invalid draft editable until the administrator corrects it.
    }
  }
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const [failure, setFailure] = useState('');
  const [diagnostic, setDiagnostic] = useState<BookDiagnostic>();
  const pending = useRef(false);
  const path =
    initial.id === undefined ? endpoint : `${endpoint}/${initial.id}`;
  const key = draft.apiKey || (initial.apiKey ? '[REDACTED]' : '');
  const connection = {
    id: initial.id,
    hostname: draft.hostname,
    port: draft.port,
    apiKey: key,
    baseUrl: draft.baseUrl,
    useSsl: draft.useSsl,
    ...(isBook
      ? {
          backend,
          serviceType: draft.serviceType ?? 'ebook',
          ...(bookorbit
            ? { bookorbitUsername: draft.bookorbitUsername?.trim() }
            : {}),
        }
      : {}),
  };
  const connected =
    (!bookorbit || !!draft.bookorbitUsername?.trim()) &&
    !!draft.hostname.trim() &&
    !!key &&
    Number.isInteger(draft.port) &&
    draft.port >= 1 &&
    draft.port <= 65535;
  const fieldsChanged =
    JSON.stringify(draft) !== JSON.stringify({ ...initial, apiKey: '' }) ||
    (backend === 'bindery' &&
      JSON.stringify(mappings) !==
        JSON.stringify(initial.binderyUserMappings ?? {}));
  const configurationValid =
    !!draft.name.trim() &&
    (!usesProfiles
      ? (backend !== 'bindery' || mappings !== undefined) &&
        (provider !== 'kapowarr' || !!draft.rootFolder?.trim())
      : draft.activeProfileId > 0 &&
        (isSportarr || !!draft.activeDirectory) &&
        (!hasMetadata ||
          !options?.metadataProfiles?.length ||
          options.metadataProfiles.some(
            ({ id }) => id === draft.activeMetadataProfileId
          )) &&
        (!options ||
          (options.profiles.some(({ id }) => id === draft.activeProfileId) &&
            (isSportarr ||
              options.rootFolders.some(
                ({ path }) => path === draft.activeDirectory
              )))));
  const optionsRequired =
    initial.id === undefined ||
    draft.hostname !== initial.hostname ||
    draft.port !== initial.port ||
    draft.baseUrl !== initial.baseUrl ||
    draft.useSsl !== initial.useSsl ||
    draft.backend !== initial.backend ||
    draft.serviceType !== initial.serviceType ||
    draft.bookorbitUsername !== initial.bookorbitUsername ||
    !!draft.apiKey;

  function change(patch: Partial<Service>) {
    setDraft((previous) => ({ ...previous, ...patch }));
    setFailure('');
    setDiagnostic(undefined);
    if (
      [
        'hostname',
        'port',
        'baseUrl',
        'useSsl',
        'apiKey',
        'backend',
        'serviceType',
        'bookorbitUsername',
      ].some((field) => field in patch)
    )
      setOptions(undefined);
  }

  async function run(action: () => Promise<void>, error: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFailure('');
    const generation = sessionGeneration();
    try {
      await action();
    } catch {
      if (generation === sessionGeneration()) setFailure(error);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function testConnection() {
    if (!connected) return;
    const generation = sessionGeneration();
    void run(async () => {
      const result = await api<Options>(`${endpoint}/test`, {
        method: 'POST',
        body: JSON.stringify(connection),
      });
      if (generation === sessionGeneration()) setOptions(result);
    }, `Could not test ${name}. Check the address and API key.`);
  }

  function diagnose() {
    if (!connected || !isBook || managed) return;
    const generation = sessionGeneration();
    setDiagnostic(undefined);
    void run(async () => {
      let result: BookDiagnostic;
      try {
        result = await api<BookDiagnostic>(`${endpoint}/diagnose`, {
          method: 'POST',
          body: JSON.stringify({
            ...connection,
            term: 'isbn:9780547928227',
            activeDirectory: draft.activeDirectory || undefined,
            activeProfileId: draft.activeProfileId || undefined,
            activeMetadataProfileId: draft.activeMetadataProfileId,
          }),
        });
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        result = { ok: false, message: error.message };
      }
      if (generation === sessionGeneration()) setDiagnostic(result);
    }, 'Could not run the book metadata diagnostic. Try again.');
  }

  function save() {
    if (!connected || !configurationValid || (optionsRequired && !options))
      return;
    const generation = sessionGeneration();
    void run(async () => {
      await api(path, {
        method: initial.id === undefined ? 'POST' : 'PUT',
        body: JSON.stringify(
          collector
            ? {
                ...connection,
                name: draft.name,
                externalUrl: draft.externalUrl,
                tags: draft.tags ?? [],
                rootFolder: comicCollector
                  ? draft.rootFolder?.trim() || undefined
                  : undefined,
                isDefault: draft.isDefault ?? false,
                syncEnabled: draft.syncEnabled ?? false,
                preventSearch: draft.preventSearch ?? false,
              }
            : {
                ...draft,
                ...(isSonarr
                  ? {
                      seriesType: draft.seriesType ?? 'standard',
                      animeSeriesType: draft.animeSeriesType ?? 'anime',
                      monitorNewItems: draft.monitorNewItems ?? 'all',
                      activeAnimeProfileName:
                        draft.activeAnimeProfileId === undefined
                          ? undefined
                          : (options?.profiles.find(
                              ({ id }) => id === draft.activeAnimeProfileId
                            )?.name ?? draft.activeAnimeProfileName),
                    }
                  : provider === 'radarr'
                    ? {
                        minimumAvailability:
                          draft.minimumAvailability ?? 'released',
                      }
                    : {
                        is4k: false,
                        ...(hasMetadata
                          ? {
                              activeMetadataProfileId:
                                draft.activeMetadataProfileId,
                              activeMetadataProfileName:
                                options?.metadataProfiles?.find(
                                  ({ id }) =>
                                    id === draft.activeMetadataProfileId
                                )?.name ?? draft.activeMetadataProfileName,
                            }
                          : {}),
                      }),
                apiKey: key,
                activeProfileName: managed
                  ? bookorbit
                    ? 'BookOrbit managed'
                    : 'Bindery managed'
                  : (options?.profiles.find(
                      ({ id }) => id === draft.activeProfileId
                    )?.name ?? draft.activeProfileName),
                ...(isBook
                  ? { backend, serviceType: draft.serviceType ?? 'ebook' }
                  : {}),
                ...(managed
                  ? {
                      activeProfileId: 0,
                      activeMetadataProfileId: 0,
                      activeMetadataProfileName: bookorbit
                        ? 'BookOrbit managed'
                        : 'Bindery managed',
                      activeDirectory: '/',
                      preventSearch: true,
                      tagRequests: false,
                      ...(bookorbit
                        ? { bookorbitUsername: draft.bookorbitUsername?.trim() }
                        : { binderyUserMappings: mappings }),
                    }
                  : {}),
              }
        ),
      });
      if (generation === sessionGeneration()) done();
    }, `Could not save the ${name} service.`);
  }

  function remove() {
    if (!confirmation || initial.id === undefined) return;
    const generation = sessionGeneration();
    void run(async () => {
      await api(path, { method: 'DELETE' }, 'empty');
      if (generation === sessionGeneration()) done();
    }, `Could not remove the ${name} service.`);
  }

  return (
    <Section
      title={
        initial.id === undefined
          ? `Add ${name} Service`
          : `Edit ${initial.name}`
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <div className="setlist">
          {isBook && (
            <>
              <label className="set cfg-row">
                <span>Backend</span>
                <select
                  className="cfg-select"
                  disabled={busy || initial.id !== undefined}
                  value={backend}
                  onChange={(event) => {
                    const selected = event.target.value as Service['backend'];
                    change({
                      backend: selected,
                      port: selected === 'bookorbit' ? 3000 : 8787,
                      serviceType: 'ebook',
                      activeProfileId: 0,
                      activeDirectory: '',
                      activeMetadataProfileId: undefined,
                    });
                  }}
                >
                  <option value="readarr">
                    ChaptarrNG or Readarr-Compatible
                  </option>
                  <option value="bindery">Bindery</option>
                  <option value="bookorbit">BookOrbit</option>
                </select>
              </label>
              <label className="set cfg-row">
                <span>Book Format</span>
                <select
                  className="cfg-select"
                  disabled={busy}
                  value={draft.serviceType ?? 'ebook'}
                  onChange={(event) =>
                    change({
                      serviceType: event.target.value as Service['serviceType'],
                      ...(managed
                        ? {}
                        : {
                            activeProfileId: 0,
                            activeDirectory: '',
                            activeMetadataProfileId: undefined,
                          }),
                    })
                  }
                >
                  <option value="ebook">Ebook</option>
                  <option value="audiobook">Audiobook</option>
                  {managed && <option value="both">Both Formats</option>}
                </select>
              </label>
              {bookorbit && (
                <label className="set cfg-row">
                  <span>BookOrbit Username</span>
                  <input
                    className="cfg-input"
                    value={draft.bookorbitUsername ?? ''}
                    disabled={busy}
                    onChange={(event) =>
                      change({ bookorbitUsername: event.target.value })
                    }
                  />
                </label>
              )}
            </>
          )}
          <SavedConnectionHost
            disabled={busy}
            onSelect={(hostname) => change({ hostname })}
          />
          {connectionFields.map(([field, label, type]) => (
            <label className="set cfg-row" key={field}>
              <span>
                {field === 'apiKey' && bookorbit ? 'BookOrbit Password' : label}
              </span>
              <input
                className="cfg-input"
                type={type}
                disabled={busy}
                value={draft[field] ?? ''}
                placeholder={
                  field === 'apiKey' && initial.apiKey ? 'Saved key' : undefined
                }
                autoComplete={field === 'apiKey' ? 'new-password' : undefined}
                onChange={(event) =>
                  change({
                    [field]:
                      type === 'number'
                        ? Number(event.target.value)
                        : event.target.value,
                  })
                }
              />
            </label>
          ))}
          {comicCollector && (
            <label className="set cfg-row">
              <span>Root Folder</span>
              <input
                className="cfg-input"
                value={draft.rootFolder ?? ''}
                required={provider === 'kapowarr'}
                disabled={busy}
                onChange={(event) => change({ rootFolder: event.target.value })}
              />
            </label>
          )}
          {flags
            .filter(([field]) =>
              isSportarr
                ? field === 'useSsl' || field === 'isDefault'
                : video ||
                  (field !== 'is4k' &&
                    field !== 'requestButtonAnimeOnly' &&
                    (!(isBook || collector) || field !== 'tagRequests') &&
                    (!(managed || provider === 'backissue') ||
                      field !== 'preventSearch'))
            )
            .map(([field, label]) => (
              <label className="set cfg-row" key={field}>
                <span>
                  {collector && field === 'syncEnabled'
                    ? 'Enable Library Scan'
                    : collector && field === 'preventSearch'
                      ? 'Search on Approval'
                      : label}
                </span>
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={
                    collector && field === 'preventSearch'
                      ? !draft.preventSearch
                      : draft[field] === true
                  }
                  onChange={(event) =>
                    change({
                      [field]:
                        collector && field === 'preventSearch'
                          ? !event.target.checked
                          : event.target.checked,
                    })
                  }
                />
              </label>
            ))}
          {isSonarr ? (
            <>
              {(
                [
                  [
                    'seriesType',
                    'Series Type',
                    'standard',
                    [
                      ['standard', 'Standard'],
                      ['daily', 'Daily'],
                      ['anime', 'Anime'],
                    ],
                  ],
                  [
                    'animeSeriesType',
                    'Anime Series Type',
                    'anime',
                    [
                      ['standard', 'Standard'],
                      ['daily', 'Daily'],
                      ['anime', 'Anime'],
                    ],
                  ],
                  [
                    'defaultSeasonType',
                    'Season Order',
                    'official',
                    [
                      ['official', 'Official'],
                      ['automatic', 'Automatic'],
                    ],
                  ],
                  [
                    'monitorNewItems',
                    'Monitor New Items',
                    'all',
                    [
                      ['all', 'All'],
                      ['none', 'None'],
                      ['latest', 'Latest Season'],
                    ],
                  ],
                ] as const
              ).map(([field, label, fallback, choices]) => (
                <label key={field} className="set cfg-row">
                  <span>{label}</span>
                  <select
                    className="cfg-select"
                    value={draft[field] ?? fallback}
                    disabled={busy}
                    onChange={(event) =>
                      change({ [field]: event.target.value })
                    }
                  >
                    {choices.map(([value, title]) => (
                      <option key={value} value={value}>
                        {title}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <label className="set cfg-row">
                <span>Enable Season Folders</span>
                <input
                  type="checkbox"
                  checked={draft.enableSeasonFolders === true}
                  disabled={busy}
                  onChange={(event) =>
                    change({ enableSeasonFolders: event.target.checked })
                  }
                />
              </label>
            </>
          ) : provider === 'radarr' ? (
            <label className="set cfg-row">
              <span>Minimum Availability</span>
              <select
                className="cfg-select"
                value={draft.minimumAvailability ?? 'released'}
                disabled={busy}
                onChange={(event) =>
                  change({ minimumAvailability: event.target.value })
                }
              >
                <option value="announced">Announced</option>
                <option value="inCinemas">In Cinemas</option>
                <option value="released">Released</option>
              </select>
            </label>
          ) : null}
          {!collector && !isSportarr && (
            <label className="set cfg-row">
              <span>Download Queue Size</span>
              <input
                className="cfg-input"
                type="number"
                value={draft.downloadQueueSize ?? 1000}
                disabled={busy}
                onChange={(event) =>
                  change({ downloadQueueSize: Number(event.target.value) })
                }
              />
            </label>
          )}
          {video && (
            <label className="set cfg-row">
              <span>Request Button Label</span>
              <input
                className="cfg-input"
                value={draft.requestButtonLabel ?? ''}
                disabled={busy}
                onChange={(event) =>
                  change({ requestButtonLabel: event.target.value })
                }
              />
            </label>
          )}
        </div>
        {isLazyLibrarian && (
          <p className="note">
            Use a write-enabled API key from LazyLibrarian under Config →
            Interface.
          </p>
        )}
        <div className="toolbar">
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={busy || !connected}
            onClick={testConnection}
          >
            Test {name}
          </button>
          {isBook && !managed && (
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={busy || !connected}
              onClick={diagnose}
            >
              Run Metadata Diagnostic
            </button>
          )}
        </div>
        {diagnostic && (
          <div className="note" role={diagnostic.ok ? 'status' : 'alert'}>
            <p>{diagnostic.message}</p>
            {diagnostic.detailMessage && <p>{diagnostic.detailMessage}</p>}
            {diagnostic.provider && <p>Provider: {diagnostic.provider}</p>}
            {diagnostic.metadataSource && (
              <p>Metadata source: {diagnostic.metadataSource}</p>
            )}
            {(diagnostic.providerNotice ?? diagnostic.legacyWarning) && (
              <p>{diagnostic.providerNotice ?? diagnostic.legacyWarning}</p>
            )}
          </div>
        )}
        {backend === 'bindery' && (
          <div className="setlist">
            <label className="set cfg-row">
              <span>Bindery User Mappings (JSON)</span>
              <textarea
                className="cfg-json"
                rows={5}
                disabled={busy}
                value={mappingText}
                onChange={(event) => setMappingText(event.target.value)}
              />
            </label>
          </div>
        )}
        {backend === 'bindery' && (
          <p className="note">
            {mappings === undefined
              ? 'Enter a JSON object with positive integer SeerrNG user IDs as keys and Bindery user IDs as values.'
              : 'Map SeerrNG user IDs to Bindery user IDs.'}
          </p>
        )}
        {options && !usesProfiles && (
          <p className="note" role="status">
            {name} connection verified.
          </p>
        )}
        {options && usesProfiles && (
          <>
            <p className="note" role="status">
              {name} connection verified.
            </p>
            <div className="setlist">
              <label className="set cfg-row">
                <span>Quality Profile</span>
                <select
                  className="cfg-select"
                  value={draft.activeProfileId}
                  disabled={busy}
                  onChange={(event) =>
                    change({ activeProfileId: Number(event.target.value) })
                  }
                >
                  <option value={0}>Choose a Profile</option>
                  {options.profiles.map(({ id, name }) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              {!isSportarr && (
                <label className="set cfg-row">
                  <span>Root Folder</span>
                  <select
                    className="cfg-select"
                    value={draft.activeDirectory}
                    disabled={busy}
                    onChange={(event) =>
                      change({ activeDirectory: event.target.value })
                    }
                  >
                    <option value="">Choose a Folder</option>
                    {options.rootFolders.map(({ id, path }) => (
                      <option key={id} value={path}>
                        {path}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {hasMetadata && options.metadataProfiles && (
              <div className="setlist">
                <label className="set cfg-row">
                  <span>Metadata Profile</span>
                  <select
                    className="cfg-select"
                    value={draft.activeMetadataProfileId ?? ''}
                    disabled={busy}
                    onChange={(event) =>
                      change({
                        activeMetadataProfileId: event.target.value
                          ? Number(event.target.value)
                          : undefined,
                        activeMetadataProfileName: undefined,
                      })
                    }
                  >
                    <option value="">Choose a Metadata Profile</option>
                    {options.metadataProfiles.map(({ id, name: title }) => (
                      <option key={id} value={id}>
                        {title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {isSonarr && (
              <div className="setlist">
                <label className="set cfg-row">
                  <span>Anime Root Folder</span>
                  <select
                    className="cfg-select"
                    value={draft.activeAnimeDirectory ?? ''}
                    disabled={busy}
                    onChange={(event) =>
                      change({ activeAnimeDirectory: event.target.value })
                    }
                  >
                    <option value="">Use Standard Root Folder</option>
                    {options.rootFolders.map(({ id, path }) => (
                      <option key={id} value={path}>
                        {path}
                      </option>
                    ))}
                  </select>
                </label>
                {(
                  [
                    [
                      'activeAnimeProfileId',
                      'Anime Quality Profile',
                      options.profiles,
                    ],
                    [
                      'activeLanguageProfileId',
                      'Series Language Profile',
                      options.languageProfiles,
                    ],
                    [
                      'activeAnimeLanguageProfileId',
                      'Anime Language Profile',
                      options.languageProfiles,
                    ],
                    [
                      'defaultMetadataLanguageId',
                      'Metadata Language',
                      options.metadataLanguages,
                    ],
                  ] as const
                ).map(([field, label, choices]) =>
                  choices ? (
                    <label className="set cfg-row" key={field}>
                      <span>{label}</span>
                      <select
                        className="cfg-select"
                        value={draft[field] ?? ''}
                        disabled={busy}
                        onChange={(event) =>
                          change({
                            [field]:
                              event.target.value === ''
                                ? field === 'defaultMetadataLanguageId'
                                  ? null
                                  : undefined
                                : Number(event.target.value),
                          })
                        }
                      >
                        <option value="">
                          {field === 'defaultMetadataLanguageId'
                            ? 'Automatic'
                            : 'Use Default'}
                        </option>
                        {choices.map(({ id, name: title }) => (
                          <option key={id} value={id}>
                            {title}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null
                )}
              </div>
            )}
            {(
              [
                ...(isBook || isSportarr ? [] : (['tags'] as const)),
                ...(video ? (['syncExcludedTags'] as const) : []),
                ...(isSonarr ? (['animeTags'] as const) : []),
              ] as const
            ).map((field) => (
              <details key={field} className="adv">
                <summary>
                  {field === 'tags'
                    ? 'Request Tags'
                    : field === 'animeTags'
                      ? 'Anime Request Tags'
                      : 'Exclude Tags From Sync'}
                </summary>
                <div className="setlist">
                  {options.tags.map(({ id, label }) => (
                    <label className="set cfg-row" key={id}>
                      <span>{label}</span>
                      <input
                        type="checkbox"
                        disabled={busy}
                        checked={draft[field]?.includes(id) ?? false}
                        onChange={(event) =>
                          change({
                            [field]: event.target.checked
                              ? [...(draft[field] ?? []), id]
                              : (draft[field]?.filter((tag) => tag !== id) ??
                                []),
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
              </details>
            ))}
          </>
        )}
        {failure && (
          <p className="note" role="alert">
            {failure}
          </p>
        )}
        <div className="toolbar">
          <button
            className="btn btn-primary btn-sm"
            disabled={
              busy ||
              !connected ||
              !fieldsChanged ||
              !configurationValid ||
              (optionsRequired && !options)
            }
          >
            Save {name}
          </button>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={busy}
            onClick={done}
          >
            Cancel
          </button>
          {initial.id !== undefined && (
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={busy}
              onClick={() => setConfirmation(true)}
            >
              Remove Service
            </button>
          )}
        </div>
        {confirmation && (
          <>
            <p className="note" role="alert">
              Remove {initial.name} as a request destination?
            </p>
            <div className="toolbar">
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                disabled={busy}
                onClick={remove}
              >
                Confirm Removal
              </button>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                disabled={busy}
                onClick={() => setConfirmation(false)}
              >
                Keep Service
              </button>
            </div>
          </>
        )}
      </form>
    </Section>
  );
}

export default function AdminServarr({
  provider,
  inSetup = false,
}: {
  provider: Provider;
  inSetup?: boolean;
}) {
  const name = names[provider];
  const services = useApi<Service[]>(`/settings/${provider}`);
  const [editing, setEditing] = useState<Service>();
  function done() {
    setEditing(undefined);
    services.reload();
  }
  return (
    <>
      {!inSetup && (
        <header className="ph">
          <h1>{name} Services</h1>
          <div className="toolbar">
            <Link className="btn btn-quiet btn-sm" to="/admin">
              Administration
            </Link>
          </div>
        </header>
      )}
      <ServiceNote
        error={services.error}
        what={`${name} services`}
        retry={services.reload}
      />
      {editing ? (
        <ServiceForm
          key={editing.id ?? 'new'}
          provider={provider}
          initial={editing}
          done={done}
        />
      ) : services.data ? (
        <Section title="Configured Services">
          <div className="toolbar">
            <button
              className="btn btn-primary btn-sm"
              onClick={() =>
                setEditing({
                  ...empty,
                  port: ports[provider],
                  ...(provider === 'whisparr' || provider === 'sportarr'
                    ? { isDefault: true }
                    : {}),
                  ...(provider === 'sportarr' ? { name } : {}),
                })
              }
            >
              Add {name}
            </button>
          </div>
          {services.data.length === 0 && (
            <p className="note">No {name} services configured.</p>
          )}
          <div className="setlist">
            {services.data.map((service) => (
              <div className="set cfg-row" key={service.id}>
                <span>
                  <b>{service.name}</b>
                  <small>
                    {service.is4k ? '4K' : 'Standard'}
                    {service.isDefault ? ' · Default' : ''}
                  </small>
                </span>
                <button
                  className="btn btn-quiet btn-sm"
                  onClick={() => setEditing(service)}
                >
                  Edit {service.name}
                </button>
              </div>
            ))}
          </div>
        </Section>
      ) : (
        !services.error && (
          <p className="note" role="status">
            Loading {name} services…
          </p>
        )
      )}
    </>
  );
}
