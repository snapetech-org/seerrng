import { MediaStatus } from '@server/constants/media';
import type Media from '@server/entity/Media';
import type { MediaRequestServiceTarget } from '@server/entity/MediaRequest';

type MagazineMedia = Partial<
  Pick<
    Media,
    'status' | 'serviceId' | 'externalServiceId' | 'externalServiceSlug'
  >
>;
type MagazineRequest = {
  serverId?: number | null;
  serviceTargets?: MediaRequestServiceTarget[] | null;
};
const requestedTargets = (request: MagazineRequest) =>
  request.serviceTargets?.filter(
    (target) =>
      target.serviceType === 'lazylibrarian' &&
      target.format === 'magazine' &&
      !target.requesterTagOnly &&
      Number.isSafeInteger(target.serverId) &&
      target.serverId >= 0 &&
      target.externalServiceId != null &&
      Number.isSafeInteger(target.externalServiceId) &&
      target.externalServiceId >= 0 &&
      (request.serverId == null || request.serverId === target.serverId)
  ) ?? [];

/** Match observed service authority, never another/default magazine destination. */
export const getMagazineRequestTarget = (
  media: MagazineMedia,
  request: MagazineRequest
): MediaRequestServiceTarget | undefined => {
  if (
    media.serviceId == null ||
    !Number.isSafeInteger(media.serviceId) ||
    media.serviceId < 0 ||
    (request.serverId != null && request.serverId !== media.serviceId)
  )
    return undefined;
  const saved = requestedTargets(request).find(
    (target) => target.serverId === media.serviceId
  );
  if (saved) return saved;
  if (
    request.serviceTargets?.length ||
    request.serverId !== media.serviceId ||
    media.externalServiceId == null ||
    !Number.isSafeInteger(media.externalServiceId) ||
    media.externalServiceId < 0
  )
    return undefined;
  return {
    serviceType: 'lazylibrarian',
    format: 'magazine',
    serverId: media.serviceId,
    externalServiceId: media.externalServiceId,
    externalServiceSlug: media.externalServiceSlug,
    status: MediaStatus.UNKNOWN,
  };
};

/** File observations belong to each requested destination, not the last scanned service. */
export const isMagazineRequestFileAvailable = (
  media: MagazineMedia,
  request: MagazineRequest
): boolean =>
  requestedTargets(request).some(
    (target) => target.status === MediaStatus.AVAILABLE
  ) ||
  (media.status === MediaStatus.AVAILABLE &&
    !!getMagazineRequestTarget(media, request));
