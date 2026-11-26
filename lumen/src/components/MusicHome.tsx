import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { api, strictQuery } from '../api';
import { useAuth } from '../auth';
import { friendlyError } from '../errors';
import {
  requestExtra,
  type AurralAlbum,
  type AurralArtist,
  type AurralSearchResponse,
  type AurralTrack,
} from '../extras';
import { cachedApi, useApi, usePublicSettings } from '../hooks';
import { useLumenLocale } from '../i18n';
import { Icon } from '../icons';
import { openPlayer } from '../musicPlayback';
import {
  artistKey,
  isAlbumRequested,
  isSongRequested,
  markAlbumRequested,
  markSongsRequested,
  onMusicDownloadsCompleted,
  songKey,
  useRequestedSongs,
} from '../musicState';
import { onSessionReset } from '../sessionState';
import { Cover, Rail, Section } from './cards';
import { ConfirmSheet } from './ConfirmSheet';
import { canRequestMusic, DetailTop, Pill } from './detail';
import { ExtraCard, ExtraGate } from './extra';
import { PlayButton, useMusicPlayer } from './MusicPlayback';
import {
  albumArt,
  ArtistCircle,
  AurralArtistCard,
  MusicDownloadsProvider,
  MusicSongList,
  releaseYear,
  useAlbumStat,
} from './MusicSections';
import { useToast } from './toast';

// --- data shapes from SeerrNG's /music endpoints ----------------------------

export interface LibraryAlbum {
  id: number;
  title: string;
  artistName: string | null;
  mbid: string | null;
  releaseGroupMbid: string | null;
  releaseDate: string | null;
  addedAt: string | null;
  trackCount?: number;
  availableTrackCount?: number;
  coverUrl: string | null;
}

export interface LibraryArtist {
  id: number;
  name: string;
  mbid: string | null;
  albumCount?: number;
  trackCount?: number;
  coverUrl: string | null;
}

interface LibraryPage<T> {
  kind: string;
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  items: T[];
}

export interface ActivityItem {
  id: string;
  title: string;
  artistName: string | null;
  albumName: string | null;
  albumMbid?: string | null;
  status: string;
  statusLabel: string | null;
  source: string | null;
  requestedAt: string | null;
  cause: { kind: string | null; name: string | null } | null;
  // why a failed download failed, in Aurral's words
  reason?: string | null;
}

export interface MusicActivity {
  active: ActivityItem[];
  queued: ActivityItem[];
  queuedTotal: number;
  recent: ActivityItem[];
  failedTotal: number;
  failed?: ActivityItem[];
  // albums with songs downloading or waiting (Aurral reports songs)
  albums?: {
    albumMbid: string | null;
    albumName: string | null;
    artistName: string | null;
    downloading: number;
    queued: number;
  }[];
}

interface RecommendedArtist {
  mbid: string;
  name: string;
  image: string | null;
  because: string | null;
  matchPercent: number | null;
  inLibrary?: boolean;
}

interface TrendingArtist {
  mbid: string;
  name: string;
  image: string | null;
  label: string | null;
  inLibrary?: boolean;
}

interface PlaylistSummary {
  id: string;
  name: string;
  curator: string | null;
  trackCount: number | null;
  artworkUrl: string | null;
  provider: string;
}

interface PlaylistCategory {
  id: string;
  name: string;
  playlists: PlaylistSummary[];
}

interface PlaylistTrack {
  title: string;
  artistName: string | null;
  albumTitle: string | null;
  albumMbid: string | null;
  artistMbid: string | null;
  durationMs: number | null;
  coverUrl: string | null;
  previewDeezerId: string | null;
  inLibrary: boolean;
  // its album is requested: the song is on its way too
  albumRequested?: boolean;
}

interface PlaylistDetail {
  id: string;
  name: string;
  description: string | null;
  curator: string | null;
  artworkUrl: string | null;
  provider: string;
  tracks: PlaylistTrack[];
}

const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? value : []);

export const libraryAlbumHref = (album: LibraryAlbum) =>
  album.releaseGroupMbid || album.mbid
    ? `/music/${encodeURIComponent(album.releaseGroupMbid || album.mbid || '')}`
    : `/music?q=${encodeURIComponent([album.artistName, album.title].filter(Boolean).join(' '))}`;

export const toAurralTrack = (track: PlaylistTrack): AurralTrack =>
  ({
    title: track.title,
    artistName: track.artistName ?? '',
    albumTitle: track.albumTitle ?? undefined,
    albumMbid: track.albumMbid ?? undefined,
    artistMbid: track.artistMbid ?? undefined,
    durationMs: track.durationMs ?? undefined,
    coverUrl: track.coverUrl ?? undefined,
    inLibrary: track.inLibrary,
    albumRequested: track.albumRequested,
    previewDeezerId: track.previewDeezerId ?? undefined,
  }) as unknown as AurralTrack;

// Polls while the page is visible: downloads move quickly.
export function usePolledApi<T>(path: string | null, everyMs: number) {
  const result = useApi<T>(path, { keepDuringRefresh: true });
  const { revalidate } = result;
  useEffect(() => {
    if (!path) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') revalidate();
    }, everyMs);
    return () => window.clearInterval(timer);
  }, [path, everyMs, revalidate]);
  return result;
}

// --- shared pieces ------------------------------------------------------------

export function LibraryAlbumCard({ album }: { album: LibraryAlbum }) {
  const { t } = useLumenLocale();
  return (
    <ExtraCard
      href={libraryAlbumHref(album)}
      img={album.coverUrl ?? undefined}
      title={album.title}
      shape="sq"
      titleKind="album"
      icon="music"
      stat={null}
      meta={[
        album.artistName,
        // 0 means the count is unknown: an album in the library has at least one song
        album.trackCount &&
        typeof album.availableTrackCount === 'number' &&
        album.availableTrackCount > 0 &&
        album.availableTrackCount < album.trackCount
          ? t('lumen.music.partOwned', '{owned} of {total} songs', {
              owned: album.availableTrackCount,
              total: album.trackCount,
            })
          : releaseYear(album.releaseDate),
      ]
        .filter(Boolean)
        .join(' · ')}
    />
  );
}

const libraryArtistAsCard = (artist: LibraryArtist): AurralArtist =>
  ({
    name: artist.name,
    mbid: artist.mbid ?? undefined,
    image: artist.coverUrl ?? undefined,
    inLibrary: true,
  }) as unknown as AurralArtist;

// Aurral reports a failed download per source ("Soulseek: No suitable slskd
// search results; yt-dlp: …; Usenet: …"). When every source found nothing,
// or only something it turned down, say that plainly; anything else is shown
// as Aurral wrote it.
const FAILURE_SOURCE_NAMES: Record<string, string> = {
  soulseek: 'Soulseek',
  slskd: 'Soulseek',
  'yt-dlp': 'YouTube',
  youtube: 'YouTube',
  usenet: 'Usenet',
};
const NOTHING_FOUND =
  /\bno (suitable|matching)\b|\bnot found\b|\bno results\b/i;
// a candidate was found but rejected (too weak a match, wrong length, …)
const TURNED_DOWN = /\bdenied\b|\brejected\b|\btoo weak\b|\bmismatch\b/i;
export const plainFailureReason = (
  reason: string,
  t: ReturnType<typeof useLumenLocale>['t']
): string => {
  const sources: string[] = [];
  let turnedDown = false;
  for (const part of reason.split(';').map((piece) => piece.trim())) {
    if (!part) continue;
    const match = part.match(/^([^:]{1,30}):\s*(.+)$/);
    const name = match && FAILURE_SOURCE_NAMES[match[1].trim().toLowerCase()];
    if (!match || !name) return reason;
    if (TURNED_DOWN.test(match[2])) turnedDown = true;
    else if (!NOTHING_FOUND.test(match[2])) return reason;
    if (!sources.includes(name)) sources.push(name);
  }
  if (!sources.length) return reason;
  let list = sources.join(', ');
  try {
    list = new Intl.ListFormat(undefined, { type: 'disjunction' }).format(
      sources
    );
  } catch {
    // older browsers: the plain comma list
  }
  return turnedDown
    ? t('lumen.music.failedNoGoodMatch', 'No good match on {sources}', {
        sources: list,
      })
    : t('lumen.music.failedNotFound', 'Not found on {sources}', {
        sources: list,
      });
};

