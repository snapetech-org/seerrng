// The categories beyond movies, series and books: music, comics, magazines, games, sports and
// adult. Each one only shows up when the SeerrNG admin has turned it on; the server checks again
// on every call, so a hidden page that someone opens by URL just explains it's off.
import { useEffect, useState } from 'react';
import { api, ApiError, type MediaInfo } from './api';
import { useAuth } from './auth';
import { useApi, type PublicSettings } from './hooks';
import type { IconName } from './icons';
import { services } from './mediaServer';
import { onSessionReset, sessionUserId } from './sessionState';

export type Extra =
  'music' | 'comic' | 'magazine' | 'game' | 'sports' | 'adult';
// games cover three SeerrNG categories: PC games, retro consoles and modern consoles
export type GameCategory = 'game' | 'retro' | 'modern';

export const EXTRAS: {
  key: Extra;
  path: string;
  icon: IconName;
  label: string;
}[] = [
  { key: 'music', path: '/music', icon: 'music', label: 'Music' },
  { key: 'comic', path: '/comics', icon: 'comic', label: 'Comics/Manga' },
  { key: 'magazine', path: '/magazines', icon: 'magazine', label: 'Magazines' },
  { key: 'game', path: '/games', icon: 'game', label: 'Games' },
  { key: 'sports', path: '/sports', icon: 'trophy', label: 'Sports' },
  { key: 'adult', path: '/adult', icon: 'lock', label: 'Adult' },
];
export const GAME_LABEL: Record<GameCategory, string> = {
  game: 'PC games',
  retro: 'Retro consoles',
  modern: 'Modern consoles',
};

// A category can be on with nothing behind it (Sports on, no Sportarr). One cheap call per
// category tells whether its catalogue answers; the menus leave out the ones that don't.
const PROBE: Partial<Record<Extra, string>> = {
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
      result: api<{ comicVineConfigured?: boolean }>(path)
        .then((d) => d?.comicVineConfigured !== false)
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

// which extras this server has turned on (games count when any of its three categories is)
export function useExtras() {
  const settings = useApi<PublicSettings>('/settings/public');
  const pub = settings.data;
  // what this account may see: SeerrNG gives each user their own categories (an admin gets all
  // of them). Until that answers nothing is probed, so a hidden category is never asked for.
  const { user } = useAuth();
  const mine = useApi<{ enabledMediaCategories?: Record<string, boolean> }>(
    user ? `/user/${user.id}/settings/main` : null
  );
  const userSettled = !user || !!mine.data || !!mine.error;
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
        : !!on[k]);
  const [working, setWorking] = useState<Set<Extra> | null>(null);
  // the game categories whose catalogue answers (PC games need QuestarrNG, consoles may not)
  const [gamesWorking, setGamesWorking] = useState<GameCategory[] | null>(null);
  const key =
    EXTRAS.map((e) => (enabled(e.key) ? e.key : '')).join(',') +
    games.join(',');
  useEffect(() => {
    if (!pub || !userSettled) return;
    let live = true;
    const keys = EXTRAS.map((e) => e.key).filter(enabled);
    Promise.all(
      keys.map((k) =>
        k === 'game'
          ? Promise.all(
              games.map((c) =>
                probe(
                  `/request/software/catalog/popular?category=${c}&limit=1`,
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
    // SeerrNG's settings couldn't be read: the pages that wait for them offer Retry
    error: pub ? null : settings.error,
    retry: settings.reload,
    enabled,
    // until the checks answer, list none (so Games doesn't load a dead category first)
    games: !enabled('game')
      ? games
      : games.filter((c) => gamesWorking?.includes(c)),
    list: EXTRAS.filter((e) => enabled(e.key) && working?.has(e.key)),
  };
}

// one request call for every extra except games: the media type and its own id
export const requestExtra = (
  mediaType: Exclude<Extra, 'game'>,
  mediaId: string | number
) =>
  api('/request', {
    method: 'POST',
    body: JSON.stringify({ mediaType, mediaId }),
  });

// ---- music (MusicBrainz release groups, requested through Lidarr) ----
export interface Album {
  id: string;
  mediaType: 'album';
  title: string;
  'primary-type'?: string;
  'first-release-date'?: string;
  'artist-credit'?: { name: string; artist?: { id: string; name: string } }[];
  posterPath?: string;
  needsCoverArt?: boolean;
  mediaInfo?: MediaInfo;
}
export interface AlbumDetails {
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
    totalListenCount?: number;
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
  mediaInfo?: MediaInfo;
}
export interface ArtistDetails {
  artist: { name: string; area?: string; type?: string; beginYear?: number };
  wikipedia?: { extract?: string } | null;
  artistThumb?: string;
  artistBackdrop?: string;
  releaseGroups: Album[];
}
export const artistOf = (a: Album) =>
  a['artist-credit']?.map((c) => c.name).join(', ') || '';
export const fmtTrack = (ms?: number) =>
  ms
    ? `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}`
    : '';

// ---- comics (ComicVine volumes) and magazines (LazyLibrarian or Google Books) ----
export interface Comic {
  id: string;
  mediaType: 'comic';
  title: string;
  publisher?: string;
  startYear?: string;
  issueCount?: number;
  posterPath?: string;
  deck?: string;
  description?: string;
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

// ComicVine descriptions are HTML; show them as plain paragraphs
export const plainText = (html?: string) =>
  (html || '')
    .replace(/<\/(p|h\d|li|div)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
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
  rating?: number | null;
  publishers?: string[];
  developers?: string[];
  screenshots?: string[];
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
export const requestGame = (
  category: GameCategory,
  g: Game,
  pick: { os?: string; arch?: string; system?: string }
) =>
  api<{ request: { status: string } }>('/request/software', {
    method: 'POST',
    body: JSON.stringify({
      category,
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
  g.availability === 'available' || g.availability === 'owned'
    ? 'In library'
    : g.availability === 'downloading'
      ? 'Downloading'
      : g.availability === 'tracked'
        ? 'Requested'
        : '';

export interface SoftwareRequest {
  request: {
    id: number;
    category: GameCategory;
    status: string;
    title: string;
    coverUrl: string | null;
    catalogId: number | null;
    catalogKey: string | null;
    catalogProvider: 'igdb' | 'dat';
    platform: { name: string } | null;
    percent: number | null;
    error: string | null;
    createdAt: string;
  };
}

// ---- sports (Sportarr leagues) and adult (Whisparr scenes, StashDB ids) ----
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
