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

const isAvailableStatus = (status?: MediaStatus) =>
  status === MediaStatus.AVAILABLE ||
  status === MediaStatus.PARTIALLY_AVAILABLE;

export const getAvailableIssueQualities = (mediaInfo?: {
  status?: MediaStatus;
  status4k?: MediaStatus;
}): IssueQuality[] => [
  ...(isAvailableStatus(mediaInfo?.status) ? (['hd'] as const) : []),
  ...(isAvailableStatus(mediaInfo?.status4k) ? (['4k'] as const) : []),
];
