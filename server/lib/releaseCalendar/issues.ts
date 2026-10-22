import KapowarrAPI, {
  type KapowarrIssue,
  type KapowarrVolume,
} from '@server/api/comics/kapowarr';
import MylarAPI, {
  type MylarComic,
  type MylarIssue,
} from '@server/api/comics/mylar';
import LazyLibrarianAPI, {
  type LazyLibrarianIssue,
  type LazyLibrarianMagazine,
} from '@server/api/lazylibrarian';
import { MediaRequestStatus, MediaType } from '@server/constants/media';
import type { EnabledMediaCategories } from '@server/constants/mediaCategories';
import type Media from '@server/entity/Media';
import { MediaIdentifierProvider } from '@server/entity/MediaIdentifier';
import type { MediaRequest } from '@server/entity/MediaRequest';
import { normalizeMagazineTitle } from '@server/lib/magazineIdentity';
import { isMediaCategoryEnabled } from '@server/lib/mediaCategories';
import { runWithServarrServiceSnapshot } from '@server/lib/serviceAdmission';
import {
  getSettings,
  type KapowarrSettings,
  type LazyLibrarianSettings,
  type MylarSettings,
} from '@server/lib/settings';
import { mapWithConcurrency } from '@server/utils/concurrency';
import type { ReleaseCalendarItem } from './normalize';
import type { CalendarQuery } from './query';

const MAX_ISSUE_CALENDAR_REQUESTS = 1_000;
const MAX_ISSUE_CALENDAR_LOOKUPS = 200;
const MAX_ISSUE_CALENDAR_EVENTS = 5_000;
const MAX_ISSUE_CALENDAR_SOURCES = 20;
const ISSUE_CALENDAR_LOOKUP_CONCURRENCY = 3;
const ISSUE_CALENDAR_CACHE_TTL_SECONDS = 60;

type IssueSource = 'mylar' | 'kapowarr' | 'lazylibrarian';
type LookupTarget = { id: string; title?: string; comicVineId?: string };

type IssueConnection =
  | {
      source: 'mylar';
      server: MylarSettings;
      targets: Map<string, LookupTarget>;
    }
  | {
      source: 'kapowarr';
      server: KapowarrSettings;
      targets: Map<string, LookupTarget>;
      volumeIndex?: Promise<KapowarrVolume[]>;
    }
  | {
      source: 'lazylibrarian';
      server: LazyLibrarianSettings;
      targets: Map<string, LookupTarget>;
    };

export type IssueCalendarResult = {
  results: ReleaseCalendarItem[];
  partialSources: { source: string; serverId?: number }[];
  truncated: boolean;
};

const nonEmpty = (value: unknown, maxLength = 1_000): string | undefined =>
  typeof value === 'string' && value.trim()
    ? value.trim().slice(0, maxLength)
    : undefined;

const positiveIntegerString = (value: unknown): string | undefined => {
  const normalized =
    typeof value === 'number' && Number.isSafeInteger(value)
      ? String(value)
      : typeof value === 'string'
        ? value.trim()
        : '';
  if (!/^[1-9]\d{0,15}$/.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? String(parsed)
    : undefined;
};

export const normalizeIssueReleaseDate = (
  value: unknown
): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const date = /^(\d{4}-\d{2}-\d{2})(?:$|[T\s])/.exec(value)?.[1];
  if (!date) return undefined;
  const parsed = new Date(date + 'T00:00:00.000Z');
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
    ? parsed.toISOString()
    : undefined;
};

const issueReleaseDate = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    const normalized = normalizeIssueReleaseDate(value);
    if (normalized) return normalized;
  }
  return undefined;
};

const isInRange = (value: string, query: CalendarQuery): boolean => {
  const date = new Date(value);
  return date >= query.allDayStart && date < query.allDayEnd;
};

const isLazyMagazineMonitored = (magazine: LazyLibrarianMagazine): boolean =>
  magazine.status?.trim().toLowerCase() === 'active' ||
  /^(wanted|snatched|seeding|processing)$/i.test(
    magazine.issueStatus?.trim() ?? ''
  );