export function ActivityRow({
  item,
  position,
}: {
  item: ActivityItem;
  position?: number;
}) {
  const { t } = useLumenLocale();
  const working = item.status === 'processing';
  const done = item.status === 'completed' || item.status === 'unchanged';
  const failed = item.status === 'failed';
  const label = done
    ? t('lumen.music.downloaded', 'Downloaded')
    : item.statusLabel ||
      (working
        ? t('lumen.status.downloading', 'Downloading')
        : failed
          ? t('lumen.music.requestStatus.failed', 'Failed')
          : t('lumen.music.queued', 'Queued'));

  // no cause: Aurral fetched it on its own (following, a mix), not a request
  const why = !item.cause
    ? null
    : item.cause.kind === 'request'
      ? t('lumen.music.yourRequest', 'Requested')
      : item.cause.name
        ? t('lumen.music.fromPlaylist', 'From {name}', {
            name: item.cause.name,
          })
        : t('lumen.music.fromAMix', 'From a mix');
  return (
    <li className="music-act-row" data-status={item.status}>
      <span className="music-act-pos" aria-hidden="true">
        {working ? (
          <span className="music-act-spin" />
        ) : failed ? (
          <Icon name="x" size="sm" />
        ) : done ? (
          <Icon name="check" size="sm" />
        ) : (
          position
        )}
      </span>
      <span className="music-act-text">
        <b>{item.title}</b>
        <small>{[item.artistName, why].filter(Boolean).join(' · ')}</small>
        {failed && item.reason && (
          <small className="music-act-reason" title={item.reason}>
            {plainFailureReason(item.reason, t)}
          </small>
        )}
      </span>
      <Pill k={working ? 'dl' : failed ? 'bad' : done ? 'ok' : 'wait'}>
        {label}
      </Pill>
    </li>
  );
}

// --- Discover -----------------------------------------------------------------

export function RecommendedArtists() {
  const { t } = useLumenLocale();
  const data = useApi<{
    recommendations?: RecommendedArtist[];
    trending?: TrendingArtist[];
  }>('/music/discover/recommended');
  const recs = list<RecommendedArtist>(data.data?.recommendations);
  if (!recs.length) return null;
  return (
    <Section title={t('lumen.music.recommended', 'Recommended for you')}>
      <Rail>
        {recs.map((artist) => (
          <ArtistCircle
            key={artist.mbid ?? artist.name}
            name={artist.name}
            mbid={artist.mbid}
            image={artist.image}
            inLibrary={artist.inLibrary === true}
            sub={
              artist.because
                ? t('lumen.music.because', 'Because you have {artist}', {
                    artist: artist.because,
                  })
                : null
            }
          />
        ))}
      </Rail>
    </Section>
  );
}

// "Because you listen to X": artists like the ones you added lately, leaving out
// the ones you already have. Three seed artists, a different set each day.
function SimilarRail({
  seed,
  owned,
}: {
  seed: LibraryArtist;
  owned: Set<string>;
}) {
  const { t } = useLumenLocale();
  const similar = useApi<{
    artists?: {
      mbid: string | null;
      name: string;
      image: string | null;
      inLibrary?: boolean;
    }[];
  }>(
    seed.mbid ? `/music/artist/${encodeURIComponent(seed.mbid)}/similar` : null
  );
  // the server checks the whole library; the recent names cover older servers
  const artists = list<{
    mbid: string | null;
    name: string;
    image: string | null;
    inLibrary?: boolean;
  }>(similar.data?.artists).filter(
    (artist) => !artist.inLibrary && !owned.has(artistKey(artist.name))
  );
  if (artists.length < 3) return null;
  return (
    <Section
      title={t(
        'lumen.music.becauseYouListen',
        'Because you listen to {artist}',
        {
          artist: seed.name,
        }
      )}
    >
      <Rail>
        {artists.slice(0, 16).map((artist) => (
          <ArtistCircle
            key={artist.mbid ?? artist.name}
            name={artist.name}
            mbid={artist.mbid}
            image={artist.image}
          />
        ))}
      </Rail>
    </Section>
  );
}

export function SimilarToYourArtists() {
  const top = useApi<LibraryPage<LibraryArtist>>(
    '/music/library?kind=artists&sort=newest&page=1&pageSize=36'
  );
  const artists = list<LibraryArtist>(top.data?.items);
  const owned = useMemo(
    () => new Set(artists.map((artist) => artistKey(artist.name))),
    [artists]
  );
  const seeds = useMemo(() => {
    // recently added artists with a real catalogue say most about current taste
    const withId = artists
      .filter((artist) => artist.mbid && (artist.trackCount ?? 0) >= 5)
      .slice(0, 18);
    if (!withId.length) return [];
    // three different artists, starting somewhere new each day
    const day = Math.floor(Date.now() / 86_400_000);
    const start = (day * 3) % withId.length;
    const picked: LibraryArtist[] = [];
    for (let i = 0; i < Math.min(3, withId.length); i++)
      picked.push(withId[(start + i) % withId.length]);
    return [...new Map(picked.map((artist) => [artist.mbid, artist])).values()];
  }, [artists]);
  return (
    <>
      {seeds.map((seed) => (
        <SimilarRail key={seed.mbid} seed={seed} owned={owned} />
      ))}
    </>
  );
}

export function TrendingArtistsRail({
  fallback,
}: {
  fallback: AurralArtist[];
}) {
  const { t } = useLumenLocale();
  const data = useApi<{ trending?: TrendingArtist[] }>(
    '/music/discover/recommended'
  );
  const trending = list<TrendingArtist>(data.data?.trending);
  // the photo list is better; only fall back once it has answered (or failed)
  if (!data.data && !data.error) return null;
  if (!trending.length && !fallback.length) return null;
  return (
    <Section title={t('lumen.music.trendingArtists', 'Trending artists')}>
      <Rail>
        {trending.length
          ? trending.map((artist) => (
              <ArtistCircle
                key={artist.mbid ?? artist.name}
                name={artist.name}
                mbid={artist.mbid}
                image={artist.image}
                inLibrary={artist.inLibrary === true}
              />
            ))
          : fallback.map((artist, index) => (
              <AurralArtistCard
                key={artist.mbid ?? `${artist.name}-${index}`}
                artist={artist}
              />
            ))}
      </Rail>
    </Section>
  );
}

