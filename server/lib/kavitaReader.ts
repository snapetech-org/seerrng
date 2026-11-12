// "Read in Kavita": which Kavita series holds each comic or manga that the
// comics service (BackIssue) has files for.
//
// The BackIssue scan records each series it sees (title, manga or comic, its
// folder). A cached copy of Kavita's series list is matched against those:
//   1. the ComicVine id, when Kavita has one for the series;
//   2. the folder: BackIssue and Kavita mount the same host folders, so the
//      series folder is the most reliable key (exact path, then a folder
//      inside/around it, then the same folder name under another root);
//   3. the name (name, localized and original name) within libraries of the
//      right kind, only when exactly one series matches.
// Everything is kept in memory: the next BackIssue scan refills it after a
// restart. Kavita being down keeps the last good copy and is retried later;
// the media pages never wait on Kavita.

import type { KavitaLibrary, KavitaSeries } from '@server/api/kavita';
import KavitaAPI, { KavitaLibraryType } from '@server/api/kavita';
import type { KavitaSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';

export interface ComicSeriesRef {
  title: string;
  kind?: 'manga' | 'comic';
  /** The series folder as the comics service sees it. */
  folder?: string;
  comicVineId?: number;
  owned?: number;
}

export interface KavitaSeriesMatch {
  libraryId: number;
  seriesId: number;
  by: 'comicvine' | 'folder' | 'name';
}

interface KavitaIndex {
  connection: string;
  loadedAt: number;
  libraries: Map<number, KavitaLibrary>;
  libraryFolders: Set<string>;
  series: KavitaSeries[];
  byComicVine: Map<string, KavitaSeries[]>;
  byFolder: Map<string, KavitaSeries[]>;
  byFolderName: Map<string, KavitaSeries[]>;
  byName: Map<string, KavitaSeries[]>;
}

/** How long a Kavita series list is used before it's re-read in the background. */
export const KAVITA_INDEX_TTL_MS = 30 * 60 * 1000;
/** After a failed read, how long before trying Kavita again. */
export const KAVITA_RETRY_MS = 5 * 60 * 1000;

const LOG = { label: 'Kavita' };

const refs = new Map<string, ComicSeriesRef>();
const matches = new Map<string, KavitaSeriesMatch | null>();
let index: KavitaIndex | undefined;
let refreshing: Promise<void> | undefined;
let lastFailureAt = 0;

const key = (serviceId: number, externalServiceId: number) =>
  `${serviceId}:${externalServiceId}`;

const connectionKey = (settings: KavitaSettings) =>
  JSON.stringify([
    settings.hostname,
    settings.port,
    settings.useSsl,
    settings.baseUrl ?? '',
    settings.apiKey,
  ]);

export const normalizeFolder = (value?: string): string =>
  (value ?? '')
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase();

const folderName = (folder: string) => folder.split('/').pop() ?? '';

export const normalizeName = (value?: string): string =>
  (value ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(\s*\d{4}\s*\)/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, '');

const MANGA_TYPES = new Set<number>([KavitaLibraryType.Manga]);
const COMIC_TYPES = new Set<number>([
  KavitaLibraryType.Comic,
  KavitaLibraryType.ComicVine,
]);
const ANY_TYPES = new Set<number>([...MANGA_TYPES, ...COMIC_TYPES]);

const typesFor = (kind?: ComicSeriesRef['kind']) =>
  kind === 'manga' ? MANGA_TYPES : kind === 'comic' ? COMIC_TYPES : ANY_TYPES;

const push = <K>(map: Map<K, KavitaSeries[]>, k: K, series: KavitaSeries) => {
  const list = map.get(k);
  if (!list) map.set(k, [series]);
  else if (!list.includes(series)) list.push(series);
};

export const buildKavitaIndex = (
  libraries: KavitaLibrary[],
  series: KavitaSeries[],
  connection = ''
): KavitaIndex => {
  const built: KavitaIndex = {
    connection,
    loadedAt: Date.now(),
    libraries: new Map(libraries.map((library) => [library.id, library])),
    libraryFolders: new Set(
      libraries.flatMap((library) => library.folders.map(normalizeFolder))
    ),
    series,
    byComicVine: new Map(),
    byFolder: new Map(),
    byFolderName: new Map(),
    byName: new Map(),
  };
  for (const item of series) {
    if (item.comicVineId && /^\d+$/.test(item.comicVineId)) {
      push(built.byComicVine, item.comicVineId, item);
    }
    for (const folder of [item.folderPath, item.lowestFolderPath]) {
      const normalized = normalizeFolder(folder);
      if (!normalized || built.libraryFolders.has(normalized)) continue;
      push(built.byFolder, normalized, item);
      push(built.byFolderName, folderName(normalized), item);
    }
    for (const name of [item.name, item.localizedName, item.originalName]) {
      const normalized = normalizeName(name);
      if (normalized) push(built.byName, normalized, item);
    }
  }
  return built;
};

const only = (
  list: KavitaSeries[] | undefined,
  idx: KavitaIndex,
  types: Set<number>
): KavitaSeries | undefined => {
  const allowed = (list ?? []).filter((item) =>
    types.has(idx.libraries.get(item.libraryId)?.type ?? -1)
  );
  return allowed.length === 1 ? allowed[0] : undefined;
};

const asMatch = (
  item: KavitaSeries,
  by: KavitaSeriesMatch['by']
): KavitaSeriesMatch => ({ libraryId: item.libraryId, seriesId: item.id, by });

/** Finds the Kavita series for one comics-service series, or null. */
export const matchKavitaSeries = (
  ref: ComicSeriesRef,
  idx: KavitaIndex
): KavitaSeriesMatch | null => {
  const types = typesFor(ref.kind);

  if (ref.comicVineId) {
    const hit = only(idx.byComicVine.get(String(ref.comicVineId)), idx, types);
    if (hit) return asMatch(hit, 'comicvine');
  }

  const folder = normalizeFolder(ref.folder);
  if (folder && !idx.libraryFolders.has(folder)) {
    // the same folder: authoritative whatever library it sits in
    const exact = idx.byFolder.get(folder);
    if (exact?.length === 1) return asMatch(exact[0], 'folder');
    if (exact && exact.length > 1) {
      const hit = only(exact, idx, types);
      if (hit) return asMatch(hit, 'folder');
    }
    // files in sub-folders (volume folders): the series folder sits above
    let parent: KavitaSeries | undefined;
    let parentDepth = -1;
    let parentTie = false;
    // or the series folder sits above Kavita's (lowest) folder
    const below = new Set<KavitaSeries>();
    for (const [candidate, list] of idx.byFolder) {
      if (folder.startsWith(`${candidate}/`)) {
        const depth = candidate.length;
        const unique = new Set(list);
        if (depth > parentDepth) {
          parent = unique.size === 1 ? list[0] : undefined;
          parentTie = unique.size !== 1;
          parentDepth = depth;
        } else if (depth === parentDepth) {
          parentTie = true;
        }
      } else if (candidate.startsWith(`${folder}/`)) {
        list.forEach((item) => below.add(item));
      }
    }
    if (parent && !parentTie) return asMatch(parent, 'folder');
    if (below.size === 1) return asMatch([...below][0], 'folder');
    // mounted under a different root: the same series folder name
    const sameName = only(idx.byFolderName.get(folderName(folder)), idx, types);
    if (sameName) return asMatch(sameName, 'folder');
  }

  for (const name of [ref.title, folder ? folderName(folder) : '']) {
    const normalized = normalizeName(name);
    if (!normalized) continue;
    const hit = only(idx.byName.get(normalized), idx, types);
    if (hit) return asMatch(hit, 'name');
  }
  return null;
};

const rematch = (refKey?: string) => {
  if (!index) {
    matches.clear();
    return;
  }
  const keys = refKey ? [refKey] : [...refs.keys()];
  if (!refKey) matches.clear();
  for (const k of keys) {
    const ref = refs.get(k);
    if (ref) matches.set(k, matchKavitaSeries(ref, index));
  }
};

/** The comics scan saw this series; rematches it against the cached Kavita list. */
export const recordComicSeries = (
  serviceId: number,
  externalServiceId: number,
  ref: ComicSeriesRef
): void => {
  const k = key(serviceId, externalServiceId);
  const previous = refs.get(k);
  refs.set(k, {
    ...ref,
    // a scan row without a folder keeps the one looked up earlier
    folder: ref.folder ?? previous?.folder,
  });
  rematch(k);
};

/** True when the scan should look up this series' folder (new, or its files changed). */
export const needsComicSeriesFolder = (
  serviceId: number,
  externalServiceId: number,
  owned: number
): boolean => {
  const previous = refs.get(key(serviceId, externalServiceId));
  return !previous?.folder || previous.owned !== owned;
};

export const isKavitaConfigured = (): boolean => !!getSettings().kavita;

/**
 * Re-reads Kavita's libraries and series. A failure keeps the last good list.
 * Concurrent calls share one read.
 */
export const refreshKavitaIndex = async (): Promise<void> => {
  const settings = getSettings().kavita;
  if (!settings) {
    index = undefined;
    matches.clear();
    return;
  }
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const api = new KavitaAPI(settings);
      const libraries = await api.getLibraries();
      const series = await api.getAllSeries();
      index = buildKavitaIndex(libraries, series, connectionKey(settings));
      lastFailureAt = 0;
      rematch();
      const found = [...matches.values()].filter(Boolean).length;
      logger.debug(
        `Kavita: ${series.length} series read, ${found} of ${refs.size} comics matched`,
        LOG
      );
    } catch (error) {
      lastFailureAt = Date.now();
      logger.warn('Kavita could not be read; keeping the last series list', {
        ...LOG,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    } finally {
      refreshing = undefined;
    }
  })();
  return refreshing;
};

