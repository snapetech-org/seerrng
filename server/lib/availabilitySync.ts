import type { JellyfinLibraryItem } from '@server/api/jellyfin';
import JellyfinAPI from '@server/api/jellyfin';
import type { PlexMetadata } from '@server/api/plexapi';
import PlexAPI from '@server/api/plexapi';
import RadarrAPI, { type RadarrMovie } from '@server/api/servarr/radarr';
import type { SonarrSeries } from '@server/api/servarr/sonarr';
import SonarrAPI from '@server/api/servarr/sonarr';
import { MediaStatus } from '@server/constants/media';
import { MediaServerType } from '@server/constants/server';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import {
  captureConfigurationAuthority,
  runWithConfigurationAdmissions,
  runWithConfigurationSnapshot,
  type ConfigurationAuthoritySnapshot,
} from '@server/lib/configurationAdmission';
import { getExternalRuntimeConfig } from '@server/lib/externalRuntimeConfig';
import {
  LibraryDeletionReconciler,
  mediaServerDeletionPresence,
} from '@server/lib/libraryDeletionReconciliation';
import {
  captureMediaServerUserAuthority,
  runWithMediaServerUserAuthority,
  type MediaServerUserAuthoritySnapshot,
} from '@server/lib/mediaServerUserAuthority';
import { runWithServarrServiceSnapshots } from '@server/lib/serviceAdmission';
import type {
  JellyfinSettings,
  PlexSettings,
  RadarrSettings,
  SonarrSettings,
} from '@server/lib/settings';
import logger from '@server/logger';
import { getHostname } from '@server/utils/getHostname';
import { getHttpErrorDetails, hasHttpStatus } from '@server/utils/httpError';
import { MoreThan } from 'typeorm';

class AvailabilitySync {
  public running = false;
  private activeRun = false;
  private plexClient: PlexAPI;

  private jellyfinClient: JellyfinAPI;

  private radarrServers: RadarrSettings[];
  private sonarrServers: SonarrSettings[];
  private configurationSnapshot: ConfigurationAuthoritySnapshot;
  private plexSettingsSnapshot: PlexSettings;
  private jellyfinSettingsSnapshot: JellyfinSettings;
  private ownerAuthoritySnapshot: MediaServerUserAuthoritySnapshot;
  private enable4kMovie: boolean;