export function PlaylistsShelf() {
  const { t } = useLumenLocale();
  const data = useApi<{ categories?: PlaylistCategory[] }>(
    '/music/discover/playlists'
  );
  const categories = list<PlaylistCategory>(data.data?.categories).filter(
    (category) => list(category.playlists).length > 0
  );
  const [picked, setPicked] = useState('');
  const current =
    categories.find((category) => category.id === picked) ?? categories[0];
  if (!current) return null;
  return (
    <Section
      title={t('lumen.music.playlistsToExplore', 'Playlists to explore')}
    >
      <div
        className="chips music-cat-chips"
        role="group"
        aria-label={t('lumen.music.playlistGenre', 'Playlist genre')}
      >
        {categories.slice(0, 14).map((category) => (
          <button
            key={category.id}
            type="button"
            className="chip"
            aria-pressed={current.id === category.id}
            onClick={() => setPicked(category.id)}
          >
            {category.name}
          </button>
        ))}
      </div>
      <Rail>
        {current.playlists.map((playlist) => (
          <ExtraCard
            key={`${playlist.provider}-${playlist.id}`}
            href={`/music/playlist/${encodeURIComponent(playlist.provider)}/${encodeURIComponent(playlist.id)}`}
            img={playlist.artworkUrl ?? undefined}
            title={playlist.name}
            shape="sq"
            titleKind="album"
            icon="music"
            meta={[
              playlist.curator,
              playlist.trackCount
                ? t('lumen.music.songCount', '{count} songs', {
                    count: playlist.trackCount,
                  })
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        ))}
      </Rail>
    </Section>
  );
}

// --- Library ------------------------------------------------------------------

const SORTS = ['newest', 'artist', 'album', 'released', 'plays'] as const;
type LibrarySort = (typeof SORTS)[number];

type LibraryKind = 'albums' | 'artists';
type LibraryItem = LibraryAlbum | LibraryArtist;
interface LibraryMore {
  path: string;
  pages: number;
  extra: LibraryItem[];
  hasMore: boolean;
}
// "Show more" pages already loaded, by the first page's path, so Back finds them again
const librarySnap = new Map<string, LibraryMore>();
onSessionReset(() => librarySnap.clear());
const libraryMoreFor = (path: string): LibraryMore =>
  librarySnap.get(path) ?? { path, pages: 1, extra: [], hasMore: true };

export function LibraryTab() {
  const { t } = useLumenLocale();
  const { aurralBase } = useMusicPlayer();
  // kind and sort live in the address (replaced, not added), so Back and reload keep them
  const [params, setParams] = useSearchParams();
  const kind: LibraryKind =
    params.get('lib') === 'artists' ? 'artists' : 'albums';
  const wantedSort =
    SORTS.find((value) => value === params.get('libsort')) ?? 'newest';
  // artists can't be sorted by album or by plays (Aurral answers an empty list)
  const sort: LibrarySort =
    kind === 'artists' && (wantedSort === 'album' || wantedSort === 'plays')
      ? 'newest'
      : wantedSort;
  const [loadingMore, setLoadingMore] = useState(false);
  const toast = useToast();
  // the name filter is in the address too; it is asked for once typing pauses
  const appliedFilter = (params.get('libq') ?? '').trim().slice(0, 100);
  const [filterText, setFilterText] = useState(appliedFilter);
  useEffect(() => {
    const wanted = filterText.trim().slice(0, 100);
    if (wanted === appliedFilter) return;
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(params);
      if (wanted) next.set('libq', wanted);
      else next.delete('libq');
      setParams(next, { replace: true });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [filterText, appliedFilter, params, setParams]);
  const filterQuery = appliedFilter
    ? `&q=${encodeURIComponent(appliedFilter)}`
    : '';
  const firstPath = `/music/library?kind=${kind}&sort=${sort}&page=1&pageSize=36${filterQuery}`;
  // page 1 is asked again as downloads land, like the count on the tab
  const first = usePolledApi<LibraryPage<LibraryItem>>(firstPath, 30000);
  const [moreState, setMoreState] = useState<LibraryMore>(() =>
    libraryMoreFor(firstPath)
  );
  const loaded =
    moreState.path === firstPath ? moreState : libraryMoreFor(firstPath);
  const livePath = useRef(firstPath);
  livePath.current = firstPath;
  const choose = (nextKind: LibraryKind, nextSort: LibrarySort) => {
    if (nextKind === kind && nextSort === sort) return;
    const next = new URLSearchParams(params);
    if (nextKind === 'albums') next.delete('lib');
    else next.set('lib', nextKind);
    if (nextSort === 'newest') next.delete('libsort');
    else next.set('libsort', nextSort);
    setParams(next, { replace: true });
  };
  // page 1 refreshes on its own while later pages were loaded earlier: new downloads
  // shift the pages, so an album can come back on the next page. Show each once.
  const items: LibraryItem[] = [];
  const seen = new Set<number>();
  // two library artists with one name (a band member's MBID) show once
  const seenArtistNames = new Set<string>();
  for (const item of [
    ...list<LibraryItem>(first.data?.items),
    ...loaded.extra,
  ]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    if (kind === 'artists' && 'name' in item) {
      const nameKey = artistKey(item.name);
      if (nameKey && seenArtistNames.has(nameKey)) continue;
      if (nameKey) seenArtistNames.add(nameKey);
    }
    items.push(item);
  }
  const total = first.data?.total ?? 0;
  const canShowMore =
    Boolean(first.data?.hasMore) && loaded.hasMore && items.length < total;
  const more = async () => {
    if (loadingMore) return;
    const path = firstPath;
    const base = loaded;
    setLoadingMore(true);
    try {
      const next = await api<LibraryPage<LibraryItem>>(
        `/music/library?kind=${kind}&sort=${sort}&page=${base.pages + 1}&pageSize=36${filterQuery}`
      );
      if (livePath.current !== path) return;
      const nextItems = list<LibraryItem>(next.items);
      const updated: LibraryMore = {
        path,
        pages: base.pages + 1,
        extra: [...base.extra, ...nextItems],
        hasMore: Boolean(next.hasMore) && nextItems.length > 0,
      };
      librarySnap.set(path, updated);
      setMoreState(updated);
    } catch (error) {
      toast(
        friendlyError(
          error,
          t('lumen.music.libraryMoreFailed', 'Could not load more.')
        )
      );
    } finally {
      setLoadingMore(false);
    }
  };
  const sortLabel: Record<LibrarySort, string> = {
    newest: t('lumen.music.sort.newest', 'Recently added'),
    artist: t('lumen.music.sort.artist', 'Artist'),
    album: t('lumen.music.sort.album', 'Album'),
    released: t('lumen.music.sort.released', 'Release date'),
    plays: t('lumen.music.sort.plays', 'Most played'),
  };
  return (
    <>
      <div className="toolbar music-lib-bar">
        <div className="seg" role="group">
          {(['albums', 'artists'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={kind === value}
              onClick={() => choose(value, sort)}
            >
              {value === 'albums'
                ? t('lumen.music.albums', 'Albums')
                : t('lumen.music.artists', 'Artists')}
            </button>
          ))}
        </div>
        <label className="sel">
          <span className="lbl">{t('lumen.music.sortBy', 'Sort')}</span>
          <select
            value={sort}
            onChange={(event) =>
              choose(kind, event.target.value as LibrarySort)
            }
          >
            {SORTS.filter(
              (value) =>
                kind === 'albums' || (value !== 'album' && value !== 'plays')
            ).map((value) => (
              <option key={value} value={value}>
                {sortLabel[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="sel music-lib-filter">
          <span className="lbl">
            {t('lumen.music.libraryFilter', 'Filter')}
          </span>
          <input
            className="cfg-input"
            type="search"
            value={filterText}
            maxLength={100}
            placeholder={
              kind === 'albums'
                ? t('lumen.music.libraryFilterAlbums', 'Album, artist or song')
                : t('lumen.music.libraryFilterArtists', 'Artist name')
            }
            onChange={(event) => setFilterText(event.target.value)}
          />
        </label>
        <span className="music-lib-count">
          {first.data
            ? kind === 'albums'
              ? t('lumen.music.albumTotal', '{count} albums', {
                  count: total.toLocaleString(),
                })
              : t('lumen.music.artistTotal', '{count} artists', {
                  count: total.toLocaleString(),
                })
            : ''}
        </span>
        {aurralBase && (
          <a
            className="btn btn-quiet btn-sm"
            href={`${aurralBase}/library`}
            target="lumen-music-player"
            rel="noreferrer"
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey) return;
              event.preventDefault();
              openPlayer(`${aurralBase}/library`);
            }}
          >
            {t('lumen.music.openInAurral', 'Open in Aurral')}
          </a>
        )}
      </div>
      {!first.data && !first.error && (
        <div className="detail-loading" aria-busy="true" />
      )}
      {first.error && (
        <div className="empty">
          <b>
            {t('lumen.music.libraryUnavailable', 'Your library could not load')}
          </b>
          {first.error}
        </div>
      )}
      {first.data && !items.length && (
        <div className="empty">
          {appliedFilter
            ? t(
                'lumen.music.libraryNoMatch',
                'Nothing in your library matches “{filter}”.',
                {
                  filter: appliedFilter,
                }
              )
            : t('lumen.music.libraryEmpty', 'Nothing in your library yet.')}
        </div>
      )}
      <div className="sqg grid">
        {kind === 'albums'
          ? (items as LibraryAlbum[]).map((album) => (
              <LibraryAlbumCard key={album.id} album={album} />
            ))
          : (items as LibraryArtist[]).map((artist) => (
              <AurralArtistCard
                key={artist.id}
                artist={libraryArtistAsCard(artist)}
              />
            ))}
      </div>
      {first.data && canShowMore && (
        <div className="more-scroll">
          <button
            type="button"
            className="btn btn-tonal"
            disabled={loadingMore}
            onClick={() => void more()}
          >
            {loadingMore
              ? t('lumen.common.loading', 'Loading…')
              : t('lumen.music.showMore', 'Show more')}
          </button>
        </div>
      )}
    </>
  );
}

// --- Activity -----------------------------------------------------------------

const RECENT_SHORT = 6;

export function ActivityTab({
  activity,
  error,
}: {
  activity?: MusicActivity | null;
  error?: string | null;
}) {
  const { t } = useLumenLocale();
  const [showAll, setShowAll] = useState(false);
  // the recent list starts short, so it sits level with "Downloading now"
  const [allRecent, setAllRecent] = useState(false);
  if (!activity && !error)
    return <div className="detail-loading" aria-busy="true" />;
  if (!activity)
    return (
      <div className="empty">
        <b>
          {t('lumen.music.activityUnavailable', 'Downloads could not load')}
        </b>
        {error}
      </div>
    );
  const active = list<ActivityItem>(activity.active);
  const queued = list<ActivityItem>(activity.queued);
  const recent = list<ActivityItem>(activity.recent);
  const failedItems = list<ActivityItem>(activity.failed);
  const shownQueue = showAll ? queued : queued.slice(0, 12);
  return (
    <div className="music-act-cols">
      <Section title={t('lumen.music.downloadingNow', 'Downloading now')}>
        {active.length ? (
          <ol className="music-act card">
            {active.map((item) => (
              <ActivityRow key={item.id} item={item} />
            ))}
          </ol>
        ) : (
          <div className="empty">
            {t(
              'lumen.music.nothingDownloading',
              'Nothing downloading right now.'
            )}
          </div>
        )}
      </Section>
      {activity.queuedTotal > 0 && (
        <Section
          title={t('lumen.music.upNext', 'Up next ({count})', {
            count: activity.queuedTotal,
          })}
          action={
            queued.length > 12 ? (
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() => setShowAll((value) => !value)}
              >
                {showAll
                  ? t('lumen.music.showLess', 'Show less')
                  : t('lumen.music.showAll', 'Show all')}
              </button>
            ) : undefined
          }
        >
          {shownQueue.length ? (
            <ol className="music-act card">
              {shownQueue.map((item, index) => (
                <ActivityRow key={item.id} item={item} position={index + 1} />
              ))}
            </ol>
          ) : (
            <div className="empty">
              {t('lumen.music.queueEmpty', 'Nothing waiting.')}
            </div>
          )}
          {activity.queuedTotal > queued.length && (
            <small className="music-side-empty">
              {t(
                'lumen.music.moreQueued',
                '{count} more are waiting behind these.',
                { count: activity.queuedTotal - queued.length }
              )}
            </small>
          )}
        </Section>
      )}
      {failedItems.length > 0 && (
        <Section
          title={t(
            'lumen.music.failedDownloads',
            'Could not download ({count})',
            {
              count: activity.failedTotal || failedItems.length,
            }
          )}
        >
          <ol className="music-act card">
            {failedItems.map((item) => (
              <ActivityRow key={item.id} item={item} />
            ))}
          </ol>
        </Section>
      )}
      <Section
        title={t('lumen.music.recentlyDownloaded', 'Recently downloaded')}
        action={
          recent.length > RECENT_SHORT ? (
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              aria-expanded={allRecent}
              onClick={() => setAllRecent((open) => !open)}
            >
              {allRecent
                ? t('lumen.music.showLess', 'Show less')
                : t('lumen.music.showAllCount', 'Show all {count}', {
                    count: recent.length,
                  })}
            </button>
          ) : undefined
        }
      >
        {recent.length ? (
          <ol className="music-act card">
            {(allRecent ? recent : recent.slice(0, RECENT_SHORT)).map(
              (item) => (
                <ActivityRow key={item.id} item={item} />
              )
            )}
          </ol>
        ) : (
          <div className="empty">
            {t('lumen.music.nothingYet', 'Nothing yet.')}
          </div>
        )}
      </Section>
    </div>
  );
}

// --- Playlist page --------------------------------------------------------------

export function MusicPlaylist() {
  const { provider = '', id = '' } = useParams();
  // a fresh page per playlist: no filter or "sent" state carries over
  return <MusicPlaylistPage key={`${provider}/${id}`} />;
}

function MusicPlaylistPage() {
  const { t } = useLumenLocale();
  const { provider = '', id = '' } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const { aurralBase } = useMusicPlayer();
  useMusicPrefetch();
  const data = useApi<PlaylistDetail>(
    `/music/discover/playlists/${encodeURIComponent(provider)}/${encodeURIComponent(id)}`
  );
  const [sent, setSent] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [filter, setFilter] = useState<'all' | 'missing' | 'coming' | 'owned'>(
    'all'
  );
  // a finished download turns its row into Play without a reload
  const { revalidate: revalidatePlaylist } = data;
  useEffect(
    () => onMusicDownloadsCompleted(() => revalidatePlaylist()),
    [revalidatePlaylist]
  );
  const [shown, setShown] = useState(50);
  const [busy, setBusy] = useState(false);
  const tracks = useMemo(
    () => list<PlaylistTrack>(data.data?.tracks),
    [data.data]
  );
  useRequestedSongs();
  const onTheWay = (track: PlaylistTrack) =>
    !track.inLibrary &&
    (track.albumRequested === true ||
      isSongRequested(songKey(track.artistName, track.title)));
  const missing = tracks.filter(
    (track) => !track.inLibrary && !onTheWay(track)
  );
  const owned = tracks.filter((track) => track.inLibrary).length;
  const comingCount = tracks.filter(onTheWay).length;
  const publicSettings = usePublicSettings();
  const canRequest =
    canRequestMusic(user?.permissions) &&
    Boolean(publicSettings?.trackRequestsEnabled);

  const getAll = async () => {
    if (!missing.length || busy) return;
    setBusy(true);
    const todo = [...missing];
    try {
      for (let start = 0; start < todo.length; start += 25) {
        const batch = todo.slice(start, start + 25);
        await api('/music/track-requests', {
          method: 'POST',
          body: JSON.stringify({
            tracks: batch.map((track) => ({
              title: track.title,
              artist: track.artistName || 'Unknown Artist',
              albumName: track.albumTitle || undefined,
              albumMbid: track.albumMbid || undefined,
              artistMbid: track.artistMbid || undefined,
              durationMs:
                track.durationMs && track.durationMs > 0
                  ? track.durationMs
                  : undefined,
              source: 'playlist',
            })),
          }),
        });
        // a later batch failing must not resend these
        markSongsRequested(
          batch.map((track) => songKey(track.artistName, track.title))
        );
      }
      setSent(true);
      toast(
        t('lumen.music.playlistRequested', 'Getting {count} songs', {
          count: todo.length,
        })
      );
    } catch (error) {
      toast(
        friendlyError(
          error,
          t(
            'lumen.music.playlistRequestFailed',
            'Could not request these songs.'
          )
        )
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ExtraGate k="music">
      <MusicDownloadsProvider>
        {!data.data && !data.error && (
          <div className="detail-loading" aria-busy="true" />
        )}
        {data.error && (
          <div className="empty">
            <b>
              {t(
                'lumen.music.playlistUnavailable',
                'This playlist could not load'
              )}
            </b>
            {data.error}
          </div>
        )}
        {data.data && (
          <article className="music-playlist">
            <header className="music-pl-head">
              <span className="music-pl-art">
                <Cover
                  src={data.data.artworkUrl ?? undefined}
                  title={data.data.name}
                  icon="music"
                />
              </span>
              <div className="music-pl-meta">
                <span className="eyebrow">
                  {t('lumen.music.playlist', 'Playlist')}
                </span>
                <h1>{data.data.name}</h1>
                <span className="music-pl-sub">
                  {[
                    data.data.curator,
                    t('lumen.music.songCount', '{count} songs', {
                      count: tracks.length,
                    }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {data.data.description && (
                  <p className="music-pl-desc">{data.data.description}</p>
                )}
                {owned > 0 && (
                  <div className="music-owned">
                    <b>
                      {t(
                        'lumen.music.ownedOfTotal',
                        '{owned} of {total} songs in your library',
                        { owned, total: tracks.length }
                      )}
                    </b>
                    <span
                      className="music-owned-bar"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={tracks.length}
                      aria-valuenow={owned}
                      aria-label={t('lumen.music.songsOwned', 'Songs owned')}
                    >
                      <i
                        style={{
                          width: `${tracks.length ? Math.round((owned / tracks.length) * 100) : 0}%`,
                        }}
                      />
                    </span>
                  </div>
                )}
                <div className="acts">
                  {canRequest && missing.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy || sent}
                      onClick={() => setConfirmAll(true)}
                    >
                      <Icon name="plus" />
                      {sent
                        ? t('lumen.music.getting', 'Getting…')
                        : owned === 0
                          ? t(
                              'lumen.music.getAllSongs',
                              'Get all {count} songs',
                              {
                                count: missing.length,
                              }
                            )
                          : missing.length === 1
                            ? t(
                                'lumen.music.getMissingSong',
                                'Get the missing song'
                              )
                            : t(
                                'lumen.music.getMissingSongs',
                                'Get the {count} missing songs',
                                {
                                  count: missing.length,
                                }
                              )}
                    </button>
                  )}
                  {aurralBase && (
                    <a
                      className="btn btn-tonal"
                      href={`${aurralBase}/discover/playlists/${encodeURIComponent(provider)}/${encodeURIComponent(id)}`}
                      target="lumen-music-player"
                      rel="noreferrer"
                      onClick={(event) => {
                        if (event.metaKey || event.ctrlKey || event.shiftKey)
                          return;
                        event.preventDefault();
                        openPlayer(
                          `${aurralBase}/discover/playlists/${encodeURIComponent(provider)}/${encodeURIComponent(id)}`
                        );
                      }}
                    >
                      {owned > 0
                        ? t('lumen.music.playInAurral', 'Play in Aurral')
                        : t('lumen.music.openInAurral', 'Open in Aurral')}
                    </a>
                  )}
                </div>
              </div>
            </header>
            {tracks.length > 0 && (
              <>
                <div
                  style={owned === 0 ? { display: 'none' } : undefined}
                  className="chips music-cat-chips"
                  role="group"
                  aria-label={t('lumen.music.playlistFilter', 'Show songs')}
                >
                  {(
                    [
                      ['all', t('lumen.music.all', 'All'), tracks.length],
                      [
                        'missing',
                        t('lumen.music.notInLibrary', 'Not in library'),
                        missing.length,
                      ],
                      [
                        'coming',
                        t('lumen.music.onTheWay', 'On the way'),
                        comingCount,
                      ],
                      [
                        'owned',
                        t('lumen.status.inLibrary', 'In library'),
                        owned,
                      ],
                    ] as const
                  )
                    .filter(([key, , count]) => key !== 'coming' || count > 0)
                    .map(([key, label, count]) => (
                      <button
                        key={key}
                        type="button"
                        className="chip"
                        aria-pressed={filter === key}
                        onClick={() => {
                          setFilter(key);
                          setShown(50);
                        }}
                      >
                        {label}
                        <span className="n">{count}</span>
                      </button>
                    ))}
                </div>
                {(() => {
                  const filtered = tracks.filter((track) =>
                    filter === 'owned'
                      ? track.inLibrary
                      : filter === 'missing'
                        ? !track.inLibrary && !onTheWay(track)
                        : filter === 'coming'
                          ? onTheWay(track)
                          : true
                  );
                  return (
                    <>
                      {filtered.length ? (
                        <MusicSongList
                          tracks={filtered.slice(0, shown).map(toAurralTrack)}
                          canRequest={canRequest}
                        />
                      ) : (
                        <div className="empty">
                          {t('lumen.music.nothingHere', 'Nothing here.')}
                        </div>
                      )}
                      {filtered.length > shown && (
                        <div className="more-scroll">
                          <button
                            type="button"
                            className="btn btn-tonal"
                            onClick={() => setShown((n) => n + 50)}
                          >
                            {t(
                              'lumen.music.showMoreSongs',
                              'Show {count} more',
                              {
                                count: Math.min(50, filtered.length - shown),
                              }
                            )}
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </>
            )}
            {confirmAll && (
              <ConfirmSheet
                title={
                  missing.length === 1
                    ? t('lumen.music.getPlaylistTitleOne', 'Get 1 song?')
                    : t('lumen.music.getPlaylistTitle', 'Get {count} songs?', {
                        count: missing.length,
                      })
                }
                body={t(
                  'lumen.music.getPlaylistSongsBody',
                  'Aurral downloads each song one after another. You can follow them in Activity.'
                )}
                confirm={t('lumen.music.getThem', 'Get them')}
                cancel={t('lumen.common.cancel', 'Cancel')}
                onConfirm={() => {
                  setConfirmAll(false);
                  void getAll();
                }}
                onClose={() => setConfirmAll(false)}
              />
            )}
          </article>
        )}
      </MusicDownloadsProvider>
    </ExtraGate>
  );
}

export type { AurralAlbum };

// --- speed: load music pages before they are opened -----------------------------

// Pointing at (or focusing) an album or artist link starts loading its page, so
// it is usually ready by the time the click lands.
export function useMusicPrefetch(artists = true) {
  useEffect(() => {
    const seen = new Set<string>();
    let timer = 0;
    const warm = (target: EventTarget | null) => {
      const link = target instanceof Element ? target.closest('a[href]') : null;
      const href = link?.getAttribute('href') || '';
      const artist = /^\/artist\/([0-9a-fA-F-]{36})$/.exec(href);
      const album = /^\/music\/([0-9a-fA-F-]{36})$/.exec(href);
      const path =
        artist && artists
          ? `/music/artist/${artist[1]}`
          : album
            ? `/music/${album[1]}`
            : null;
      if (!path || seen.has(path)) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        seen.add(path);
        void cachedApi(path).catch(() => undefined);
      }, 90);
    };
    const over = (event: Event) => warm(event.target);
    document.addEventListener('pointerover', over, { passive: true });
    document.addEventListener('focusin', over);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerover', over);
      document.removeEventListener('focusin', over);
    };
  }, [artists]);
}

// --- artist page (Aurral) -----------------------------------------------------------

export interface AurralArtistDetails {
  mbid: string;
  name: string;
  type: string | null;
  country: string | null;
  beginYear: number | null;
  endYear: number | null;
  genres: string[];
  bio: string | null;
  incomplete?: boolean;
  // which releases are worth getting is still being worked out: ask again
  redundancyPending?: boolean;
  // this id has no releases, but another artist with the same name does
  sameNameArtist?: { mbid: string; name: string; releaseCount: number };
  releaseGroups: {
    id: string;
    title: string;
    year: number | null;
    primaryType: 'Album' | 'EP' | 'Single' | 'Other';
    secondaryTypes: string[];
    coverUrl: string | null;
    inLibrary: boolean;
    partial?: boolean;
    requested: boolean;
    // the library's own song counts (the Library tab's "x of y")
    libraryTrackCount?: number;
    libraryAvailableTrackCount?: number;
    blocklisted?: boolean;
    // another edition, a single whose songs are on an album, or a promo:
    // hidden until "Show other editions and singles"
    redundant?: {
      code: 'sameAlbum' | 'covered' | 'unofficial';
      reason: string;
      coveredBy?: { mbid: string; title: string };
      // a compilation: how many more albums besides coveredBy have its songs
      alsoOn?: number;
    };
  }[];
}

type ReleaseGroup = AurralArtistDetails['releaseGroups'][number];

// A hidden release: says why, and points at the release that brings its
// songs instead of offering Get (a promo keeps Get, behind the reveal only).
function HiddenReleaseCard({
  group,
  artistName,
  canRequest,
  asked,
  onAsked,
}: {
  group: ReleaseGroup;
  artistName: string;
  canRequest: boolean;
  asked: boolean;
  onAsked: (id: string) => void;
}) {
  const { t } = useLumenLocale();
  const redundant = group.redundant;
  const stat = useAlbumStat({
    mbid: group.id,
    title: group.title,
    artistName,
    primaryType: group.primaryType,
    inLibrary: group.inLibrary,
    partial: group.partial,
    requested: group.requested || asked,
    blocklisted: group.blocklisted,
  });
  const coveredBy = redundant?.coveredBy;
  const reason =
    redundant?.code === 'covered' && coveredBy && redundant.alsoOn
      ? t('lumen.music.onAlbumAndMoreReason', 'On {title} and {count} more', {
          title: coveredBy.title,
          count: redundant.alsoOn,
        })
      : redundant?.code === 'covered' && coveredBy
        ? t('lumen.music.onAlbumReason', 'On {title}', {
            title: coveredBy.title,
          })
        : redundant?.code === 'sameAlbum' && coveredBy
          ? t('lumen.music.editionOfReason', 'Another edition of {title}', {
              title: coveredBy.title,
            })
          : t('lumen.music.promoReason', 'Promo release');
  return (
    <ExtraCard
      href={`/music/${group.id}`}
      img={albumArt(group.coverUrl, group.id, artistName, group.title)}
      title={group.title}
      shape="sq"
      titleKind="album"
      icon="music"
      stat={stat}
      note={reason}
      meta={
        coveredBy
          ? t('lumen.music.openRelease', 'Open {title}', {
              title: coveredBy.title,
            })
          : group.year
            ? String(group.year)
            : undefined
      }
      metaHref={coveredBy ? `/music/${coveredBy.mbid}` : undefined}
      quick={
        canRequest && redundant?.code === 'unofficial'
          ? {
              label: t('lumen.music.getAlbumNamed', 'Get {title}', {
                title: group.title,
              }),
              action: t('lumen.music.get', 'Get'),
              run: async () => {
                await requestExtra('music', group.id);
                onAsked(group.id);
              },
            }
          : undefined
      }
    />
  );
}

// One release on the artist page, with the same state every other card for
// it shows (library, partly, requested here or elsewhere, downloading).
// Live albums and remixes stay on the page but are not one tap away: Get all
// leaves them out, and their own page still offers them.
const NO_QUICK_GET_TYPES = new Set(['live', 'remix', 'dj-mix']);
const hasNoQuickGet = (group: { secondaryTypes?: string[] }) =>
  (group.secondaryTypes ?? []).some((type) =>
    NO_QUICK_GET_TYPES.has(type.toLowerCase())
  );

function ArtistReleaseCard({
  group,
  artistName,
  canRequest,
  asked,
  onAsked,
}: {
  group: ReleaseGroup;
  artistName: string;
  canRequest: boolean;
  asked: boolean;
  onAsked: (id: string) => void;
}) {
  const { t } = useLumenLocale();
  const stat = useAlbumStat({
    mbid: group.id,
    title: group.title,
    artistName,
    primaryType: group.primaryType,
    inLibrary: group.inLibrary,
    partial: group.partial,
    requested: group.requested || asked,
    blocklisted: group.blocklisted,
    libraryTrackCount: group.libraryTrackCount,
    libraryAvailableTrackCount: group.libraryAvailableTrackCount,
  });
  return (
    <ExtraCard
      href={`/music/${group.id}`}
      img={albumArt(group.coverUrl, group.id, artistName, group.title)}
      title={group.title}
      shape="sq"
      titleKind="album"
      icon="music"
      stat={stat}
      meta={group.year ? String(group.year) : undefined}
      quick={
        canRequest && !hasNoQuickGet(group)
          ? {
              label: t('lumen.music.getAlbumNamed', 'Get {title}', {
                title: group.title,
              }),
              action: t('lumen.music.get', 'Get'),
              run: async () => {
                await requestExtra('music', group.id);
                onAsked(group.id);
              },
            }
          : undefined
      }
    />
  );
}

// "Get all releases": the server plans it so each song is asked for once
interface RequestAllItem {
  mbid: string;
  title: string;
  primaryType: 'Album' | 'EP' | 'Single';
}
interface RequestAllPlan {
  albums: RequestAllItem[];
  epsAndSingles: RequestAllItem[];
  // new songs of partly new singles, asked for one by one
  songs?: { title: string; artistName: string; fromReleaseMbid: string }[];
  skipped: (RequestAllItem & { reasonCode: string; reason: string })[];
  counts: {
    albums: number;
    epsAndSingles: number;
    songs?: number;
    skipped: number;
    covered: number;
    requested?: number;
    failed?: number;
  };
  results?: (RequestAllItem & {
    status: 'requested' | 'skipped' | 'failed';
    reason?: string;
  })[];
  songResults?: {
    title: string;
    fromReleaseMbid: string;
    status: 'requested' | 'failed';
    reason?: string;
  }[];
  stoppedReason?: string;
}

export function AurralArtistView({ id }: { id: string }) {
  const { t } = useLumenLocale();
  const { user } = useAuth();
  const toast = useToast();
  const hint = (useLocation().state ?? {}) as {
    name?: string;
    image?: string;
  };
  const details = useApi<AurralArtistDetails>(
    `/music/artist/${encodeURIComponent(id)}`
  );
  const follow = useApi<{
    inLibrary: boolean;
    following: boolean;
    // false for people who may request music but not follow artists
    canFollow?: boolean;
  }>(`/music/artist/${encodeURIComponent(id)}/follow`);
  const detailsName =
    details.data?.name && !/^unknown artist$/i.test(details.data.name.trim())
      ? details.data.name
      : '';
  const name = detailsName || hint.name || '';
  const incomplete = Boolean(
    details.data &&
    (details.data.incomplete ||
      !detailsName ||
      !list(details.data.releaseGroups).length)
  );
  // The catalog fills a new artist in over the next minute or so: until the albums arrive,
  // ask again every 5 s (past the saved copy) for about a minute, then leave Try again.
  const [catalogRetries, setCatalogRetries] = useState(0);
  const { revalidate: revalidateDetails } = details;
  useEffect(() => setCatalogRetries(0), [id]);
  // also while the server is still reading album track lists, so a single
  // whose songs are on an album stops offering Get within a few seconds
  const askAgain = incomplete || Boolean(details.data?.redundancyPending);
  useEffect(() => {
    if (!askAgain || catalogRetries >= 12) return;
    const timer = window.setTimeout(() => {
      setCatalogRetries((n) => n + 1);
      revalidateDetails();
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [askAgain, catalogRetries, revalidateDetails]);
  // A song can carry the id of a different artist with the same name, one with no
  // releases at all: go to the one that has the music instead of an empty page.
  const sameName = incomplete ? details.data?.sameNameArtist?.mbid : undefined;
  const goToArtist = useNavigate();
  useEffect(() => {
    if (sameName && sameName !== id)
      goToArtist(`/artist/${encodeURIComponent(sameName)}`, { replace: true });
  }, [sameName, id, goToArtist]);
  const songs = useApi<AurralSearchResponse>(
    name ? `/music/search?q=${encodeURIComponent(name)}&limit=20` : null,
    { currentPathOnly: true }
  );
  // a finished download: the shelves and the top songs ask again
  const { revalidate: revalidateSongs } = songs;
  useEffect(
    () =>
      onMusicDownloadsCompleted(() => {
        revalidateDetails();
        revalidateSongs();
      }),
    [revalidateDetails, revalidateSongs]
  );

  const canRequest = canRequestMusic(user?.permissions);
  const [asked, setAsked] = useState<string[]>([]);
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(
    null
  );
  const [confirm, setConfirm] = useState<
    'releases' | 'singles' | 'unfollow' | null
  >(null);
  // the dry run behind the Get all confirm sheet: exact numbers, nothing asked
  const [plan, setPlan] = useState<RequestAllPlan | null>(null);
  // the same dry run, asked when the page opens: the Get button's numbers
  const [pagePlan, setPagePlan] = useState<RequestAllPlan | null>(null);
  const [pagePlanFailed, setPagePlanFailed] = useState(false);
  const [pagePlanNonce, setPagePlanNonce] = useState(0);
  const [planError, setPlanError] = useState<unknown>(null);
  const [following, setFollowing] = useState<boolean | null>(null);
  const [freshFollow, setFreshFollow] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [bioOpen, setBioOpen] = useState(false);
  // wait for the name so the photo is asked for once
  const image =
    hint.image ||
    (name
      ? strictQuery(
          `/api/v1/music/artist-image/${encodeURIComponent(id)}?name=${encodeURIComponent(name)}`
        )
      : undefined);

  const allGroups = list<ReleaseGroup>(details.data?.releaseGroups);
  // other editions, singles an album already has and promos wait behind
  // "Show other editions and singles"; they never count as albums to get
  const hiddenGroups = allGroups.filter((group) => group.redundant);
  const shownGroups = allGroups.filter((group) => !group.redundant);
  // studio releases, with singles written for a film (only secondary type
  // Soundtrack) among the singles, like Get all counts them
  const groups = shownGroups.filter(
    (group) =>
      (!group.secondaryTypes?.length &&
        (group.primaryType === 'Album' ||
          group.primaryType === 'EP' ||
          group.primaryType === 'Single')) ||
      ((group.primaryType === 'EP' || group.primaryType === 'Single') &&
        group.secondaryTypes?.length === 1 &&
        group.secondaryTypes[0].toLowerCase() === 'soundtrack')
  );
  const otherGroups = shownGroups.filter((group) => !groups.includes(group));
  // the reveal lives in the address (replaced, not added), like other toggles
  const [params, setParams] = useSearchParams();
  const showHidden = params.get('others') === '1';
  const toggleHidden = () => {
    const next = new URLSearchParams(params);
    if (showHidden) next.delete('others');
    else next.set('others', '1');
    setParams(next, { replace: true });
  };
  useRequestedSongs();
  // One rule everywhere: an album the library has part of counts as "have
  // part of it" (its page offers the missing songs); it is not asked for again
  // by Get all, nor is a blocklisted one, one already requested anywhere, or a
  // single whose song was asked for.
  const missing = (group: ReleaseGroup) =>
    !group.inLibrary &&
    !group.partial &&
    !group.blocklisted &&
    !group.requested &&
    !asked.includes(group.id) &&
    !isAlbumRequested(group.id) &&
    !(
      group.primaryType === 'Single' &&
      isSongRequested(songKey(name, group.title))
    );
  const albums = groups.filter((group) => group.primaryType === 'Album');
  const smaller = groups.filter(
    (group) => group.primaryType === 'EP' || group.primaryType === 'Single'
  );
  const missingAlbums = albums.filter(missing);
  const missingSmaller = smaller.filter(missing);
  // "Get all": albums first, then EPs, then singles (the server skips what an
  // album request already covers)
  const missingEps = missingSmaller.filter(
    (group) => group.primaryType === 'EP'
  );
  const missingSingles = missingSmaller.filter(
    (group) => group.primaryType === 'Single'
  );
  const missingReleases = [...missingAlbums, ...missingEps, ...missingSingles];
  const ownedCount = allGroups.filter(
    (group) => group.inLibrary || group.partial
  ).length;
  const publicSettings = usePublicSettings();
  const canRequestSongs =
    canRequest && Boolean(publicSettings?.trackRequestsEnabled);
  const isFollowing = following ?? follow.data?.following ?? false;
  // following downloads future releases without a request, so the server limits it
  const canFollow = canRequest && follow.data?.canFollow !== false;

  const artistNameLower = name.trim().toLowerCase();
  const topTracks = list<AurralTrack>(songs.data?.tracks).filter(
    (track) =>
      (track.artistMbid &&
        track.artistMbid.toLowerCase() === id.toLowerCase()) ||
      track.artistName?.trim().toLowerCase() === artistNameLower
  );

  const requestAllPath = `/music/artist/${encodeURIComponent(id)}/request-all`;
  useEffect(() => {
    if (!canRequest) return;
    let live = true;
    setPagePlan(null);
    setPagePlanFailed(false);
    api<RequestAllPlan>(requestAllPath, {
      method: 'POST',
      body: JSON.stringify({ dryRun: true }),
    })
      .then((result) => {
        if (live) setPagePlan(result);
      })
      .catch(() => {
        if (live) setPagePlanFailed(true);
      });
    return () => {
      live = false;
    };
  }, [canRequest, requestAllPath, pagePlanNonce]);
  const openGetAll = async (kind: 'releases' | 'singles') => {
    setPlanError(null);
    setConfirm(kind);
    // the plan the page already asked for has the exact numbers
    if (pagePlan) {
      setPlan(pagePlan);
      return;
    }
    setPlan(null);
    try {
      setPlan(
        await api<RequestAllPlan>(requestAllPath, {
          method: 'POST',
          body: JSON.stringify({ dryRun: true }),
        })
      );
    } catch (error) {
      setPlanError(error ?? new Error('failed'));
    }
  };

  const getAll = async () => {
    const planned = plan
      ? plan.counts.albums +
        plan.counts.epsAndSingles +
        (plan.counts.songs ?? 0)
      : missingReleases.length;
    setConfirm(null);
    setBulk({ done: 0, total: planned });
    let result: RequestAllPlan | null = null;
    let failure: unknown = null;
    try {
      result = await api<RequestAllPlan>(requestAllPath, {
        method: 'POST',
        body: JSON.stringify({}),
      });
    } catch (error) {
      failure = error;
    }
    setBulk(null);
    if (!result) {
      toast(
        friendlyError(
          failure,
          t('lumen.music.getAllFailed', 'Could not request the releases.')
        )
      );
      return;
    }
    const results = result.results ?? [];
    const songResults = result.songResults ?? [];
    const requested = results.filter((item) => item.status === 'requested');
    const failed = [
      ...results.filter((item) => item.status === 'failed'),
      ...songResults.filter((item) => item.status === 'failed'),
    ];
    requested.forEach((item) => markAlbumRequested(item.mbid));
    markSongsRequested(
      songResults
        .filter((item) => item.status === 'requested')
        .map((item) => songKey(name, item.title))
    );
    const requestedCount =
      requested.length +
      songResults.filter((item) => item.status === 'requested').length;
    setAsked((current) => [
      ...current,
      ...results
        .filter((item) => item.status !== 'failed')
        .map((item) => item.mbid),
    ]);
    if (requestedCount)
      toast(
        requested.length === 0
          ? t('lumen.music.requestedSongs', 'Getting {count} songs', {
              count: requestedCount,
            })
          : t('lumen.music.requestedReleases', 'Getting {count} releases', {
              count: requestedCount,
            })
      );
    // always say how many failed; the first reason helps when there is one
    if (failed.length) {
      const said = t(
        'lumen.music.someRequestsFailed',
        '{count} could not be requested.',
        { count: failed.length }
      );
      const reason = result.stoppedReason ?? failed[0]?.reason ?? '';
      toast(reason && reason !== said ? `${said} ${reason}` : said);
    }
    revalidateDetails();
    setPagePlanNonce((n) => n + 1);
  };

  const getAllBody = () => {
    if (planError)
      return friendlyError(
        planError,
        t(
          'lumen.music.getAllPlanFailed',
          'Could not work out which releases to get. Try again.'
        )
      );
    if (!plan)
      return t(
        'lumen.music.getAllPlanning',
        'Working out which releases bring songs you do not have yet…'
      );
    const albumsCount = plan.counts.albums;
    const smallerCount = plan.counts.epsAndSingles;
    const songsCount = plan.counts.songs ?? 0;
    const skipped = plan.counts.covered
      ? ' ' +
        t(
          'lumen.music.skippedCoveredOrUnofficial',
          '{count} skipped: already covered or unofficial.',
          { count: plan.counts.covered }
        )
      : '';
    if (albumsCount + smallerCount + songsCount === 0)
      return (
        t(
          'lumen.music.getAllNothingNew',
          'Nothing new to request: you will already have every song.'
        ) + skipped
      );
    const albumsText =
      albumsCount === 1
        ? t('lumen.music.oneAlbum', '1 album')
        : t('lumen.music.albumCount', '{count} albums', {
            count: albumsCount,
          });
    const smallerText =
      smallerCount === 1
        ? t('lumen.music.oneSingleOrEp', '1 single or EP')
        : t('lumen.music.singlesEpsCount', '{count} singles & EPs', {
            count: smallerCount,
          });
    const songsText =
      songsCount === 1
        ? t('lumen.music.oneExtraSong', '1 extra song')
        : t('lumen.music.extraSongsCount', '{count} extra songs', {
            count: songsCount,
          });
    const parts = [
      albumsCount ? albumsText : '',
      smallerCount ? smallerText : '',
      songsCount ? songsText : '',
    ].filter(Boolean);
    const releases =
      parts.length === 3
        ? t('lumen.music.listOfThree', '{first}, {second} and {third}', {
            first: parts[0],
            second: parts[1],
            third: parts[2],
          })
        : parts.length === 2
          ? t('lumen.music.albumsAndSmaller', '{albums} and {smaller}', {
              albums: parts[0],
              smaller: parts[1],
            })
          : parts[0];
    return (
      t(
        'lumen.music.getAllPlanBody',
        '{releases} by {name} will be requested.',
        { releases, name }
      ) +
      skipped +
      ' ' +
      t(
        'lumen.music.aurralOneAfterAnother',
        'Aurral downloads them one after another.'
      )
    );
  };

  const toggleFollow = async () => {
    if (followBusy || !name) return;
    setFollowBusy(true);
    const before = isFollowing;
    // show the change at once; Aurral can take several seconds to answer
    setFollowing(!before);
    setFreshFollow(!before);
    try {
      const next = await api<{ following: boolean }>(
        `/music/artist/${encodeURIComponent(id)}/follow`,
        {
          method: 'PUT',
          body: JSON.stringify({ follow: !isFollowing, name }),
        }
      );
      setFollowing(next.following);
      toast(
        next.following
          ? t(
              'lumen.music.followingToast',
              'Following {name}: new releases will download',
              { name }
            )
          : t('lumen.music.unfollowedToast', 'Stopped following {name}', {
              name,
            })
      );
    } catch (error) {
      setFollowing(before);
      toast(
        friendlyError(
          error,
          t('lumen.music.followFailed', 'Could not change following.')
        )
      );
    } finally {
      setFollowBusy(false);
    }
  };

  const card = (group: ReleaseGroup) => (
    <ArtistReleaseCard
      key={group.id}
      group={group}
      artistName={name}
      canRequest={canRequest}
      asked={asked.includes(group.id)}
      onAsked={(groupId) => setAsked((current) => [...current, groupId])}
    />
  );
  // The Get button speaks the server plan's numbers (the dry run asked when
  // the page opened); without it (it failed) the page's own count stands in.
  const planAlbums = pagePlan?.counts.albums ?? 0;
  const planSmaller = pagePlan?.counts.epsAndSingles ?? 0;
  const planSongs = pagePlan?.counts.songs ?? 0;
  const allPlanned = Boolean(
    pagePlan && planAlbums + planSmaller + planSongs === 0
  );
  const getAllButton: { kind: 'releases' | 'singles'; label: string } | null =
    pagePlan
      ? planAlbums > 0
        ? {
            kind: 'releases',
            label: t(
              'lumen.music.getMissingReleases',
              'Get the {count} missing releases',
              { count: planAlbums + planSmaller }
            ),
          }
        : planSmaller > 0
          ? {
              kind: 'singles',
              label: t(
                'lumen.music.getSinglesEps',
                'Get {count} singles & EPs',
                { count: planSmaller }
              ),
            }
          : planSongs > 0
            ? {
                kind: 'singles',
                label: t('lumen.music.getMoreSongs', 'Get {count} more songs', {
                  count: planSongs,
                }),
              }
            : null
      : pagePlanFailed
        ? missingAlbums.length > 0
          ? {
              kind: 'releases',
              label: t(
                'lumen.music.getMissingReleases',
                'Get the {count} missing releases',
                { count: missingReleases.length }
              ),
            }
          : missingSmaller.length > 0
            ? {
                kind: 'singles',
                label: t(
                  'lumen.music.getSinglesEps',
                  'Get {count} singles & EPs',
                  { count: missingSmaller.length }
                ),
              }
            : null
        : null;
  const partlyOwnedAlbums = albums.filter(
    (group) => !group.inLibrary && group.partial
  ).length;

  if (details.error && !details.data)
    return (
      <div className="empty">
        <b>
          {t('lumen.music.artistUnavailable', 'This artist could not load')}
        </b>
        {details.error}
        <button
          type="button"
          className="btn btn-tonal btn-sm"
          onClick={details.reload}
        >
          {t('lumen.common.tryAgain', 'Try again')}
        </button>
      </div>
    );

  const d = details.data;
  return (
    <MusicDownloadsProvider>
      <article className="detail">
        <DetailTop
          backdrop={image}
          poster={image}
          square
          title={
            name ||
            (d
              ? t('lumen.music.unknownArtist', 'Unknown artist')
              : t('lumen.common.loading', 'Loading…'))
          }
          line={
            d
              ? [
                  d.type && d.type !== 'Person' ? d.type : '',
                  d.country ?? '',
                  d.beginYear
                    ? t('lumen.music.since', 'Since {year}', {
                        year: d.beginYear,
                      })
                    : '',
                  t('lumen.music.releaseCount', '{count} releases', {
                    count: allGroups.length,
                  }),
                  albums.length
                    ? albums.every((group) => group.inLibrary)
                      ? t(
                          'lumen.music.allAlbumsOwned',
                          'All albums in your library'
                        )
                      : partlyOwnedAlbums > 0
                        ? t(
                            'lumen.music.ownedAlbumsPartly',
                            'You have {owned} of {total} albums, {partly} in part',
                            {
                              owned: albums.filter(
                                (group) => group.inLibrary || group.partial
                              ).length,
                              total: albums.length,
                              partly: partlyOwnedAlbums,
                            }
                          )
                        : t(
                            'lumen.music.ownedAlbums',
                            'You have {owned} of {total} albums',
                            {
                              owned: albums.filter((group) => group.inLibrary)
                                .length,
                              total: albums.length,
                            }
                          )
                    : '',
                ]
              : []
          }
        />
        <div className="dbody">
          {d?.bio && (
            <div className="music-artist-about">
              <p
                className={
                  bioOpen ? 'music-artist-bio' : 'music-artist-bio clamp'
                }
                id="music-artist-bio"
              >
                {d.bio}
              </p>
              {d.bio.length > 160 && (
                <button
                  type="button"
                  className="linklike"
                  aria-expanded={bioOpen}
                  aria-controls="music-artist-bio"
                  onClick={() => setBioOpen((open) => !open)}
                >
                  {bioOpen
                    ? t('lumen.music.showLess', 'Show less')
                    : t('lumen.music.readMore', 'Read more')}
                </button>
              )}
            </div>
          )}
          <div className="dstatus music-artist-acts">
            {canRequest && getAllButton && (
              <button
                type="button"
                className={
                  getAllButton.kind === 'releases'
                    ? 'btn btn-primary btn-sm'
                    : 'btn btn-quiet btn-sm'
                }
                disabled={Boolean(bulk)}
                onClick={() => void openGetAll(getAllButton.kind)}
              >
                <Icon name="plus" size="sm" />
                {getAllButton.label}
              </button>
            )}
            {ownedCount > 0 && (
              <PlayButton
                className="btn btn-sm music-owned-btn"
                target={{ kind: 'artist', artist: { name, mbid: id } }}
              />
            )}
            {canFollow && (
              <button
                type="button"
                className={
                  isFollowing
                    ? freshFollow
                      ? 'btn btn-tonal btn-sm music-following fresh'
                      : 'btn btn-tonal btn-sm music-following'
                    : 'btn btn-tonal btn-sm'
                }
                onMouseLeave={() => setFreshFollow(false)}
                aria-pressed={isFollowing}
                aria-describedby="music-follow-help"
                // a failed lookup leaves Follow usable (as not following)
                disabled={
                  followBusy || !name || (!follow.data && !follow.error)
                }
                onClick={() =>
                  isFollowing ? setConfirm('unfollow') : void toggleFollow()
                }
              >
                <Icon name={isFollowing ? 'check' : 'plus'} size="sm" />
                {isFollowing ? (
                  <>
                    <span className="when-idle">
                      {t('lumen.music.followingLabel', 'Following')}
                    </span>
                    <span className="when-hover">
                      {t('lumen.music.unfollow', 'Unfollow')}
                    </span>
                  </>
                ) : (
                  t('lumen.music.follow', 'Follow')
                )}
              </button>
            )}

            {bulk && (
              <Pill k="dl" icon="down">
                {t(
                  'lumen.music.requestingProgress',
                  'Requesting {done} of {total}',
                  { done: bulk.done, total: bulk.total }
                )}
              </Pill>
            )}
          </div>
          {canRequest && allPlanned && (
            <p className="music-follow-help music-all-had">
              {t(
                'lumen.music.everythingHad',
                'Everything by {name} is in your library or on its way.',
                { name }
              )}
            </p>
          )}
          {canFollow && (
            <p className="music-follow-help" id="music-follow-help">
              {isFollowing
                ? t(
                    'lumen.music.followingHelp',
                    'New albums and singles by {name} download automatically. Tap Following to stop.',
                    { name }
                  )
                : t(
                    'lumen.music.followHelp2',
                    'Follow to get new albums and singles automatically when they come out.'
                  )}
            </p>
          )}
          {d?.genres?.length ? (
            <div className="chips wrap music-artist-genres">
              {d.genres.map((genre) => (
                <Link
                  key={genre}
                  className="chip"
                  to={`/music?genre=${encodeURIComponent(genre)}`}
                >
                  {genre}
                </Link>
              ))}
            </div>
          ) : null}
          {!d && <div className="detail-loading" aria-busy="true" />}
          {incomplete && (
            <div className="empty" role="status">
              <b>
                {t(
                  'lumen.music.artistIncomplete',
                  'The catalog has not answered for this artist yet'
                )}
              </b>
              {t(
                'lumen.music.artistIncompleteHelp',
                'Albums and songs usually appear within a minute.'
              )}
              <button
                type="button"
                className="btn btn-tonal btn-sm"
                onClick={() => {
                  setCatalogRetries(0);
                  details.revalidate();
                }}
              >
                {t('lumen.common.tryAgain', 'Try again')}
              </button>
            </div>
          )}
          {topTracks.length > 0 && (
            <Section title={t('lumen.music.topSongs', 'Top songs')}>
              <MusicSongList
                tracks={topTracks}
                maxItems={10}
                canRequest={canRequestSongs}
              />
            </Section>
          )}
          {(
            [
              ['albums', t('lumen.music.albums', 'Albums'), albums],
              [
                'singles',
                t('lumen.music.singlesEps', 'Singles & EPs'),
                smaller,
              ],
              [
                'other',
                t('lumen.music.otherReleases', 'Live, compilations and more'),
                otherGroups,
              ],
            ] as const
          ).map(([key, title, items]) =>
            items.length ? (
              <Section
                key={key}
                title={title}
                action={
                  items.length > 6 ? (
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      onClick={() =>
                        setExpanded((current) =>
                          current.includes(key)
                            ? current.filter((k) => k !== key)
                            : [...current, key]
                        )
                      }
                    >
                      {expanded.includes(key)
                        ? t('lumen.music.showLess', 'Show less')
                        : t('lumen.music.seeAllCount', 'See all {count}', {
                            count: items.length,
                          })}
                    </button>
                  ) : undefined
                }
              >
                {expanded.includes(key) ? (
                  <div className="sqg grid">{items.map(card)}</div>
                ) : (
                  <Rail>{items.map(card)}</Rail>
                )}
              </Section>
            ) : null
          )}
          {hiddenGroups.length > 0 && (
            <div className="music-hidden-releases">
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                aria-expanded={showHidden}
                onClick={toggleHidden}
              >
                {showHidden
                  ? t(
                      'lumen.music.hideOtherReleases',
                      'Hide other editions and singles'
                    )
                  : t(
                      'lumen.music.showOtherReleases',
                      'Show {count} other editions and singles',
                      { count: hiddenGroups.length }
                    )}
              </button>
              {showHidden && (
                <div className="music-hidden-groups">
                  <h2 className="h2">
                    {t(
                      'lumen.music.otherEditionsTitle',
                      'Other editions and singles'
                    )}
                  </h2>
                  {(
                    [
                      [
                        'sameAlbum',
                        t('lumen.music.hiddenEditions', 'Other editions'),
                      ],
                      [
                        'covered',
                        t(
                          'lumen.music.hiddenCovered',
                          'Songs already on the albums'
                        ),
                      ],
                      [
                        'unofficial',
                        t(
                          'lumen.music.hiddenUnofficial',
                          'Promo and unofficial releases'
                        ),
                      ],
                    ] as const
                  ).map(([code, title]) => {
                    const items = hiddenGroups.filter(
                      (group) => group.redundant?.code === code
                    );
                    return items.length ? (
                      <Section key={code} title={title}>
                        <div className="sqg grid">
                          {items.map((group) => (
                            <HiddenReleaseCard
                              key={group.id}
                              group={group}
                              artistName={name}
                              canRequest={canRequest}
                              asked={asked.includes(group.id)}
                              onAsked={(groupId) =>
                                setAsked((current) => [...current, groupId])
                              }
                            />
                          ))}
                        </div>
                      </Section>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          )}
          <SimilarArtists id={id} />
        </div>
        {confirm === 'unfollow' && (
          <ConfirmSheet
            title={t('lumen.music.unfollowTitle', 'Stop following {name}?', {
              name,
            })}
            body={t(
              'lumen.music.unfollowBody',
              'New releases will no longer download. Music you already have stays in your library.'
            )}
            confirm={t('lumen.music.unfollow', 'Unfollow')}
            cancel={t('lumen.common.cancel', 'Cancel')}
            onConfirm={() => {
              setConfirm(null);
              void toggleFollow();
            }}
            onClose={() => setConfirm(null)}
          />
        )}
        {(confirm === 'releases' || confirm === 'singles') && (
          <ConfirmSheet
            title={
              confirm === 'releases'
                ? t(
                    'lumen.music.getAllReleasesTitle',
                    'Get all releases by {name}?',
                    { name }
                  )
                : plan &&
                    plan.counts.epsAndSingles === 0 &&
                    (plan.counts.songs ?? 0) > 0
                  ? t(
                      'lumen.music.getSongsTitle',
                      'Get more songs by {name}?',
                      {
                        name,
                      }
                    )
                  : t(
                      'lumen.music.getSinglesTitle',
                      'Get the singles and EPs by {name}?',
                      { name }
                    )
            }
            body={getAllBody()}
            confirm={t('lumen.music.getThem', 'Get them')}
            cancel={t('lumen.common.cancel', 'Cancel')}
            busy={!plan && !planError}
            confirmDisabled={
              !plan ||
              plan.counts.albums +
                plan.counts.epsAndSingles +
                (plan.counts.songs ?? 0) ===
                0
            }
            onConfirm={() => void getAll()}
            onClose={() => setConfirm(null)}
          />
        )}
      </article>
    </MusicDownloadsProvider>
  );
}

function SimilarArtists({ id }: { id: string }) {
  const { t } = useLumenLocale();
  const similar = useApi<{
    artists?: {
      mbid: string | null;
      name: string;
      image: string | null;
      inLibrary?: boolean;
    }[];
  }>(`/music/artist/${encodeURIComponent(id)}/similar`);
  const artists = list<{
    mbid: string | null;
    name: string;
    image: string | null;
    inLibrary?: boolean;
  }>(similar.data?.artists);
  if (!artists.length) return null;
  return (
    <Section title={t('lumen.music.fansAlsoLike', 'Fans also like')}>
      <Rail>
        {artists.map((artist) => (
          <ArtistCircle
            key={artist.mbid ?? artist.name}
            name={artist.name}
            mbid={artist.mbid}
            image={artist.image}
            inLibrary={artist.inLibrary === true}
          />
        ))}
      </Rail>
    </Section>
  );
}
