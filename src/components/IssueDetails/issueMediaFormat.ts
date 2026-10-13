import { MediaStatus, MediaType } from '@server/constants/media';

export type IssueMediaType =
  'movie' | 'tv' | 'music' | 'book' | 'comic' | 'magazine';
export type IssueQuality = 'hd' | '4k';

export const getIssueMediaAndFormatLabel = (
  mediaType: IssueMediaType | MediaType,
  is4k = false
): string => {
  switch (mediaType) {
    case MediaType.TV:
      return `Series · ${is4k ? '4K' : 'HD'}`;
    case MediaType.MOVIE:
      return `Movie · ${is4k ? '4K' : 'HD'}`;
    case MediaType.MUSIC:
      return 'Music · Album';
    case MediaType.COMIC:
    case 'comic':
      return 'Comic';
    case MediaType.MAGAZINE:
    case 'magazine':
      return 'Magazine';
    default:
      return 'Book';
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
