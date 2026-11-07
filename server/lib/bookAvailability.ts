import { MediaRequestStatus, MediaStatus } from '@server/constants/media';
import type Media from '@server/entity/Media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import { isProviderBookEdition } from '@server/utils/bookEdition';

export type BookFormat = 'ebook' | 'audiobook' | 'both';
type BookAvailabilityMedia = Pick<
  Media,
  | 'status'
  | 'availableEbookServiceIds'
  | 'availableAudiobookServiceIds'
  | 'audiobookLibraryServiceId'
  | 'audiobookLibraryItemId'
  | 'ratingKey'
  | 'hasPlexAudiobookFile'
>;
const validIds = (value: unknown): number[] =>
  Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (id): id is number => Number.isSafeInteger(id) && id >= 0
          )
        ),
      ].sort((a, b) => a - b)
    : [];
export const bookFileServiceIdsTransformer = {
  from(value: string | null): number[] | null {
    if (value === null) return null;
    try {
      return validIds(JSON.parse(value));
    } catch {
      return [];
    }
  },
  to(value: number[] | null | undefined): string | null {
    return value == null ? null : JSON.stringify(validIds(value));
  },
};

// A manager record is an acquisition destination, never evidence of a file.
// Keep observations per destination so a pending second server cannot erase
// files imported by the first. ABS and Plex observations remain independent.
export const hasBookFileEvidence = (
  media: BookAvailabilityMedia,
  format: Exclude<BookFormat, 'both'>
): boolean =>
  format === 'ebook'
    ? validIds(media.availableEbookServiceIds).length > 0
    : media.hasPlexAudiobookFile === true ||
      validIds(media.availableAudiobookServiceIds).length > 0 ||
      (media.audiobookLibraryServiceId != null &&
        !!media.audiobookLibraryItemId) ||
      !!media.ratingKey;

export const recordBookFileAvailability = (
  media: Pick<
    Media,
    'availableEbookServiceIds' | 'availableAudiobookServiceIds'
  >,
  format: Exclude<BookFormat, 'both'>,
  serviceId: number,
  hasFiles: boolean
): boolean => {
  if (!Number.isSafeInteger(serviceId) || serviceId < 0)
    throw new Error('A valid book service ID is required.');
  const key =
    format === 'ebook'
      ? 'availableEbookServiceIds'
      : 'availableAudiobookServiceIds';
  const previous = media[key];
  media[key] = validIds([
    ...validIds(media[key]).filter((id) => id !== serviceId),
    ...(hasFiles ? [serviceId] : []),
  ]);
  return (
    previous == null ||
    previous.length !== media[key].length ||
    previous.some((id, index) => id !== media[key]![index])
  );
};

export const getBookAvailabilityStatus = (
  media: BookAvailabilityMedia,
  processing = false
): MediaStatus => {
  if (
    hasBookFileEvidence(media, 'ebook') ||
    hasBookFileEvidence(media, 'audiobook')
  )
    return MediaStatus.AVAILABLE;
  return media.status === MediaStatus.DELETED
    ? MediaStatus.DELETED
    : processing
      ? MediaStatus.PROCESSING
      : MediaStatus.UNKNOWN;
};
export const hasAvailableBookFormat = (
  media: BookAvailabilityMedia,
  format: Exclude<BookFormat, 'both'>
): boolean =>
  (media.status === MediaStatus.AVAILABLE ||
    media.status === MediaStatus.PARTIALLY_AVAILABLE) &&
  hasBookFileEvidence(media, format);
export const hasAvailableBookServiceFormat = (
  media: BookAvailabilityMedia,
  format: Exclude<BookFormat, 'both'>,
  serviceId: number | null | undefined
): boolean => {
  if (!hasAvailableBookFormat(media, format)) return false;
  if (
    format === 'audiobook' &&
    (media.hasPlexAudiobookFile === true ||
      (media.audiobookLibraryServiceId != null &&
        !!media.audiobookLibraryItemId) ||
      !!media.ratingKey)
  )
    return true;
  const sources =
    format === 'ebook'
      ? media.availableEbookServiceIds
      : media.availableAudiobookServiceIds;
  return serviceId != null && !!sources?.includes(serviceId);
};

export const isRequestedBookFormatAvailable = (
  media: BookAvailabilityMedia,
  format: BookFormat
): boolean =>
  format === 'both'
    ? hasAvailableBookFormat(media, 'ebook') &&
      hasAvailableBookFormat(media, 'audiobook')
    : hasAvailableBookFormat(media, format);

export const isBookRequestFileAvailable = (
  media: BookAvailabilityMedia,
  request: Pick<MediaRequest, 'bookFormat' | 'preferredEditionId'> & {
    serviceTargets?: MediaRequest['serviceTargets'] | null;
  }
): boolean => {
  const formats =
    request.bookFormat === 'both'
      ? (['ebook', 'audiobook'] as const)
      : ([request.bookFormat ?? 'ebook'] as const);
  return formats.every(
    (format) =>
      hasAvailableBookFormat(media, format) &&
      (!isProviderBookEdition(request.preferredEditionId) ||
        request.serviceTargets?.some(
          (target) =>
            target.serviceType === 'readarr' &&
            target.format === format &&
            target.status === MediaStatus.AVAILABLE
        ))
  );
};

export const isPendingBookAcquisitionTarget = (target: {
  serviceType: string;
  format?: string;
  status?: MediaStatus | null;
}): boolean =>
  target.serviceType === 'readarr' &&
  (target.format === 'ebook' || target.format === 'audiobook') &&
  (target.status === MediaStatus.PENDING ||
    target.status === MediaStatus.PROCESSING);

type ActiveBookRequest = {
  status: MediaRequestStatus;
  bookFormat?: BookFormat | null;
  serviceTargets?:
    | Pick<
        NonNullable<MediaRequest['serviceTargets']>[number],
        'serviceType' | 'format' | 'status'
      >[]
    | null;
};
// Provider handoff completes the Seerr request while file acquisition continues.
// That active target prevents duplicate requests without claiming availability.
export const isActiveBookFormatRequest = (
  request: ActiveBookRequest,
  format?: Exclude<BookFormat, 'both'>
): boolean => {
  if (
    request.status === MediaRequestStatus.DECLINED ||
    request.status === MediaRequestStatus.FAILED
  )
    return false;
  if (
    format &&
    (request.bookFormat ?? 'ebook') !== format &&
    request.bookFormat !== 'both'
  )
    return false;
  if (request.status !== MediaRequestStatus.COMPLETED) return true;
  return !!request.serviceTargets?.some(
    (target) =>
      isPendingBookAcquisitionTarget(target) &&
      (!format || target.format === format)
  );
};
