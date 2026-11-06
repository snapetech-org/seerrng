import { MediaStatus } from '@server/constants/media';
import type Media from '@server/entity/Media';
import {
  hasAvailableBookFormat,
  isActiveBookFormatRequest,
} from '@server/lib/bookAvailability';

type BookMediaInfo = {
  mediaInfo?: Media;
};

export const isBookInProgress = (title: BookMediaInfo) =>
  (title.mediaInfo?.downloadStatus ?? []).length > 0 ||
  (title.mediaInfo?.audiobookDownloadStatus ?? []).length > 0;

export const canRequestMissingBookFormat = (title: BookMediaInfo) => {
  if (!title.mediaInfo || title.mediaInfo.status === MediaStatus.BLOCKLISTED) {
    return false;
  }

  const hasEbookServiceLink = hasAvailableBookFormat(title.mediaInfo, 'ebook');
  const hasAudiobookServiceLink = hasAvailableBookFormat(
    title.mediaInfo,
    'audiobook'
  );
  const activeBookRequests =
    title.mediaInfo.requests?.filter((request) =>
      isActiveBookFormatRequest(request)
    ) ?? [];
  const hasActiveEbookRequest = activeBookRequests.some(
    (request) =>
      (request.bookFormat ?? 'ebook') === 'ebook' ||
      request.bookFormat === 'both'
  );
  const hasActiveAudiobookRequest = activeBookRequests.some(
    (request) =>
      request.bookFormat === 'audiobook' || request.bookFormat === 'both'
  );

  return (
    !(hasEbookServiceLink || hasActiveEbookRequest) ||
    !(hasAudiobookServiceLink || hasActiveAudiobookRequest)
  );
};
