import { MediaRequestStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import {
  MediaRequest,
  ServiceConfigurationError,
  getRequestMutationAdmissionKey,
  runWithRequestAdmission,
} from '@server/entity/MediaRequest';
import { getExternalRuntimeConfig } from '@server/lib/externalRuntimeConfig';
import { Permission } from '@server/lib/permissions';
import { runAuthorizedUserSecurityMutation } from '@server/lib/userSecurityMutation';

export class PendingRequestTransitionNotFoundError extends Error {
  public readonly status = 404;

  constructor() {
    super('Request not found.');
  }
}

export class PendingRequestTransitionConflictError extends Error {
  public readonly status = 409;

  constructor() {
    super('Only pending requests can be approved or declined.');
  }
}

export const validateExternalServiceConfiguration = (
  requestType: MediaType,
  serverId?: number | null,
  bookFormat?: 'ebook' | 'audiobook' | 'both' | null,
  is4k = false
) => {
  const settings = getExternalRuntimeConfig();

  if (requestType === MediaType.MOVIE || requestType === MediaType.TV) {
    if (serverId === undefined || serverId === null) {
      return;
    }
    const selectedServer =
      requestType === MediaType.MOVIE
        ? settings.radarr.find(({ id }) => id === serverId)
        : settings.sonarr.find(({ id }) => id === serverId);
    if (!selectedServer) {
      throw new ServiceConfigurationError(
        `The selected ${
          requestType === MediaType.MOVIE ? 'Radarr' : 'Sonarr'
        } server no longer exists.`
      );
    }
    if (selectedServer.is4k !== is4k) {
      throw new ServiceConfigurationError(
        `The selected ${
          requestType === MediaType.MOVIE ? 'Radarr' : 'Sonarr'
        } server does not match the requested quality tier.`
      );
    }
    return;
  }

  if (requestType === MediaType.MUSIC) {
    if (serverId === undefined || serverId === null) {
      if (!settings.lidarr.some((lidarr) => lidarr.isDefault)) {
        throw new ServiceConfigurationError(
          'No default Lidarr server is configured for music requests.'
        );
      }

      return;
    }

    if (!settings.lidarr.some((lidarr) => lidarr.id === serverId)) {
      throw new ServiceConfigurationError(
        'The selected Lidarr server no longer exists.'
      );
    }
  }

  if (requestType === MediaType.BOOK) {
    const requestedFormat = bookFormat ?? 'ebook';

    if (serverId === undefined || serverId === null) {
      const hasDefaultEbook = settings.readarr.some(
        (readarr) =>
          readarr.isDefault && (readarr.serviceType ?? 'ebook') === 'ebook'
      );
      const hasDefaultAudiobook = settings.readarr.some(
        (readarr) => readarr.isDefault && readarr.serviceType === 'audiobook'
      );

      if (requestedFormat === 'both') {
        if (!hasDefaultEbook || !hasDefaultAudiobook) {
          throw new ServiceConfigurationError(
            'Both-format book requests require default ebook and audiobook Bookshelf services.'
          );
        }

        return;
      }

      if (
        (requestedFormat === 'ebook' && !hasDefaultEbook) ||
        (requestedFormat === 'audiobook' && !hasDefaultAudiobook)
      ) {
        throw new ServiceConfigurationError(
          `No default ${requestedFormat} Bookshelf server is configured for book requests.`
        );
      }

      return;
    }

    const selectedReadarr = settings.readarr.find(
      (readarr) => readarr.id === serverId
    );

    if (!selectedReadarr) {
      throw new ServiceConfigurationError(
        'The selected Bookshelf server no longer exists.'
      );
    }

    if (requestedFormat === 'both') {
      if ((selectedReadarr.serviceType ?? 'ebook') !== 'ebook') {
        throw new ServiceConfigurationError(
          'The selected Bookshelf server is configured for audiobook requests, not ebook requests.'
        );
      }
      if (
        !settings.readarr.some(
          (readarr) => readarr.isDefault && readarr.serviceType === 'audiobook'
        )
      ) {
        throw new ServiceConfigurationError(
          'Both-format book requests require a default audiobook Bookshelf service.'
        );
      }
      return;
    }

    const selectedReadarrServiceType = selectedReadarr.serviceType ?? 'ebook';

    if (selectedReadarrServiceType !== requestedFormat) {
      throw new ServiceConfigurationError(
        `The selected Bookshelf server is configured for ${selectedReadarrServiceType} requests, not ${requestedFormat} requests.`
      );
    }
  }

  if (requestType === MediaType.COMIC) {
    if (serverId === undefined || serverId === null) {
      if (
        !settings.mylar.some((mylar) => mylar.isDefault) &&
        !settings.kapowarr.some((kapowarr) => kapowarr.isDefault) &&
        !settings.backissue.some((backissue) => backissue.isDefault)
      ) {
        throw new ServiceConfigurationError(
          'No default comic service is configured for comic requests.'
        );
      }
      return;
    }

    if (
      !settings.mylar.some((mylar) => mylar.id === serverId) &&
      !settings.kapowarr.some((kapowarr) => kapowarr.id === serverId) &&
      !settings.backissue.some((backissue) => backissue.id === serverId)
    ) {
      throw new ServiceConfigurationError(
        'The selected comics server no longer exists.'
      );
    }
  }

  if (requestType === MediaType.MAGAZINE) {
    if (serverId === undefined || serverId === null) {
      if (!settings.lazylibrarian.some((service) => service.isDefault)) {
        throw new ServiceConfigurationError(
          'No default LazyLibrarian server is configured for magazine requests.'
        );
      }
      return;
    }

    if (!settings.lazylibrarian.some((service) => service.id === serverId)) {
      throw new ServiceConfigurationError(
        'The selected LazyLibrarian server no longer exists.'
      );
    }
  }
};

export const transitionPendingMediaRequest = (
  requestId: number,
  actorId: number,
  newStatus: MediaRequestStatus.APPROVED | MediaRequestStatus.DECLINED,
  expectedCredentialVersion?: number
) => {
  if (
    !Number.isSafeInteger(requestId) ||
    requestId <= 0 ||
    !Number.isSafeInteger(actorId) ||
    actorId <= 0
  ) {
    throw new PendingRequestTransitionNotFoundError();
  }

  const requestRepository = getRepository(MediaRequest);
  return runAuthorizedUserSecurityMutation(
    actorId,
    actorId,
    Permission.MANAGE_REQUESTS,
    (actor) =>
      runWithRequestAdmission(
        [getRequestMutationAdmissionKey(requestId)],
        async () => {
          const request = await requestRepository.findOne({
            where: { id: requestId },
            relations: { requestedBy: true, modifiedBy: true },
          });
          if (!request) {
            throw new PendingRequestTransitionNotFoundError();
          }
          if (request.status !== MediaRequestStatus.PENDING) {
            throw new PendingRequestTransitionConflictError();
          }

          if (newStatus === MediaRequestStatus.APPROVED) {
            validateExternalServiceConfiguration(
              request.type,
              request.serverId,
              request.bookFormat,
              request.is4k
            );
          }

          request.status = newStatus;
          request.modifiedBy = actor;
          return requestRepository.save(request);
        }
      ),
    { expectedCredentialVersion }
  );
};
