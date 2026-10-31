import { MediaType } from '@server/constants/media';
import type Issue from '@server/entity/Issue';
import type IssueComment from '@server/entity/IssueComment';
import type Media from '@server/entity/Media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import type { User } from '@server/entity/User';
import { defineMessages, type IntlInstance } from '@server/i18n';
import globalMessages from '@server/i18n/globalMessages';
import {
  isValidOpenLibraryResourceId,
  normalizeMusicBrainzId,
  normalizeOpenLibraryWorkId,
} from '@server/lib/externalIds';
import type { NotificationAgentConfig } from '@server/lib/settings';
import { normalizeStashDbId } from '@server/lib/stashdbIdentity';
import { createSafeHttpRequestOptions } from '@server/utils/security';
import type { Notification } from '..';

export type SoftwareRequestStatus =
  'available' | 'pending' | 'approved' | 'declined' | 'failed';

export interface NotificationPayload {
  event?: string;
  eventMessage?: NotificationEventDescriptor;
  issueEventMessage?: NotificationIssueEventDescriptor;
  bodyMessage?: NotificationBodyMessage;
  subjectMessage?: NotificationSubjectMessage;
  subject: string;
  notifySystem: boolean;
  notifyAdmin: boolean;
  notifyUser?: User;
  media?: Media;
  mediaUrl?: string;
  image?: string;
  message?: string;
  availabilitySubscription?: boolean;
  extra?: { name: string; value: string; label?: NotificationExtraLabel }[];
  request?: MediaRequest;
  issue?: Issue;
  comment?: IssueComment;
  pendingRequestsCount?: number;
  isAdmin?: boolean;
  softwareRequestStatus?: SoftwareRequestStatus;
}

export type NotificationEventKind =
  | 'available'
  | 'approved'
  | 'declined'
  | 'pending'
  | 'autoRequested'
  | 'autoApproved'
  | 'failed';

export interface NotificationEventDescriptor {
  kind: NotificationEventKind;
  mediaType: Media['mediaType'];
  is4k: boolean;
}

const mediaRequestEventMessages = defineMessages('notifications.event', {
  available:
    '{mediaType, select, movie {{quality}Movie Now Available} tv {{quality}Series Now Available} music {{quality}Music Now Available} book {{quality}Book Now Available} comic {{quality}Comic Now Available} magazine {{quality}Magazine Now Available} adult {{quality}Adult Scene Now Available} sports {{quality}Sports Event Now Available} other {{quality}Media Now Available}}',
  approved:
    '{mediaType, select, movie {{quality}Movie Request Approved} tv {{quality}Series Request Approved} music {{quality}Music Request Approved} book {{quality}Book Request Approved} comic {{quality}Comic Request Approved} magazine {{quality}Magazine Request Approved} adult {{quality}Adult Scene Request Approved} sports {{quality}Sports Event Request Approved} other {{quality}Media Request Approved}}',
  declined:
    '{mediaType, select, movie {{quality}Movie Request Declined} tv {{quality}Series Request Declined} music {{quality}Music Request Declined} book {{quality}Book Request Declined} comic {{quality}Comic Request Declined} magazine {{quality}Magazine Request Declined} adult {{quality}Adult Scene Request Declined} sports {{quality}Sports Event Request Declined} other {{quality}Media Request Declined}}',
  pending:
    '{mediaType, select, movie {New {quality}Movie Request} tv {New {quality}Series Request} music {New {quality}Music Request} book {New {quality}Book Request} comic {New {quality}Comic Request} magazine {New {quality}Magazine Request} adult {New {quality}Adult Scene Request} sports {New {quality}Sports Event Request} other {New {quality}Media Request}}',
  autoRequested:
    '{mediaType, select, movie {{quality}Movie Request Automatically Submitted} tv {{quality}Series Request Automatically Submitted} music {{quality}Music Request Automatically Submitted} book {{quality}Book Request Automatically Submitted} comic {{quality}Comic Request Automatically Submitted} magazine {{quality}Magazine Request Automatically Submitted} adult {{quality}Adult Scene Request Automatically Submitted} sports {{quality}Sports Event Automatically Submitted} other {{quality}Media Request Automatically Submitted}}',
  autoApproved:
    '{mediaType, select, movie {{quality}Movie Request Automatically Approved} tv {{quality}Series Request Automatically Approved} music {{quality}Music Request Automatically Approved} book {{quality}Book Request Automatically Approved} comic {{quality}Comic Request Automatically Approved} magazine {{quality}Magazine Request Automatically Approved} adult {{quality}Adult Scene Request Automatically Approved} sports {{quality}Sports Event Request Automatically Approved} other {{quality}Media Request Automatically Approved}}',
  failed:
    '{mediaType, select, movie {{quality}Movie Request Failed} tv {{quality}Series Request Failed} music {{quality}Music Request Failed} book {{quality}Book Request Failed} comic {{quality}Comic Request Failed} magazine {{quality}Magazine Request Failed} adult {{quality}Adult Scene Request Failed} sports {{quality}Sports Event Request Failed} other {{quality}Media Request Failed}}',
});

