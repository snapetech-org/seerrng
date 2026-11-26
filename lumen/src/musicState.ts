import { createContext, useContext, useSyncExternalStore } from 'react';
import { onSessionReset } from './sessionState';

// Songs asked for, shared by every list on every music page, so "Getting…" shows
// the same everywhere (top result, song lists, playlists). Two sources: the server's
// open track requests (replaced by each answer, so a failed or cancelled one drops
// out) and songs asked for on this device, which cover the moments before the server
// lists them.
const server = new Set<string>();
const local = new Map<string, number>();
// a song asked for here is dropped once the server, asked well after, no longer has it open
const LOCAL_GRACE_MS = 120_000;
const listeners = new Set<() => void>();
let version = 0;

const notify = () => {
  version += 1;
  for (const listener of listeners) listener();
};

// --- names, compared the way the server compares them -----------------------------

// The server's normalizeMusicSearchText: accents dropped, curly and straight
// quotes alike, "P!nk" = "pink", "&" = "and", other punctuation a space.
export const normalizeMusicText = (value: string): string =>
  value
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFKC')
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ß/g, 'ss')
    .replace(/ł/g, 'l')
    .replace(/['’‘`]/g, '')
    .replace(/(\p{L})!(?=\p{L})/gu, '$1i')
    .replace(/(\p{L})\$(?=\p{L})/gu, '$1s')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{M}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const matchKey = (value: string) =>
  normalizeMusicText(value) || value.trim().toLocaleLowerCase();

const compact = (value: string) => value.replace(/\s+/g, '');

// The server's stripTrackTitleExtras: "(feat. X)", "[Live]", " - Remastered
// 2011", "(From the Motion Picture …)" and other appended parts go.
const stripTitleExtras = (title: string): string => {
  const unfeatured =
    title
      .replace(
        /\s*(?:\(|\[)\s*(?:feat\.?|ft\.?|featuring|with)\s+[^()[\]]*(?:\)|\])/gi,
        ''
      )
      .replace(
        /\s*(?:\(|\[)\s*from\s+(?:the\s+motion\s+picture\s+)?[^()[\]]*(?:\)|\])/gi,
        ''
      )
      .replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.+$/i, '')
      .replace(/\s+/g, ' ')
      .trim() || title.trim();
  let working = unfeatured
    .replace(
      /\s+-\s+[^-]*\b(?:remaster(?:ed)?|version|edit|mix|mono|stereo|live|single)\b[^-]*$/i,
      ''
    )
    .trim();
  for (let i = 0; i < 3; i += 1) {
    const next = working.replace(/\s*[([][^()[\]]*[)\]]\s*$/, '').trim();
    if (!next || next === working) break;
    working = next;
  }
  return normalizeMusicText(working || title);
};

const FEATURED_ARTIST = /\s+(?:feat\.?|ft\.?|featuring)\s+.*$/i;

/** A normalised artist name ("Beyoncé feat. X" = "beyonce"). */
export const artistKey = (name: string | null | undefined): string => {
  const artist = (name ?? '').trim();
  if (!artist) return '';
  return compact(
    matchKey(artist.replace(FEATURED_ARTIST, '').trim() || artist)
  );
};

/** A normalised album title, without "(Deluxe)" and the like. */
export const albumTitleKey = (title: string | null | undefined): string =>
  title?.trim() ? compact(stripTitleExtras(title)) : '';

/**
 * One song, the same however a catalog spells it: the server's owned-song key
 * (artist without "feat." parts, title without appended extras, accents,
 * quotes and punctuation ignored). Empty when either part is missing.
 */
export const songKey = (
  artist: string | null | undefined,
  title: string | null | undefined
): string => {
  const artistPart = artistKey(artist);
  const titlePart = title?.trim() ? compact(stripTitleExtras(title)) : '';
  return artistPart && titlePart ? `${artistPart}|${titlePart}` : '';
};

export function markSongsRequested(keys: string[]) {
  let changed = false;
  const now = Date.now();
  for (const key of keys) {
    if (!key) continue;
    if (!local.has(key) && !server.has(key)) changed = true;
    local.set(key, now);
  }
  if (changed) notify();
}

// A request that failed, was declined or was cancelled: the song can be asked for again.
export function unmarkSongs(keys: string[]) {
  let changed = false;
  for (const key of keys) if (local.delete(key)) changed = true;
  if (changed) notify();
}

// The server's open requests, as one complete answer.
export function setServerRequestedSongs(keys: string[]) {
  const next = new Set(keys.filter(Boolean));
  let changed =
    next.size !== server.size || [...next].some((key) => !server.has(key));
  server.clear();
  for (const key of next) server.add(key);
  const cutoff = Date.now() - LOCAL_GRACE_MS;
  for (const [key, at] of local) {
    if (at < cutoff && !next.has(key)) {
      local.delete(key);
      changed = true;
    }
  }
  if (changed) notify();
}

export const isSongRequested = (key: string) =>
  Boolean(key) && (server.has(key) || local.has(key));

// --- albums asked for -------------------------------------------------------------

// Albums (release groups) asked for on this device, so a one-tap Get on any card,
// the top result or the artist page shows "Requested" on every card for that album
// until the page's own answer (the album's request state) catches up.
const albumsAsked = new Set<string>();

export function markAlbumRequested(mbid: string | null | undefined) {
  const id = mbid?.trim().toLowerCase();
  if (!id || albumsAsked.has(id)) return;
  albumsAsked.add(id);
  notify();
}

export const isAlbumRequested = (mbid: string | null | undefined) =>
  Boolean(mbid) && albumsAsked.has(mbid!.trim().toLowerCase());

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// Re-renders when any song or album is marked requested.
export const useRequestedSongs = () =>
  useSyncExternalStore(
    subscribe,
    () => version,
    () => 0
  );
export const useRequestedAlbums = useRequestedSongs;

onSessionReset(() => {
  server.clear();
  local.clear();
  albumsAsked.clear();
  notify();
});

// --- what Aurral is downloading ---------------------------------------------------

export interface DownloadingSource {
  artistName: string | null;
  title: string;
  albumName?: string | null;
  albumMbid?: string | null;
}

/**
 * Keys for one song Aurral is downloading or has queued. A song is matched to
 * its album when the activity names one, so the live version downloading does
 * not mark the studio song.
 */
export const downloadKeysFor = (item: DownloadingSource): string[] => {
  const song = songKey(item.artistName, item.title);
  if (!song) return [];
  const mbid = item.albumMbid?.trim().toLowerCase();
  const album = albumTitleKey(item.albumName);
  return [
    `s:${song}`,
    ...(mbid ? [`m:${song}|${mbid}`] : []),
    ...(album ? [`a:${song}|${album}`] : []),
    ...(!mbid && !album ? [`n:${song}`] : []),
  ];
};

/** Keys for an album with songs downloading (by MBID, and by artist + title). */
export const albumDownloadKeysFor = (album: {
  albumMbid?: string | null;
  albumName?: string | null;
  artistName?: string | null;
}): string[] => {
  const mbid = album.albumMbid?.trim().toLowerCase();
  const name = albumTitleKey(album.albumName);
  const artist = artistKey(album.artistName);
  return [
    ...(mbid ? [`album:${mbid}`] : []),
    ...(name && artist ? [`albumname:${artist}|${name}`] : []),
  ];
};

/** Whether this song row is downloading, given the shared downloading keys. */
export const isSongDownloading = (
  keys: ReadonlySet<string>,
  track: {
    artistName?: string | null;
    title: string;
    albumTitle?: string | null;
    albumMbid?: string | null;
  }
): boolean => {
  const song = songKey(track.artistName, track.title);
  if (!song || !keys.has(`s:${song}`)) return false;
  if (keys.has(`n:${song}`)) return true;
  const mbid = track.albumMbid?.trim().toLowerCase();
  if (mbid && keys.has(`m:${song}|${mbid}`)) return true;
  const album = albumTitleKey(track.albumTitle);
  if (album && keys.has(`a:${song}|${album}`)) return true;
  // the row names no album: any download of the song counts
  return !mbid && !album;
};

/** Whether an album has songs downloading or queued. */
export const isAlbumDownloading = (
  keys: ReadonlySet<string>,
  album: {
    mbid?: string | null;
    title?: string | null;
    artistName?: string | null;
  }
): boolean =>
  albumDownloadKeysFor({
    albumMbid: album.mbid,
    albumName: album.title,
    artistName: album.artistName,
  }).some((key) => keys.has(key));

// Keys of songs and albums Aurral is downloading or has queued, from one shared
// poll (the page that owns the poll provides it; lists only read it).
export const MusicDownloadsContext = createContext<Set<string>>(new Set());
export const useDownloadingSongs = () => useContext(MusicDownloadsContext);

// --- downloads that finished --------------------------------------------------------

// Lists that show owned state ask again when a song or album leaves the
// downloading set, so a finished row turns into Play without a reload.
const completedListeners = new Set<() => void>();
export function onMusicDownloadsCompleted(listener: () => void) {
  completedListeners.add(listener);
  return () => {
    completedListeners.delete(listener);
  };
}
export function notifyMusicDownloadsCompleted() {
  for (const listener of completedListeners) listener();
}
