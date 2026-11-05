/**
 * Library settings routes are mounted under `/api/v1/settings` on the server.
 * Keep these paths shared by the router and UI so their API contract cannot
 * drift independently. The public paths and request schema must also remain
 * declared in `seerr-api.yml`, which validates API requests at runtime.
 */
export const SETTINGS_LIBRARY_ROUTE_PATHS = {
  plex: '/plex/library',
  jellyfin: '/jellyfin/library',
} as const;

export type SettingsLibraryProvider = keyof typeof SETTINGS_LIBRARY_ROUTE_PATHS;

export const SETTINGS_PLEX_LIBRARY_TYPE_ROUTE_PATH = `${SETTINGS_LIBRARY_ROUTE_PATHS.plex}/:libraryId/type`;

export interface SettingsLibraryUpdateBody {
  sync?: boolean;
  enable?: string;
  episodeOrderLibraryId?: string;
  episodeOrderProvider?: 'none' | 'tmdb' | 'tvdb';
}

export const getSettingsLibraryApiPath = (
  provider: SettingsLibraryProvider
): string => `/api/v1/settings${SETTINGS_LIBRARY_ROUTE_PATHS[provider]}`;

export const getSettingsPlexLibraryTypeApiPath = (libraryId: string): string =>
  `${getSettingsLibraryApiPath('plex')}/${encodeURIComponent(libraryId)}/type`;

export const createSettingsLibraryUpdateBody = (options: {
  sync?: boolean;
  enabledLibraryIds?: readonly string[];
  episodeOrder?: {
    libraryId: string;
    provider: 'none' | 'tmdb' | 'tvdb';
  };
}): SettingsLibraryUpdateBody => {
  const body: SettingsLibraryUpdateBody = {};

  if (options.sync !== undefined) {
    body.sync = options.sync;
  }

  if (options.enabledLibraryIds !== undefined) {
    body.enable = options.enabledLibraryIds.join(',');
  }

  if (options.episodeOrder) {
    body.episodeOrderLibraryId = options.episodeOrder.libraryId;
    body.episodeOrderProvider = options.episodeOrder.provider;
  }

  return body;
};
