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
import { CategorySettingsNote, ServiceNote } from '../components/extra';
import { useExtras } from '../extras';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';

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
  all: ['library.all', 'All titles'],
  watched: ['library.watched', 'Watched'],
  unwatched: ['library.unwatched', 'Unwatched'],
  'in-progress': ['library.in-progress', 'In progress'],
  watchlist: ['library.watchlist', 'Watchlist'],
  completed: ['library.completed', 'Completed'],
  rated: ['library.rated', 'Rated'],
};
type Shelf = keyof typeof SHELF_LABELS;
const STATUS_LABELS: Record<string, [string, string]> = {
  watched: ['library.watchedState', 'Watched'],
  unwatched: ['library.unwatchedState', 'Unwatched'],
  completed: ['library.completedState', 'Completed'],
  planning: ['library.planning', 'Planning to watch'],
  watching: ['library.watching', 'Watching'],
  dropped: ['library.dropped', 'Dropped'],
};

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
  const { t } = useLumenLocale();
  if (!data.items.length)
    return (
      <p className="note">
        {t('library.empty', 'No titles match this shelf.')}
      </p>
    );
  return (
    <ul className="setlist">
      {data.items.map((item) => {
        const href = videoHref(item);
        const statusLabel = item.status
          ? (STATUS_LABELS[item.status] ?? ['', item.status])
          : undefined;
        const summary = [
          item.year,
          statusLabel ? t(statusLabel[0], statusLabel[1]) : '',
          item.rating !== undefined
            ? t('library.rating', 'Your rating: {rating}/10', {
                rating: item.rating,
              })
            : '',
          item.progress !== undefined
            ? item.totalEpisodes === undefined
              ? t('library.episodes', '{count} episodes watched', {
                  count: item.progress,
                })
              : t('library.total', '{count}/{total} episodes watched', {
                  count: item.progress,
                  total: item.totalEpisodes,
                })
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
  const { t } = useLumenLocale();
  const native = isNative(source);
  const extras = useExtras();
  const movieEnabled = extras.categoryEnabled('movie');
  const tvEnabled = extras.categoryEnabled('tv');
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
    !native &&
    ((requestedType === 'movie' && movieEnabled) ||
      (requestedType === 'tv' && tvEnabled))
      ? requestedType
      : '';
  const disabledScope =
    !native &&
    ((requestedType === 'movie' && !movieEnabled) ||
      (requestedType === 'tv' && !tvEnabled));
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
  const path =
    extras.ready && (movieEnabled || tvEnabled) && !disabledScope
      ? `${BASE}/library/${source}?${params}`
      : null;

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
      <CategorySettingsNote error={extras.error} retry={extras.retry} />
      <div className="toolbar">
        <label className="sel">
          <span className="lbl">{t('library.shelf', 'Shelf')}</span>
          <select
            value={shelf}
            onChange={(event) => changeFilter('shelf', event.target.value)}
          >
            {shelves.map((value) => (
              <option key={value} value={value}>
                {t(SHELF_LABELS[value][0], SHELF_LABELS[value][1])}
              </option>
            ))}
          </select>
        </label>
        {native ? (
          !!libraries?.length && (
            <label className="sel">
              <span className="lbl">
                {t('library.library', 'Media server library')}
              </span>
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
            <span className="lbl">{t('library.mediaType', 'Media type')}</span>
            <select
              value={mediaType}
              onChange={(event) =>
                changeFilter('mediaType', event.target.value)
              }
            >
              <option value="">
                {t('library.allTypes', 'Movies and series')}
              </option>
              {movieEnabled && (
                <option value="movie">{t('library.movies', 'Movies')}</option>
              )}
              {tvEnabled && (
                <option value="tv">{t('library.series', 'Series')}</option>
              )}
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
        movieEnabled={movieEnabled}
        tvEnabled={tvEnabled}
        disabledScope={disabledScope || (!movieEnabled && !tvEnabled)}
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
  movieEnabled,
  tvEnabled,
  disabledScope,
  setLibraries,
  choosingLibrary,
  previous,
  next,
}: {
  path: string | null;
  matchRevision: number;
  page: number;
  native: boolean;
  trackingProvider?: TrackingSource;
  repairPath?: string;
  shelf: Shelf;
  mediaType: string;
  movieEnabled: boolean;
  tvEnabled: boolean;
  disabledScope: boolean;
  setLibraries: (libraries: LibraryResult['libraries']) => void;
  choosingLibrary: boolean;
  previous: () => void;
  next: (cursor: number) => void;
}) {
  const { t } = useLumenLocale();
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
  const validResponse =
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
  const data = validResponse
    ? {
        ...validResponse,
        items: validResponse.items.filter(
          (item) =>
            (item.mediaType !== 'movie' || movieEnabled) &&
            (item.mediaType !== 'tv' || tvEnabled)
        ),
      }
    : null;
  const error =
    requestError ||
    (response
      ? data
        ? null
        : t('lumen.myMedia.invalidLibrary', 'Invalid library response.')
      : null);
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
          what={t('lumen.myMedia.yourLibrary', 'your library')}
          provider={trackingProvider}
          code={apiError?.code}
          retryAt={apiError?.retryAt}
          retry={reload}
        />
      )}
      {disabledScope ? (
        <p className="note" role="status">
          {t(
            'lumen.category.disabledForAccount',
            'This category is turned off for your account.'
          )}
        </p>
      ) : (
        !data &&
        !error && (
          <p className="note" role="status">
            {t('library.loading', 'Loading your library…')}
          </p>
        )
      )}
      {data && choosingLibrary && !data.libraries?.length && (
        <p className="note">
          {t(
            'lumen.myMedia.noLibraries',
            'No media server libraries are available.'
          )}
        </p>
      )}
      {data && !choosingLibrary && (
        <>
          {trackingProvider && data.allowWrites === false && (
            <p className="note">
              {t(
                'lumen.myMedia.enableWrites',
                'Want to update tracking from My Media?'
              )}{' '}
              <Link to="/me/account/linked-accounts">
                {t(
                  'lumen.myMedia.enableWritesLink',
                  'Enable writes in Linked Accounts'
                )}
              </Link>
              .
            </p>
          )}
          {!!data.missingMappings && (
            <p className="note">
              {t(
                'library.unmapped',
                'Some titles retain their original provider identity until a catalog match is confirmed.'
              )}
            </p>
          )}
          {data.truncated && (
            <p className="note" role="status">
              {t(
                'library.limit',
                'This page reached a safety limit. Continue with Next if available, or finish browsing in your provider app.'
              )}
            </p>
          )}
          <LibraryRows
            data={data}
            provider={trackingProvider}
            updated={refresh}
          />
        </>
      )}
      <nav
        className="toolbar"
        aria-label={t('lumen.myMedia.pages', 'Library pages')}
      >
        <button
          className="btn btn-quiet btn-sm"
          disabled={page === 1}
          onClick={previous}
        >
          {t('library.previous', 'Previous page')}
        </button>
        <span className="note">
          {t('library.page', 'Page {page}', { page })}
        </span>
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
          {t('library.next', 'Next page')}
        </button>
      </nav>
    </>
  );
}

export default function Library() {
  const { t } = useLumenLocale();
  const extras = useExtras();
  const connections = useApi<Connections>(`${BASE}/accounts`);
  const [matchRevision, setMatchRevision] = useState(0);
  const [bookmark, setBookmark] = useSearchParams();
  const data = Array.isArray(connections.data?.accounts)
    ? connections.data
    : null;
  const error =
    connections.error ||
    (connections.data && !data
      ? t(
          'lumen.myMedia.invalidAccounts',
          'Invalid connected accounts response.'
        )
      : null);
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
      <CategorySettingsNote error={extras.error} retry={extras.retry} />
      <header className="ph">
        <h1>{t('library.title', 'My Media')}</h1>
      </header>
      <ServiceNote
        error={error}
        what={t('library.title', 'My Media')}
        title={t('lumen.myMedia.couldNotLoad', 'Could not load {what}', {
          what: t('library.title', 'My Media'),
        })}
        retry={connections.reload}
      />
      {!data && !error && (
        <p className="note" role="status">
          {t('library.loading', 'Loading your library…')}
        </p>
      )}
      {data && !current && (
        <div className="toolbar">
          <p className="note">
            {t(
              'lumen.myMedia.noSource',
              'Link a media server or tracking account to browse your library.'
            )}
          </p>
          <Link
            className="btn btn-tonal btn-sm"
            to="/me/account/linked-accounts"
          >
            {t('library.accounts', 'Manage connected accounts')}
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
              <span className="lbl">
                {t('library.provider', 'Library source')}
              </span>
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
              {t('lumen.myMedia.manageAccounts', 'Manage Linked Accounts')}
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
