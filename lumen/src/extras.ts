// The categories beyond movies, series and books: music, comics, magazines, games, sports and
// adult. Each one only shows up when the SeerrNG admin has turned it on; the server checks again
// on every call, so a hidden page that someone opens by URL just explains it's off.
import { useEffect, useState } from 'react';
import { canRequestAdult } from './adultPermissions';
import { api, ApiError, type MediaInfo, type MusicServiceSummary } from './api';
import { isAdministrator, useAuth } from './auth';
import { useApi, type PublicSettings } from './hooks';
import type { IconName } from './icons';
import { services } from './mediaServer';
import { markAlbumRequested } from './musicState';
import { onSessionReset, sessionUserId } from './sessionState';

export type Extra =
  'music' | 'podcast' | 'comic' | 'magazine' | 'game' | 'sports' | 'adult';
// games cover three SeerrNG categories: PC games, retro consoles and modern consoles
export type GameCategory = 'game' | 'retro' | 'modern';

export const EXTRAS: {
  key: Extra;
  path: string;
  icon: IconName;
  label: string;
  message: string;
}[] = [
  {
    key: 'music',
    path: '/music',
    icon: 'music',
    label: 'Music',
    message: 'components.Layout.Sidebar.browsemusic',
  },
  {
    key: 'podcast',
    path: '/podcasts',
    icon: 'mic',
    label: 'Podcasts',
    message: 'lumen.nav.podcasts',
  },
  {
    key: 'comic',
    path: '/comics',
    icon: 'comic',
    label: 'Comics/Manga',
    message: 'lumen.nav.comicsManga',
  },
  {
    key: 'magazine',
    path: '/magazines',
    icon: 'magazine',
    label: 'Magazines',
    message: 'components.Layout.Sidebar.browsemagazines',
  },
  {
    key: 'game',
    path: '/games',
    icon: 'game',
    label: 'Games',
    message: 'lumen.nav.games',
  },
  {
    key: 'sports',
    path: '/sports',
    icon: 'trophy',
    label: 'Sports',
    message: 'components.Layout.Sidebar.browsesports',
  },
  {
    key: 'adult',
    path: '/adult',
    icon: 'lock',
    label: 'Adult',
    message: 'components.Layout.Sidebar.browseadult',
  },
];
export const GAME_LABEL: Record<GameCategory, string> = {
  game: 'PC games',
  retro: 'Retro consoles',
  modern: 'Modern consoles',
};

