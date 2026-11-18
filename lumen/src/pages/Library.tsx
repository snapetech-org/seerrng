import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import LibraryRepair from '../components/LibraryRepair';
import PersonalIdentityPacks from '../components/PersonalIdentityPacks';
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

interface LibraryItem {
  id: string;
  title: string;
  year?: number;
  mediaType?: 'movie' | 'tv';
  tmdbId?: number;
  status?: string;
  rating?: number;
  progress?: number;
  totalEpisodes?: number;
}

interface LibraryResult {
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

function LibraryRows({ data }: { data: LibraryResult }) {
  if (!data.items.length)
    return <p className="note">No titles match this shelf.</p>;
  return (
    <ul className="setlist">
      {data.items.map((item) => {
        const mapped =
          (item.mediaType === 'movie' || item.mediaType === 'tv') &&
          Number.isSafeInteger(item.tmdbId) &&
          (item.tmdbId ?? 0) > 0;
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
              {mapped ? (
                <Link className="go" to={`/${item.mediaType}/${item.tmdbId}`}>
                  {item.title}
                </Link>
              ) : (
                <b>{item.title}</b>
              )}
              {summary && <small>{summary}</small>}
            </div>
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
  const [shelf, setShelf] = useState<Shelf>(
    source === 'trakt' ? 'watched' : 'all'
  );
  const [mediaType, setMediaType] = useState('');
  const [libraryId, setLibraryId] = useState('');
  const [cursors, setCursors] = useState([0]);
  const page = cursors.length;
  const [libraries, setLibraries] = useState<LibraryResult['libraries']>();
  const selectedLibrary = libraryId || libraries?.[0]?.id;
  const params = new URLSearchParams({ shelf, page: String(page) });
  if (native) {
    params.set('cursor', String(cursors[page - 1]));
    if (selectedLibrary) params.set('libraryId', selectedLibrary);
  } else if (mediaType) {
    params.set('mediaType', mediaType);
  }
  const path = `${BASE}/library/${source}?${params}`;

  function changeFilter(update: () => void) {
    update();
    setCursors([0]);
  }

  return (
    <>
      <div className="toolbar">
        <label className="sel">
          <span className="lbl">Shelf</span>
          <select
            value={shelf}
            onChange={(event) =>
              changeFilter(() => setShelf(event.target.value as Shelf))
            }
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
                  changeFilter(() => setLibraryId(event.target.value))
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
                changeFilter(() => setMediaType(event.target.value))
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
        repairPath={native ? undefined : `${BASE}/library/${source}/repair`}
        shelf={shelf}
        mediaType={mediaType}
        setLibraries={setLibraries}
        choosingLibrary={native && !selectedLibrary}
        previous={() => setCursors(cursors.slice(0, -1))}
        next={(cursor) => setCursors([...cursors, cursor])}
      />
    </>
  );
}

function LibraryPage({
  path,
  matchRevision,
  page,
  native,
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
  repairPath?: string;
  shelf: Shelf;
  mediaType: string;
  setLibraries: (libraries: LibraryResult['libraries']) => void;
  choosingLibrary: boolean;
  previous: () => void;
  next: (cursor: number) => void;
}) {
  const { data, error, reload, refresh } = useApi<LibraryResult>(path, {
    currentPathOnly: true,
    keepDuringRefresh: true,
  });
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
      <ServiceNote error={error} what="your library" retry={reload} />
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
          <LibraryRows data={data} />
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
  const [source, setSource] = useState<Source>();
  const nativeSource = connections.data?.mediaServer;
  const sources = [
    ...(nativeSource?.connected ? [nativeSource.provider] : []),
    ...(connections.data?.accounts ?? []).map((account) => account.provider),
  ];
  const current = source && sources.includes(source) ? source : sources[0];
  return (
    <>
      <header className="ph">
        <h1>My Media</h1>
      </header>
      <ServiceNote
        error={connections.error}
        what="connected accounts"
        retry={connections.reload}
      />
      {!connections.data && !connections.error && (
        <p className="note" role="status">
          Loading connected accounts…
        </p>
      )}
      {connections.data && !current && (
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
                onChange={(event) => setSource(event.target.value as Source)}
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
