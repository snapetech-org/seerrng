import type Media from '@server/entity/Media';
import type { MediaSearchMetadata } from '@server/entity/MediaSearchMetadata';
import type { User } from '@server/entity/User';
import type { PaginatedResponse } from './common';

export type MediaListItem = Pick<
  Media,
  | 'id'
  | 'mediaType'
  | 'status'
  | 'status4k'
  | 'tmdbId'
  | 'viewerRequestCoverage'
> &
  Partial<Pick<Media, 'imdbId' | 'mbId' | 'mediaAddedAt' | 'tvdbId'>> &
  Partial<
    Pick<
      MediaSearchMetadata,
      'title' | 'overview' | 'posterPath' | 'releaseDate'
    >
  >;

export interface MediaResultsResponse extends PaginatedResponse {
  results: MediaListItem[];
}

export interface MediaWatchDataResponse {
  data?: {
    users: User[];
    playCount: number;
    playCount7Days: number;
    playCount30Days: number;
  };
  data4k?: {
    users: User[];
    playCount: number;
    playCount7Days: number;
    playCount30Days: number;
  };
}
