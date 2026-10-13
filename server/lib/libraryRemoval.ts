import BackIssueAPI from '@server/api/comics/backissue';
import KapowarrAPI from '@server/api/comics/kapowarr';
import MylarAPI from '@server/api/comics/mylar';
import LazyLibrarianAPI from '@server/api/lazylibrarian';
import LidarrAPI from '@server/api/servarr/lidarr';
import RadarrAPI from '@server/api/servarr/radarr';
import ReadarrAPI from '@server/api/servarr/readarr';
import SonarrAPI from '@server/api/servarr/sonarr';
import { MediaType } from '@server/constants/media';
import type Media from '@server/entity/Media';
import { MediaIdentifierProvider } from '@server/entity/MediaIdentifier';
import type {
  LibraryCopy,
  LibraryRemovalPlan,
} from '@server/interfaces/api/libraryRemoval';
import { getExternalRuntimeConfig } from '@server/lib/externalRuntimeConfig';
import { normalizeMagazineTitle } from '@server/lib/magazineIdentity';
import type {
  CollectorServiceSettings,
  DVRSettings,
} from '@server/lib/settings';
import { createHmac } from 'node:crypto';

export const libraryServiceType = (
  type: MediaType,
  comicServiceType?: Media['comicServiceType']
): LibraryCopy['serviceType'] => {
  switch (type) {
    case MediaType.MOVIE:
      return 'radarr';
    case MediaType.TV:
      return 'sonarr';
    case MediaType.MUSIC:
      return 'lidarr';
    case MediaType.BOOK:
      return 'readarr';
    case MediaType.COMIC:
      if (
        comicServiceType !== 'mylar' &&
        comicServiceType !== 'kapowarr' &&
        comicServiceType !== 'backissue'
      ) {
        throw new Error(
          'Cannot safely identify the comic backend. Refresh its metadata before deleting.'
        );
      }
      return comicServiceType;
    case MediaType.MAGAZINE:
      return 'lazylibrarian';
    default:
      throw new Error('Unsupported library media type.');
  }
};

const webUrl = (
  settings: DVRSettings | CollectorServiceSettings,
  path: string
) =>
  settings.externalUrl
    ? settings.externalUrl.replace(/\/+$/, '') + path
    : RadarrAPI.buildUrl(settings, path);

const isHighQualityServer = (
  settings: DVRSettings | CollectorServiceSettings
): boolean => 'is4k' in settings && settings.is4k === true;

export const libraryPlanToken = (
  mediaId: number,
  targets: LibraryCopy[],
  authority: unknown
) =>
  createHmac('sha256', getExternalRuntimeConfig().main.apiKey)
    .update(
      JSON.stringify({
        mediaId,
        targets: [...targets].sort((a, b) => a.key.localeCompare(b.key)),
        authority,
      })
    )
    .digest('hex');

