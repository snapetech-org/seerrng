// The categories beyond movies, series and books: music, comics, magazines, games, sports and
// adult. Each one only shows up when the SeerrNG admin has turned it on; the server checks again
// on every call, so a hidden page that someone opens by URL just explains it's off.
import { useEffect, useState } from 'react';
import { api, ApiError, type MediaInfo } from './api';
import { usePublicSettings } from './hooks';
import type { IconName } from './icons';

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
  { key: 'comic', path: '/comics', icon: 'comic', label: 'Comics' },
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
const probes = new Map<string, Promise<boolean>>();
const probe = (path: string) => {
  if (!probes.has(path)) {
    probes.set(
      path,
      api<{ comicVineConfigured?: boolean }>(path)
        .then((d) => d?.comicVineConfigured !== false)
        // "not configured" and "unavailable" come back as 503; anything else, let the page explain
        .catch(
          (e) =>
            !(
              e instanceof ApiError &&
              (e.status === 503 || e.status === 404 || e.status === 403)
            )
        )
    );
  }
  return probes.get(path)!;
};

// which extras this server has turned on (games count when any of its three categories is)
export function useExtras() {
  const pub = usePublicSettings();
  const on = pub?.enabledMediaCategories || {};
  const games = (['game', 'retro', 'modern'] as GameCategory[]).filter(
    (c) => on[c]
  );
  const enabled = (k: Extra) =>
    k === 'game'
      ? games.length > 0
      : k === 'adult'
        ? !!on.adult && !!pub?.adultEnabled
        : !!on[k];
  const [working, setWorking] = useState<Set<Extra> | null>(null);
  const key =
    EXTRAS.map((e) => (enabled(e.key) ? e.key : '')).join(',') +
    games.join(',');
  useEffect(() => {
    if (!pub) return;
    let live = true;
    const keys = EXTRAS.map((e) => e.key).filter(enabled);
    Promise.all(
      keys.map((k) =>
        k === 'game'
          ? Promise.all(
              games.map((c) =>
                probe(`/request/software/catalog/popular?category=${c}&limit=1`)
              )
            ).then((r) => r.some(Boolean))
          : PROBE[k]
            ? probe(PROBE[k]!)
            : Promise.resolve(true)
      )
    ).then((r) => live && setWorking(new Set(keys.filter((_, i) => r[i]))));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, !!pub]);
  return {
    ready: !!pub,
    enabled,
    games,
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
}
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
