import BinderyAPI from '@server/api/bindery';
import BookOrbitAPI from '@server/api/bookorbit';
import BackIssueAPI from '@server/api/comics/backissue';
import KapowarrAPI from '@server/api/comics/kapowarr';
import LidarrAPI from '@server/api/servarr/lidarr';
import RadarrAPI from '@server/api/servarr/radarr';
import ReadarrAPI, { type ReadarrMediaType } from '@server/api/servarr/readarr';
import SonarrAPI from '@server/api/servarr/sonarr';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { BookRequestSearch } from '@server/entity/BookRequestSearch';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import { getExternalRuntimeConfig } from '@server/lib/externalRuntimeConfig';
import requestDispatchManager from '@server/lib/requestDispatch';
import { readarrServiceSupportsFormat } from '@server/utils/readarrService';
import axios from 'axios';

type CleanupQueueItem = {
  id: number;
  movieId?: number;
  seriesId?: number;
  albumId?: number;
  bookId?: number;
  book?: { id?: number };
  volumeId?: number;
};

type CleanupQueueApi = {
  getQueue: () => Promise<CleanupQueueItem[]>;
  deleteQueueItem: (
    queueId: number,
    options: {
      removeFromClient: boolean;
      blocklist: boolean;
      skipRedownload: boolean;
    }
  ) => Promise<void>;
};

export class RequestWorkCleanupError extends Error {}

const removeMatchingQueueItems = async (
  api: CleanupQueueApi,
  matches: (item: CleanupQueueItem) => boolean
): Promise<void> => {
  const queue = await api.getQueue();
  for (const item of queue.filter(matches)) {
    await api.deleteQueueItem(item.id, {
      removeFromClient: true,
      blocklist: false,
      skipRedownload: true,
    });
  }
  if ((await api.getQueue()).some(matches)) {
    throw new RequestWorkCleanupError(
      'The download service did not confirm cancellation.'
    );
  }
};

