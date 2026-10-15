import defineMessages from '@app/utils/defineMessages';
import type { RequestStatusMessageKey } from '@server/lib/requestStatus';
import type { IntlShape, MessageDescriptor } from 'react-intl';

export const requestStatusMessages = defineMessages(
  'components.RequestStatus',
  {
    bookUnavailable:
      'No usable edition is available from the connected book service. Check the requested edition and the service catalog or acquisition sources, then retry when they are ready.',
    bookQueueFailed:
      'The connected book service reported a download or import failure. Check its queue or logs for the cause, fix it there, then retry here.',
    bookCouldNotAccept:
      'The connected book service could not accept this request. Check its connection and metadata provider settings, then retry.',
    comicUnavailable:
      'No usable release is available from the connected comics service. Check the requested comic and the service catalog or acquisition sources, then retry when they are ready.',
    comicQueueFailed:
      'The connected comics service reported a download or import failure. Check its queue or logs for the cause, fix it there, then retry here.',
    comicCouldNotAccept:
      'The connected comics service could not accept this request. Check its connection and ComicVine metadata settings, then retry.',
    waitingForApproval: 'Your request is waiting for approval.',
    approvedWaitingDispatch:
      'Your request was approved and is waiting to be dispatched.',
    searching: 'Searching for a usable release.',
    downloading: 'A usable release is downloading.',
    importing: 'The download is being imported.',
    addingToLibrary: 'The media is being added to your library.',
    available: 'The requested media is available.',
    unavailable: 'No usable release is currently available.',
    downloadImportFailed: 'The download or import failed.',
    couldNotComplete: 'The request could not be completed.',
    declined: 'This request was declined.',
    cancelled: 'This request was cancelled.',
    noReleaseFound: 'No release found. Use an interactive search in Lidarr.',
    waitingForUsableRelease:
      'Waiting for a usable release. No active download or import is currently reported.',
    preparingEbook:
      'ChaptarrNG is preparing the requested ebook while it imports the author.',
    preparingAudiobook:
      'ChaptarrNG is preparing the requested audiobook while it imports the author.',
    waitingForBookshelf: 'Waiting for Bookshelf to prepare the requested book.',
    preparingBookshelfSearch:
      'SeerrNG is preparing a Bookshelf search for this title. Availability will update after a library scan finds the book.',
    requestRetried: 'The request was retried and is waiting to be dispatched.',
    approvedForProcessing: 'Approved for processing.',
  }
);

const messagesByKey: Record<RequestStatusMessageKey, MessageDescriptor> = {
  bookUnavailable: requestStatusMessages.bookUnavailable,
  bookQueueFailed: requestStatusMessages.bookQueueFailed,
  bookCouldNotAccept: requestStatusMessages.bookCouldNotAccept,
  comicUnavailable: requestStatusMessages.comicUnavailable,
  comicQueueFailed: requestStatusMessages.comicQueueFailed,
  comicCouldNotAccept: requestStatusMessages.comicCouldNotAccept,
  waitingForApproval: requestStatusMessages.waitingForApproval,
  approvedWaitingDispatch: requestStatusMessages.approvedWaitingDispatch,
  searching: requestStatusMessages.searching,
  downloading: requestStatusMessages.downloading,
  importing: requestStatusMessages.importing,
  addingToLibrary: requestStatusMessages.addingToLibrary,
  available: requestStatusMessages.available,
  unavailable: requestStatusMessages.unavailable,
  downloadImportFailed: requestStatusMessages.downloadImportFailed,
  couldNotComplete: requestStatusMessages.couldNotComplete,
  declined: requestStatusMessages.declined,
  cancelled: requestStatusMessages.cancelled,
  noReleaseFound: requestStatusMessages.noReleaseFound,
  waitingForUsableRelease: requestStatusMessages.waitingForUsableRelease,
  preparingEbook: requestStatusMessages.preparingEbook,
  preparingAudiobook: requestStatusMessages.preparingAudiobook,
  waitingForBookshelf: requestStatusMessages.waitingForBookshelf,
  preparingBookshelfSearch: requestStatusMessages.preparingBookshelfSearch,
  requestRetried: requestStatusMessages.requestRetried,
  approvedForProcessing: requestStatusMessages.approvedForProcessing,
};

export const formatRequestStatusMessage = (
  intl: IntlShape,
  status: { message: string | null; messageKey?: RequestStatusMessageKey }
): string =>
  status.messageKey
    ? intl.formatMessage(messagesByKey[status.messageKey])
    : (status.message ?? '');