// A category can be on with nothing behind it (Sports on, no Sportarr). One cheap call per
// category tells whether its catalogue answers; the menus leave out the ones that don't.
const PROBE: Partial<Record<Extra, string>> = {
  podcast: '/podcast/status',
  comic: '/discover/comics',
  magazine: '/discover/magazines?catalog=tracked',
  sports: '/discover/sports',
  adult: '/adult/search',
};
type ProbeEntry = { at: number; result: Promise<boolean> };
const probes = new Map<string, ProbeEntry>();
// answers are kept for the tab for 10 minutes, so reloading a page doesn't re-ask
// SeerrNG about every unconfigured category (they count against its rate limit)
// (kept per account: what answers can depend on permissions)
const PROBE_TTL = 10 * 60_000;
const probeKey = () => `lumen-probes:${sessionUserId() ?? 'none'}`;
const savedProbes = (key: string): Record<string, [boolean, number]> => {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
  } catch {
    return {};
  }
};
const saveProbe = (key: string, path: string, ok: boolean) => {
  try {
    const all = savedProbes(key);
    all[path] = [ok, Date.now()];
    sessionStorage.setItem(key, JSON.stringify(all));
  } catch {
    // storage full or blocked: just ask again next time
  }
};
onSessionReset(() => probes.clear());
const probe = (path: string, configured = false) => {
  // A connected game catalog may be temporarily unavailable. Keep its page and
  // Retry reachable; explicit denials and missing endpoints still stay hidden.
  const cachePath = configured ? `configured:${path}` : path;
  const key = probeKey();
  const now = Date.now();
  const previous = probes.get(cachePath);
  if (previous && (previous.at > now || now - previous.at >= PROBE_TTL))
    probes.delete(cachePath);
  const saved = savedProbes(key)[cachePath];
  if (
    !probes.has(cachePath) &&
    Array.isArray(saved) &&
    typeof saved[0] === 'boolean' &&
    Number.isFinite(saved[1]) &&
    Date.now() - saved[1] >= 0 &&
    Date.now() - saved[1] < PROBE_TTL
  )
    probes.set(cachePath, { at: saved[1], result: Promise.resolve(saved[0]) });
  if (!probes.has(cachePath)) {
    const pending: ProbeEntry = {
      at: now,
      result: api<{ comicVineConfigured?: boolean; configured?: boolean }>(path)
        // podcasts answer { configured } (an Audiobookshelf podcast library exists)
        .then((d) =>
          path === '/podcast/status'
            ? d?.configured === true
            : d?.comicVineConfigured !== false
        )
        // Unknown configuration can also report 503. Explicit configured catalogs
        // use their own cache namespace so old negative probes cannot hide recovery.
        .catch(
          (e) =>
            !(
              e instanceof ApiError &&
              ((e.status === 503 && !configured) ||
                e.status === 404 ||
                e.status === 403)
            )
        )
        .then((ok) => {
          if (probes.get(cachePath) === pending) {
            pending.at = Date.now();
            saveProbe(key, cachePath, ok);
          }
          return ok;
        }),
    };
    probes.set(cachePath, pending);
  }
  return probes.get(cachePath)!.result;
};
const GAME_PROBE = '/request/software/catalog/popular?category=';
// drop the kept answers for one kind of check, so the next probe asks SeerrNG again
const forgetProbes = (part: string) => {
  for (const k of [...probes.keys()]) if (k.includes(part)) probes.delete(k);
  try {
    const key = probeKey();
    const all = savedProbes(key);
    for (const k of Object.keys(all)) if (k.includes(part)) delete all[k];
    sessionStorage.setItem(key, JSON.stringify(all));
  } catch {
    // storage blocked: nothing was kept there
  }
};