class RequestWorkCleanupManager {
  private async cleanupBookOperation(
    operation: BookRequestSearch,
    mediaId: number,
    request: MediaRequest
  ): Promise<void> {
    // Imported files are library inventory, not cancellable acquisition work.
    // A mixed-format request may still have another operation to withdraw.
    if (operation.state === 'available') return;
    const runtimeConfig = getExternalRuntimeConfig();
    const readarrServices = runtimeConfig.readarr;
    const server = readarrServices.find(
      (candidate) => candidate.id === operation.serviceId
    );
    if (!server?.syncEnabled) {
      throw new RequestWorkCleanupError(
        'The selected Bookshelf service is unavailable for cleanup.'
      );
    }
    if (server.backend === 'bookorbit') {
      // A BookOrbit request can be shared by other subscribers. Unsubscribe the
      // service account only while the request is still waiting for approval;
      // BookOrbit owns all approved acquisition and imported library files.
      if (operation.bookorbitRequestId != null) {
        const bookorbit = new BookOrbitAPI(server);
        const linked = await bookorbit.getRequest(operation.bookorbitRequestId);
        if (linked.status === 'pending') {
          const account = await bookorbit.testConnection();
          if (linked.userId === account.userId) {
            // BookOrbit may have other subscribers; preserve their request.
            if (!linked.subscribers?.length)
              await bookorbit.cancel(operation.bookorbitRequestId);
          } else {
            await bookorbit.unsubscribe(operation.bookorbitRequestId);
          }
        }
      }
      return;
    }
    if (server.backend === 'bindery') {
      if (operation.binderyRequestId == null) return;

      const bindery = new BinderyAPI(server);
      const binderyRequestId = operation.binderyRequestId;
      const withdrawalReason = 'Withdrawn in SeerrNG.';
      const getRequest = async () => {
        const snapshot = await bindery.getRequestsById(
          new Set([binderyRequestId])
        );
        if (!snapshot.complete) {
          throw new RequestWorkCleanupError(
            'Bindery could not confirm the request status. Refresh and try again.'
          );
        }
        return snapshot.requests.get(binderyRequestId);
      };
      let clearBinderyLink = false;

      try {
        const binderyRequest = await getRequest();
        if (binderyRequest?.status === 'declined') {
          clearBinderyLink = true;
        } else if (!binderyRequest) {
          // The complete admin queue scan confirmed that Bindery no longer
          // has this request, so there is no pending work to withdraw.
          clearBinderyLink = true;
        } else if (binderyRequest?.status !== 'pending') {
          return;
        }
        if (!clearBinderyLink) {
          await bindery.declineRequest(binderyRequestId, withdrawalReason);
          clearBinderyLink = true;
        }
      } catch (error) {
        const status = axios.isAxiosError(error)
          ? error.response?.status
          : undefined;
        if (status === 404 || status === 409) {
          try {
            const currentRequest = await getRequest();
            if (currentRequest?.status === 'pending') {
              throw new RequestWorkCleanupError(
                'Bindery did not confirm the request withdrawal. The request may still be pending there.'
              );
            }
            clearBinderyLink = currentRequest?.status === 'declined';
          } catch (refreshError) {
            if (refreshError instanceof RequestWorkCleanupError) {
              throw refreshError;
            }
            throw new RequestWorkCleanupError(
              'SeerrNG could not confirm cancellation in Bindery. Check Bindery before retrying.'
            );
          }
        } else if (error instanceof RequestWorkCleanupError) {
          throw error;
        } else {
          throw new RequestWorkCleanupError(
            'SeerrNG could not confirm cancellation in Bindery. Check Bindery before retrying.'
          );
        }
      }

      // Declining only withdraws a Bindery request that is still pending. If
      // it was already approved, Bindery owns the active acquisition and it
      // continues after the SeerrNG request is cancelled. We deliberately do
      // not delete an admin-visible Bindery queue row here: that service-wide
      // action can interrupt work Bindery or another request still needs.
      if (clearBinderyLink) {
        await getRepository(Media).update(
          mediaId,
          operation.format === 'audiobook'
            ? {
                audiobookServiceId: null,
                audiobookExternalServiceId: null,
                audiobookExternalServiceSlug: null,
              }
            : {
                serviceId: null,
                externalServiceId: null,
                externalServiceSlug: null,
              }
        );
        const nextTargets = (request.serviceTargets ?? []).map((target) =>
          target.serviceType === 'readarr' &&
          target.serverId === operation.serviceId &&
          target.format === operation.format
            ? { ...target, externalServiceId: null, externalServiceSlug: null }
            : target
        );
        await getRepository(MediaRequest).update(request.id, {
          serviceTargets: nextTargets,
        });
        request.serviceTargets = nextTargets;
      }
      return;
    }
    const api = new ReadarrAPI({
      apiKey: server.apiKey,
      url: ReadarrAPI.buildUrl(server, '/api/v1'),
      mediaType: operation.format,
    });
    const clearServiceLink = async () =>
      getRepository(Media).update(mediaId, {
        ...(operation.format === 'audiobook'
          ? {
              audiobookServiceId: null,
              audiobookExternalServiceId: null,
              audiobookExternalServiceSlug: null,
            }
          : {
              serviceId: null,
              externalServiceId: null,
              externalServiceSlug: null,
            }),
      });

    if (operation.pendingId != null) {
      const instanceUrl = new URL(ReadarrAPI.buildUrl(server, '/api/v1')).href;
      const pendingReferences = await getRepository(BookRequestSearch).find({
        where: { pendingId: operation.pendingId },
        select: { id: true, requestId: true, serviceId: true, state: true },
      });
      const activeReferences = pendingReferences.filter((reference) => {
        if (['available', 'unavailable', 'failed'].includes(reference.state)) {
          return false;
        }

        if (reference.serviceId === operation.serviceId) {
          return true;
        }

        const referenceService = readarrServices.find(
          (candidate) => candidate.id === reference.serviceId
        );
        if (!referenceService) {
          return true;
        }

        try {
          return (
            new URL(ReadarrAPI.buildUrl(referenceService, '/api/v1')).href ===
            instanceUrl
          );
        } catch {
          // If a stored reference cannot be mapped to an instance, preserve
          // the pending import rather than risking cancellation of shared work.
          return true;
        }
      });
      const referencedByAnotherRequest = activeReferences.some(
        (reference) => reference.requestId !== operation.requestId
      );
      const earlierReferenceInRequest = activeReferences.some(
        (reference) =>
          reference.requestId === operation.requestId &&
          reference.id < operation.id
      );
      if (!referencedByAnotherRequest && !earlierReferenceInRequest) {
        await api.cancelPendingAuthorImport(operation.pendingId);
      }
      await clearServiceLink();
      return;
    }
    if (operation.bookId == null) {
      await clearServiceLink();
      return;
    }
    if (operation.commandId != null) {
      const command = await api.getCommand(operation.commandId);
      if (
        !['completed', 'failed', 'aborted', 'cancelled', 'orphaned'].includes(
          String(command.status ?? '')
            .trim()
            .toLowerCase()
        )
      ) {
        throw new RequestWorkCleanupError(
          'Bookshelf has not finished its search command and cannot confirm cancellation yet.'
        );
      }
    } else if (
      operation.state !== 'pending' &&
      operation.state !== 'monitoring'
    ) {
      throw new RequestWorkCleanupError(
        'Bookshelf request tracking is incomplete, so Seerr cannot confirm cancellation yet.'
      );
    }
    await removeMatchingQueueItems(
      api,
      (item) => (item.bookId ?? item.book?.id) === operation.bookId
    );

    const book = await api.getBookIfExists(operation.bookId);
    let removedBook = !book;
    if (book && operation.createdBook) {
      if ((book.statistics?.bookFileCount ?? 0) === 0) {
        await api.removeBook(operation.bookId, { deleteFiles: false });
        removedBook = true;
      }
    }
    if (operation.createdAuthor && operation.authorId) {
      const remainingBooks = await api.getBooksByAuthor(operation.authorId, 0);
      if (remainingBooks.length === 0) {
        await api.removeAuthor(operation.authorId, { deleteFiles: false });
      }
    }
    if (removedBook) {
      await getRepository(Media).update(mediaId, {
        ...(operation.format === 'audiobook'
          ? {
              audiobookServiceId: null,
              audiobookExternalServiceId: null,
              audiobookExternalServiceSlug: null,
            }
          : {
              serviceId: null,
              externalServiceId: null,
              externalServiceSlug: null,
            }),
      });
    }
  }

