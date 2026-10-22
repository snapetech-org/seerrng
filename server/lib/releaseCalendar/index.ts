import LidarrAPI from '@server/api/servarr/lidarr';
import RadarrAPI from '@server/api/servarr/radarr';
import ReadarrAPI from '@server/api/servarr/readarr';
import SonarrAPI from '@server/api/servarr/sonarr';
import { MediaRequestStatus, MediaType } from '@server/constants/media';
import type {
  EnabledMediaCategories,
  MediaCategoryKey,
} from '@server/constants/mediaCategories';
import { getRepository } from '@server/datasource';
import { MediaIdentifierProvider } from '@server/entity/MediaIdentifier';
import { MediaRequest } from '@server/entity/MediaRequest';
import {
  normalizeMusicBrainzId,
  normalizeOpenLibraryEditionId,
  normalizeOpenLibraryWorkId,
} from '@server/lib/externalIds';
import { normalizeValidIsbn } from '@server/lib/isbn';
import { isMediaCategoryEnabled } from '@server/lib/mediaCategories';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { parseBookshelfBookId } from '@server/utils/bookshelfCatalog';
import {
  BoundedTaskQueue,
  mapWithConcurrency,
} from '@server/utils/concurrency';
import { annotateReleaseCalendarHistory } from './historyStore';
import { getComicMagazineReleaseCalendar } from './issues';
import {
  normalizeCalendarRow,
  type ReleaseCalendarBookFormat,
  type ReleaseCalendarItem,
} from './normalize';
import type { CalendarQuery } from './query';
import { getSoftwareReleaseCalendar } from './software';

const calendarQueue = new BoundedTaskQueue(3, 32);

