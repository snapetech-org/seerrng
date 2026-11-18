import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import IdentityMapping, {
  type MappingCandidate,
  videoHref,
} from '../components/IdentityMapping';
import LibraryRepair from '../components/LibraryRepair';
import LibraryTracking from '../components/LibraryTracking';
import PersonalIdentityPacks from '../components/PersonalIdentityPacks';
import ProviderFailure from '../components/ProviderFailure';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';

const BASE = '/integrations/discovery';
const SOURCE_NAMES = {
  plex: 'Plex',
  jellyfin: 'Jellyfin',
  emby: 'Emby',
  trakt: 'Trakt',
  anilist: 'AniList',
  simkl: 'Simkl',
};
type Source = keyof typeof SOURCE_NAMES;
type NativeSource = 'plex' | 'jellyfin' | 'emby';
type TrackingSource = Exclude<Source, NativeSource>;

interface Connections {
  accounts: { provider: TrackingSource }[];
  mediaServer: { provider: NativeSource; connected: boolean } | null;
}

interface LibraryItem extends MappingCandidate {
  sourceId?: string;
  status?: string;
  rating?: number;
  progress?: number;
  totalEpisodes?: number;
}

interface LibraryResult {
  allowWrites?: boolean;
  items: LibraryItem[];
  libraries?: { id: string; name: string }[];
  hasMore: boolean;
  nextCursor?: number;
  missingMappings: number;
  truncated: boolean;
}

const SHELF_LABELS = {
  all: 'All Titles',
  watched: 'Watched',
  unwatched: 'Unwatched',
  'in-progress': 'In Progress',
  watchlist: 'Watchlist',
  completed: 'Completed',
  rated: 'Rated',
};
type Shelf = keyof typeof SHELF_LABELS;

const isNative = (source: Source): source is NativeSource =>
  source === 'plex' || source === 'jellyfin' || source === 'emby';