export const getNotificationEvent = (
  payload: Pick<NotificationPayload, 'event' | 'eventMessage'>,
  intl: IntlInstance
): string | undefined => {
  if (!payload.eventMessage) {
    return payload.event;
  }

  return intl.formatMessage(
    mediaRequestEventMessages[payload.eventMessage.kind],
    {
      mediaType: payload.eventMessage.mediaType,
      quality: payload.eventMessage.is4k ? '4K ' : '',
    }
  );
};

export type NotificationIssueEventDescriptor = {
  kind: 'created' | 'resolved' | 'reopened' | 'comment';
  issueType: 'video' | 'audio' | 'subtitles' | 'other';
};
export type NotificationBodyMessage =
  'comicRequestDetails' | 'magazineRequestDetails' | 'adultRequestDetails';
export type NotificationSubjectMessage = 'bookRequest' | 'adultSceneRequest';
export type NotificationExtraLabel =
  | 'requestedSeasons'
  | 'artist'
  | 'publisher'
  | 'affectedSeason'
  | 'affectedEpisode';

const notificationContentMessages = defineMessages('notifications.content', {
  created:
    '{issueType, select, video {New Video Issue Reported} audio {New Audio Issue Reported} subtitles {New Subtitle Issue Reported} other {New Issue Reported}}',
  resolved:
    '{issueType, select, video {Video Issue Resolved} audio {Audio Issue Resolved} subtitles {Subtitle Issue Resolved} other {Issue Resolved}}',
  reopened:
    '{issueType, select, video {Video Issue Reopened} audio {Audio Issue Reopened} subtitles {Subtitle Issue Reopened} other {Issue Reopened}}',
  comment:
    '{issueType, select, video {New Comment on Video Issue} audio {New Comment on Audio Issue} subtitles {New Comment on Subtitle Issue} other {New Comment on Issue}}',
  comicRequestDetails: 'Comic request details are available in SeerrNG.',
  magazineRequestDetails: 'Magazine request details are available in SeerrNG.',
  adultRequestDetails: 'Adult Scene request details are available in SeerrNG.',
  bookRequest: 'Book request',
  adultSceneRequest: 'Adult scene request',
  requestedSeasons: 'Requested Seasons',
  artist: 'Artist',
  publisher: 'Publisher',
  affectedSeason: 'Affected Season',
  affectedEpisode: 'Affected Episode',
});

export const getNotificationContent = (
  payload: NotificationPayload,
  intl: IntlInstance
): { event?: string; message?: string } => {
  if (!payload.softwareRequestStatus) {
    return {
      event: payload.issueEventMessage
        ? intl.formatMessage(
            notificationContentMessages[payload.issueEventMessage.kind],
            { issueType: payload.issueEventMessage.issueType }
          )
        : getNotificationEvent(payload, intl),
      message: payload.bodyMessage
        ? intl.formatMessage(notificationContentMessages[payload.bodyMessage])
        : payload.message,
    };
  }

  const messages = {
    available: [
      globalMessages.softwareRequestAvailable,
      globalMessages.softwareAvailableMessage,
    ],
    pending: [
      globalMessages.softwareRequestPending,
      globalMessages.softwarePendingMessage,
    ],
    approved: [
      globalMessages.softwareRequestApproved,
      globalMessages.softwareApprovedMessage,
    ],
    declined: [
      globalMessages.softwareRequestDeclined,
      globalMessages.softwareDeclinedMessage,
    ],
    failed: [
      globalMessages.softwareRequestFailed,
      globalMessages.softwareFailedMessage,
    ],
  } satisfies Record<
    SoftwareRequestStatus,
    [
      (typeof globalMessages)[keyof typeof globalMessages],
      (typeof globalMessages)[keyof typeof globalMessages],
    ]
  >;
  const [event, message] = messages[payload.softwareRequestStatus];

  return {
    event: intl.formatMessage(event),
    message: intl.formatMessage(message),
  };
};