export async function getReleaseCalendar(
  query: CalendarQuery,
  userId: number,
  isAdmin: boolean,
  options: {
    includeDateHistory?: boolean;
    includeSoftware?: boolean;
    enabledMediaCategories?: Partial<EnabledMediaCategories>;
  } = {}
) {
  const settings = getSettings();
  const enabledMediaCategories = options.enabledMediaCategories;
  const isCategoryEnabled = (category: MediaCategoryKey) =>
    isMediaCategoryEnabled(category) &&
    enabledMediaCategories?.[category] !== false;
  const loadedRequests =
    query.scope === 'mine'
      ? await getRepository(MediaRequest)
          .createQueryBuilder('request')
          .innerJoinAndSelect('request.media', 'media')
          .leftJoinAndSelect('media.identifiers', 'identifier')
          .where('request.requestedById = :userId', { userId })
          .andWhere('request.status != :declined', {
            declined: MediaRequestStatus.DECLINED,
          })
          .orderBy('request.id', 'DESC')
          .take(5_001)
          .getMany()
      : [];
  const requests = loadedRequests.slice(0, 5_000);
  const sources = [
    ...settings.radarr.map((server) => ({
      source: 'radarr' as const,
      mediaType: 'movie' as const,
      category: 'movie' as const,
      bookFormat: undefined,
      server,
    })),
    ...settings.sonarr.map((server) => ({
      source: 'sonarr' as const,
      mediaType: 'tv' as const,
      category: 'tv' as const,
      bookFormat: undefined,
      server,
    })),
    ...settings.lidarr.map((server) => ({
      source: 'lidarr' as const,
      mediaType: 'music' as const,
      category: 'music' as const,
      bookFormat: undefined,
      server,
    })),
    ...settings.readarr
      .filter((server) => server.backend !== 'bindery')
      .map((server) => {
        const bookFormat: ReleaseCalendarBookFormat =
          server.serviceType === 'audiobook' ? 'audiobook' : 'ebook';
        return {
          source: 'readarr' as const,
          mediaType: 'book' as const,
          category: bookFormat,
          bookFormat,
          server,
        };
      }),
  ].filter(
    (item) =>
      isCategoryEnabled(item.category) &&
      (!query.mediaType || item.mediaType === query.mediaType)
  );
  let sourceTruncated = loadedRequests.length > requests.length;
  const partialSources: { source: string; serverId?: number }[] = [];
  let softwareResults: ReleaseCalendarItem[] = [];
  let issueResults: ReleaseCalendarItem[] = [];
  if (
    options.includeSoftware !== false &&
    (!query.mediaType || query.mediaType === 'software')
  ) {
    const software = await getSoftwareReleaseCalendar(
      query,
      userId,
      enabledMediaCategories
    );
    softwareResults = software.results;
    sourceTruncated ||= software.truncated;
    partialSources.push(...software.partialSources);
  }
  if (
    !query.mediaType ||
    query.mediaType === 'comic' ||
    query.mediaType === 'magazine'
  ) {
    const issues = await getComicMagazineReleaseCalendar(
      query,
      requests,
      isAdmin,
      enabledMediaCategories
    );
    issueResults = issues.results;
    sourceTruncated ||= issues.truncated;
    partialSources.push(...issues.partialSources);
  }
  const batches = await mapWithConcurrency(
    sources.slice(0, 20),
    3,
    async ({ source, server, bookFormat }) => {
      try {
        const api =
          source === 'radarr'
            ? new RadarrAPI({
                url: RadarrAPI.buildUrl(server, '/api/v3'),
                apiKey: server.apiKey,
              })
            : source === 'sonarr'
              ? new SonarrAPI({
                  url: SonarrAPI.buildUrl(server, '/api/v3'),
                  apiKey: server.apiKey,
                })
              : source === 'lidarr'
                ? new LidarrAPI({
                    url: LidarrAPI.buildUrl(server, '/api/v1'),
                    apiKey: server.apiKey,
                  })
                : new ReadarrAPI({
                    url: ReadarrAPI.buildUrl(server, '/api/v1'),
                    apiKey: server.apiKey,
                    mediaType: bookFormat ?? 'ebook',
                  });
        const rows = await calendarQueue.run(() =>
          api.getReleaseCalendar(
            new Date(
              Math.min(query.start.getTime(), query.allDayStart.getTime())
            ).toISOString(),
            new Date(
              Math.max(query.end.getTime(), query.allDayEnd.getTime())
            ).toISOString(),
            query.includeUnmonitored,
            source === 'lidarr',
            source === 'readarr'
          )
        );
        if (api instanceof SonarrAPI) {
          const missingIds = [
            ...new Set(
              rows.flatMap((row) =>
                row &&
                typeof row === 'object' &&
                !(
                  'series' in row &&
                  row.series &&
                  typeof row.series === 'object'
                ) &&
                'seriesId' in row &&
                typeof row.seriesId === 'number' &&
                Number.isSafeInteger(row.seriesId) &&
                row.seriesId > 0
                  ? [row.seriesId]
                  : []
              )
            ),
          ];
          if (missingIds.length > 200) sourceTruncated = true;
          let missingSeries = false;
          const series = await mapWithConcurrency(
            missingIds.slice(0, 200),
            3,
            async (id) => {
              try {
                return {
                  id,
                  series: await calendarQueue.run(() => api.getSeriesById(id)),
                };
              } catch {
                missingSeries = true;
                return undefined;
              }
            }
          );
          if (missingSeries)
            partialSources.push({
              source,
              ...(isAdmin ? { serverId: server.id } : {}),
            });
          const byId = new Map(
            series.flatMap((item) =>
              item ? [[item.id, item.series] as const] : []
            )
          );
          for (const row of rows)
            if (
              row &&
              typeof row === 'object' &&
              !(
                'series' in row &&
                row.series &&
                typeof row.series === 'object'
              ) &&
              'seriesId' in row
            )
              Object.assign(row, { series: byId.get(row.seriesId as number) });
        }
        return rows.flatMap((row) => {
          const item = normalizeCalendarRow(
            source,
            server.id,
            server.is4k,
            row,
            query.allDayStart,
            query.allDayEnd,
            source === 'readarr' ? bookFormat : undefined
          );
          return item &&
            new Date(item.startsAt) >=
              (item.allDay ? query.allDayStart : query.start) &&
            new Date(item.startsAt) <
              (item.allDay ? query.allDayEnd : query.end)
            ? [item]
            : [];
        });
      } catch {
        partialSources.push({
          source,
          ...(isAdmin ? { serverId: server.id } : {}),
        });
        return [];
      }
    }
  );
  let results: ReleaseCalendarItem[] = [
    ...batches.flat(),
    ...softwareResults,
    ...issueResults,
  ];
  if (query.scope === 'mine') {
    const tmdbIds = new Set(
      requests.map(
        (request) =>
          `${request.media.mediaType}:${request.media.tmdbId}:${request.is4k}`
      )
    );
    const tvdbIds = new Set(
      requests
        .filter((request) => request.media.tvdbId)
        .map((request) => `${request.media.tvdbId}:${request.is4k}`)
    );
    const musicIds = new Set(
      requests
        .filter((request) => request.media.mediaType === MediaType.MUSIC)
        .flatMap((request) =>
          request.media.mbId ? [normalizeMusicBrainzId(request.media.mbId)] : []
        )
    );
    const bookFormatsByIdentity = new Map<
      string,
      Set<ReleaseCalendarBookFormat>
    >();
    const addBookIdentity = (
      identity: string,
      formats: Set<ReleaseCalendarBookFormat>
    ) => {
      const existing = bookFormatsByIdentity.get(identity) ?? new Set();
      for (const format of formats) existing.add(format);
      bookFormatsByIdentity.set(identity, existing);
    };
    for (const request of requests) {
      if (request.media.mediaType !== MediaType.BOOK) continue;
      const targetedFormats = (request.serviceTargets ?? [])
        .filter((target) => target.serviceType === 'readarr')
        .map((target) => target.format)
        .filter(
          (format): format is ReleaseCalendarBookFormat =>
            format === 'ebook' || format === 'audiobook'
        );
      const requestedFormats = new Set<ReleaseCalendarBookFormat>(
        targetedFormats.length
          ? targetedFormats
          : request.bookFormat === 'both'
            ? ['ebook', 'audiobook']
            : [request.bookFormat === 'audiobook' ? 'audiobook' : 'ebook']
      );
      const requestedIsbn = normalizeValidIsbn(
        request.preferredIsbn13 ?? undefined
      );
      if (requestedIsbn)
        addBookIdentity(`isbn:${requestedIsbn}`, requestedFormats);
      const preferredEditionId = request.preferredEditionId?.trim();
      if (preferredEditionId)
        addBookIdentity(
          `openlibrary-edition:${normalizeOpenLibraryEditionId(preferredEditionId).toLowerCase()}`,
          requestedFormats
        );
      for (const identifier of request.media.identifiers ?? []) {
        const value = identifier.value.trim();
        if (!value) continue;
        if (identifier.provider === MediaIdentifierProvider.READARR) {
          addBookIdentity(`readarr:${value.toLowerCase()}`, requestedFormats);
        } else if (
          identifier.provider === MediaIdentifierProvider.BOOKSHELF ||
          identifier.provider === MediaIdentifierProvider.AUDIOBOOKSHELF
        ) {
          const bookshelfId = parseBookshelfBookId(value);
          addBookIdentity(
            `${identifier.provider}:${(bookshelfId?.foreignBookId ?? value).toLowerCase()}`,
            requestedFormats
          );
        } else if (
          identifier.provider === MediaIdentifierProvider.OPENLIBRARY
        ) {
          addBookIdentity(
            `openlibrary:${normalizeOpenLibraryWorkId(value)}`,
            requestedFormats
          );
        } else if (
          identifier.provider === MediaIdentifierProvider.OPENLIBRARY_EDITION
        ) {
          addBookIdentity(
            `openlibrary-edition:${normalizeOpenLibraryEditionId(value).toLowerCase()}`,
            requestedFormats
          );
        } else if (identifier.provider === MediaIdentifierProvider.ISBN) {
          addBookIdentity(
            `isbn:${normalizeValidIsbn(value) ?? value}`,
            requestedFormats
          );
        }
      }
    }
    results = results.filter((item) => {
      if (item.mediaType === 'software') {
        // The software-request query applied the user's scope before catalog lookup.
        return true;
      }
      if (item.mediaType === 'comic' || item.mediaType === 'magazine') {
        // Comic and magazine lookups were scoped to the user's requests above.
        return true;
      }
      if (item.mediaType === 'music')
        return !!item.mbId && musicIds.has(normalizeMusicBrainzId(item.mbId));
      if (item.mediaType === 'book') {
        if (!item.foreignBookId || !item.bookFormat) return false;
        const foreignBookId = item.foreignBookId.trim();
        const identities = [
          `readarr:${foreignBookId.toLowerCase()}`,
          `bookshelf:${foreignBookId.toLowerCase()}`,
          `audiobookshelf:${foreignBookId.toLowerCase()}`,
        ];
        const openLibraryId = foreignBookId.match(
          /^(?:openlibrary:)?(?:\/?works\/)?(OL\d+W)$/i
        )?.[1];
        if (openLibraryId)
          identities.push(
            `openlibrary:${normalizeOpenLibraryWorkId(openLibraryId)}`
          );
        if (item.foreignEditionId)
          identities.push(
            `openlibrary-edition:${normalizeOpenLibraryEditionId(item.foreignEditionId).toLowerCase()}`
          );
        for (const isbn of item.isbnCandidates ?? [])
          identities.push(`isbn:${isbn}`);
        const prefixedIsbn = foreignBookId.match(/^isbn:(.+)$/i)?.[1];
        if (prefixedIsbn)
          identities.push(
            `isbn:${normalizeValidIsbn(prefixedIsbn) ?? prefixedIsbn.trim()}`
          );
        return identities.some((identity) =>
          bookFormatsByIdentity.get(identity)?.has(item.bookFormat!)
        );
      }
      return item.tmdbId
        ? tmdbIds.has(`${item.mediaType}:${item.tmdbId}:${item.is4k}`)
        : item.mediaType === 'tv' &&
            !!item.tvdbId &&
            tvdbIds.has(`${item.tvdbId}:${item.is4k}`);
    });
  }
  results.sort(
    (a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id)
  );
  const visibleResults = results.slice(0, 5000);
  if (visibleResults.length && options.includeDateHistory !== false) {
    try {
      return {
        results: await annotateReleaseCalendarHistory(visibleResults),
        partialSources,
        truncated:
          sourceTruncated || sources.length > 20 || results.length > 5000,
      };
    } catch (error) {
      logger.warn('Release calendar date history could not be loaded.', {
        label: 'Release Calendar',
        errorMessage:
          error instanceof Error ? error.message : 'Unknown database error',
      });
    }
  }
  return {
    results: visibleResults,
    partialSources,
    truncated: sourceTruncated || sources.length > 20 || results.length > 5000,
  };
}