// which extras this server has turned on (games count when any of its three categories is)
export function useExtras() {
  const settings = useApi<PublicSettings>('/settings/public');
  const pub = settings.data;
  // what this account may see: SeerrNG gives each user their own categories (an admin gets all
  // of them). Until that answers nothing is probed, so a hidden category is never asked for.
  const { user } = useAuth();
  const contentRestricted = user
    ? typeof user.contentRestricted === 'boolean'
      ? user.contentRestricted
      : !isAdministrator(user.permissions) &&
        settings.data?.ageGate?.defaultRestricted === true
    : false;
  const adultAccessAllowed =
    !contentRestricted && canRequestAdult(user?.permissions);
  const mine = useApi<{ enabledMediaCategories?: Record<string, boolean> }>(
    user ? `/user/${user.id}/settings/main` : null
  );
  const userSettled = user !== undefined && (!user || !!mine.data);
  const own = mine.data?.enabledMediaCategories;
  const global = pub?.enabledMediaCategories || {};
  // a category must be on for the whole server *and* for this account
  const on: Record<string, boolean> = { ...global };
  if (own) for (const k of Object.keys(on)) if (own[k] === false) on[k] = false;
  const svc = services();
  const games = (['game', 'retro', 'modern'] as GameCategory[]).filter(
    (c) => on[c] && (c === 'game' ? svc.software : svc.software || svc.romarr)
  );
  // the category must be on in SeerrNG *and* have its service connected
  const connected: Record<Extra, boolean> = {
    music: svc.music,
    // no SeerrNG category: shown when Audiobookshelf has a podcast library (probed)
    podcast: true,
    comic: svc.comics,
    magazine: svc.magazines,
    // consoles can come from ROMarrNG alone; each category is checked below
    game: svc.software || svc.romarr,
    sports: svc.sports,
    adult: true,
  };
  const enabled = (k: Extra) =>
    connected[k] &&
    (k === 'game'
      ? games.length > 0
      : k === 'adult'
        ? !!on.adult && !!pub?.adultEnabled
        : k === 'podcast'
          ? true
          : !!on[k]);
  const [working, setWorking] = useState<Set<Extra> | null>(null);
  // the game categories whose catalogue answers (PC games need QuestarrNG, consoles may not)
  const [gamesWorking, setGamesWorking] = useState<GameCategory[] | null>(null);
  // Retry on Games: forget the saved game answers and ask again
  const [recheck, setRecheck] = useState(0);
  const key =
    EXTRAS.map((e) =>
      enabled(e.key) && (e.key !== 'adult' || adultAccessAllowed) ? e.key : ''
    ).join(',') +
    games.join(',') +
    recheck;
  useEffect(() => {
    if (!pub || !userSettled) return;
    let live = true;
    const keys = EXTRAS.map((e) => e.key).filter(
      (category) =>
        enabled(category) && (category !== 'adult' || adultAccessAllowed)
    );
    Promise.all(
      keys.map((k) =>
        k === 'game'
          ? Promise.all(
              games.map((c) =>
                probe(
                  `${GAME_PROBE}${c}&limit=1`,
                  pub.softwareEnabled === true ||
                    (c !== 'game' && pub.romarrEnabled === true)
                )
              )
            ).then((r) => {
              if (live) setGamesWorking(games.filter((_, i) => r[i]));
              return r.some(Boolean);
            })
          : PROBE[k]
            ? probe(PROBE[k]!)
            : Promise.resolve(true)
      )
    ).then((r) => live && setWorking(new Set(keys.filter((_, i) => r[i]))));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, !!pub, userSettled]);
  return {
    ready: !!pub && userSettled,
    accountReady: userSettled,
    // SeerrNG's settings couldn't be read: the pages that wait for them offer Retry
    error: !pub ? settings.error : user && !mine.data ? mine.error : null,
    retry: () => {
      if (!pub) settings.reload();
      if (user && !mine.data) mine.reload();
    },
    enabled,
    // raw server/account category visibility, independent of connected services
    categoryEnabled: (category: string) => on[category] !== false,
    accountCategoryEnabled: (category: string) => own?.[category] !== false,
    // until the checks answer, list none (so Games doesn't load a dead category first)
    games: !enabled('game')
      ? games
      : games.filter((c) => gamesWorking?.includes(c)),
    // the game catalogue checks have answered (games above may still be empty: none works)
    gamesChecked: !enabled('game') || gamesWorking !== null,
    recheckGames: () => {
      forgetProbes(GAME_PROBE);
      setGamesWorking(null);
      setRecheck((n) => n + 1);
    },
    list: EXTRAS.filter(
      (e) =>
        enabled(e.key) &&
        working?.has(e.key) &&
        (e.key !== 'adult' || adultAccessAllowed)
    ),
  };
}

// one request call for every extra except games: the media type and its own id
export const requestExtra = (
  mediaType: Exclude<Extra, 'game'>,
  mediaId: string | number,
  serverId?: number,
  rootFolder?: string,
  // music: ask even when the songs will already come from another release
  options: { force?: boolean } = {}
) =>
  api('/request', {
    method: 'POST',
    body: JSON.stringify({
      mediaType,
      mediaId,
      ...(serverId !== undefined ? { serverId } : {}),
      ...(rootFolder ? { rootFolder } : {}),
      ...(options.force ? { force: true } : {}),
    }),
  }).then((result) => {
    // every card, the top result and the album page show this album as asked for
    if (mediaType === 'music') markAlbumRequested(String(mediaId));
    return result;
  });