// No fuzzy title matching, default-service fallback or status-only deletion.
// A plan is built from fresh service inventories, including copies with no saved
// Seerr service IDs. Any inaccessible service fails the complete preflight.
export const resolveLibraryRemoval = async (
  media: Media
): Promise<{
  plan: LibraryRemovalPlan;
  remove: (target: LibraryCopy) => Promise<void>;
}> => {
  const type = libraryServiceType(media.mediaType, media.comicServiceType);
  const settings = getExternalRuntimeConfig()[type];
  const targets: LibraryCopy[] = [];
  const removers = new Map<string, () => Promise<void>>();
  const add = (
    server: DVRSettings | CollectorServiceSettings,
    id: number | string,
    quality: string,
    path: string,
    remove: () => Promise<void>
  ) => {
    if (
      (typeof id === 'number' && (!Number.isSafeInteger(id) || id <= 0)) ||
      (typeof id === 'string' && !id.trim())
    )
      throw new Error('Invalid library item ID.');
    const key = [type, server.id, id, quality].join(':');
    if (removers.has(key)) return;
    targets.push({
      key,
      serviceType: type,
      serviceId: server.id,
      externalId: id,
      service: server.name,
      quality,
      url: webUrl(server, path),
    });
    removers.set(key, remove);
  };
  for (const server of settings) {
    try {
      if (type === 'radarr') {
        if (!media.tmdbId) throw new Error('Missing TMDB identifier.');
        const api = new RadarrAPI({
          apiKey: server.apiKey,
          url: RadarrAPI.buildUrl(server, '/api/v3'),
        });
        for (const item of await api.getMovies({
          tmdbId: media.tmdbId,
          strict: true,
        })) {
          if (item.tmdbId === media.tmdbId)
            add(
              server,
              item.id,
              isHighQualityServer(server) ? '4K' : 'HD',
              '/movie/' +
                encodeURIComponent(item.titleSlug || String(item.tmdbId)),
              () => api.removeMovieById(item.id)
            );
        }
      } else if (type === 'sonarr') {
        if (!media.tvdbId)
          throw new Error(
            'Missing TVDB identifier; refresh the media metadata first.'
          );
        const api = new SonarrAPI({
          apiKey: server.apiKey,
          url: SonarrAPI.buildUrl(server, '/api/v3'),
        });
        for (const item of await api.getSeries()) {
          if (item.tvdbId === media.tvdbId) {
            const seriesId = item.id;
            if (seriesId == null) throw new Error('Missing library series ID.');
            add(
              server,
              seriesId,
              isHighQualityServer(server) ? '4K' : 'HD',
              '/series/' +
                encodeURIComponent(item.titleSlug || String(item.tvdbId)),
              () => api.removeSeriesById(seriesId)
            );
          }
        }
      } else if (type === 'lidarr') {
        if (!media.mbId) throw new Error('Missing MusicBrainz identifier.');
        const api = new LidarrAPI({
          apiKey: server.apiKey,
          url: LidarrAPI.buildUrl(server, '/api/v1'),
        });
        for (const item of await api.getAlbums(0)) {
          if (item.foreignAlbumId?.toLowerCase() === media.mbId.toLowerCase()) {
            const albumId = item.id;
            if (albumId == null) throw new Error('Missing library album ID.');
            add(
              server,
              albumId,
              server.name,
              '/album/' + encodeURIComponent(item.foreignAlbumId),
              () => api.removeAlbum(albumId)
            );
          }
        }
      } else if (type === 'readarr') {
        const format =
          getExternalRuntimeConfig().readarr.find((s) => s.id === server.id)
            ?.serviceType ?? 'ebook';
        const api = new ReadarrAPI({
          apiKey: server.apiKey,
          url: ReadarrAPI.buildUrl(server, '/api/v1'),
          mediaType: format,
        });
        const linkedId =
          format === 'audiobook'
            ? media.audiobookServiceId === server.id
              ? media.audiobookExternalServiceId
              : undefined
            : media.serviceId === server.id
              ? media.externalServiceId
              : undefined;
        const books = await api.getBooks();
        const canonicalIds = new Set(
          (media.identifiers ?? [])
            .filter((identifier) => identifier.provider === 'openlibrary')
            .map((identifier) => identifier.value.replace(/^\/works\//, ''))
        );
        for (const item of books) {
          const foreignId = String(item.foreignBookId ?? '').replace(
            /^\/works\//,
            ''
          );
          if (
            item.id === linkedId ||
            (/^OL\d+W$/.test(foreignId) && canonicalIds.has(foreignId))
          )
            add(
              server,
              item.id,
              format === 'audiobook' ? 'Audiobook' : 'Book',
              '/book/' +
                encodeURIComponent(item.titleSlug || foreignId) +
                '?mediaType=' +
                format,
              () => api.removeBook(item.id)
            );
        }
      } else if (type === 'mylar') {
        const comicVineId = media.identifiers?.find(
          (identifier) =>
            identifier.provider === MediaIdentifierProvider.COMICVINE
        )?.value;
        if (!comicVineId) throw new Error('Missing ComicVine identifier.');
        const api = new MylarAPI({
          apiKey: server.apiKey,
          url: MylarAPI.buildUrl(server),
        });
        for (const item of await api.getIndex()) {
          if (item.id === comicVineId)
            add(
              server,
              item.id,
              'Comic',
              '/comicDetails?ComicID=' + encodeURIComponent(item.id),
              () => api.removeComic(item.id)
            );
        }
      } else if (type === 'kapowarr') {
        const comicVineId = Number(
          media.identifiers?.find(
            (identifier) =>
              identifier.provider === MediaIdentifierProvider.COMICVINE
          )?.value
        );
        if (!Number.isSafeInteger(comicVineId) || comicVineId <= 0)
          throw new Error('Missing ComicVine identifier.');
        const api = new KapowarrAPI({
          apiKey: server.apiKey,
          url: KapowarrAPI.buildUrl(server),
        });
        for (const item of await api.getVolumes()) {
          if (item.comicvine_id === comicVineId)
            add(server, item.id, 'Comic', '/volumes/' + item.id, () =>
              api.removeVolume(item.id)
            );
        }
      } else if (type === 'backissue') {
        const comicVineId = Number(
          media.identifiers?.find(
            (identifier) =>
              identifier.provider === MediaIdentifierProvider.COMICVINE
          )?.value
        );
        if (!Number.isSafeInteger(comicVineId) || comicVineId <= 0)
          throw new Error('Missing ComicVine identifier.');
        const api = new BackIssueAPI({
          apiKey: server.apiKey,
          url: BackIssueAPI.buildUrl(server),
        });
        for (const item of await api.getCollection()) {
          if (item.cv_id === comicVineId)
            add(server, item.id, 'Comic', '/', () => api.removeSeries(item.id));
        }
      } else {
        const magazineTitles = new Set(
          [
            ...(media.identifiers ?? [])
              .filter(
                (identifier) =>
                  identifier.provider === MediaIdentifierProvider.LAZYLIBRARIAN
              )
              .map((identifier) => identifier.value),
            media.externalServiceSlug,
          ]
            .filter((title): title is string => !!title)
            .map(normalizeMagazineTitle)
        );
        if (!magazineTitles.size)
          throw new Error('Missing LazyLibrarian magazine identifier.');
        const api = new LazyLibrarianAPI({
          apiKey: server.apiKey,
          url: LazyLibrarianAPI.buildUrl(server),
        });
        for (const item of await api.getMagazines()) {
          if (magazineTitles.has(normalizeMagazineTitle(item.title)))
            add(server, item.title, 'Magazine', '', () =>
              api.removeMagazine(item.title)
            );
        }
      }
    } catch {
      // Do not expose service addresses, credentials or upstream exception bodies.
      throw new Error(
        'Unable to verify library copies in ' +
          server.name +
          '. No deletion has started.'
      );
    }
  }
  return {
    plan: {
      targets,
      token: libraryPlanToken(media.id, targets, settings),
      verifiedServices: settings.length,
    },
    remove: async (target) => {
      const remove = removers.get(target.key);
      if (!remove) throw new Error('Library target is no longer verified.');
      await remove();
    },
  };
};

export const executeLibraryRemoval = async (
  token: unknown,
  resolved: Awaited<ReturnType<typeof resolveLibraryRemoval>>,
  afterRemoval: (target: LibraryCopy, remaining: LibraryCopy[]) => Promise<void>
) => {
  if (typeof token !== 'string' || token !== resolved.plan.token)
    throw new Error(
      'Library copies changed. Review a fresh confirmation before deleting.'
    );
  if (!resolved.plan.targets.length)
    throw new Error('No library copies were found.');
  const remaining = [...resolved.plan.targets];
  for (const target of resolved.plan.targets) {
    await resolved.remove(target);
    remaining.shift();
    await afterRemoval(target, [...remaining]);
  }
};