export const getNotificationExtras = (
  payload: NotificationPayload,
  intl: IntlInstance
): { name: string; value: string }[] => {
  if (payload.softwareRequestStatus && payload.notifyUser) {
    return [
      {
        name: intl.formatMessage(globalMessages.requestedBy),
        value: payload.notifyUser.displayName,
      },
    ];
  }

  return (payload.extra ?? []).map((extra) => ({
    ...extra,
    name: extra.label
      ? intl.formatMessage(notificationContentMessages[extra.label])
      : extra.name,
  }));
};

// Resolve only app-authored descriptors at delivery time. Dynamic media titles,
// comments, provider descriptions, and legacy/custom payloads stay verbatim.
export const getLocalizedNotificationPayload = (
  payload: NotificationPayload,
  intl: IntlInstance
): NotificationPayload => ({
  ...payload,
  ...getNotificationContent(payload, intl),
  subject: payload.subjectMessage
    ? intl.formatMessage(notificationContentMessages[payload.subjectMessage])
    : payload.subject,
  extra: getNotificationExtras(payload, intl),
});

export const NOTIFICATION_HTTP_OPTIONS = {
  ...createSafeHttpRequestOptions(
    () => process.env.SEERR_ALLOW_PRIVATE_NOTIFICATION_URLS === 'true',
    false
  ),
  timeout: 10_000,
  maxBodyLength: 128 * 1024,
  maxContentLength: 128 * 1024,
};
export const CONFIGURABLE_NOTIFICATION_HTTP_OPTIONS = {
  ...NOTIFICATION_HTTP_OPTIONS,
  ...createSafeHttpRequestOptions(
    () => process.env.SEERR_ALLOW_PRIVATE_NOTIFICATION_URLS === 'true',
    false,
    true
  ),
};
export const NOTIFICATION_DELIVERY_CONCURRENCY = 10;

export const truncateNotificationText = (
  value: string,
  maxLength: number
): string => {
  if (value.length <= maxLength) {
    return value;
  }
  if (maxLength <= 0) {
    return '';
  }

  let output = '';
  for (const character of value) {
    if (output.length + character.length + 1 > maxLength) {
      break;
    }
    output += character;
  }
  return `${output}…`;
};

export const truncateNotificationUtf8 = (
  value: string,
  maxBytes: number
): string => {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) {
    return value;
  }
  if (maxBytes <= 0) {
    return '';
  }

  const omission = '…';
  const omissionBytes = Buffer.byteLength(omission, 'utf8');
  if (omissionBytes > maxBytes) {
    return '';
  }
  let output = '';
  let outputBytes = 0;
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (outputBytes + characterBytes + omissionBytes > maxBytes) {
      break;
    }
    output += character;
    outputBytes += characterBytes;
  }
  return `${output}${omission}`;
};