  async run() {
    if (this.activeRun) {
      logger.warn('Availability sync is already running; skipping overlap.', {
        label: 'Availability Sync',
      });
      return;
    }

    this.activeRun = true;
    try {
      let mediaServerType!: MediaServerType;
      await runWithConfigurationAdmissions(['jellyfin', 'plex'], async () => {
        const settings = getExternalRuntimeConfig();
        mediaServerType = settings.main.mediaServerType;
        const configurationSection =
          mediaServerType === MediaServerType.PLEX ? 'plex' : 'jellyfin';
        this.configurationSnapshot = captureConfigurationAuthority(
          configurationSection,
          settings
        );
        this.plexSettingsSnapshot = structuredClone(settings.plex);
        this.jellyfinSettingsSnapshot = structuredClone(settings.jellyfin);
        this.radarrServers = structuredClone(settings.radarr);
        this.sonarrServers = structuredClone(settings.sonarr);
        this.enable4kMovie = this.radarrServers.some((server) => server.is4k);
      });
      this.running = true;

      logger.info(`Starting availability sync...`, {
        label: 'AvailabilitySync',
      });
      const pageSize = 50;

      switch (mediaServerType) {
        case MediaServerType.PLEX:
          this.ownerAuthoritySnapshot = await captureMediaServerUserAuthority(
            1,
            'plex'
          );
          if (this.ownerAuthoritySnapshot.plexToken) {
            this.plexClient = new PlexAPI({
              plexToken: this.ownerAuthoritySnapshot.plexToken,
              plexSettings: this.plexSettingsSnapshot,
            });
          } else {
            logger.error('Plex admin is not configured.');
            this.running = false;
            return;
          }
          break;
        case MediaServerType.JELLYFIN:
        case MediaServerType.EMBY:
          this.ownerAuthoritySnapshot = await captureMediaServerUserAuthority(
            1,
            'jellyfin'
          );
          if (
            this.ownerAuthoritySnapshot.jellyfinUserId &&
            this.ownerAuthoritySnapshot.jellyfinDeviceId
          ) {
            this.jellyfinClient = new JellyfinAPI(
              getHostname(this.jellyfinSettingsSnapshot),
              this.jellyfinSettingsSnapshot.apiKey,
              this.ownerAuthoritySnapshot.jellyfinDeviceId
            );

            this.jellyfinClient.setUserId(
              this.ownerAuthoritySnapshot.jellyfinUserId
            );

            try {
              await this.jellyfinClient.getSystemInfo();
            } catch (e) {
              logger.error('Sync interrupted.', {
                label: 'AvailabilitySync',
                status: e.statusCode,
                error: e.name,
                errorMessage: e.errorCode,
              });

              this.running = false;
              return;
            }
          } else {
            logger.error('Jellyfin admin is not configured.');

            this.running = false;
            return;
          }
          break;
        default:
          logger.error('An admin is not configured.');

          this.running = false;
          return;
      }

      const deletionReconciler = new LibraryDeletionReconciler({
        radarr: this.radarrServers,
        sonarr: this.sonarrServers,
        mediaServerPresence: (media, is4k) =>
          mediaServerDeletionPresence(
            media,
            is4k,
            mediaServerType,
            this.plexClient,
            this.jellyfinClient,
            this.plexSettingsSnapshot.machineId
          ),
        withOwnerAuthority: (callback) =>
          runWithMediaServerUserAuthority(
            this.ownerAuthoritySnapshot,
            callback
          ),
        withAuthority: (media, callback) =>
          this.withAuthoritySnapshot(media.mediaType, callback),
        cancelled: () => !this.running,
      });
      for await (const media of this.loadAvailableMediaPaginated(pageSize)) {
        if (!this.running) {
          break;
        }

        // Provider presence checks here supply diagnostic logs. The deletion
        // reconciler below owns all availability status and removal decisions.
        if (media.mediaType === 'movie') {
          const existsInRadarr = await this.mediaExistsInRadarr(media, false);
          const existsInRadarr4k = await this.mediaExistsInRadarr(media, true);

          // plex
          if (mediaServerType === MediaServerType.PLEX) {
            const existsInPlex = await this.mediaExistsInPlex(media, false);
            const existsInPlex4k = await this.mediaExistsInPlex(media, true);

            if (existsInPlex || existsInRadarr) {
              logger.debug(
                `The non-4K movie [TMDB ID ${media.tmdbId}] still exists. Preventing removal.`,
                {
                  label: 'AvailabilitySync',
                }
              );
            }

            if (existsInPlex4k || existsInRadarr4k) {
              logger.debug(
                `The 4K movie [TMDB ID ${media.tmdbId}] still exists. Preventing removal.`,
                {
                  label: 'AvailabilitySync',
                }
              );
            }
          }

          //jellyfin
          if (
            mediaServerType === MediaServerType.JELLYFIN ||
            mediaServerType === MediaServerType.EMBY
          ) {
            const existsInJellyfin = await this.mediaExistsInJellyfin(
              media,
              false
            );
            const existsInJellyfin4k = await this.mediaExistsInJellyfin(
              media,
              true
            );

            if (existsInJellyfin || existsInRadarr) {
              logger.debug(
                `The non-4K movie [TMDB ID ${media.tmdbId}] still exists. Preventing removal.`,
                {
                  label: 'AvailabilitySync',
                }
              );
            }

            if (existsInJellyfin4k || existsInRadarr4k) {
              logger.debug(
                `The 4K movie [TMDB ID ${media.tmdbId}] still exists. Preventing removal.`,
                {
                  label: 'AvailabilitySync',
                }
              );
            }
          }
        }

        if (media.mediaType === 'tv') {
          //plex

          const existsInPlex = await this.mediaExistsInPlex(media, false);
          const existsInPlex4k = await this.mediaExistsInPlex(media, true);

          //jellyfin
          const existsInJellyfin = await this.mediaExistsInJellyfin(
            media,
            false
          );
          const existsInJellyfin4k = await this.mediaExistsInJellyfin(
            media,
            true
          );

          const existsInSonarr = await this.mediaExistsInSonarr(media, false);
          const existsInSonarr4k = await this.mediaExistsInSonarr(media, true);

          //plex
          if (mediaServerType === MediaServerType.PLEX) {
            if (existsInPlex || existsInSonarr) {
              logger.debug(
                `The non-4K show [TMDB ID ${media.tmdbId}] still exists. Preventing removal.`,
                {
                  label: 'AvailabilitySync',
                }
              );
            }
          }

          if (mediaServerType === MediaServerType.PLEX) {
            if (existsInPlex4k || existsInSonarr4k) {
              logger.debug(
                `The 4K show [TMDB ID ${media.tmdbId}] still exists. Preventing removal.`,
                {
                  label: 'AvailabilitySync',
                }
              );
            }
          }

          //jellyfin
          if (
            mediaServerType === MediaServerType.JELLYFIN ||
            mediaServerType === MediaServerType.EMBY
          ) {
            if (existsInJellyfin || existsInSonarr) {
              logger.debug(
                `The non-4K show [TMDB ID ${media.tmdbId}] still exists. Preventing removal.`,
                {
                  label: 'AvailabilitySync',
                }
              );
            }
          }

          if (
            mediaServerType === MediaServerType.JELLYFIN ||
            mediaServerType === MediaServerType.EMBY
          ) {
            if (existsInJellyfin4k || existsInSonarr4k) {
              logger.debug(
                `The 4K show [TMDB ID ${media.tmdbId}] still exists. Preventing removal.`,
                {
                  label: 'AvailabilitySync',
                }
              );
            }
          }
        }
        await deletionReconciler.reconcile(media);
      }
    } catch (ex) {
      logger.error('Failed to complete availability sync.', {
        errorMessage: ex.message,
        label: 'AvailabilitySync',
      });
    } finally {
      logger.info(`Availability sync complete.`, {
        label: 'AvailabilitySync',
      });
      this.running = false;
      this.activeRun = false;
    }
  }