const eventTitle = (
  parent: string,
  number: string | undefined,
  issueName: string | undefined
): string =>
  (number
    ? parent + ' #' + number
    : issueName
      ? parent + ': ' + issueName
      : parent
  ).slice(0, 1_000);

const stableIssueKey = (
  issueId: unknown,
  issueDate: string,
  issueNumber: string | undefined,
  issueTitle: string | undefined
): string => {
  const stableId =
    typeof issueId === 'number' && Number.isSafeInteger(issueId) && issueId > 0
      ? String(issueId)
      : nonEmpty(issueId, 128);
  return (
    stableId ??
    [issueDate, issueNumber, issueTitle].filter(Boolean).join(':').slice(0, 256)
  );
};

const comicEvent = (
  source: 'mylar' | 'kapowarr',
  serverId: number,
  comicId: string,
  parentTitle: string,
  issue: MylarIssue | KapowarrIssue,
  query: CalendarQuery
): ReleaseCalendarItem | undefined => {
  const date =
    source === 'mylar'
      ? issueReleaseDate(
          (issue as MylarIssue).releaseDate,
          (issue as MylarIssue).issueDate
        )
      : issueReleaseDate((issue as KapowarrIssue).releaseDate);
  if (!date || !isInRange(date, query)) return undefined;
  const number = nonEmpty(
    source === 'mylar'
      ? (issue as MylarIssue).number
      : (issue as KapowarrIssue).issue_number,
    64
  );
  const issueName = nonEmpty(
    source === 'mylar'
      ? (issue as MylarIssue).name
      : (issue as KapowarrIssue).title,
    512
  );
  const issueId =
    source === 'mylar' ? (issue as MylarIssue).id : (issue as KapowarrIssue).id;
  return {
    id:
      source +
      ':' +
      serverId +
      ':' +
      comicId +
      ':' +
      stableIssueKey(issueId, date, number, issueName),
    source,
    mediaType: 'comic',
    title: eventTitle(parentTitle, number, issueName),
    startsAt: date,
    dateType: 'issue',
    allDay: true,
    comicId,
    ...(number ? { issueNumber: number } : {}),
    available:
      source === 'mylar'
        ? (issue as MylarIssue).status?.trim().toLowerCase() === 'downloaded'
        : (issue as KapowarrIssue).files.length > 0,
    is4k: false,
  };
};

const magazineEvent = (
  serverId: number,
  magazineTitle: string,
  issue: LazyLibrarianIssue,
  query: CalendarQuery
): ReleaseCalendarItem | undefined => {
  const date = issueReleaseDate(issue.issueDate);
  if (!date || !isInRange(date, query)) return undefined;
  const number = nonEmpty(issue.issueNumber, 64);
  const issueName = nonEmpty(issue.title, 512);
  const issueId = stableIssueKey(issue.issueId, date, number, issueName);
  return {
    id:
      'lazylibrarian:' +
      serverId +
      ':' +
      normalizeMagazineTitle(magazineTitle) +
      ':' +
      issueId,
    source: 'lazylibrarian',
    mediaType: 'magazine',
    title: eventTitle(magazineTitle, number, issueName),
    startsAt: date,
    dateType: 'issue',
    allDay: true,
    magazineTitle,
    ...(number ? { issueNumber: number } : {}),
    available: Boolean(issue.issueFile?.trim()),
    is4k: false,
  };
};

const mediaSlug = (media: Media): string | undefined =>
  nonEmpty(media.externalServiceSlug, 2_048) ??
  (media.externalServiceId && media.externalServiceId > 0
    ? String(media.externalServiceId)
    : undefined);

const addTarget = (connection: IssueConnection, target: LookupTarget) => {
  const { id } = target;
  const normalizedId =
    connection.source === 'lazylibrarian'
      ? normalizeMagazineTitle(id)
      : id.trim();
  if (!normalizedId) return;
  const existing = connection.targets.get(normalizedId);
  if (!existing) {
    connection.targets.set(normalizedId, target);
  } else {
    if (!existing.title && target.title) existing.title = target.title;
    if (!existing.comicVineId && target.comicVineId)
      existing.comicVineId = target.comicVineId;
  }
};

