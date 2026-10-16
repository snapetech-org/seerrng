import defineMessages from '@app/utils/defineMessages';
import { MediaStatus, MediaType } from '@server/constants/media';
import { type IntlShape, type MessageDescriptor } from 'react-intl';

export type IssueMediaType =
  'movie' | 'tv' | 'music' | 'book' | 'comic' | 'magazine';
export type IssueQuality = 'hd' | '4k';

const messages = defineMessages('components.IssueDetails.IssueMediaFormat', {
  seriesQuality: 'Series · {quality}',
  movieQuality: 'Movie · {quality}',
  musicAlbum: 'Music · Album',
  comic: 'Comic',
  magazine: 'Magazine',
  book: 'Book',
});

const formatDefaultMessage = (
  message: MessageDescriptor & { defaultMessage: string },
  values?: Record<string, string>
): string => {
  let result = message.defaultMessage ?? '';

  for (const [key, value] of Object.entries(values ?? {})) {
    result = result.replaceAll(`{${key}}`, value);
  }

  return result;
};

export const getIssueMediaAndFormatLabel = (
  mediaType: IssueMediaType | MediaType,
  is4k = false,
  intl?: Pick<IntlShape, 'formatMessage'>
): string => {
  const format = (
    message: MessageDescriptor & { defaultMessage: string },
    values?: Record<string, string>
  ) =>
    intl
      ? intl.formatMessage(message, values)
      : formatDefaultMessage(message, values);

  switch (mediaType) {
    case MediaType.TV:
      return format(messages.seriesQuality, { quality: is4k ? '4K' : 'HD' });
    case MediaType.MOVIE:
      return format(messages.movieQuality, { quality: is4k ? '4K' : 'HD' });
    case MediaType.MUSIC:
      return format(messages.musicAlbum);
    case MediaType.COMIC:
    case 'comic':
      return format(messages.comic);
    case MediaType.MAGAZINE:
    case 'magazine':
      return format(messages.magazine);
    default:
      return format(messages.book);
  }
};

export const isIssueReportableStatus = (
  status?: MediaStatus,
  includePartiallyAvailable = false
) =>
  status === MediaStatus.AVAILABLE ||
  status === MediaStatus.PROCESSING ||
  (includePartiallyAvailable && status === MediaStatus.PARTIALLY_AVAILABLE);

type IssueMediaStatus = {
  status?: MediaStatus;
  status4k?: MediaStatus;
};

export const canReportMovieIssue = (
  mediaInfo?: IssueMediaStatus,
  canReport4k = false
): boolean =>
  isIssueReportableStatus(mediaInfo?.status) ||
  (canReport4k && isIssueReportableStatus(mediaInfo?.status4k));

export const canReportSeriesIssue = (
  mediaInfo?: IssueMediaStatus,
  canReport4k = false
): boolean =>
  isIssueReportableStatus(mediaInfo?.status, true) ||
  (canReport4k && isIssueReportableStatus(mediaInfo?.status4k, true));

export const getReportableIssueQualities = (
  mediaInfo?: IssueMediaStatus
): IssueQuality[] => [
  ...(isIssueReportableStatus(mediaInfo?.status, true)
    ? (['hd'] as const)
    : []),
  ...(isIssueReportableStatus(mediaInfo?.status4k, true)
    ? (['4k'] as const)
    : []),
];

export const getReportableIssueSeasons = (
  seasons:
    | {
        seasonNumber: number;
        status?: MediaStatus;
        status4k?: MediaStatus;
      }[]
    | undefined,
  is4k: boolean
): number[] =>
  (seasons ?? [])
    .filter((season) =>
      isIssueReportableStatus(is4k ? season.status4k : season.status, true)
    )
    .map((season) => season.seasonNumber);