  public cancel() {
    this.running = false;
  }

  private async *loadAvailableMediaPaginated(pageSize: number) {
    let lastMediaId = 0;
    const mediaRepository = getRepository(Media);
    const whereOptions = [
      { status: MediaStatus.AVAILABLE },
      { status: MediaStatus.PARTIALLY_AVAILABLE },
      { status4k: MediaStatus.AVAILABLE },
      { status4k: MediaStatus.PARTIALLY_AVAILABLE },
      { status: MediaStatus.DELETED },
      { status4k: MediaStatus.DELETED },
      { status: MediaStatus.BLOCKLISTED },
      { seasons: { status: MediaStatus.AVAILABLE } },
      { seasons: { status: MediaStatus.PARTIALLY_AVAILABLE } },
      { seasons: { status4k: MediaStatus.AVAILABLE } },
      { seasons: { status4k: MediaStatus.PARTIALLY_AVAILABLE } },
    ];

    while (true) {
      const mediaPage = await mediaRepository.find({
        where: whereOptions.map((where) => ({
          ...where,
          id: MoreThan(lastMediaId),
        })),
        order: { id: 'ASC' },
        take: pageSize,
      });

      if (!mediaPage.length) {
        return;
      }

      lastMediaId = mediaPage[mediaPage.length - 1].id;
      yield* mediaPage;
    }
  }

  private withAuthoritySnapshot<Result>(
    mediaType: string,
    callback: () => Promise<Result>
  ): Promise<Result> {
    return runWithConfigurationSnapshot(this.configurationSnapshot, () => {
      if (mediaType === 'movie' && this.radarrServers.length > 0) {
        return runWithServarrServiceSnapshots(
          'radarr',
          this.radarrServers,
          callback,
          {
            requireExactAuthoritySet: true,
          }
        );
      }
      if (mediaType === 'tv' && this.sonarrServers.length > 0) {
        return runWithServarrServiceSnapshots(
          'sonarr',
          this.sonarrServers,
          callback,
          {
            requireExactAuthoritySet: true,
          }
        );
      }
      return callback();
    });
  }