const requestServerId = (
  request: MediaRequest,
  source: IssueSource
): number | undefined => {
  const serviceTarget = (request.serviceTargets ?? []).find(
    (target) =>
      target.serviceType === source &&
      target.format === (source === 'lazylibrarian' ? 'magazine' : 'comic')
  );
  const serverId =
    serviceTarget?.serverId ?? request.serverId ?? request.media?.serviceId;
  return Number.isSafeInteger(serverId) && serverId! >= 0
    ? serverId!
    : undefined;
};

const requestComicSource = (
  request: MediaRequest
): 'mylar' | 'kapowarr' | undefined => {
  const targetSource = request.serviceTargets?.find(
    (target) =>
      target.format === 'comic' &&
      (target.serviceType === 'mylar' || target.serviceType === 'kapowarr')
  )?.serviceType;
  if (targetSource === 'mylar' || targetSource === 'kapowarr')
    return targetSource;
  const configuredSource = request.media?.comicServiceType;
  return configuredSource === 'mylar' || configuredSource === 'kapowarr'
    ? configuredSource
    : undefined;
};

const comicVineId = (media: Media): string | undefined =>
  positiveIntegerString(
    media.identifiers?.find(
      (identifier) =>
        identifier.provider === MediaIdentifierProvider.COMICVINE &&
        identifier.canonical
    )?.value
  );

const requestedTargets = (
  requests: MediaRequest[],
  source: IssueSource,
  serverId: number
): LookupTarget[] => {
  const targets = new Map<string, LookupTarget>();
  for (const request of requests) {
    const media = request.media;
    if (!media) continue;
    if (source === 'mylar') {
      if (
        media.mediaType !== MediaType.COMIC ||
        requestComicSource(request) !== 'mylar' ||
        requestServerId(request, source) !== serverId
      )
        continue;
      const id = positiveIntegerString(mediaSlug(media)) ?? comicVineId(media);
      if (id) targets.set(id, { id });
    } else if (source === 'kapowarr') {
      if (
        media.mediaType !== MediaType.COMIC ||
        requestComicSource(request) !== 'kapowarr' ||
        requestServerId(request, source) !== serverId
      )
        continue;
      const id = positiveIntegerString(mediaSlug(media));
      if (id) {
        targets.set(id, { id });
      } else {
        const canonicalId = comicVineId(media);
        if (canonicalId)
          targets.set(`cv:${canonicalId}`, {
            id: `cv:${canonicalId}`,
            comicVineId: canonicalId,
          });
      }
    } else {
      if (
        media.mediaType !== MediaType.MAGAZINE ||
        requestServerId(request, source) !== serverId
      )
        continue;
      const title =
        nonEmpty(media.externalServiceSlug, 2_048) ??
        media.identifiers?.find(
          (identifier) => identifier.provider === 'lazylibrarian'
        )?.value;
      if (title) {
        const id = normalizeMagazineTitle(title);
        if (id) targets.set(id, { id: title, title });
      }
    }
  }
  return [...targets.values()];
};

function makeConnections(options: {
  includeComic: boolean;
  includeMagazine: boolean;
  enabledCategories?: Partial<EnabledMediaCategories>;
}): IssueConnection[] {
  const settings = getSettings();
  const connections: IssueConnection[] = [];
  const isEnabled = (category: 'comic' | 'magazine') =>
    isMediaCategoryEnabled(category) &&
    options.enabledCategories?.[category] !== false;
  if (options.includeComic && isEnabled('comic')) {
    for (const server of settings.mylar)
      connections.push({ source: 'mylar', server, targets: new Map() });
    for (const server of settings.kapowarr)
      connections.push({ source: 'kapowarr', server, targets: new Map() });
  }
  if (options.includeMagazine && isEnabled('magazine')) {
    for (const server of settings.lazylibrarian)
      connections.push({ source: 'lazylibrarian', server, targets: new Map() });
  }
  return connections;
}