// ---- music (MusicBrainz release groups, requested through Lidarr) ----
export interface Album {
  id: string;
  mediaType: 'album';
  title: string;
  'primary-type'?: string;
  secondary_types?: string[];
  'first-release-date'?: string;
  'artist-credit'?: { name: string; artist?: { id: string; name: string } }[];
  posterPath?: string;
  needsCoverArt?: boolean;
  availableQualities?: ('MP3' | 'FLAC')[];
  qualityStatuses?: { quality: 'MP3' | 'FLAC'; status: number }[];
  mediaInfo?: MediaInfo;
  // the music library's own state of this album (all or part of its songs)
  inLibrary?: boolean;
  partial?: boolean;
  libraryTrackCount?: number;
  libraryAvailableTrackCount?: number;
}
export interface AlbumDetails {
  onUserWatchlist?: boolean;
  id: string;
  title: string;
  type?: string;
  releaseDate?: string;
  artist: {
    id: string;
    name: string;
    area?: string;
    beginYear?: number;
    type?: string;
  };
  tracks?: {
    name: string;
    position: number;
    length?: number;
    recordingMbid?: string;
    totalListenCount?: number;
    artists?: { name: string; mbid: string }[];
  }[];
  tags?: {
    releaseGroup?: { tag: string; count: number }[];
    artist?: { tag: string; count: number }[];
  };
  stats?: { totalListenCount?: number; totalUserCount?: number };
  posterPath?: string;
  recordLabel?: string;
  artistThumb?: string;
  artistBackdrop?: string;
  trackAvailability?: {
    mp3?: string[];
    flac?: string[];
    // songs of this release owned on another one (same artist and title)
    elsewhere?: string[];
  };
  // the music library's own count of this album's songs (the Library tab's)
  libraryAlbum?: {
    status: 'owned' | 'partial';
    trackCount: number;
    availableTrackCount: number;
  };
  // a single whose songs are on an album (or another edition): where they are
  redundant?: {
    code: 'sameAlbum' | 'covered';
    reason: string;
    coveredBy: { mbid: string; title: string };
  };
  mediaInfo?: MediaInfo;
  availableServices?: { serverId: number; quality: string }[];
}

export interface TrackRequestStatus {
  configured: boolean;
  slskdnConfigured?: boolean;
  aurralConfigured?: boolean;
  backend?: 'aurral' | 'slskdn' | null;
  canRequest: boolean;
}

export interface TrackRequestItem {
  id: number;
  status:
    'pending' | 'searching' | 'completed' | 'failed' | 'declined' | 'cancelled';
  backendType?: 'slskdn' | 'aurral';
  artist: string;
  title: string;
  recordingMbid?: string | null;
  source?: string;
  searchCount: number;
  lastMatchCount: number;
  lastError?: string | null;
  lastErrorMessageKey?: string | null;
  createdAt: string;
  updatedAt?: string;
  requestedBy?: { id: number; displayName: string };
}

export const hasAurralMusicService = (
  services?: MusicServiceSummary[] | null,
  trackStatus?: TrackRequestStatus | null
) =>
  Boolean(
    trackStatus?.aurralConfigured ||
    // an unexpected answer (not a list) must not take the music page down
    (Array.isArray(services) &&
      services.some((service) => service?.backendType === 'aurral'))
  );
/**
 * The Lumen music pages (Discover, search, artist, library, activity) work
 * with Aurral or Lidarr; the server answers them from whichever is set up.
 */
export const hasMusicPagesService = (
  services?: MusicServiceSummary[] | null,
  trackStatus?: TrackRequestStatus | null
) =>
  hasAurralMusicService(services, trackStatus) ||
  (Array.isArray(services) &&
    services.some((service) => service?.backendType === 'lidarr'));
export interface ArtistDetails {
  artist: {
    id?: string;
    name: string;
    area?: string;
    type?: string;
    beginYear?: number;
  };
  wikipedia?: {
    content?: string;
    extract?: string;
    title?: string;
    url?: string;
  } | null;
  artistThumb?: string;
  artistBackdrop?: string;
  releaseGroups: Album[];
  typeCounts?: Record<string, number>;
}

export interface AurralArtist {
  mbid: string | null;
  name: string;
  image: string | null;
  inLibrary: boolean;
}

export interface AurralAlbum {
  mbid: string | null;
  title: string;
  artistName: string;
  artistMbid: string | null;
  primaryType: string;
  releaseDate: string | null;
  coverUrl: string | null;
  inLibrary: boolean;
  mediaInfo?: MediaInfo;
  // part of its songs are in the library, with the library's own counts
  partial?: boolean;
  libraryTrackCount?: number;
  libraryAvailableTrackCount?: number;
}