  private async mediaExistsInRadarr(
    media: Media,
    is4k: boolean
  ): Promise<boolean> {
    let existsInRadarr = false;

    const hasSameServerInBothModes = this.radarrServers.some((a) =>
      this.radarrServers.some(
        (b) =>
          Boolean(a.is4k) !== Boolean(b.is4k) &&
          a.hostname === b.hostname &&
          a.port === b.port
      )
    );

    // Check for availability in all of the available radarr servers
    // If any find the media, we will assume the media exists
    for (const server of this.radarrServers.filter(
      (server) => Boolean(server.is4k) === is4k
    )) {
      const radarrAPI = new RadarrAPI({
        apiKey: server.apiKey,
        url: RadarrAPI.buildUrl(server, '/api/v3'),
      });

      try {
        let radarr: RadarrMovie | undefined;

        if (media.externalServiceId && !is4k) {
          radarr = await radarrAPI.getMovie({
            id: media.externalServiceId,
          });
        }

        if (media.externalServiceId4k && is4k) {
          radarr = await radarrAPI.getMovie({
            id: media.externalServiceId4k,
          });
        }

        if (radarr && radarr.tmdbId !== media.tmdbId) {
          continue;
        }

        if (radarr && radarr.hasFile) {
          const resolution =
            radarr?.movieFile?.mediaInfo?.resolution?.split('x');
          const is4kMovie =
            resolution?.length === 2 && Number(resolution[0]) >= 2000;

          if (hasSameServerInBothModes && resolution?.length === 2) {
            // Same server in both modes then use resolution to distinguish
            existsInRadarr = is4k ? is4kMovie : !is4kMovie;
          } else {
            // One server type and if file exists, count it
            existsInRadarr = true;
          }
        }
      } catch (ex) {
        const { errorMessage } = getHttpErrorDetails(ex);
        if (!hasHttpStatus(ex, 404)) {
          existsInRadarr = true;
          logger.debug(
            `Failure retrieving the ${is4k ? '4K' : 'non-4K'} movie [TMDB ID ${
              media.tmdbId
            }] from Radarr.`,
            {
              errorMessage,
              label: 'Availability Sync',
            }
          );
        }
      }

      if (existsInRadarr) break;
    }

    return existsInRadarr;
  }

  private async mediaExistsInSonarr(
    media: Media,
    is4k: boolean
  ): Promise<boolean> {
    let existsInSonarr = false;

    // Check for availability in all of the available sonarr servers
    // If any find the media, we will assume the media exists
    for (const server of this.sonarrServers.filter((server) => {
      return Boolean(server.is4k) === is4k;
    })) {
      const sonarrAPI = new SonarrAPI({
        apiKey: server.apiKey,
        url: SonarrAPI.buildUrl(server, '/api/v3'),
      });

      try {
        let sonarr: SonarrSeries | undefined;

        if (media.externalServiceId && !is4k) {
          sonarr = await sonarrAPI.getSeriesById(media.externalServiceId);
        }

        if (media.externalServiceId4k && is4k) {
          sonarr = await sonarrAPI.getSeriesById(media.externalServiceId4k);
        }

        if (sonarr && media.tvdbId != null && sonarr.tvdbId !== media.tvdbId) {
          continue;
        }

        if (sonarr) {
          if (sonarr.statistics.episodeFileCount > 0) {
            existsInSonarr = true;
          }
        }
      } catch (ex) {
        const { errorMessage } = getHttpErrorDetails(ex);
        if (!hasHttpStatus(ex, 404)) {
          existsInSonarr = true;
          logger.debug(
            `Failure retrieving the ${is4k ? '4K' : 'non-4K'} show [TMDB ID ${
              media.tmdbId
            }] from Sonarr.`,
            {
              errorMessage,
              label: 'Availability Sync',
            }
          );
        }
      }
    }

    return existsInSonarr;
  }