function LibraryRows({
  data,
  updated,
  provider,
}: {
  provider?: TrackingSource;
  data: LibraryResult;
  updated: () => void;
}) {
  if (!data.items.length)
    return <p className="note">No titles match this shelf.</p>;
  return (
    <ul className="setlist">
      {data.items.map((item) => {
        const href = videoHref(item);
        const summary = [
          item.year,
          item.status,
          item.rating !== undefined ? `Rating: ${item.rating}/10` : '',
          item.progress !== undefined
            ? `${item.progress}${item.totalEpisodes === undefined ? '' : ` of ${item.totalEpisodes}`} episodes`
            : '',
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <li className="set" key={item.id}>
            <div>
              {href ? (
                <Link className="go" to={href}>
                  {item.title}
                </Link>
              ) : (
                <b>{item.title}</b>
              )}
              {summary && <small>{summary}</small>}
            </div>
            <IdentityMapping item={item} updated={updated} />
            {provider && data.allowWrites === true && (
              <LibraryTracking
                item={item}
                provider={provider}
                updated={updated}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function LibraryShelf({
  source,
  matchRevision,
}: {
  source: Source;
  matchRevision: number;
}) {
  const native = isNative(source);
  const shelves: Shelf[] = native
    ? ['all', 'watched', 'unwatched', 'in-progress']
    : source === 'trakt'
      ? ['watched', 'watchlist', 'rated']
      : ['all', 'watchlist', 'in-progress', 'completed', 'rated'];
  const [bookmark, setBookmark] = useSearchParams();
  const shelf =
    shelves.find((value) => value === bookmark.get('shelf')) ?? shelves[0];
  const requestedType = bookmark.get('mediaType');
  const mediaType =
    !native && (requestedType === 'movie' || requestedType === 'tv')
      ? requestedType
      : '';
  const libraryId = bookmark.get('libraryId');
  const [libraries, setLibraries] = useState<LibraryResult['libraries']>();
  const selectedLibrary = native
    ? (libraries?.find(({ id }) => id === libraryId) ?? libraries?.[0])?.id
    : undefined;
  const scope = JSON.stringify([shelf, mediaType, selectedLibrary]);
  const [paging, setPaging] = useState({ scope, cursors: [0] });
  const cursors = paging.scope === scope ? paging.cursors : [0];
  const page = cursors.length;
  const params = new URLSearchParams({ shelf, page: String(page) });
  if (native) {
    params.set('cursor', String(cursors[page - 1]));
    if (selectedLibrary) params.set('libraryId', selectedLibrary);
  } else if (mediaType) {
    params.set('mediaType', mediaType);
  }
  const path = `${BASE}/library/${source}?${params}`;

  function changeFilter(key: string, value: string) {
    const next = new URLSearchParams(bookmark);
    next.set('source', source);
    if (value) next.set(key, value);
    else next.delete(key);
    setPaging({ scope, cursors: [0] });
    setBookmark(next);
  }

  return (
    <>
      <div className="toolbar">
        <label className="sel">
          <span className="lbl">Shelf</span>
          <select
            value={shelf}
            onChange={(event) => changeFilter('shelf', event.target.value)}
          >
            {shelves.map((value) => (
              <option key={value} value={value}>
                {SHELF_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        {native ? (
          !!libraries?.length && (
            <label className="sel">
              <span className="lbl">Library</span>
              <select
                value={selectedLibrary}
                onChange={(event) =>
                  changeFilter('libraryId', event.target.value)
                }
              >
                {libraries.map(({ id, name }) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )
        ) : (
          <label className="sel">
            <span className="lbl">Media Type</span>
            <select
              value={mediaType}
              onChange={(event) =>
                changeFilter('mediaType', event.target.value)
              }
            >
              <option value="">Movies and Series</option>
              <option value="movie">Movies</option>
              <option value="tv">Series</option>
            </select>
          </label>
        )}
      </div>
      <LibraryPage
        path={path}
        matchRevision={matchRevision}
        page={page}
        native={native}
        trackingProvider={isNative(source) ? undefined : source}
        repairPath={native ? undefined : `${BASE}/library/${source}/repair`}
        shelf={shelf}
        mediaType={mediaType}
        setLibraries={setLibraries}
        choosingLibrary={native && !selectedLibrary}
        previous={() => setPaging({ scope, cursors: cursors.slice(0, -1) })}
        next={(cursor) => setPaging({ scope, cursors: [...cursors, cursor] })}
      />
    </>
  );
}

function LibraryPage({
  path,
  matchRevision,
  page,
  native,
  trackingProvider,
  repairPath,
  shelf,
  mediaType,
  setLibraries,
  choosingLibrary,
  previous,
  next,
}: {
  path: string;
  matchRevision: number;
  page: number;
  native: boolean;
  trackingProvider?: TrackingSource;
  repairPath?: string;
  shelf: Shelf;
  mediaType: string;
  setLibraries: (libraries: LibraryResult['libraries']) => void;
  choosingLibrary: boolean;
  previous: () => void;
  next: (cursor: number) => void;
}) {
  const {
    data: response,
    error: requestError,
    apiError,
    reload,
    refresh,
  } = useApi<LibraryResult>(path, {
    currentPathOnly: true,
    keepDuringRefresh: true,
  });
  const data =
    response &&
    Array.isArray(response.items) &&
    response.items.every(
      (item) => typeof item?.id === 'string' && typeof item.title === 'string'
    ) &&
    (response.libraries === undefined ||
      (Array.isArray(response.libraries) &&
        response.libraries.every(
          (library) =>
            typeof library?.id === 'string' && typeof library.name === 'string'
        )))
      ? response
      : null;
  const error =
    requestError || (response && !data ? 'Invalid library response.' : null);
  const previousRevision = useRef(matchRevision);
  useEffect(() => {
    if (previousRevision.current !== matchRevision) {
      previousRevision.current = matchRevision;
      refresh();
    }
  }, [matchRevision, refresh]);
  useEffect(() => {
    if (data) setLibraries(data.libraries);
  }, [data, setLibraries]);

  return (
    <>
      {repairPath && (
        <LibraryRepair
          key={`${repairPath}:${shelf}:${mediaType}`}
          path={repairPath}
          shelf={shelf}
          mediaType={mediaType || undefined}
          reload={refresh}
        />
      )}
      {error && (
        <ProviderFailure
          key={`${path}:${apiError?.retryAt ?? ''}`}
          error={error}
          what="your library"
          provider={trackingProvider}
          code={apiError?.code}
          retryAt={apiError?.retryAt}
          retry={reload}
        />
      )}
      {!data && !error && (
        <p className="note" role="status">
          Loading your library…
        </p>
      )}
      {data && choosingLibrary && !data.libraries?.length && (
        <p className="note">No media server libraries are available.</p>
      )}
      {data && !choosingLibrary && (
        <>
          {trackingProvider && data.allowWrites === false && (
            <p className="note">
              Want to update tracking from My Media?{' '}
              <Link to="/me/account/linked-accounts">
                Enable writes in Linked Accounts
              </Link>
              .
            </p>
          )}
          {!!data.missingMappings && (
            <p className="note">
              Some titles do not have a confirmed catalog match.
            </p>
          )}
          {data.truncated && (
            <p className="note" role="status">
              This library reached its result limit.
            </p>
          )}
          <LibraryRows
            data={data}
            provider={trackingProvider}
            updated={refresh}
          />
        </>
      )}
      <nav className="toolbar" aria-label="Library Pages">
        <button
          className="btn btn-quiet btn-sm"
          disabled={page === 1}
          onClick={previous}
        >
          Previous Page
        </button>
        <span className="note">Page {page}</span>
        <button
          className="btn btn-quiet btn-sm"
          disabled={
            choosingLibrary ||
            page >= 500 ||
            !data?.hasMore ||
            (native && data.nextCursor === undefined)
          }
          onClick={() => next(data?.nextCursor ?? 0)}
        >
          Next Page
        </button>
      </nav>
    </>
  );
}

export default function Library() {
  const connections = useApi<Connections>(`${BASE}/accounts`);
  const [matchRevision, setMatchRevision] = useState(0);
  const [bookmark, setBookmark] = useSearchParams();
  const data = Array.isArray(connections.data?.accounts)
    ? connections.data
    : null;
  const error =
    connections.error ||
    (connections.data && !data ? 'Invalid connected accounts response.' : null);
  const nativeSource = data?.mediaServer;
  const sources = [
    ...(nativeSource?.connected === true && isNative(nativeSource.provider)
      ? [nativeSource.provider]
      : []),
    ...(data?.accounts ?? []).flatMap((account) => {
      const provider = account?.provider;
      return provider === 'trakt' ||
        provider === 'anilist' ||
        provider === 'simkl'
        ? [provider]
        : [];
    }),
  ];
  const current =
    sources.find((source) => source === bookmark.get('source')) ?? sources[0];
  return (
    <>
      <header className="ph">
        <h1>My Media</h1>
      </header>
      <ServiceNote
        error={error}
        what="connected accounts"
        retry={connections.reload}
      />
      {!data && !error && (
        <p className="note" role="status">
          Loading connected accounts…
        </p>
      )}
      {data && !current && (
        <div className="toolbar">
          <p className="note">
            Link a media server or tracking account to browse your library.
          </p>
          <Link
            className="btn btn-tonal btn-sm"
            to="/me/account/linked-accounts"
          >
            Open Linked Accounts
          </Link>
        </div>
      )}
      <PersonalIdentityPacks
        onImported={() => setMatchRevision((revision) => revision + 1)}
      />
      {current && (
        <>
          <div className="toolbar">
            <label className="sel">
              <span className="lbl">Library Source</span>
              <select
                value={current}
                onChange={(event) => {
                  const next = new URLSearchParams(bookmark);
                  next.set('source', event.target.value);
                  next.delete('shelf');
                  next.delete('mediaType');
                  next.delete('libraryId');
                  setBookmark(next);
                }}
              >
                {sources.map((value) => (
                  <option key={value} value={value}>
                    {SOURCE_NAMES[value]}
                  </option>
                ))}
              </select>
            </label>
            <Link
              className="btn btn-quiet btn-sm"
              to="/me/account/linked-accounts"
            >
              Manage Linked Accounts
            </Link>
          </div>
          <LibraryShelf
            key={current}
            source={current}
            matchRevision={matchRevision}
          />
        </>
      )}
    </>
  );
}