export interface AurralTrack {
  title: string;
  artistName: string;
  artistMbid: string | null;
  albumTitle: string | null;
  albumMbid: string | null;
  durationMs: number | null;
  coverUrl: string | null;
  inLibrary: boolean;
  // its album is requested or downloading: the song is on its way too
  albumRequested?: boolean;
}

export type AurralTopResult =
  | ({ type: 'artist' } & AurralArtist)
  | ({ type: 'album' } & AurralAlbum)
  | ({ type: 'track' } & AurralTrack)
  | null;

export interface AurralSearchResponse {
  artists: AurralArtist[];
  albums: AurralAlbum[];
  tracks: AurralTrack[];
  top: AurralTopResult;
  // artist/album catalog was unavailable; songs may still be shown
  degraded?: boolean;
  // the person's own library, searched first
  library?: {
    artists?: AurralArtist[];
    albums?: AurralAlbum[];
    tracks?: AurralTrack[];
  } | null;
  // a pasted Spotify/Apple Music/YouTube Music/TIDAL/Deezer link, resolved
  link?: {
    type?: 'track' | 'album' | 'artist' | 'playlist';
    provider?: string | null;
    id?: string | null;
    mbid?: string | null;
    title?: string | null;
    artistName?: string | null;
    albumMbid?: string | null;
  } | null;
  // the query actually used when the original found nothing
  correctedQuery?: string | null;
}

export interface AurralTrendingResponse {
  artists: AurralArtist[];
  albums: AurralAlbum[];
  tracks: AurralTrack[];
}

export interface AurralGenresResponse {
  tags: string[];
}

export interface AurralGenreResponse {
  tag: string;
  artists: AurralArtist[];
}
export const artistOf = (a: Pick<Album, 'artist-credit'>) =>
  a['artist-credit']?.map((c) => c.name).join(', ') || '';