const refreshInBackground = () => {
  void refreshKavitaIndex().catch(() => undefined);
};

/** The Kavita series for a comics-service series, from the cache (never waits). */
export const getKavitaSeriesMatch = (
  serviceId?: number | null,
  externalServiceId?: number | null
): KavitaSeriesMatch | undefined => {
  const settings = getSettings().kavita;
  if (!settings || serviceId == null || externalServiceId == null) {
    return undefined;
  }
  const now = Date.now();
  const stale =
    !index ||
    index.connection !== connectionKey(settings) ||
    now - index.loadedAt > KAVITA_INDEX_TTL_MS;
  if (stale && !refreshing && now - lastFailureAt > KAVITA_RETRY_MS) {
    refreshInBackground();
  }
  if (!index || index.connection !== connectionKey(settings)) return undefined;
  return matches.get(key(serviceId, externalServiceId)) ?? undefined;
};

/** "Read in Kavita" address for a comics-service series, if Kavita has it. */
export const getKavitaReaderUrl = (
  serviceId?: number | null,
  externalServiceId?: number | null
): string | undefined => {
  const match = getKavitaSeriesMatch(serviceId, externalServiceId);
  const settings = getSettings().kavita;
  if (!match || !settings) return undefined;
  try {
    return KavitaAPI.buildSeriesUrl(settings, match.libraryId, match.seriesId);
  } catch {
    return undefined;
  }
};

/** Test hook. */
export const resetKavitaReader = (): void => {
  refs.clear();
  matches.clear();
  index = undefined;
  refreshing = undefined;
  lastFailureAt = 0;
};