  private async cleanupUntrackedBookLinks(
    request: MediaRequest
  ): Promise<void> {
    const media = await getRepository(Media).findOneByOrFail({
      id: request.media.id,
    });
    const formats: ReadarrMediaType[] =
      request.bookFormat === 'both'
        ? ['ebook', 'audiobook']
        : [request.bookFormat === 'audiobook' ? 'audiobook' : 'ebook'];

    for (const format of formats) {
      const serviceId =
        format === 'audiobook' ? media.audiobookServiceId : media.serviceId;
      const bookId =
        format === 'audiobook'
          ? media.audiobookExternalServiceId
          : media.externalServiceId;
      if (serviceId == null || bookId == null) continue;
      const server = getExternalRuntimeConfig().readarr.find(
        (candidate) =>
          candidate.id === serviceId &&
          readarrServiceSupportsFormat(candidate, format)
      );
      if (!server?.syncEnabled) {
        throw new RequestWorkCleanupError(
          'The selected Bookshelf service is unavailable for cleanup.'
        );
      }
      if (server.backend === 'bindery' || server.backend === 'bookorbit') {
        continue;
      }
      const api = new ReadarrAPI({
        apiKey: server.apiKey,
        url: ReadarrAPI.buildUrl(server, '/api/v1'),
        mediaType: format,
      });
      await removeMatchingQueueItems(
        api,
        (item) => (item.bookId ?? item.book?.id) === bookId
      );
      const book = await api.getBookIfExists(bookId);
      if (book && (book.statistics?.bookFileCount ?? 0) === 0) {
        throw new RequestWorkCleanupError(
          'Seerr cannot safely remove an untracked empty Bookshelf entry.'
        );
      }
      if (!book) {
        await getRepository(Media).update(media.id, {
          ...(format === 'audiobook'
            ? {
                audiobookServiceId: null,
                audiobookExternalServiceId: null,
                audiobookExternalServiceSlug: null,
              }
            : {
                serviceId: null,
                externalServiceId: null,
                externalServiceSlug: null,
              }),
        });
      }
    }
  }