export const fmtTrack = (ms?: number) => {
  if (!ms) return '';
  // round the whole length first: 3:59.6 is 4:00, never 3:60
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

// ---- comics (ComicVine volumes) and magazines (LazyLibrarian or Google Books) ----
export interface Comic {
  onUserWatchlist?: boolean;
  id: string;
  mediaType: 'comic';
  title: string;
  publisher?: string;
  startYear?: string;
  issueCount?: number;
  posterPath?: string;
  deck?: string;
  description?: string;
  siteDetailUrl?: string;
  issues?: ComicIssue[];
  mediaInfo?: MediaInfo;
  manga?: boolean; // manga or manhwa, not a Western comic
  edition?: 'en' | 'ja';
  label?: string; // e.g. "Manga · English edition · Yen Press · 13 vols"
}
// One card per work: a manga (an AniList series, id "al-<id>") or a Western
// run (id = its main ComicVine volume). Each edition is one ComicVine volume
// (Viz's English Chainsaw Man, Norma's Spanish one…); requests go out for one
// edition, the English one by default.
export interface ComicEdition {
  id: string;
  title: string;
  publisher?: string;
  language?: string;
  languageName?: string;
  startYear?: string;
  issueCount?: number;
  posterPath?: string;
  recommended?: boolean;
  mediaInfo?: MediaInfo;
}
export interface ComicWork {
  id: string;
  mediaType: 'comic';
  kind: 'manga' | 'comic';
  title: string;
  anilistId?: number;
  posterPath?: string;
  startYear?: string;
  publisher?: string;
  issueCount?: number;
  status?: 'ongoing' | 'finished' | 'hiatus' | 'cancelled';
  genres?: string[];
  description?: string;
  editions: ComicEdition[];
  // false for a manga from AniList whose ComicVine editions aren't looked up yet
  editionsResolved: boolean;
  recommendedId?: string;
  mediaInfo?: MediaInfo;
  mediaEditionId?: string;
}
export interface ComicLanding {
  library: ComicWork[];
  trending: ComicWork[];
  newest: ComicWork[];
  western: ComicWork[];
  failed: string[];
  genres: string[];
  publishers: string[];
  comicVineConfigured: boolean;
}
// a work's editions, looked up on ComicVine the first time a manga is opened
export const loadComicWork = (id: string) =>
  api<ComicWork>(`/comic/work/${encodeURIComponent(id)}`);
// the edition a quick request asks for: the recommended (English) one
export const recommendedEdition = (w: ComicWork) =>
  w.editions.find((e) => e.id === w.recommendedId);
export const editionLine = (e: ComicEdition, unit = 'vol') =>
  [
    e.languageName,
    e.publisher,
    e.startYear,
    e.issueCount
      ? `${e.issueCount} ${unit}${e.issueCount === 1 ? '' : 's'}`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');

export interface ComicIssue {
  id: string;
  name?: string;
  issueNumber?: string;
  coverDate?: string;
  coverUrl?: string;
}
export interface Magazine {
  onUserWatchlist?: boolean;
  id: string;
  mediaType: 'magazine';
  provider: 'lazylibrarian' | 'googlebooks';
  title: string;
  posterPath?: string;
  publisher?: string;
  firstPublishYear?: number;
  status?: string;
  latestIssue?: string;
  issueCount?: number;
  requestable?: boolean;
  issues?: { id: string; date?: string; available: boolean }[];
  mediaInfo?: MediaInfo;
}

const comicDescriptionEntities: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&#039;': "'",
  '&lt;': '<',
  '&gt;': '>',
};

// ComicVine descriptions are HTML; show them as plain paragraphs.
export const plainText = (html?: string) =>
  (typeof html === 'string' ? html : '')
    .replace(/<\/(p|h\d|li|div)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(
      /&(?:nbsp|amp|quot|#0?39|lt|gt);/g,
      (entity) => comicDescriptionEntities[entity]
    )
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

// ---- games (IGDB or DAT catalogue, requested through QuestarrNG / ROMarrNG) ----
export interface Game {
  id: string;
  catalogProvider: 'igdb' | 'dat';
  catalogId: string;
  igdbId?: number;
  title: string;
  summary: string;
  coverUrl: string;
  releaseDate: string;
  platforms: string[];
  genres: string[];
  emulationSystems?: {
    slug: string;
    name: string;
    group: 'retro' | 'modern';
  }[];
  availability?:
    'available' | 'owned' | 'tracked' | 'downloading' | 'missing' | 'unknown';
  availableSystems?: string[];
  trackedSystems?: string[];
  steamOwned?: boolean;
  rating?: number | null;
  publishers?: string[];
  developers?: string[];
  screenshots?: string[];
  videos?: { name: string; videoId: string }[];
  timeToBeat?: {
    hastily?: number;
    normally?: number;
    completely?: number;
  } | null;
}
export interface GamePage {
  results: Game[];
  nextCursor?: string | null;
  nextOffset?: number | null;
}

export function unwrapCatalogGame(response: Game | { game: Game } | null) {
  if (!response || typeof response !== 'object') return null;
  const game = 'game' in response ? response.game : response;
  return game && typeof game === 'object' ? game : null;
}
export const PC_OS = [
  ['windows', 'Windows'],
  ['linux', 'Linux'],
  ['macos', 'macOS'],
] as const;
export const PC_ARCH = [
  ['x64', '64-bit (x64)'],
  ['arm64', 'ARM64'],
  ['x86', '32-bit (x86)'],
  ['universal', 'Universal'],
] as const;
export const PATCH_ID = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,127}$/;

export function patchHref(
  id: string,
  version?: string,
  category?: GameCategory,
  platform?: string | null
) {
  if (!PATCH_ID.test(id) || (version && !PATCH_ID.test(version))) return;
  const query = new URLSearchParams();
  if (version) query.set('version', version);
  if (category === 'modern') query.set('category', category);
  if (platform && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(platform))
    query.set('platform', platform);
  return `/patches/${encodeURIComponent(id)}${query.size ? `?${query}` : ''}`;
}

export type PatchSelection = {
  kind: 'patch';
  projectId: string;
  versionId?: string;
  keepOriginal: boolean;
};

type Content = {
  igdbId: number;
  title: string;
  owned: boolean;
  storyContent: boolean | null;
  type?:
    | 'expansion'
    | 'dlc'
    | 'cosmetic'
    | 'season-pass'
    | 'bonus'
    | 'soundtrack'
    | 'unknown';
  releaseDate?: string;
};
type Edition = {
  igdbId: number;
  title: string;
  summary?: string;
  releaseDate?: string;
  owned: boolean;
  contentKnown: boolean;
  includes: Content[];
};
type GameContentCatalog = {
  available: boolean;
  base?: { igdbId: number; title: string; owned: boolean; status?: string };
  editions?: Edition[];
  addons?: Content[];
};
export function useGameContentCatalog(id?: number | null) {
  return useApi<GameContentCatalog>(
    typeof id === 'number' && Number.isSafeInteger(id) && id > 0
      ? `/game-content/${id}/editions`
      : null
  );
}

export type GameContentSelection =
  | { kind: 'game-content'; mode: 'edition'; editionId: number; addonIds: [] }
  | { kind: 'game-content'; mode: 'missing-selected'; addonIds: number[] };

export const requestGame = (
  category: GameCategory,
  g: Game,
  pick: {
    os?: string;
    arch?: string;
    system?: string;
    selection?: PatchSelection | GameContentSelection;
  }
) =>
  api<{ request: { status: string; id?: number } }>('/request/software', {
    method: 'POST',
    body: JSON.stringify({
      category,
      selection: pick.selection,
      catalogProvider: g.catalogProvider,
      ...(g.catalogProvider === 'dat'
        ? { catalogKey: g.catalogId }
        : { catalogId: g.igdbId }),
      ...(category === 'game'
        ? { variant: { operatingSystem: pick.os, architecture: pick.arch } }
        : { platformSlug: pick.system }),
    }),
  });
// a game's state in plain words, from the catalogue's availability field
export const gameState = (g: Game) =>
  g.availability === 'available'
    ? 'In library'
    : g.availability === 'owned'
      ? 'Owned in QuestarrNG'
      : g.availability === 'downloading'
        ? 'Downloading'
        : g.availability === 'tracked'
          ? 'Tracked'
          : g.availability === 'unknown'
            ? 'Availability unknown'
            : '';

export interface SoftwareRequest {
  request: {
    id: number;
    requestedBy?: { id: number; displayName: string } | null;
    category: GameCategory;
    status: string;
    title: string;
    coverUrl: string | null;
    catalogId: number | null;
    catalogKey: string | null;
    catalogProvider: 'igdb' | 'dat';
    selection?:
      | PatchSelection
      | {
          kind: 'game-content';
          mode: 'edition' | 'missing-selected';
          editionId?: number;
          addonIds?: number[];
        }
      | null;
    platform: { name: string; slug?: string } | null;
    percent: number | null;
    error: string | null;
    createdAt: string;
  };
}

export function softwareSelectionLabel(
  selection: SoftwareRequest['request']['selection']
) {
  if (selection?.kind === 'patch') return 'Patch';
  if (selection?.kind !== 'game-content') return undefined;
  if (selection.mode === 'edition') return 'Complete Edition';
  const count = selection.addonIds?.length ?? 0;
  return count === 1
    ? '1 Add-on'
    : count > 1
      ? `${count} Add-ons`
      : 'Selected Add-ons';
}

// ---- sports (Sportarr leagues) and adult (Whisparr scenes, StashDB ids) ----
export function adultScenePath(id: string, serverId?: number | null) {
  const scoped =
    typeof serverId === 'number' &&
    Number.isSafeInteger(serverId) &&
    serverId >= 0 &&
    serverId <= 1_000_000_000;
  return `/adult/${encodeURIComponent(id)}${scoped ? `?serverId=${serverId}` : ''}`;
}

export interface League {
  id: string;
  mediaType: 'sports';
  title: string;
  overview: string;
  sport?: string;
  country?: string;
  year?: number;
  posterPath?: string;
  requestable: boolean;
  libraryState: 'monitored' | 'unmonitored' | 'requested' | 'not-added';
  eventsAvailable?: boolean;
  mediaInfo?: MediaInfo;
}
export interface Scene {
  id: string;
  mediaType: 'adult';
  title: string;
  year?: number;
  overview?: string;
  studio?: string;
  performers: string[];
  posterPath?: string;
  serviceId: number;
  mediaInfo?: { status: number; requestStatus?: number };
}
