import type {
  AurralLibraryAlbumEntry,
  AurralLibraryTrackEntry,
} from '@server/api/aurral';
import AurralAPI from '@server/api/aurral';
import type { MusicProvider } from '@server/lib/musicProviders';
import {
  compactMusicSearchText,
  musicMatchKey,
  stripTrackTitleExtras,
} from '@server/lib/musicSearch';
import { getSettings } from '@server/lib/settings';
import { getDefaultAurralServer } from '@server/lib/soulseek/trackRequests';
import logger from '@server/logger';
import { appDataPath } from '@server/utils/appDataVolume';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Songs in the music library by normalised artist + title, so a song owned on
 * a compilation shows as owned on its single, in charts and in playlists.
 *
 * One index per Aurral server: a full read of the library's tracks (paged,
 * at most every FULL_REFRESH_MS, in the background once there is an index,
 * one page at a time with a pause so Aurral keeps answering everyone else),
 * plus the newest page at most every DELTA_REFRESH_MS so a song that just
 * finished downloading flips to owned within a minute. A failed read never
 * marks anything: without an index nothing is marked; a partial read only
 * holds songs that are really there.
 */

export const OWNED_SONGS_DELTA_REFRESH_MS = 60_000;
// A full read is heavy for Aurral (each 100-song page is about 1 MB and blocks
// its process for up to seconds; 35k songs is ~350 pages). New songs arrive
// through the minute-by-minute newest-page delta, so the full read only has to
// catch removals and edits.
export const OWNED_SONGS_FULL_REFRESH_MS = 6 * 60 * 60_000;
const PAGE_SIZE = 100;
const MAX_PAGES = 500;
const MAX_KEYS = 100_000;
// the first read (nothing to answer with yet) goes faster than a refresh
const FIRST_BUILD_CONCURRENCY = 2;
const REFRESH_CONCURRENCY = 1;
const REFRESH_PAGE_PAUSE_MS = 250;
// a saved index older than this is not used after a restart
const SAVED_INDEX_MAX_AGE_MS = 24 * 60 * 60_000;
// how long a page view waits for the first index or a newest-songs refresh
const FIRST_BUILD_WAIT_MS = 1_500;
/** How long a caller that must not guess (Get all) waits for a first build. */
export const OWNED_INDEX_MUST_KNOW_WAIT_MS = 20_000;

export interface OwnedIndexOptions {
  /** Wait this long for the first build instead of the page's short wait. */
  firstBuildWaitMs?: number;
}
const DELTA_WAIT_MS = 1_500;
const DELTA_RETRY_MS = 15_000;

const FEATURED_ARTIST = /\s+(?:feat\.?|ft\.?|featuring)\s+.*$/i;

/** "STELLA LEFTY|boston": artist without "feat." parts, title without extras. */
export const ownedSongKey = (
  artistName: string | null | undefined,
  title: string | null | undefined
): string => {
  const artist = (artistName ?? '').trim();
  const song = (title ?? '').trim();
  if (!artist || !song) return '';
  const artistKey = compactMusicSearchText(
    musicMatchKey(artist.replace(FEATURED_ARTIST, '').trim() || artist)
  );
  const titleKey = compactMusicSearchText(stripTrackTitleExtras(song));
  return artistKey && titleKey ? `${artistKey}|${titleKey}` : '';
};

// "Noah Kahan with Post Malone", "Lily & Madeleine", "Artist x Artist"
const ARTIST_CREDIT_JOINER = /\s+(?:with|&|x|and|\+)\s+|\s*,\s+/i;

/**
 * Every key a library song is owned under: its full artist credit, and for a
 * shared credit ("Noah Kahan with Post Malone") also the first artist alone,
 * so the song counts as that artist's ("Noah Kahan|dial drunk").
 */