function requestConnectionFor(
  request: MediaRequest,
  connections: IssueConnection[]
): IssueConnection | undefined {
  const media = request.media;
  if (!media) return undefined;
  const source =
    media.mediaType === MediaType.MAGAZINE
      ? 'lazylibrarian'
      : requestComicSource(request);
  if (source !== 'mylar' && source !== 'kapowarr' && source !== 'lazylibrarian')
    return undefined;
  const serverId = requestServerId(request, source);
  if (serverId === undefined) return undefined;
  return connections.find(
    (connection) =>
      connection.source === source && connection.server.id === serverId
  );
}

const withMylar = <Result>(
  snapshot: MylarSettings,
  callback: (api: MylarAPI) => Promise<Result>
): Promise<Result> =>
  runWithServarrServiceSnapshot('mylar', snapshot, (server) =>
    callback(
      new MylarAPI({ url: MylarAPI.buildUrl(server), apiKey: server.apiKey })
    )
  );

const withKapowarr = <Result>(
  snapshot: KapowarrSettings,
  callback: (api: KapowarrAPI) => Promise<Result>
): Promise<Result> =>
  runWithServarrServiceSnapshot('kapowarr', snapshot, (server) =>
    callback(
      new KapowarrAPI({
        url: KapowarrAPI.buildUrl(server),
        apiKey: server.apiKey,
      })
    )
  );

const withLazyLibrarian = <Result>(
  snapshot: LazyLibrarianSettings,
  callback: (api: LazyLibrarianAPI) => Promise<Result>
): Promise<Result> =>
  runWithServarrServiceSnapshot('lazylibrarian', snapshot, (server) =>
    callback(
      new LazyLibrarianAPI({
        url: LazyLibrarianAPI.buildUrl(server),
        apiKey: server.apiKey,
      })
    )
  );

const getKapowarrVolumeIndex = (
  connection: Extract<IssueConnection, { source: 'kapowarr' }>
): Promise<KapowarrVolume[]> =>
  (connection.volumeIndex ??= withKapowarr(connection.server, (api) =>
    api.getVolumes()
  ));

async function loadLibraryTargets(
  connection: IssueConnection,
  includeUnmonitored: boolean
): Promise<LookupTarget[]> {
  if (connection.source === 'mylar') {
    const comics = await withMylar(connection.server, (api) =>
      api.getIndex(ISSUE_CALENDAR_CACHE_TTL_SECONDS)
    );
    return comics
      .filter(
        (comic: MylarComic) =>
          includeUnmonitored || comic.status?.trim().toLowerCase() === 'active'
      )
      .map((comic) => ({ id: comic.id, title: comic.name }));
  }
  if (connection.source === 'kapowarr') {
    const volumes = await getKapowarrVolumeIndex(connection);
    return volumes
      .filter(
        (volume: KapowarrVolume) => includeUnmonitored || volume.monitored
      )
      .map((volume) => ({
        id: String(volume.id),
        title: volume.title,
      }));
  }
  const magazines = await withLazyLibrarian(connection.server, (api) =>
    api.getMagazines()
  );
  return magazines
    .filter(
      (magazine: LazyLibrarianMagazine) =>
        includeUnmonitored || isLazyMagazineMonitored(magazine)
    )
    .map((magazine) => ({
      id: magazine.title,
      title: magazine.title,
    }));
}

type IssueEventBatch = {
  results: ReleaseCalendarItem[];
  truncated: boolean;
};

const appendIssueEvent = (
  result: IssueEventBatch,
  item: ReleaseCalendarItem | undefined
): boolean => {
  if (!item) return true;
  if (result.results.length >= MAX_ISSUE_CALENDAR_EVENTS) {
    result.truncated = true;
    return false;
  }
  result.results.push(item);
  return true;
};

