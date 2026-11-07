import { MediaStatus } from '@server/constants/media';
import type Media from '@server/entity/Media';
import type { MediaRequestServiceTarget } from '@server/entity/MediaRequest';

type ComicMedia = Partial<
  Pick<Media, 'status' | 'serviceId' | 'externalServiceId' | 'comicServiceType'>
>;
type ComicRequest = {
  serverId?: number | null;
  serviceTargets?: MediaRequestServiceTarget[] | null;
};

const requestedTargets = (request: ComicRequest) =>
  request.serviceTargets?.filter(
    (target) =>
      target.format === 'comic' &&
      (request.serverId == null || target.serverId === request.serverId)
  ) ?? [];

export const matchesComicDestination = (
  request: ComicRequest,
  media: ComicMedia
): boolean => {
  const targets = requestedTargets(request);
  return targets.length > 0
    ? targets.some(
        (target) =>
          target.serverId === media.serviceId &&
          target.serviceType === (media.comicServiceType ?? 'mylar')
      )
    : request.serverId == null || request.serverId === media.serviceId;
};

export const hasDeliveredComicTarget = (
  target: MediaRequestServiceTarget
): boolean =>
  target.format === 'comic' &&
  Number.isSafeInteger(target.externalServiceId) &&
  Number(target.externalServiceId) > 0;

export const getComicRequestTarget = (
  media: ComicMedia,
  request: ComicRequest
): MediaRequestServiceTarget | undefined => {
  const saved = requestedTargets(request)[0];
  if (saved) return saved;
  if (
    media.serviceId == null ||
    media.externalServiceId == null ||
    !matchesComicDestination(request, media)
  )
    return undefined;
  return {
    serviceType: media.comicServiceType ?? 'mylar',
    format: 'comic',
    serverId: media.serviceId,
    externalServiceId: media.externalServiceId,
    status: media.status ?? MediaStatus.UNKNOWN,
  };
};

export const isComicRequestAvailable = (
  media: ComicMedia,
  request: ComicRequest
): boolean => {
  const targets = requestedTargets(request);
  return (
    targets.some(
      (target) =>
        hasDeliveredComicTarget(target) &&
        target.status === MediaStatus.AVAILABLE
    ) ||
    (media.status === MediaStatus.AVAILABLE &&
      media.serviceId != null &&
      media.externalServiceId != null &&
      matchesComicDestination(request, media))
  );
};
