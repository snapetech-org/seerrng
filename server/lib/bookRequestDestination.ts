import { hasAvailableBookServiceFormat } from '@server/lib/bookAvailability';
import {
  hasTrackedAvailableDestination,
  isDestinationAvailableInTargets,
  type RequestDestination,
  type StoredRequestDestination,
} from '@server/lib/requestDestination';
// Actual files establish presence; known target history preserves destination
// distinctions. Historical completion alone never proves a file still exists.
export const isBookDestinationFileAvailable = (
  media: Parameters<typeof hasAvailableBookServiceFormat>[0],
  target: RequestDestination | null | undefined,
  requests: StoredRequestDestination[] | null | undefined
): boolean => {
  if (
    !target ||
    target.serviceType !== 'readarr' ||
    (target.format !== 'ebook' && target.format !== 'audiobook') ||
    !hasAvailableBookServiceFormat(media, target.format, target.serverId)
  )
    return false;
  if (
    target.format === 'audiobook' &&
    ((media.audiobookLibraryServiceId != null &&
      !!media.audiobookLibraryItemId) ||
      !!media.ratingKey)
  )
    return true;
  return (
    !hasTrackedAvailableDestination(requests, target) ||
    isDestinationAvailableInTargets(requests, target)
  );
};