export const ownedSongKeysFor = (
  artistName: string | null | undefined,
  title: string | null | undefined
): string[] => {
  const full = ownedSongKey(artistName, title);
  if (!full) return [];
  const artist = (artistName ?? '').replace(FEATURED_ARTIST, '').trim();
  const first = artist.split(ARTIST_CREDIT_JOINER)[0]?.trim();
  if (!first || first === artist) return [full];
  const primary = ownedSongKey(first, title);
  return primary && primary !== full ? [full, primary] : [full];
};

interface OwnedSongIndex {
  keys: Set<string>;
  builtAt: number;
  deltaAt: number;
  // keys the newest-page check added, and when: a full read that started
  // before them keeps them when it replaces this index
  recent?: Map<string, number>;
  // false when a page failed: the next index keeps this one's keys
  complete?: boolean;
}

const indexes = new Map<string, OwnedSongIndex>();
const builds = new Map<string, Promise<OwnedSongIndex | null>>();
const deltas = new Map<string, Promise<void>>();

const pause = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms).unref?.();
  });

/**
 * Reads pages 2..pages with a few workers (one for a refresh, with a pause
 * between pages). A failed page only leaves its entries out.
 */
const readPages = async (
  pages: number,
  refresh: boolean,
  readPage: (page: number) => Promise<void>,
  stop: () => boolean = () => false
): Promise<number> => {
  const rest = Array.from({ length: Math.max(0, pages - 1) }, (_, i) => i + 2);
  let next = 0;
  let failed = 0;
  const worker = async () => {
    while (next < rest.length && !stop()) {
      const page = rest[next++];
      try {
        await readPage(page);
      } catch {
        // a missing page only leaves its entries unmarked (the replaced
        // index's entries are kept, see startBuild)
        failed += 1;
      }
      if (refresh && next < rest.length) await pause(REFRESH_PAGE_PAUSE_MS);
    }
  };
  await Promise.all(
    Array.from(
      { length: refresh ? REFRESH_CONCURRENCY : FIRST_BUILD_CONCURRENCY },
      worker
    )
  );
  return failed;
};

// Saved indexes: a restart (every update) otherwise re-reads the whole
// library and leaves owned badges off until that finishes.
type SavedIndexKind = 'songs' | 'albums';

const savedIndexFile = (kind: SavedIndexKind, serverKey: string) =>
  path.join(
    appDataPath(),
    'cache',
    `music-owned-${kind}-${createHash('sha256')
      .update(serverKey)
      .digest('hex')
      .slice(0, 16)}.json`
  );

// tests read and write no files
const persistIndexes = () => process.env.NODE_ENV !== 'test';

const saveIndex = async (
  kind: SavedIndexKind,
  serverKey: string,
  data: { builtAt: number; [field: string]: unknown }
) => {
  if (!persistIndexes()) return;
  const file = savedIndexFile(kind, serverKey);
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await writeFile(temporary, JSON.stringify(data), { mode: 0o600 });
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    logger.debug('Unable to save the owned music index', {
      label: 'Music API',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
};

const loadIndex = async (
  kind: SavedIndexKind,
  serverKey: string
): Promise<Record<string, unknown> | null> => {
  if (!persistIndexes()) return null;
  try {
    const saved = JSON.parse(
      await readFile(savedIndexFile(kind, serverKey), 'utf8')
    ) as Record<string, unknown> | null;
    const builtAt = saved?.builtAt;
    if (
      typeof builtAt !== 'number' ||
      !Number.isFinite(builtAt) ||
      Date.now() - builtAt > SAVED_INDEX_MAX_AGE_MS ||
      builtAt > Date.now() + 60_000
    )
      return null;
    return saved;
  } catch {
    return null;
  }
};

// one disk read per server and kind after a start
const restored = new Map<string, Promise<void>>();
const restoreOnce = (key: string, restore: () => Promise<void>) => {
  let done = restored.get(key);
  if (!done) {
    done = restore().catch(() => undefined);
    restored.set(key, done);
  }
  return done;
};

const restoreSongIndex = (serverKey: string) =>
  restoreOnce(`songs:${serverKey}`, async () => {
    const saved = await loadIndex('songs', serverKey);
    if (!saved || !Array.isArray(saved.keys) || indexes.has(serverKey)) return;
    const keys = new Set<string>();
    for (const key of saved.keys.slice(0, MAX_KEYS))
      if (typeof key === 'string' && key.length <= 1024) keys.add(key);
    // deltaAt 0: the newest page is read on the next view
    indexes.set(serverKey, {
      keys,
      builtAt: saved.builtAt as number,
      deltaAt: 0,
    });
  });

const addEntries = (keys: Set<string>, entries: AurralLibraryTrackEntry[]) => {
  for (const entry of entries) {
    if (keys.size >= MAX_KEYS) return;
    for (const key of ownedSongKeysFor(entry.artistName, entry.title)) {
      keys.add(key);
    }
  }
};

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('timed out')), ms);
      timer.unref?.();
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
};

