import type {
  JellyfinLibraryItem,
  JellyfinLibraryItemExtended,
} from '@server/api/jellyfin';
import JellyfinAPI from '@server/api/jellyfin';
import type { PlexMetadata } from '@server/api/plexapi';
import PlexAPI from '@server/api/plexapi';
import RadarrAPI, { type RadarrMovie } from '@server/api/servarr/radarr';
import type { SonarrSeason, SonarrSeries } from '@server/api/servarr/sonarr';
import SonarrAPI from '@server/api/servarr/sonarr';
import TheMovieDb from '@server/api/themoviedb';
import type { TmdbTvScanDetails } from '@server/api/themoviedb/interfaces';
import { MediaStatus } from '@server/constants/media';
import { MediaServerType } from '@server/constants/server';
import dataSource, { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import type Season from '@server/entity/Season';
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
import {
  externalSeasonNumberFor,
  findTvdbSeasonMappings,
  hasTvdbIdentifierForMedia,
  type SeasonNumberMapping,
} from '@server/lib/seasonNumberMapping';
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
  private plexSeasonsCache: Record<string, PlexMetadata[]>;
  private plexEpisodeExistsCache: Record<string, boolean>;

  private jellyfinClient: JellyfinAPI;
  private jellyfinSeasonsCache: Record<string, JellyfinLibraryItem[]>;
  private jellyfinEpisodeExistsCache: Record<string, boolean>;

  private sonarrSeasonsCache: Record<string, SonarrSeason[]>;
  private sonarrTvdbIdCache: Record<string, number>;
  private tvdbSeasonMappingCache = new Map<string, SeasonNumberMapping[]>();
  private radarrServers: RadarrSettings[];
  private sonarrServers: SonarrSettings[];
  private configurationSnapshot: ConfigurationAuthoritySnapshot;
  private plexSettingsSnapshot: PlexSettings;
  private jellyfinSettingsSnapshot: JellyfinSettings;
  private ownerAuthoritySnapshot: MediaServerUserAuthoritySnapshot;
  private enable4kMovie: boolean;
  private enable4kShow: boolean;

  readonly tmdb = new TheMovieDb();

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
        this.enable4kShow = this.sonarrServers.some((server) => server.is4k);
      });
      this.running = true;
      this.plexSeasonsCache = {};
      this.plexEpisodeExistsCache = {};
      this.jellyfinSeasonsCache = {};
      this.jellyfinEpisodeExistsCache = {};
      this.sonarrSeasonsCache = {};
      this.sonarrTvdbIdCache = {};
      this.tvdbSeasonMappingCache.clear();

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

        // Check plex, radarr, and sonarr for that specific media and
        // if unavailable, then we change the status accordingly.
        // If a non-4k or 4k version exists in at least one of the instances, we will only update that specific version
        if (media.mediaType === 'movie') {
          // if (mediaServerType === MediaServerType.PLEX) {
          //   await this.mediaExistsInPlex(media, false);
          // } else if (
          //   mediaServerType === MediaServerType.JELLYFIN ||
          //   mediaServerType === MediaServerType.EMBY
          // ) {
          //   await this.mediaExistsInJellyfin(media, false);
          // }

          const existsInRadarr = await this.mediaExistsInRadarr(media, false);
          const existsInRadarr4k = await this.mediaExistsInRadarr(media, true);

          // plex
          if (mediaServerType === MediaServerType.PLEX) {
            const { existsInPlex } = await this.mediaExistsInPlex(media, false);
            const { existsInPlex: existsInPlex4k } =
              await this.mediaExistsInPlex(media, true);

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
            const { existsInJellyfin } = await this.mediaExistsInJellyfin(
              media,
              false
            );
            const { existsInJellyfin: existsInJellyfin4k } =
              await this.mediaExistsInJellyfin(media, true);

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

        // If both versions still exist in plex, we still need
        // to check through sonarr to verify season availability
        if (media.mediaType === 'tv') {
          //plex

          const { existsInPlex, seasonsMap: plexSeasonsMap = new Map() } =
            await this.mediaExistsInPlex(media, false);
          const {
            existsInPlex: existsInPlex4k,
            seasonsMap: plexSeasonsMap4k = new Map(),
          } = await this.mediaExistsInPlex(media, true);

          //jellyfin
          const {
            existsInJellyfin,
            seasonsMap: jellyfinSeasonsMap = new Map(),
          } = await this.mediaExistsInJellyfin(media, false);
          const {
            existsInJellyfin: existsInJellyfin4k,
            seasonsMap: jellyfinSeasonsMap4k = new Map(),
          } = await this.mediaExistsInJellyfin(media, true);

          const { existsInSonarr, seasonsMap: sonarrSeasonsMap } =
            await this.mediaExistsInSonarr(media, false);
          const {
            existsInSonarr: existsInSonarr4k,
            seasonsMap: sonarrSeasonsMap4k,
          } = await this.mediaExistsInSonarr(media, true);

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

          // Here we will create a final map that will cross compare
          // with plex and sonarr. Filtered seasons will go through
          // each season and assume the season does not exist. If Plex or
          // Sonarr finds that season, we will change the final seasons value
          // to true.
          const filteredSeasonsMap: Map<number, boolean> = new Map();
          media.seasons
            .filter(
              (season) =>
                season.status === MediaStatus.AVAILABLE ||
                season.status === MediaStatus.PARTIALLY_AVAILABLE
            )
            .forEach((season) =>
              filteredSeasonsMap.set(season.seasonNumber, false)
            );

          const filteredSeasonsMap4k: Map<number, boolean> = new Map();
          media.seasons
            .filter(
              (season) =>
                season.status4k === MediaStatus.AVAILABLE ||
                season.status4k === MediaStatus.PARTIALLY_AVAILABLE
            )
            .forEach((season) =>
              filteredSeasonsMap4k.set(season.seasonNumber, false)
            );

          let finalSeasons: Map<number, boolean>;
          let finalSeasons4k: Map<number, boolean>;

          if (mediaServerType === MediaServerType.PLEX) {
            finalSeasons = new Map([
              ...filteredSeasonsMap,
              ...plexSeasonsMap,
              ...sonarrSeasonsMap,
            ]);
            finalSeasons4k = new Map([
              ...filteredSeasonsMap4k,
              ...plexSeasonsMap4k,
              ...sonarrSeasonsMap4k,
            ]);
          } else {
            // Jellyfin/Emby
            finalSeasons = new Map([
              ...filteredSeasonsMap,
              ...jellyfinSeasonsMap,
              ...sonarrSeasonsMap,
            ]);
            finalSeasons4k = new Map([
              ...filteredSeasonsMap4k,
              ...jellyfinSeasonsMap4k,
              ...sonarrSeasonsMap4k,
            ]);
          }

          // We need to fetch from TMDB to get the episode count for each season
          let tvShow: TmdbTvScanDetails | undefined;
          try {
            if (media.tmdbId) {
              tvShow = await this.tmdb.getTvShowForScan({
                tvId: Number(media.tmdbId),
              });
            } else if (media.tvdbId) {
              tvShow = await this.tmdb.getShowByTvdbIdForScan({
                tvdbId: Number(media.tvdbId),
              });
            }
          } catch (e) {
            logger.debug(
              `Failed to fetch TMDB data for show [TMDB ID ${media.tmdbId}]. Skipping season enrichment.`,
              { label: 'AvailabilitySync', errorMessage: e.message }
            );
          }

          if (tvShow) {
            // fill the finalSeasons and finalSeasons4k maps with false for missing seasons
            media.seasons.forEach((season) => {
              // Specials don't count towards availability (baseScanner skips them too)
              // TODO: doesn't respect enableSpecialEpisodes; needs a shared predicate with baseScanner.ts
              if (season.seasonNumber === 0) {
                return;
              }
              if (
                !finalSeasons.has(season.seasonNumber) &&
                tvShow.seasons.find(
                  (s) => s.season_number === season.seasonNumber
                )?.episode_count
              ) {
                finalSeasons.set(season.seasonNumber, false);
              }
              if (
                !finalSeasons4k.has(season.seasonNumber) &&
                tvShow.seasons.find(
                  (s) => s.season_number === season.seasonNumber
                )?.episode_count
              ) {
                finalSeasons4k.set(season.seasonNumber, false);
              }
            });
          }

          // Episode-level completeness remains separate from confirmed removal
          // of an entire quality/library entry.
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
  ): Promise<{ existsInSonarr: boolean; seasonsMap: Map<number, boolean> }> {
    let existsInSonarr = false;
    let preventSeasonSearch = false;

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

        if (
          sonarr &&
          sonarr.tvdbId !== media.tvdbId &&
          !(await hasTvdbIdentifierForMedia(
            dataSource.manager,
            media.id,
            sonarr.tvdbId
          ))
        ) {
          continue;
        }

        if (sonarr) {
          const externalServiceId = is4k
            ? media.externalServiceId4k
            : media.externalServiceId;
          const cacheKey = `${server.id}-${externalServiceId}`;
          this.sonarrSeasonsCache[cacheKey] = sonarr.seasons;
          this.sonarrTvdbIdCache[cacheKey + '-' + is4k] = sonarr.tvdbId;

          if (sonarr.statistics.episodeFileCount > 0) {
            existsInSonarr = true;
          }
        }
      } catch (ex) {
        const { errorMessage } = getHttpErrorDetails(ex);
        if (!hasHttpStatus(ex, 404)) {
          existsInSonarr = true;
          preventSeasonSearch = true;
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

    // Here we check each season for availability
    // If the API returns an error other than a 404,
    // we will have to prevent the season check from happening
    const seasonsMap: Map<number, boolean> = new Map();

    if (!preventSeasonSearch) {
      const filteredSeasons = media.seasons.filter(
        (season) =>
          season[is4k ? 'status4k' : 'status'] === MediaStatus.AVAILABLE ||
          season[is4k ? 'status4k' : 'status'] ===
            MediaStatus.PARTIALLY_AVAILABLE
      );

      for (const season of filteredSeasons) {
        const seasonExists = await this.seasonExistsInSonarr(
          media,
          season,
          is4k
        );

        if (seasonExists) {
          seasonsMap.set(season.seasonNumber, true);
        }
      }
    }

    return { existsInSonarr, seasonsMap };
  }

  private async seasonExistsInSonarr(
    media: Media,
    season: Season,
    is4k: boolean
  ): Promise<boolean> {
    let seasonExists = false;

    // Check each sonarr instance to see if the media still exists
    // If found, we will assume the media exists and prevent removal
    // We can use the cache we built when we fetched the series with mediaExistsInSonarr
    for (const server of this.sonarrServers.filter(
      (server) => Boolean(server.is4k) === is4k
    )) {
      let sonarrSeasons: SonarrSeason[] | undefined;

      if (media.externalServiceId && !is4k) {
        sonarrSeasons =
          this.sonarrSeasonsCache[`${server.id}-${media.externalServiceId}`];
      }

      if (media.externalServiceId4k && is4k) {
        sonarrSeasons =
          this.sonarrSeasonsCache[`${server.id}-${media.externalServiceId4k}`];
      }

      const cacheKey = `${server.id}-${
        is4k ? media.externalServiceId4k : media.externalServiceId
      }`;
      const tvdbId =
        this.sonarrTvdbIdCache[cacheKey + '-' + is4k] ?? media.tvdbId;
      const mappings = tvdbId
        ? await this.getSeasonNumberMappings(media.id, tvdbId, server.id, is4k)
        : [];
      const externalSeasonNumber = externalSeasonNumberFor(
        season.seasonNumber,
        mappings
      );
      const seasonIsAvailable = sonarrSeasons?.find(
        ({ seasonNumber, statistics }) =>
          externalSeasonNumber === seasonNumber &&
          statistics?.episodeFileCount &&
          statistics?.episodeFileCount > 0
      );

      if (seasonIsAvailable && sonarrSeasons) {
        seasonExists = true;
      }
    }

    return seasonExists;
  }

  // Plex
  private async mediaExistsInPlex(
    media: Media,
    is4k: boolean
  ): Promise<{ existsInPlex: boolean; seasonsMap?: Map<number, boolean> }> {
    const ratingKey = media.ratingKey;
    const ratingKey4k = media.ratingKey4k;
    let existsInPlex = false;
    let preventSeasonSearch = false;

    // Check each plex instance to see if the media still exists
    // If found, we will assume the media exists and prevent removal
    // We can use the cache we built when we fetched the series with mediaExistsInPlex
    try {
      let plexMedia: PlexMetadata | undefined;

      if (ratingKey && !is4k) {
        plexMedia = await this.plexClient?.getMetadata(ratingKey);

        if (media.mediaType === 'tv') {
          this.plexSeasonsCache[ratingKey] =
            await this.plexClient?.getChildrenMetadata(ratingKey);
        }

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
          this.plexSeasonsCache[ratingKey4k] =
            await this.plexClient?.getChildrenMetadata(ratingKey4k);
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
            const cachedSeasons = this.plexSeasonsCache[ratingKey4k];
            if (cachedSeasons?.length) {
              let has4kInAnySeason = false;
              let verifiedAnySeason = false;
              for (const season of cachedSeasons) {
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
        preventSeasonSearch = true;
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

    // Here we check each season in plex for availability
    // If the API returns an error other than a 404,
    // we will have to prevent the season check from happening
    if (media.mediaType === 'tv') {
      const seasonsMap: Map<number, boolean> = new Map();

      if (!preventSeasonSearch) {
        const filteredSeasons = media.seasons.filter(
          (season) =>
            season[is4k ? 'status4k' : 'status'] === MediaStatus.AVAILABLE ||
            season[is4k ? 'status4k' : 'status'] ===
              MediaStatus.PARTIALLY_AVAILABLE
        );

        for (const season of filteredSeasons) {
          const seasonExists = await this.seasonExistsInPlex(
            media,
            season,
            is4k
          );

          if (seasonExists) {
            seasonsMap.set(season.seasonNumber, true);
          }
        }
      }

      return { existsInPlex, seasonsMap };
    }

    return { existsInPlex };
  }

  private async seasonExistsInPlex(
    media: Media,
    season: Season,
    is4k: boolean
  ): Promise<boolean> {
    const ratingKey = media.ratingKey;
    const ratingKey4k = media.ratingKey4k;
    let seasonExistsInPlex = false;

    let plexSeasons: PlexMetadata[] | undefined;

    if (ratingKey && !is4k) {
      plexSeasons = this.plexSeasonsCache[ratingKey];
    }

    if (ratingKey4k && is4k) {
      plexSeasons = this.plexSeasonsCache[ratingKey4k];
    }

    const seasonMeta = plexSeasons?.find(
      (plexSeason) => plexSeason.index === season.seasonNumber
    );

    if (seasonMeta) {
      const cacheKey = `${is4k ? '4k' : 'std'}-${seasonMeta.ratingKey}`;

      if (cacheKey in this.plexEpisodeExistsCache) {
        seasonExistsInPlex = this.plexEpisodeExistsCache[cacheKey];
      } else {
        try {
          // Season metadata exists, but we need to verify it has actual
          // episode files. Plex can keep empty season entries.
          const episodes = await this.plexClient?.getChildrenMetadata(
            seasonMeta.ratingKey
          );

          const episodeVersions =
            episodes?.flatMap((episode) => episode.Media ?? []) ?? [];

          if (is4k) {
            seasonExistsInPlex = episodeVersions.some(
              (mediaItem) => (mediaItem.width ?? 0) >= 2000
            );
          } else if (this.enable4kShow) {
            seasonExistsInPlex = episodeVersions.some(
              (mediaItem) => (mediaItem.width ?? 0) < 2000
            );
          } else {
            seasonExistsInPlex = episodeVersions.length > 0;
          }
        } catch {
          // If we can't fetch episodes, assume the season exists
          // to avoid false removal
          seasonExistsInPlex = true;
        }

        this.plexEpisodeExistsCache[cacheKey] = seasonExistsInPlex;
      }
    }

    return seasonExistsInPlex;
  }

  // Jellyfin
  private async mediaExistsInJellyfin(
    media: Media,
    is4k: boolean
  ): Promise<{ existsInJellyfin: boolean; seasonsMap?: Map<number, boolean> }> {
    const ratingKey = media.jellyfinMediaId;
    const ratingKey4k = media.jellyfinMediaId4k;
    let existsInJellyfin = false;
    let preventSeasonSearch = false;

    // Check each jellyfin instance to see if the media still exists
    // If found, we will assume the media exists and prevent removal
    // We can use the cache we built when we fetched the series with mediaExistsInJellyfin
    try {
      let jellyfinMedia: JellyfinLibraryItemExtended | undefined;

      if (ratingKey && !is4k) {
        jellyfinMedia = await this.jellyfinClient?.getItemData(ratingKey);

        if (media.mediaType === 'tv' && jellyfinMedia !== undefined) {
          this.jellyfinSeasonsCache[ratingKey] =
            await this.jellyfinClient?.getSeasons(ratingKey);
        }
      }

      if (ratingKey4k && is4k) {
        jellyfinMedia = await this.jellyfinClient?.getItemData(ratingKey4k);

        if (media.mediaType === 'tv' && jellyfinMedia !== undefined) {
          this.jellyfinSeasonsCache[ratingKey4k] =
            await this.jellyfinClient?.getSeasons(ratingKey4k);
        }
      }

      if (jellyfinMedia) {
        existsInJellyfin = true;
      }
    } catch (ex) {
      const { errorMessage } = getHttpErrorDetails(ex);
      if (!hasHttpStatus(ex, 404)) {
        existsInJellyfin = true;
        preventSeasonSearch = true;
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

    // Here we check each season in jellyfin for availability
    // If the API returns an error other than a 404,
    // we will have to prevent the season check from happening
    if (media.mediaType === 'tv') {
      const seasonsMap: Map<number, boolean> = new Map();

      if (!preventSeasonSearch) {
        const filteredSeasons = media.seasons.filter(
          (season) =>
            season[is4k ? 'status4k' : 'status'] === MediaStatus.AVAILABLE ||
            season[is4k ? 'status4k' : 'status'] ===
              MediaStatus.PARTIALLY_AVAILABLE
        );

        for (const season of filteredSeasons) {
          const seasonExists = await this.seasonExistsInJellyfin(
            media,
            season,
            is4k
          );

          if (seasonExists) {
            seasonsMap.set(season.seasonNumber, true);
          }
        }
      }

      return { existsInJellyfin, seasonsMap };
    }

    return { existsInJellyfin };
  }

  private async seasonExistsInJellyfin(
    media: Media,
    season: Season,
    is4k: boolean
  ): Promise<boolean> {
    const ratingKey = media.jellyfinMediaId;
    const ratingKey4k = media.jellyfinMediaId4k;
    let seasonExistsInJellyfin = false;

    let jellyfinSeasons: JellyfinLibraryItem[] | undefined;

    if (ratingKey && !is4k) {
      jellyfinSeasons = this.jellyfinSeasonsCache[ratingKey];
    }

    if (ratingKey4k && is4k) {
      jellyfinSeasons = this.jellyfinSeasonsCache[ratingKey4k];
    }

    const seasonMeta = jellyfinSeasons?.find(
      (jellyfinSeason) => jellyfinSeason.IndexNumber === season.seasonNumber
    );

    if (seasonMeta) {
      const seriesId = is4k ? ratingKey4k : ratingKey;

      if (seriesId) {
        const cacheKey = `${seriesId}-${seasonMeta.Id}`;

        if (cacheKey in this.jellyfinEpisodeExistsCache) {
          seasonExistsInJellyfin = this.jellyfinEpisodeExistsCache[cacheKey];
        } else {
          try {
            // Season metadata exists, but we need to verify it has actual
            // episode files. Jellyfin keeps season entries even after all
            // episodes are deleted. getEpisodes already filters out
            // virtual episodes.
            const episodes = await this.jellyfinClient.getEpisodes(
              seriesId,
              seasonMeta.Id
            );

            seasonExistsInJellyfin = episodes.length > 0;
          } catch {
            // If we can't fetch episodes, assume the season exists
            // to avoid false removal
            seasonExistsInJellyfin = true;
          }

          this.jellyfinEpisodeExistsCache[cacheKey] = seasonExistsInJellyfin;
        }
      }
    }

    return seasonExistsInJellyfin;
  }

  private async getSeasonNumberMappings(
    mediaId: number,
    tvdbId: number,
    sonarrServerId: number,
    is4k: boolean
  ): Promise<SeasonNumberMapping[]> {
    const key = `${mediaId}:${tvdbId}:${sonarrServerId}:${is4k}`;
    const cached = this.tvdbSeasonMappingCache.get(key);
    if (cached) return cached;

    const mappings = await findTvdbSeasonMappings(
      dataSource.manager,
      mediaId,
      tvdbId,
      sonarrServerId,
      is4k
    );
    this.tvdbSeasonMappingCache.set(key, mappings);
    return mappings;
  }
}

const availabilitySync = new AvailabilitySync();

export default availabilitySync;