  public async cleanup(request: MediaRequest, active: boolean): Promise<void> {
    await requestDispatchManager.cancel(request.id);
    if (!active) return;

    if (request.type === MediaType.MAGAZINE) {
      throw new RequestWorkCleanupError(
        'LazyLibrarian does not support cancelling an individual magazine search through its API.'
      );
    }

    if (
      request.type === MediaType.COMIC &&
      request.media.comicServiceType === 'mylar'
    ) {
      throw new RequestWorkCleanupError(
        'Mylar3 does not support cancelling an individual comic download through its API.'
      );
    }

    if (request.type === MediaType.BOOK) {
      const operations = await getRepository(BookRequestSearch).find({
        where: { requestId: request.id },
        order: { id: 'ASC' },
      });
      for (const operation of operations) {
        await this.cleanupBookOperation(operation, request.media.id, request);
      }
      if (operations.length === 0) {
        await this.cleanupUntrackedBookLinks(request);
      }
      await getRepository(BookRequestSearch).delete({ requestId: request.id });
      return;
    }

    const media = await getRepository(Media).findOneByOrFail({
      id: request.media.id,
    });
    const serviceId =
      request.serverId ?? (request.is4k ? media.serviceId4k : media.serviceId);
    const externalId = request.is4k
      ? media.externalServiceId4k
      : media.externalServiceId;
    if (serviceId == null || externalId == null) return;

    const settings = getExternalRuntimeConfig();
    let api: CleanupQueueApi | undefined;
    let matches: ((item: CleanupQueueItem) => boolean) | undefined;
    if (request.type === MediaType.MOVIE) {
      const server = settings.radarr.find((item) => item.id === serviceId);
      if (server) {
        api = new RadarrAPI({
          apiKey: server.apiKey,
          url: RadarrAPI.buildUrl(server, '/api/v3'),
        });
        matches = (item) => item.movieId === externalId;
      }
    } else if (request.type === MediaType.TV) {
      const server = settings.sonarr.find((item) => item.id === serviceId);
      if (server) {
        api = new SonarrAPI({
          apiKey: server.apiKey,
          url: SonarrAPI.buildUrl(server, '/api/v3'),
        });
        matches = (item) => item.seriesId === externalId;
      }
    } else if (request.type === MediaType.MUSIC) {
      const server = settings.lidarr.find((item) => item.id === serviceId);
      if (server) {
        api = new LidarrAPI({
          apiKey: server.apiKey,
          url: LidarrAPI.buildUrl(server, '/api/v1'),
        });
        matches = (item) => item.albumId === externalId;
      }
    } else if (
      request.type === MediaType.COMIC &&
      media.comicServiceType === 'kapowarr'
    ) {
      const server = settings.kapowarr.find((item) => item.id === serviceId);
      if (server) {
        const kapowarr = new KapowarrAPI({
          apiKey: server.apiKey,
          url: KapowarrAPI.buildUrl(server),
        });
        api = {
          getQueue: async () =>
            (await kapowarr.getQueue()).map((item) => ({
              id: item.id,
              volumeId: item.volumeId,
            })),
          deleteQueueItem: (queueId, options) =>
            kapowarr.removeQueueItem(queueId, options.blocklist),
        };
        matches = (item) => item.volumeId === externalId;
      }
    } else if (
      request.type === MediaType.COMIC &&
      media.comicServiceType === 'backissue'
    ) {
      const server = settings.backissue.find((item) => item.id === serviceId);
      if (server) {
        const backissue = new BackIssueAPI({
          url: BackIssueAPI.buildUrl(server),
          apiKey: server.apiKey,
        });
        api = {
          getQueue: async () =>
            (await backissue.getQueue()).map((item) => ({
              id: item.id,
              volumeId: item.seriesId,
            })),
          deleteQueueItem: (queueId) => backissue.cancelQueueItem(queueId),
        };
        matches = (item) => item.volumeId === externalId;
      }
    }
    if (!api || !matches) {
      throw new RequestWorkCleanupError(
        'The selected download service is unavailable for cleanup.'
      );
    }
    await removeMatchingQueueItems(api, matches);
  }
}

const requestWorkCleanupManager = new RequestWorkCleanupManager();

export default requestWorkCleanupManager;
