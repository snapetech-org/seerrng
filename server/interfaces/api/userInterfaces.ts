import type Media from '@server/entity/Media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import type { User } from '@server/entity/User';
import type { PaginatedResponse } from './common';

export interface UserResultsResponse extends PaginatedResponse {
  results: User[];
}

export interface UserRequestsResponse extends PaginatedResponse {
  results: MediaRequest[];
}

export interface QuotaStatus {
  days?: number;
  limit?: number;
  used: number;
  remaining?: number;
  restricted: boolean;
}

export interface QuotaResponse {
  movie: QuotaStatus;
  tv: QuotaStatus;
  music: QuotaStatus;
  book: QuotaStatus;
  comic: QuotaStatus;
  magazine: QuotaStatus;
  adult: QuotaStatus;
  software: QuotaStatus;
}

export interface UserAvailabilitySubscriptionResponse {
  subscribed: boolean;
  canSubscribe: boolean;
  scope?: { is4k: boolean | null; seasonNumber: number | null };
}

export interface UserWatchDataResponse {
  recentlyWatched: Media[];
  playCount: number;
}

export interface UserBulkUpdateSettings {
  watchlistSyncMovies?: boolean;
  watchlistSyncTv?: boolean;
  watchlistSyncMusic?: boolean;
  watchlistSyncBooks?: boolean;
  watchlistSyncComics?: boolean;
  watchlistSyncMagazines?: boolean;
}

export interface UserBulkUpdateRequest {
  ids: number[];
  permissions?: number;
  settings?: UserBulkUpdateSettings;
}