const isSafeRelativeNotificationPath = (value: string): boolean => {
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\r\n]/.test(value) ||
    /^[a-z][a-z0-9+.-]*:/i.test(value)
  ) {
    return false;
  }

  try {
    const parsed = new URL(value, 'https://seerr.invalid');
    const path = value.split(/[?#]/, 1)[0];
    return (
      parsed.origin === 'https://seerr.invalid' && parsed.pathname === path
    );
  } catch {
    return false;
  }
};

export const getMediaTypeLabel = (
  intl: IntlInstance,
  mediaType: Media['mediaType']
): string => {
  switch (mediaType) {
    case MediaType.MOVIE:
      return intl.formatMessage(globalMessages.movie);
    case MediaType.MUSIC:
      return intl.formatMessage(globalMessages.music);
    case MediaType.BOOK:
      return intl.formatMessage(globalMessages.book);
    case MediaType.COMIC:
      return intl.formatMessage(globalMessages.comic);
    case MediaType.MAGAZINE:
      return intl.formatMessage(globalMessages.magazine);
    case MediaType.ADULT:
      return intl.formatMessage(globalMessages.adult);
    default:
      return intl.formatMessage(globalMessages.series);
  }
};

export const getNotificationMediaUrl = (
  payload: Pick<NotificationPayload, 'media' | 'mediaUrl'>
): string | undefined => {
  if (payload.mediaUrl) {
    return isSafeRelativeNotificationPath(payload.mediaUrl)
      ? payload.mediaUrl
      : undefined;
  }

  if (!payload.media) {
    return undefined;
  }

  if (payload.media.mediaType === 'music') {
    const musicBrainzId = payload.media.mbId
      ? normalizeMusicBrainzId(payload.media.mbId)
      : undefined;
    return musicBrainzId
      ? `/music/${encodeURIComponent(musicBrainzId)}`
      : undefined;
  }

  if (payload.media.mediaType === 'book') {
    const openLibraryId = payload.media.identifiers?.find(
      (identifier) => identifier.provider === 'openlibrary'
    )?.value;

    const normalizedOpenLibraryId = openLibraryId
      ? normalizeOpenLibraryWorkId(openLibraryId)
      : undefined;
    return normalizedOpenLibraryId &&
      isValidOpenLibraryResourceId(normalizedOpenLibraryId)
      ? `/book/${encodeURIComponent(normalizedOpenLibraryId)}`
      : undefined;
  }

  if (payload.media.mediaType === 'comic') {
    const comicVineId = payload.media.identifiers?.find(
      (identifier) => identifier.provider === 'comicvine'
    )?.value;

    return comicVineId && /^\d+$/.test(comicVineId)
      ? `/comic/${encodeURIComponent(comicVineId)}`
      : undefined;
  }

  if (payload.media.mediaType === 'magazine') {
    const magazineId =
      payload.media.externalServiceSlug ??
      payload.media.identifiers?.find(
        (identifier) => identifier.provider === 'lazylibrarian'
      )?.value;
    return magazineId
      ? `/magazine/${encodeURIComponent(magazineId)}`
      : undefined;
  }

  if (payload.media.mediaType === 'adult') {
    const stashDbId = normalizeStashDbId(
      payload.media.identifiers?.find(
        (identifier) => identifier.provider === 'stashdb'
      )?.value
    );
    return stashDbId ? `/adult/${encodeURIComponent(stashDbId)}` : undefined;
  }

  return `/${payload.media.mediaType}/${payload.media.tmdbId}`;
};

export const getNotificationActionUrl = (
  payload: Pick<NotificationPayload, 'issue' | 'media' | 'mediaUrl'>,
  applicationUrl?: string
): string | undefined => {
  if (!applicationUrl) {
    return undefined;
  }

  if (payload.issue) {
    return `${applicationUrl}/issues/${payload.issue.id}`;
  }

  const mediaUrl = getNotificationMediaUrl(payload);

  return mediaUrl ? `${applicationUrl}${mediaUrl}` : undefined;
};

export const getNotificationActionLabel = (
  payload: Pick<NotificationPayload, 'issue' | 'mediaUrl'>
) => {
  if (payload.issue) return globalMessages.viewIssue;
  if (
    payload.mediaUrl?.startsWith('/requests/status?requestId=') ||
    payload.mediaUrl?.startsWith('/requests/status?softwareRequestId=')
  ) {
    return globalMessages.viewRequestStatus;
  }
  return globalMessages.viewMedia;
};

export abstract class BaseAgent<T extends NotificationAgentConfig> {
  protected settings?: T;
  public constructor(settings?: T) {
    this.settings = settings;
  }

  protected abstract getSettings(): T;
}

export interface NotificationAgent {
  shouldSend(): boolean;
  send(type: Notification, payload: NotificationPayload): Promise<boolean>;
}
