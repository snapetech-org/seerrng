export enum MediaRequestStatus {
  PENDING = 1,
  APPROVED,
  DECLINED,
  FAILED,
  COMPLETED,
}

/**
 * Stable, non-sensitive classifications for the most recent failed request
 * dispatch. Keep stored values append-only because they are exposed by the
 * request API and may be read by older clients.
 */
export enum MediaRequestFailureReason {
  SERVICE_UNAVAILABLE = 'service_unavailable',
  DISPATCH_FAILED = 'dispatch_failed',
  TVDB_ID_UNRESOLVED = 'tvdb_id_unresolved',
  TVDB_SEASON_DATA_UNVERIFIED = 'tvdb_season_data_unverified',
  TVDB_SEASON_MISMATCH = 'tvdb_season_mismatch',
}

export enum MediaType {
  MOVIE = 'movie',
  TV = 'tv',
  MUSIC = 'music',
  BOOK = 'book',
  COMIC = 'comic',
  MAGAZINE = 'magazine',
  SPORTS = 'sports',
}

export enum MediaStatus {
  UNKNOWN = 1,
  PENDING,
  PROCESSING,
  PARTIALLY_AVAILABLE,
  AVAILABLE,
  BLOCKLISTED,
  DELETED,
}