const buildIndex = async (
  aurral: MusicProvider,
  refresh: boolean
): Promise<OwnedSongIndex | null> => {
  const first = await aurral.getLibraryTrackPage(1, PAGE_SIZE, 'name');
  const keys = new Set<string>();
  addEntries(keys, first.items);
  const pages = Math.min(MAX_PAGES, Math.ceil(first.total / PAGE_SIZE));
  const failed = await readPages(
    pages,
    refresh,
    async (page) =>
      addEntries(
        keys,
        (await aurral.getLibraryTrackPage(page, PAGE_SIZE, 'name')).items
      ),
    () => keys.size >= MAX_KEYS
  );
  const now = Date.now();
  return { keys, builtAt: now, deltaAt: now, complete: failed === 0 };
};

const startBuild = (serverKey: string, aurral: MusicProvider) => {
  const running = builds.get(serverKey);
  if (running) return running;
  const startedAt = Date.now();
  const build = buildIndex(aurral, indexes.has(serverKey))
    .then((index) => {
      if (index) {
        // A refresh takes minutes: songs the newest-page check added while it
        // ran stay, and so does everything when a page could not be read.
        const previous = indexes.get(serverKey);
        if (previous) {
          const keep = index.complete
            ? [...(previous.recent ?? [])]
                .filter(([, addedAt]) => addedAt >= startedAt)
                .map(([key]) => key)
            : previous.keys;
          for (const key of keep) {
            if (index.keys.size >= MAX_KEYS) break;
            index.keys.add(key);
          }
        }
        indexes.set(serverKey, index);
        void saveIndex('songs', serverKey, {
          builtAt: index.builtAt,
          keys: [...index.keys],
        });
      }
      return index;
    })
    .catch((error: unknown) => {
      logger.debug('Owned song index could not be read', {
        label: 'Music API',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return null;
    })
    .finally(() => builds.delete(serverKey));
  builds.set(serverKey, build);
  return build;
};

const refreshDelta = (
  serverKey: string,
  aurral: MusicProvider,
  index: OwnedSongIndex
) => {
  const running = deltas.get(serverKey);
  if (running) return running;
  const delta = aurral
    .getLibraryTrackPage(1, PAGE_SIZE, 'newest')
    .then((page) => {
      const now = Date.now();
      const recent = (index.recent ??= new Map());
      for (const entry of page.items) {
        for (const key of ownedSongKeysFor(entry.artistName, entry.title)) {
          if (index.keys.has(key) || index.keys.size >= MAX_KEYS) continue;
          index.keys.add(key);
          recent.set(key, now);
        }
      }
      index.deltaAt = now;
    })
    .catch(() => {
      // try again soon, not on every page view
      index.deltaAt =
        Date.now() - OWNED_SONGS_DELTA_REFRESH_MS + DELTA_RETRY_MS;
    })
    .finally(() => deltas.delete(serverKey));
  deltas.set(serverKey, delta);
  return delta;
};

/**
 * The owned-song keys for this Aurral server, or null when no index could be
 * read (then callers mark nothing). Never throws.
 */
export const getOwnedSongKeys = async (
  aurral: MusicProvider,
  serverKey: string,
  { firstBuildWaitMs = FIRST_BUILD_WAIT_MS }: OwnedIndexOptions = {}
): Promise<ReadonlySet<string> | null> => {
  try {
    if (!indexes.has(serverKey)) await restoreSongIndex(serverKey);
    const now = Date.now();
    // An old index keeps answering while a new one is read: dropping it made
    // every page after a quiet half hour think the library was empty.
    let index = indexes.get(serverKey);
    if (!index) {
      index =
        (await withTimeout(startBuild(serverKey, aurral), firstBuildWaitMs)
          .then((built) => built ?? undefined)
          .catch(() => undefined)) ?? undefined;
      return index?.keys ?? null;
    }
    if (now - index.builtAt > OWNED_SONGS_FULL_REFRESH_MS) {
      // the old index answers while the new one is read
      void startBuild(serverKey, aurral);
    }
    if (now - index.deltaAt > OWNED_SONGS_DELTA_REFRESH_MS) {
      await withTimeout(
        refreshDelta(serverKey, aurral, index),
        DELTA_WAIT_MS
      ).catch(() => undefined);
    }
    return index.keys;
  } catch {
    return null;
  }
};

/** Marks songs whose artist + title are in the library as owned. */
export const markOwnedSongs = <
  T extends { artistName: string; title: string; inLibrary: boolean },
>(
  tracks: T[],
  keys: ReadonlySet<string> | null
): T[] => {
  if (!keys || keys.size === 0) return tracks;
  return tracks.map((track) =>
    !track.inLibrary && keys.has(ownedSongKey(track.artistName, track.title))
      ? { ...track, inLibrary: true }
      : track
  );
};

/**
 * Albums in the music library by release-group (or release) MBID, with how
 * many of their songs are there: the same Aurral library album pages the
 * Library tab shows, so "1 of 10 songs" there is "partly in library" on the
 * artist page, in search, in charts and on the album page.
 *
 * Same refresh rules as the song index: a full read at most every
 * OWNED_SONGS_FULL_REFRESH_MS (about one call per 60 albums), the newest page
 * at most every OWNED_SONGS_DELTA_REFRESH_MS. A failed read marks nothing.
 */
export interface OwnedAlbumCounts {
  trackCount: number;
  availableTrackCount: number;
}

export interface OwnedAlbumState extends OwnedAlbumCounts {
  status: 'owned' | 'partial';
}

export interface OwnedAlbumLookup {
  byId: ReadonlyMap<string, OwnedAlbumCounts>;
  // albums the library has without any MBID, by normalised artist + title
  byName: ReadonlyMap<string, OwnedAlbumCounts>;
  // normalised names of artists with at least one song in the library
  artistNames: ReadonlySet<string>;
}

interface OwnedAlbumIndex {
  byId: Map<string, OwnedAlbumCounts>;
  byName: Map<string, OwnedAlbumCounts>;
  artistNames: Set<string>;
  builtAt: number;
  deltaAt: number;
  // entries the newest-page check set, and when (see OwnedSongIndex.recent)
  recent?: Map<string, number>;
  complete?: boolean;
}

const ALBUM_PAGE_SIZE = 60;
const MAX_ALBUM_PAGES = 400;
const MAX_ALBUMS = 50_000;

const albumIndexes = new Map<string, OwnedAlbumIndex>();
const albumBuilds = new Map<string, Promise<OwnedAlbumIndex | null>>();
const albumDeltas = new Map<string, Promise<void>>();

const normalizeId = (value: string | null | undefined) =>
  (value ?? '').trim().toLowerCase();

/** Normalised artist name, the way the owned-album index keeps it. */
export const ownedArtistKey = (name: string | null | undefined): string => {
  const artist = (name ?? '').trim();
  if (!artist) return '';
  return compactMusicSearchText(
    musicMatchKey(artist.replace(FEATURED_ARTIST, '').trim() || artist)
  );
};

const albumState = (
  counts: OwnedAlbumCounts | undefined
): OwnedAlbumState | null => {
  if (!counts || counts.availableTrackCount <= 0) return null;
  const owned =
    counts.trackCount <= 0 || counts.availableTrackCount >= counts.trackCount;
  return {
    status: owned ? 'owned' : 'partial',
    trackCount: Math.max(counts.trackCount, counts.availableTrackCount),
    availableTrackCount: counts.availableTrackCount,
  };
};

// Two library albums can be one release group (two editions): keep the one
// that has more of its songs, a complete one first.
const better = (
  current: OwnedAlbumCounts | undefined,
  next: OwnedAlbumCounts
): OwnedAlbumCounts => {
  if (!current) return next;
  const ratio = (counts: OwnedAlbumCounts) =>
    counts.trackCount > 0
      ? counts.availableTrackCount / counts.trackCount
      : counts.availableTrackCount > 0
        ? 1
        : 0;
  const a = ratio(current);
  const b = ratio(next);
  if (b !== a) return b > a ? next : current;
  return next.availableTrackCount > current.availableTrackCount
    ? next
    : current;
};

const addAlbumEntries = (
  index: OwnedAlbumIndex,
  entries: AurralLibraryAlbumEntry[],
  replace: boolean,
  touched?: (key: string) => void
) => {
  for (const entry of entries) {
    if (index.byId.size + index.byName.size >= MAX_ALBUMS) return;
    const counts: OwnedAlbumCounts = {
      trackCount: Math.max(0, entry.trackCount || 0),
      availableTrackCount: Math.max(0, entry.availableTrackCount || 0),
    };
    const ids = [entry.releaseGroupMbid, entry.mbid]
      .map(normalizeId)
      .filter(Boolean);
    if (counts.availableTrackCount > 0) {
      const artist = ownedArtistKey(entry.artistName);
      if (artist) index.artistNames.add(artist);
    }
    if (ids.length) {
      for (const id of new Set(ids)) {
        index.byId.set(
          id,
          replace ? counts : better(index.byId.get(id), counts)
        );
        touched?.(`id:${id}`);
      }
    } else {
      const key = ownedSongKey(entry.artistName, entry.title);
      if (key) {
        index.byName.set(
          key,
          replace ? counts : better(index.byName.get(key), counts)
        );
        touched?.(`name:${key}`);
      }
    }
  }
};

const buildAlbumIndex = async (
  aurral: MusicProvider,
  refresh: boolean
): Promise<OwnedAlbumIndex | null> => {
  const first = await aurral.getLibraryAlbumPage(1, ALBUM_PAGE_SIZE, 'album');
  const index: OwnedAlbumIndex = {
    byId: new Map(),
    byName: new Map(),
    artistNames: new Set(),
    builtAt: 0,
    deltaAt: 0,
  };
  addAlbumEntries(index, first.items, false);
  const pages = Math.min(
    MAX_ALBUM_PAGES,
    Math.ceil(first.total / ALBUM_PAGE_SIZE)
  );
  const failed = await readPages(pages, refresh, async (page) =>
    addAlbumEntries(
      index,
      (await aurral.getLibraryAlbumPage(page, ALBUM_PAGE_SIZE, 'album')).items,
      false
    )
  );
  index.complete = failed === 0;
  const now = Date.now();
  index.builtAt = now;
  index.deltaAt = now;
  return index;
};

const savedCounts = (value: unknown): Map<string, OwnedAlbumCounts> => {
  const counts = new Map<string, OwnedAlbumCounts>();
  if (!Array.isArray(value)) return counts;
  for (const pair of value.slice(0, MAX_ALBUMS)) {
    if (!Array.isArray(pair) || typeof pair[0] !== 'string') continue;
    const entry = pair[1] as Partial<OwnedAlbumCounts> | null;
    const trackCount = Number(entry?.trackCount);
    const availableTrackCount = Number(entry?.availableTrackCount);
    if (
      !Number.isSafeInteger(trackCount) ||
      !Number.isSafeInteger(availableTrackCount)
    )
      continue;
    counts.set(pair[0], { trackCount, availableTrackCount });
  }
  return counts;
};

const restoreAlbumIndex = (serverKey: string) =>
  restoreOnce(`albums:${serverKey}`, async () => {
    const saved = await loadIndex('albums', serverKey);
    if (!saved || albumIndexes.has(serverKey)) return;
    const artistNames = new Set<string>();
    if (Array.isArray(saved.artistNames))
      for (const name of saved.artistNames.slice(0, MAX_ALBUMS))
        if (typeof name === 'string') artistNames.add(name);
    albumIndexes.set(serverKey, {
      byId: savedCounts(saved.byId),
      byName: savedCounts(saved.byName),
      artistNames,
      builtAt: saved.builtAt as number,
      deltaAt: 0,
    });
  });

const startAlbumBuild = (serverKey: string, aurral: MusicProvider) => {
  const running = albumBuilds.get(serverKey);
  if (running) return running;
  const startedAt = Date.now();
  const build = buildAlbumIndex(aurral, albumIndexes.has(serverKey))
    .then((index) => {
      if (index) {
        // as for songs: newest-page updates made while the read ran stay, and
        // a read with a failed page keeps the old entries it could not see
        const previous = albumIndexes.get(serverKey);
        if (previous) {
          const recent = new Set(
            [...(previous.recent ?? [])]
              .filter(([, at]) => at >= startedAt)
              .map(([key]) => key)
          );
          for (const [map, from, to] of [
            ['id', previous.byId, index.byId],
            ['name', previous.byName, index.byName],
          ] as const) {
            for (const [key, counts] of from) {
              if (
                recent.has(`${map}:${key}`) ||
                (!index.complete && !to.has(key))
              )
                to.set(key, counts);
            }
          }
          if (!index.complete)
            for (const name of previous.artistNames)
              index.artistNames.add(name);
        }
        albumIndexes.set(serverKey, index);
        void saveIndex('albums', serverKey, {
          builtAt: index.builtAt,
          byId: [...index.byId],
          byName: [...index.byName],
          artistNames: [...index.artistNames],
        });
      }
      return index;
    })
    .catch((error: unknown) => {
      logger.debug('Owned album index could not be read', {
        label: 'Music API',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return null;
    })
    .finally(() => albumBuilds.delete(serverKey));
  albumBuilds.set(serverKey, build);
  return build;
};

const refreshAlbumDelta = (
  serverKey: string,
  aurral: MusicProvider,
  index: OwnedAlbumIndex
) => {
  const running = albumDeltas.get(serverKey);
  if (running) return running;
  const delta = aurral
    .getLibraryAlbumPage(1, ALBUM_PAGE_SIZE, 'newest')
    .then((page) => {
      // the newest albums are the ones still filling up: take their counts as is
      const now = Date.now();
      const touched = new Map<string, number>();
      addAlbumEntries(index, page.items, true, (key) => touched.set(key, now));
      index.recent ??= new Map();
      for (const [key, at] of touched) index.recent.set(key, at);
      index.deltaAt = now;
    })
    .catch(() => {
      index.deltaAt =
        Date.now() - OWNED_SONGS_DELTA_REFRESH_MS + DELTA_RETRY_MS;
    })
    .finally(() => albumDeltas.delete(serverKey));
  albumDeltas.set(serverKey, delta);
  return delta;
};

/**
 * The owned-album lookup for this Aurral server, or null when no index could
 * be read (then callers mark nothing). Never throws.
 */
export const getOwnedAlbums = async (
  aurral: MusicProvider,
  serverKey: string,
  { firstBuildWaitMs = FIRST_BUILD_WAIT_MS }: OwnedIndexOptions = {}
): Promise<OwnedAlbumLookup | null> => {
  try {
    if (!albumIndexes.has(serverKey)) await restoreAlbumIndex(serverKey);
    const now = Date.now();
    // kept while a new one is read, as for songs
    let index = albumIndexes.get(serverKey);
    if (!index) {
      index =
        (await withTimeout(startAlbumBuild(serverKey, aurral), firstBuildWaitMs)
          .then((built) => built ?? undefined)
          .catch(() => undefined)) ?? undefined;
      return index ?? null;
    }
    if (now - index.builtAt > OWNED_SONGS_FULL_REFRESH_MS) {
      void startAlbumBuild(serverKey, aurral);
    }
    if (now - index.deltaAt > OWNED_SONGS_DELTA_REFRESH_MS) {
      await withTimeout(
        refreshAlbumDelta(serverKey, aurral, index),
        DELTA_WAIT_MS
      ).catch(() => undefined);
    }
    return index;
  } catch {
    return null;
  }
};

/**
 * What the library holds of one album: by MBID (release group or release),
 * or, for library albums without any MBID, by artist + title. Null when the
 * library has none of its songs or there is no index.
 */
export const ownedAlbumState = (
  lookup: OwnedAlbumLookup | null | undefined,
  album: {
    mbid?: string | null;
    artistName?: string | null;
    title?: string | null;
  }
): OwnedAlbumState | null => {
  if (!lookup) return null;
  const id = normalizeId(album.mbid);
  if (id) {
    const byId = albumState(lookup.byId.get(id));
    if (byId) return byId;
  }
  const key = ownedSongKey(album.artistName, album.title);
  return key ? albumState(lookup.byName.get(key)) : null;
};

/**
 * The owned-album lookup for the default Aurral server, for routes that do
 * not go through the music permission gate (album page, catalog, global
 * search). Null when Aurral is not configured or the library cannot be read.
 */
export const loadDefaultOwnedAlbums =
  async (): Promise<OwnedAlbumLookup | null> => {
    try {
      const server = getDefaultAurralServer(getSettings().aurral);
      if (!server?.hostname || !server.apiKey) return null;
      const url = AurralAPI.buildUrl(server);
      return await getOwnedAlbums(
        new AurralAPI({ url, apiKey: server.apiKey }),
        url
      );
    } catch {
      return null;
    }
  };

/**
 * Adds the library state to MusicBrainz album results (global search, home
 * shelves, the catalog browser): inLibrary / partial plus the library's song
 * counts, the same answer the music pages give. Other results pass through.
 */
export const markOwnedAlbumResults = <T>(
  results: T[],
  lookup: OwnedAlbumLookup | null | undefined
): T[] => {
  if (!lookup) return results;
  return results.map((result) => {
    const album = result as unknown as {
      mediaType?: string;
      id?: string;
      title?: string;
      'artist-credit'?: { name?: string }[];
    };
    if (album?.mediaType !== 'album' || typeof album.id !== 'string') {
      return result;
    }
    const state = ownedAlbumState(lookup, {
      mbid: album.id,
      artistName: album['artist-credit']?.[0]?.name ?? null,
      title: album.title ?? null,
    });
    if (!state) return result;
    return {
      ...result,
      inLibrary: state.status === 'owned',
      partial: state.status === 'partial',
      libraryTrackCount: state.trackCount,
      libraryAvailableTrackCount: state.availableTrackCount,
    };
  });
};

/** Whether the library has songs by this artist (by normalised name). */

export const isOwnedArtist = (
  lookup: OwnedAlbumLookup | null | undefined,
  name: string | null | undefined
): boolean => {
  const key = ownedArtistKey(name);
  return Boolean(lookup && key && lookup.artistNames.has(key));
};

/** Test hook: forget every index. */
export const resetOwnedSongIndexes = () => {
  indexes.clear();
  builds.clear();
  deltas.clear();
  albumIndexes.clear();
  albumBuilds.clear();
  albumDeltas.clear();
  restored.clear();
};