async function loadConnectionIssues(
  connection: IssueConnection,
  target: LookupTarget,
  query: CalendarQuery
): Promise<IssueEventBatch> {
  const result: IssueEventBatch = { results: [], truncated: false };
  if (connection.source === 'mylar') {
    const detail = await withMylar(connection.server, (api) =>
      api.getComic(target.id, ISSUE_CALENDAR_CACHE_TTL_SECONDS)
    );
    const parentTitle =
      nonEmpty(detail.comic?.name) ?? nonEmpty(target.title) ?? target.id;
    const comicId = positiveIntegerString(detail.comic?.id ?? target.id);
    if (!comicId) return result;
    for (const issue of detail.issues) {
      const item = comicEvent(
        'mylar',
        connection.server.id,
        comicId,
        parentTitle,
        issue,
        query
      );
      if (!appendIssueEvent(result, item)) break;
    }
    return result;
  }
  if (connection.source === 'kapowarr') {
    let volume: KapowarrVolume | undefined;
    if (target.comicVineId) {
      const indexedVolume = (await getKapowarrVolumeIndex(connection)).find(
        (candidate) => String(candidate.comicvine_id) === target.comicVineId
      );
      if (indexedVolume)
        volume = await withKapowarr(connection.server, (api) =>
          api.getVolume(indexedVolume.id, ISSUE_CALENDAR_CACHE_TTL_SECONDS)
        );
    } else {
      const volumeId = Number(target.id);
      if (!Number.isSafeInteger(volumeId) || volumeId < 1) return result;
      volume = await withKapowarr(connection.server, (api) =>
        api.getVolume(volumeId, ISSUE_CALENDAR_CACHE_TTL_SECONDS)
      );
    }
    if (!volume)
      throw new Error('Kapowarr did not return the requested volume.');
    const comicId = positiveIntegerString(volume.comicvine_id);
    if (!comicId) return result;
    const parentTitle = nonEmpty(volume.title) ?? target.title ?? comicId;
    for (const issue of volume.issues ?? []) {
      const item = comicEvent(
        'kapowarr',
        connection.server.id,
        comicId,
        parentTitle,
        issue,
        query
      );
      if (!appendIssueEvent(result, item)) break;
    }
    return result;
  }
  const detail = await withLazyLibrarian(connection.server, (api) =>
    api.getIssues(target.id, undefined, ISSUE_CALENDAR_CACHE_TTL_SECONDS)
  );
  const magazineTitle =
    nonEmpty(detail.magazine?.title) ?? nonEmpty(target.title) ?? target.id;
  for (const issue of detail.issues) {
    const item = magazineEvent(
      connection.server.id,
      magazineTitle,
      issue,
      query
    );
    if (!appendIssueEvent(result, item)) break;
  }
  return result;
}

