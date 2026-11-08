export interface LibraryCopy {
  key: string;
  serviceId: number;
  serviceType:
    | 'radarr'
    | 'sonarr'
    | 'lidarr'
    | 'readarr'
    | 'mylar'
    | 'kapowarr'
    | 'backissue'
    | 'lazylibrarian';
  externalId: number | string;
  service: string;
  quality: string;
  url: string;
}

export interface LibraryRemovalPlan {
  targets: LibraryCopy[];
  token: string;
  verifiedServices: number;
  /** Administrator-only, freshly verified recovery; independent of viewer masking. */
  staleAvailabilityQualities?: ('HD' | '4K')[];
}