  // Plex
  private async mediaExistsInPlex(
    media: Media,
    is4k: boolean
  ): Promise<boolean> {
    const ratingKey = media.ratingKey;
    const ratingKey4k = media.ratingKey4k;
    let existsInPlex = false;
    let plexSeasons: PlexMetadata[] | undefined;

    // Check each plex instance to see if the media still exists
    // If found, we will assume the media exists and prevent removal
    // We can use the cache we built when we fetched the series with mediaExistsInPlex
    try {
      let plexMedia: PlexMetadata | undefined;

      if (ratingKey && !is4k) {
        plexMedia = await this.plexClient?.getMetadata(ratingKey);

        if (
          plexMedia &&
          media.mediaType === 'movie' &&
          this.enable4kMovie &&
          plexMedia.Media?.length &&
          !plexMedia.Media.some((mediaItem) => (mediaItem.width ?? 0) < 2000)
        ) {
          plexMedia = undefined;
        }
      }

      if (ratingKey4k && is4k) {
        plexMedia = await this.plexClient?.getMetadata(ratingKey4k);

        if (media.mediaType === 'tv') {
          plexSeasons = await this.plexClient?.getChildrenMetadata(ratingKey4k);
        }

        if (plexMedia) {
          if (
            media.mediaType === 'movie' &&
            plexMedia.Media?.length &&
            !plexMedia.Media.some((mediaItem) => (mediaItem.width ?? 0) >= 2000)
          ) {
            plexMedia = undefined;
          }

          if (plexMedia && media.mediaType === 'tv') {
            if (plexSeasons?.length) {
              let has4kInAnySeason = false;
              let verifiedAnySeason = false;
              for (const season of plexSeasons) {
                try {
                  const episodes = await this.plexClient?.getChildrenMetadata(
                    season.ratingKey
                  );
                  if (episodes?.some((episode) => episode.Media?.length)) {
                    verifiedAnySeason = true;
                  }
                  const has4kEpisode = episodes?.some((episode) =>
                    episode.Media?.some(
                      (mediaItem) => (mediaItem.width ?? 0) >= 2000
                    )
                  );
                  if (has4kEpisode) {
                    has4kInAnySeason = true;
                    break;
                  }
                } catch {
                  // If we can't fetch episodes for a season, continue checking other seasons
                }
              }
              if (verifiedAnySeason && !has4kInAnySeason) {
                plexMedia = undefined;
              }
            }
          }
        }
      }

      if (plexMedia) {
        existsInPlex = true;
      }
    } catch (ex) {
      const { errorMessage } = getHttpErrorDetails(ex);
      if (!hasHttpStatus(ex, 404)) {
        existsInPlex = true;
        logger.debug(
          `Failure retrieving the ${is4k ? '4K' : 'non-4K'} ${
            media.mediaType === 'tv' ? 'show' : 'movie'
          } [TMDB ID ${media.tmdbId}] from Plex.`,
          {
            errorMessage,
            label: 'Availability Sync',
          }
        );
      }
    }

    return existsInPlex;
  }

  // Jellyfin
  private async mediaExistsInJellyfin(
    media: Media,
    is4k: boolean
  ): Promise<boolean> {
    const ratingKey = media.jellyfinMediaId;
    const ratingKey4k = media.jellyfinMediaId4k;
    let existsInJellyfin = false;

    // Check each jellyfin instance to see if the media still exists
    // If found, we will assume the media exists and prevent removal
    // We can use the cache we built when we fetched the series with mediaExistsInJellyfin
    try {
      let jellyfinMedia: JellyfinLibraryItem | undefined;

      if (ratingKey && !is4k) {
        jellyfinMedia = await this.jellyfinClient?.getItemData(ratingKey);
      }

      if (ratingKey4k && is4k) {
        jellyfinMedia = await this.jellyfinClient?.getItemData(ratingKey4k);
      }

      if (jellyfinMedia) {
        existsInJellyfin = true;
      }
    } catch (ex) {
      const { errorMessage } = getHttpErrorDetails(ex);
      if (!hasHttpStatus(ex, 404)) {
        existsInJellyfin = true;
        logger.debug(
          `Failure retrieving the ${is4k ? '4K' : 'non-4K'} ${
            media.mediaType === 'tv' ? 'show' : 'movie'
          } [TMDB ID ${media.tmdbId}] from Jellyfin.`,
          {
            errorMessage,
            label: 'AvailabilitySync',
          }
        );
      }
    }

    return existsInJellyfin;
  }
}

const availabilitySync = new AvailabilitySync();

export default availabilitySync;