export async function getComicMagazineReleaseCalendar(
  query: CalendarQuery,
  requests: MediaRequest[],
  isAdmin = false,
  enabledCategories?: Partial<EnabledMediaCategories>
): Promise<IssueCalendarResult> {
  const includeComic = !query.mediaType || query.mediaType === 'comic';
  const includeMagazine = !query.mediaType || query.mediaType === 'magazine';
  const isEnabled = (category: 'comic' | 'magazine') =>
    isMediaCategoryEnabled(category) && enabledCategories?.[category] !== false;
  const result: IssueCalendarResult = {
    results: [],
    partialSources: [],
    truncated: false,
  };
  if (
    (!includeComic || !isEnabled('comic')) &&
    (!includeMagazine || !isEnabled('magazine'))
  )
    return result;

  const connections = makeConnections({
    includeComic,
    includeMagazine,
    enabledCategories,
  });
  if (connections.length > MAX_ISSUE_CALENDAR_SOURCES) {
    result.truncated = true;
    connections.length = MAX_ISSUE_CALENDAR_SOURCES;
  }

  if (query.scope === 'mine') {
    const issueRequests = requests.filter(
      (request) =>
        request.status !== MediaRequestStatus.DECLINED &&
        ((request.media?.mediaType === MediaType.COMIC &&
          includeComic &&
          isEnabled('comic')) ||
          (request.media?.mediaType === MediaType.MAGAZINE &&
            includeMagazine &&
            isEnabled('magazine')))
    );
    if (issueRequests.length > MAX_ISSUE_CALENDAR_REQUESTS)
      result.truncated = true;
    const boundedRequests = issueRequests.slice(0, MAX_ISSUE_CALENDAR_REQUESTS);
    for (const request of boundedRequests) {
      if (!request.media) continue;
      const connection = requestConnectionFor(request, connections);
      if (!connection) {
        const source =
          request.media.mediaType === MediaType.MAGAZINE
            ? 'lazylibrarian'
            : requestComicSource(request);
        const serverId = source ? requestServerId(request, source) : undefined;
        if (source && serverId !== undefined) {
          result.partialSources.push({
            source,
            ...(isAdmin ? { serverId } : {}),
          });
        }
        continue;
      }
      requestedTargets(
        [request],
        connection.source,
        connection.server.id
      ).forEach((target) => addTarget(connection, target));
    }
  } else {
    const loaded = await mapWithConcurrency(
      connections,
      ISSUE_CALENDAR_LOOKUP_CONCURRENCY,
      async (connection) => {
        try {
          return {
            connection,
            targets: await loadLibraryTargets(
              connection,
              query.includeUnmonitored
            ),
          };
        } catch {
          result.partialSources.push({
            source: connection.source,
            ...(isAdmin ? { serverId: connection.server.id } : {}),
          });
          return { connection, targets: [] };
        }
      }
    );
    for (const { connection, targets } of loaded) {
      if (targets.length > MAX_ISSUE_CALENDAR_LOOKUPS) result.truncated = true;
      for (const target of targets.slice(0, MAX_ISSUE_CALENDAR_LOOKUPS))
        addTarget(connection, target);
    }
  }

  const connectionOrder = connections.filter(
    (connection) => connection.targets.size > 0
  );
  const targetsByConnection = connectionOrder.map((connection) => ({
    connection,
    targets: [...connection.targets.values()],
    index: 0,
  }));
  const selected: { connection: IssueConnection; target: LookupTarget }[] = [];
  let hasMore = true;
  while (selected.length < MAX_ISSUE_CALENDAR_LOOKUPS && hasMore) {
    hasMore = false;
    for (const group of targetsByConnection) {
      const target = group.targets[group.index];
      if (!target) continue;
      hasMore = true;
      group.index += 1;
      selected.push({ connection: group.connection, target });
      if (selected.length >= MAX_ISSUE_CALENDAR_LOOKUPS) break;
    }
  }
  if (targetsByConnection.some((group) => group.index < group.targets.length))
    result.truncated = true;

  for (
    let index = 0;
    index < selected.length;
    index += ISSUE_CALENDAR_LOOKUP_CONCURRENCY
  ) {
    const batch = selected.slice(
      index,
      index + ISSUE_CALENDAR_LOOKUP_CONCURRENCY
    );
    const loaded = await mapWithConcurrency(
      batch,
      ISSUE_CALENDAR_LOOKUP_CONCURRENCY,
      async ({ connection, target }) => {
        try {
          return {
            failed: false as const,
            events: await loadConnectionIssues(connection, target, query),
          };
        } catch {
          return { failed: true as const };
        }
      }
    );

    for (let loadedIndex = 0; loadedIndex < loaded.length; loadedIndex += 1) {
      const current = loaded[loadedIndex];
      if (current.failed) {
        const { connection } = batch[loadedIndex];
        result.partialSources.push({
          source: connection.source,
          ...(isAdmin ? { serverId: connection.server.id } : {}),
        });
        continue;
      }

      for (const item of current.events.results) {
        if (result.results.length >= MAX_ISSUE_CALENDAR_EVENTS) {
          result.truncated = true;
          break;
        }
        result.results.push(item);
      }
      result.truncated ||= current.events.truncated;

      if (result.results.length >= MAX_ISSUE_CALENDAR_EVENTS) {
        const hasMoreLoadedEvents = loaded
          .slice(loadedIndex + 1)
          .some(
            (entry) =>
              !entry.failed &&
              (entry.events.results.length > 0 || entry.events.truncated)
          );
        const hasUnloadedTargets = index + batch.length < selected.length;
        if (hasMoreLoadedEvents || hasUnloadedTargets) result.truncated = true;
        break;
      }
    }

    if (result.results.length >= MAX_ISSUE_CALENDAR_EVENTS) break;
  }
  result.partialSources = [
    ...new Map(
      result.partialSources.map((source) => [
        `${source.source}:${source.serverId ?? ''}`,
        source,
      ])
    ).values(),
  ];
  return result;
}
