import {
  getMetadataProvider,
  isTheMovieDbProvider,
} from '@server/api/metadata';
import type { SonarrSeries } from '@server/api/servarr/sonarr';
import SonarrAPI from '@server/api/servarr/sonarr';
import { ANIME_KEYWORD_ID } from '@server/api/themoviedb/constants';
import type {
  TmdbTvDetails,
  TmdbTvScanDetails,
} from '@server/api/themoviedb/interfaces';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import dataSource, { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MediaIdentifier, {
  MediaIdentifierProvider,
} from '@server/entity/MediaIdentifier';
import MediaRequest from '@server/entity/MediaRequest';
import Season from '@server/entity/Season';
import SeasonRequest, {
  isActiveSeasonRequest,
} from '@server/entity/SeasonRequest';
import {
  clearSonarrEpisodeAvailabilityForSeries,
  removeMissingSonarrEpisodeSeries,
  syncSonarrEpisodeAvailability,
  type SonarrSeasonAvailabilitySync,
} from '@server/lib/episodeAvailability';
import { getExternalRuntimeConfig } from '@server/lib/externalRuntimeConfig';
import { runMediaEntityMutation } from '@server/lib/mediaMutation';
import { upsertMediaSearchMetadata } from '@server/lib/mediaSearchMetadata';
import type {
  ProcessableSeason,
  RunnableScanner,
  StatusBase,
} from '@server/lib/scanners/baseScanner';
import BaseScanner from '@server/lib/scanners/baseScanner';
import { forEachMediaCleanupBatch } from '@server/lib/scanners/mediaCleanupBatches';
import {
  externalSeasonNumberFor,
  findMediaForTvdbId,
  getSeasonMappingsForTvdbIdentifier,
} from '@server/lib/seasonNumberMapping';
import {
  runWithServarrServiceSnapshot,
  runWithServarrServiceSnapshots,
  ServarrServiceAuthorityChangedError,
} from '@server/lib/serviceAdmission';
import {
  getSettings,
  MetadataProviderType,
  type SonarrSettings,
} from '@server/lib/settings';
import { is4kResolution } from '@server/lib/videoResolution';
import { getHttpErrorDetails } from '@server/utils/httpError';
import { uniqWith } from 'lodash';
import type { FindOptionsWhere } from 'typeorm';

type SyncStatus = StatusBase & {
  currentServer: SonarrSettings;
  servers: SonarrSettings[];
};

class SonarrScanner
  extends BaseScanner<SonarrSeries>
  implements RunnableScanner<SyncStatus>
{
  private servers: SonarrSettings[];
  private currentServer: SonarrSettings;
  private sonarrApi: SonarrAPI;
  private scannedTvdbIds: Set<number> = new Set();
  private scanned4kTvdbIds: Set<number> = new Set();
  private scannedTmdbIds: Set<number> = new Set();
  private scanned4kTmdbIds: Set<number> = new Set();
  private currentServiceTvdbIds: Set<number> = new Set();
  private currentServiceTmdbIds: Set<number> = new Set();
  private currentService4kTvdbIds: Set<number> = new Set();
  private currentService4kTmdbIds: Set<number> = new Set();
  private didScanStandard = false;
  private didScan4k = false;
  private serverReturnedEmpty = false;
  private server4kReturnedEmpty = false;
  private resolutionAwareSingleServer = false;

  constructor() {
    super('Sonarr Scan', { bundleSize: 50 });
  }

  public status(): SyncStatus {
    return {
      running: this.running,
      progress: this.progress,
      total: this.items.length,
      currentServer: this.currentServer,
      servers: this.servers,
    };
  }

  public async run(): Promise<void> {
    const settings = getExternalRuntimeConfig();
    const sessionId = this.startRun();
    if (!sessionId) {
      return;
    }
    this.scannedTvdbIds.clear();
    this.scanned4kTvdbIds.clear();
    this.scannedTmdbIds.clear();
    this.scanned4kTmdbIds.clear();
    this.didScanStandard = false;
    this.didScan4k = false;
    this.serverReturnedEmpty = false;
    this.server4kReturnedEmpty = false;

    try {
      const fourKEnabled = getSettings().main.enable4k !== false;
      this.servers = uniqWith(
        structuredClone(
          settings.sonarr.filter((server) => fourKEnabled || !server.is4k)
        ),
        (sonarrA, sonarrB) =>
          sonarrA.hostname === sonarrB.hostname &&
          sonarrA.port === sonarrB.port &&
          sonarrA.baseUrl === sonarrB.baseUrl
      );
      this.resolutionAwareSingleServer =
        fourKEnabled &&
        this.servers.filter((server) => server.syncEnabled).length === 1 &&
        settings.sonarr.some(
          (server) =>
            server.syncEnabled &&
            !server.is4k &&
            server.hostname === this.servers[0].hostname &&
            server.port === this.servers[0].port &&
            server.baseUrl === this.servers[0].baseUrl
        );
      if (fourKEnabled && this.resolutionAwareSingleServer) {
        this.enable4kShow = true;
        this.log(
          'Single Sonarr server detected. Episode file resolution will separate HD and 4K availability.',
          'info'
        );
      }

      for (const server of this.servers) {
        this.currentServer = server;
        this.currentServiceTvdbIds.clear();
        this.currentServiceTmdbIds.clear();
        this.currentService4kTvdbIds.clear();
        this.currentService4kTmdbIds.clear();
        if (server.syncEnabled) {
          this.log(
            `Beginning to process Sonarr server: ${server.name}`,
            'info'
          );

          this.items = await runWithServarrServiceSnapshot(
            'sonarr',
            server,
            async (current) => {
              this.sonarrApi = new SonarrAPI({
                apiKey: current.apiKey,
                url: SonarrAPI.buildUrl(current, '/api/v3'),
              });
              return this.sonarrApi.getSeries();
            }
          );

          const server4k = this.enable4kShow && server.is4k;
          const scansBothResolutions =
            this.resolutionAwareSingleServer && this.enable4kShow;
          if (scansBothResolutions) {
            this.didScanStandard = true;
            this.didScan4k = true;
          } else if (server4k) {
            this.didScan4k = true;
          } else {
            this.didScanStandard = true;
          }

          if (this.items.length === 0) {
            if (server4k) {
              this.server4kReturnedEmpty = true;
            } else {
              this.serverReturnedEmpty = true;
            }
            if (scansBothResolutions) {
              this.serverReturnedEmpty = true;
              this.server4kReturnedEmpty = true;
            }
            this.log(
              `Sonarr server ${server.name} returned no series. Orphan cleanup for this profile type will be skipped.`,
              'warn'
            );
          }

          await this.loop(this.processSonarrSeries.bind(this), { sessionId });

          const hasCompleteMediaIdentity = this.items.every(
            (series) => Number.isSafeInteger(series.tvdbId) && series.tvdbId > 0
          );
          const hasCompleteSeriesIdentity = this.items.every(
            (series) => Number.isSafeInteger(series.id) && (series.id ?? 0) > 0
          );
          if (
            getSettings().main.trackEpisodeAvailability &&
            this.items.length > 0 &&
            hasCompleteSeriesIdentity
          ) {
            await runWithServarrServiceSnapshot('sonarr', server, () =>
              removeMissingSonarrEpisodeSeries(
                server.id,
                this.items.map((series) => series.id!)
              )
            );
          }
          if (this.items.length > 0 && hasCompleteMediaIdentity) {
            const formats = scansBothResolutions
              ? ([
                  {
                    format: 'standard' as const,
                    tmdbIds: this.currentServiceTmdbIds,
                    tvdbIds: this.currentServiceTvdbIds,
                  },
                  {
                    format: '4k' as const,
                    tmdbIds: this.currentService4kTmdbIds,
                    tvdbIds: this.currentService4kTvdbIds,
                  },
                ] as const)
              : ([
                  {
                    format: server4k ? ('4k' as const) : ('standard' as const),
                    tmdbIds: this.currentServiceTmdbIds,
                    tvdbIds: this.currentServiceTvdbIds,
                  },
                ] as const);
            for (const { format, tmdbIds, tvdbIds } of formats) {
              await runWithServarrServiceSnapshot('sonarr', server, async () =>
                this.markMissingVideoServiceStatusesUnknown({
                  serviceType: 'sonarr',
                  serverId: server.id,
                  format,
                  mediaType: MediaType.TV,
                  tmdbIds,
                  tvdbIds,
                })
              );
            }
          }
        } else {
          this.log(`Sync not enabled. Skipping Sonarr server: ${server.name}`);
        }
      }

      // Only run cleanup if all servers of this profile type have sync enabled.
      // If any server is skipped, we can't distinguish truly orphaned media from
      // media that exists on an unscanned server (e.g. separate instances for
      // anime, regional content, or different languages).
      const allStandardScanned = this.serversForQuality(false).every(
        (server) => server.syncEnabled
      );
      const all4kScanned = this.serversForQuality(true).every(
        (server) => server.syncEnabled
      );

      if (!allStandardScanned) {
        this.didScanStandard = false;
      }
      if (!all4kScanned) {
        this.didScan4k = false;
      }

      if (this.serverReturnedEmpty) {
        this.didScanStandard = false;
      }
      if (this.server4kReturnedEmpty) {
        this.didScan4k = false;
      }

      if (this.didScanStandard) {
        await this.resolveDeferredSeasonStatusResets(false, (callback) =>
          runWithServarrServiceSnapshots(
            'sonarr',
            this.serversForQuality(false).filter(
              (server) => server.syncEnabled
            ),
            callback,
            {
              requireExactAuthoritySet: true,
              includeCurrent: (server) =>
                server.syncEnabled && this.serverMatchesQuality(server, false),
            }
          )
        );
      }
      if (this.didScan4k) {
        await this.resolveDeferredSeasonStatusResets(true, (callback) =>
          runWithServarrServiceSnapshots(
            'sonarr',
            this.serversForQuality(true).filter((server) => server.syncEnabled),
            callback,
            {
              requireExactAuthoritySet: true,
              includeCurrent: (server) =>
                server.syncEnabled && this.serverMatchesQuality(server, true),
            }
          )
        );
      }

      await this.cleanupOrphanedShows();
      this.log('Sonarr scan complete', 'info');
    } catch (e) {
      this.log('Scan interrupted', 'error', {
        ...getHttpErrorDetails(e),
        errorStack: e instanceof Error ? e.stack : undefined,
      });
    } finally {
      this.endRun(sessionId);
    }
  }

  private async processSonarrSeries(sonarrSeries: SonarrSeries) {
    if (Number.isSafeInteger(sonarrSeries.tvdbId) && sonarrSeries.tvdbId > 0) {
      if (this.resolutionAwareSingleServer) {
        this.currentServiceTvdbIds.add(sonarrSeries.tvdbId);
        this.currentService4kTvdbIds.add(sonarrSeries.tvdbId);
      } else {
        this.currentServiceTvdbIds.add(sonarrSeries.tvdbId);
      }
    }
    const server4k = this.enable4kShow && this.currentServer.is4k;
    if (!this.resolutionAwareSingleServer) {
      if (server4k) {
        this.scanned4kTvdbIds.add(sonarrSeries.tvdbId);
      } else {
        this.scannedTvdbIds.add(sonarrSeries.tvdbId);
      }
    }

    try {
      const hasEpisodeFiles = sonarrSeries.seasons.some(
        (season) => (season.statistics?.episodeFileCount ?? 0) > 0
      );
      const sonarrSeriesId = sonarrSeries.id;
      const settings = getSettings();
      const mayTrackEpisodeAvailability =
        settings.main.trackEpisodeAvailability &&
        (settings.metadataSettings.tv === MetadataProviderType.TVDB ||
          settings.metadataSettings.anime === MetadataProviderType.TVDB);
      let episodeFiles:
        Awaited<ReturnType<SonarrAPI['getEpisodes']>> | undefined;
      let episodeListingFetched = false;
      const hasValidSeriesId =
        Number.isSafeInteger(sonarrSeriesId) && (sonarrSeriesId ?? 0) > 0;
      if (
        this.resolutionAwareSingleServer &&
        hasEpisodeFiles &&
        hasValidSeriesId
      ) {
        episodeFiles = await runWithServarrServiceSnapshot(
          'sonarr',
          this.currentServer,
          () => this.sonarrApi.getEpisodes(sonarrSeriesId!, true)
        );
        episodeListingFetched = true;
      } else if (this.resolutionAwareSingleServer) {
        episodeFiles = [];
      }
      if (
        mayTrackEpisodeAvailability &&
        hasValidSeriesId &&
        !episodeListingFetched
      ) {
        try {
          episodeFiles = await runWithServarrServiceSnapshot(
            'sonarr',
            this.currentServer,
            () =>
              this.sonarrApi.getEpisodes(
                sonarrSeriesId!,
                this.resolutionAwareSingleServer
              )
          );
          episodeListingFetched = true;
        } catch (e) {
          this.log(
            'Unable to refresh per-episode Sonarr availability; keeping the last successful scan.',
            'warn',
            {
              errorMessage: e instanceof Error ? e.message : String(e),
              title: sonarrSeries.title,
            }
          );
        }
      }
      const expectedEpisodeCount = sonarrSeries.seasons.reduce(
        (total, season) => total + (season.statistics?.totalEpisodeCount ?? 0),
        0
      );
      const episodeListingComplete =
        episodeListingFetched &&
        expectedEpisodeCount > 0 &&
        (episodeFiles?.length ?? 0) >= expectedEpisodeCount;
      const mediaMatches = await findMediaForTvdbId(
        dataSource.manager,
        sonarrSeries.tvdbId
      );
      const targets: (Media | undefined)[] =
        mediaMatches.length > 0 ? mediaMatches : [undefined];

      for (const media of targets) {
        let resolvedTmdbId: number | undefined;
        try {
          resolvedTmdbId = await this.processSonarrSeriesForMedia(
            sonarrSeries,
            media,
            server4k,
            episodeFiles,
            episodeListingComplete
          );
        } catch (e) {
          if (e instanceof ServarrServiceAuthorityChangedError) throw e;
          const failedQualities = this.resolutionAwareSingleServer
            ? ([false, true] as const)
            : ([server4k] as const);
          for (const is4k of failedQualities) {
            this.markShowScanFailed(sonarrSeries.tvdbId, is4k, resolvedTmdbId);
          }
          this.log('Failed to process Sonarr media', 'error', {
            errorMessage: e instanceof Error ? e.message : String(e),
            title: sonarrSeries.title,
            mediaId: media?.id,
          });
        }
      }
    } catch (e) {
      if (e instanceof ServarrServiceAuthorityChangedError) throw e;
      const failedQualities = this.resolutionAwareSingleServer
        ? ([false, true] as const)
        : ([server4k] as const);
      for (const is4k of failedQualities) {
        this.markShowScanFailed(sonarrSeries.tvdbId, is4k);
      }
      this.log('Failed to process Sonarr media', 'error', {
        errorMessage: e instanceof Error ? e.message : String(e),
        title: sonarrSeries.title,
      });
    }
  }

  private async processSonarrSeriesForMedia(
    sonarrSeries: SonarrSeries,
    media: Media | undefined,
    server4k: boolean,
    episodeFiles?: Awaited<ReturnType<SonarrAPI['getEpisodes']>>,
    episodeListingComplete = false
  ): Promise<number> {
    let tvShow: TmdbTvScanDetails | TmdbTvDetails;
    if (!media || !media.tmdbId) {
      tvShow = await this.tmdb.getShowByTvdbIdForScan({
        tvdbId: sonarrSeries.tvdbId,
      });
    } else {
      tvShow = await this.tmdb.getTvShowForScan({ tvId: media.tmdbId });
    }

    const tmdbId = tvShow.id;
    if (Number.isSafeInteger(tmdbId) && tmdbId > 0) {
      if (this.resolutionAwareSingleServer) {
        this.currentServiceTmdbIds.add(tmdbId);
        this.currentService4kTmdbIds.add(tmdbId);
      } else {
        this.currentServiceTmdbIds.add(tmdbId);
      }
    }
    if (!this.resolutionAwareSingleServer) {
      (server4k ? this.scanned4kTmdbIds : this.scannedTmdbIds).add(tmdbId);
    }
    const tmdbIdentifiesAnime = tvShow.keywords.results.some(
      (keyword) => keyword.id === ANIME_KEYWORD_ID
    );
    const seriesUsesAnimeMetadata =
      this.isAnimeSeries(sonarrSeries) || tmdbIdentifiesAnime;
    tvShow = await this.applyMetadataProvider(
      tvShow,
      this.isAnimeSeries(sonarrSeries)
    );
    const settings = getExternalRuntimeConfig();
    const seasonMappings = media
      ? getSeasonMappingsForTvdbIdentifier(
          media,
          sonarrSeries.tvdbId,
          this.currentServer.id,
          Boolean(this.currentServer.is4k),
          sonarrSeries.seasonType ?? 'standard'
        )
      : [];

    const episodeCountsBySeason = new Map<
      number,
      { standard: number; fourK: number }
    >();
    if (this.resolutionAwareSingleServer) {
      for (const episode of episodeFiles ?? []) {
        if (!episode.hasFile || episode.episodeFileId <= 0) continue;
        const counts = episodeCountsBySeason.get(episode.seasonNumber) ?? {
          standard: 0,
          fourK: 0,
        };
        if (is4kResolution(episode.fileResolution) === true) {
          counts.fourK++;
        } else {
          counts.standard++;
        }
        episodeCountsBySeason.set(episode.seasonNumber, counts);
      }
    }

    const processableSeasons: ProcessableSeason[] = tvShow.seasons
      .filter(
        (season) =>
          settings.main.enableSpecialEpisodes || season.season_number !== 0
      )
      .map((season) => {
        const externalSeasonNumber = externalSeasonNumberFor(
          season.season_number,
          seasonMappings
        );
        const sonarrSeason = sonarrSeries.seasons.find(
          (item) => item.seasonNumber === externalSeasonNumber
        );
        const totalAvailableEpisodes =
          sonarrSeason?.statistics?.episodeFileCount ?? 0;
        const resolutionCounts =
          episodeCountsBySeason.get(externalSeasonNumber);

        return {
          seasonNumber: season.season_number,
          episodes: this.resolutionAwareSingleServer
            ? (resolutionCounts?.standard ?? 0)
            : !server4k
              ? totalAvailableEpisodes
              : 0,
          episodes4k: this.resolutionAwareSingleServer
            ? (resolutionCounts?.fourK ?? 0)
            : server4k
              ? totalAvailableEpisodes
              : 0,
          totalEpisodes:
            sonarrSeason?.statistics?.totalEpisodeCount ?? season.episode_count,
          processing:
            Boolean(sonarrSeason?.monitored) && totalAvailableEpisodes === 0,
          is4kOverride: this.resolutionAwareSingleServer ? false : server4k,
        };
      });

    if (this.resolutionAwareSingleServer) {
      const hasStandardActivity = processableSeasons.some(
        (season) => season.episodes > 0 || season.processing
      );
      const has4kFiles = processableSeasons.some(
        (season) => season.episodes4k > 0
      );
      if (hasStandardActivity) {
        this.scannedTvdbIds.add(sonarrSeries.tvdbId);
        this.scannedTmdbIds.add(tmdbId);
      }
      if (has4kFiles) {
        this.scanned4kTvdbIds.add(sonarrSeries.tvdbId);
        this.scanned4kTmdbIds.add(tmdbId);
      }

      const processOptions = {
        serviceId: this.currentServer.id,
        requestServiceType: 'sonarr' as const,
        externalServiceId: sonarrSeries.id,
        externalServiceSlug: sonarrSeries.titleSlug,
        title: sonarrSeries.title,
        deferStatusReset: true,
        preserveInactiveServiceIdentity: true,
        mutationGuard: <Result>(callback: () => Promise<Result>) =>
          runWithServarrServiceSnapshot('sonarr', this.currentServer, callback),
      };
      await this.processShow(
        tmdbId,
        sonarrSeries.tvdbId,
        processableSeasons.map((season) => ({
          ...season,
          episodes4k: 0,
          is4kOverride: false,
        })),
        { ...processOptions, is4k: false }
      );
      await this.processShow(
        tmdbId,
        sonarrSeries.tvdbId,
        processableSeasons.map((season) => ({
          ...season,
          episodes: 0,
          processing: false,
          is4kOverride: true,
        })),
        { ...processOptions, is4k: true }
      );
    } else {
      await this.processShow(tmdbId, sonarrSeries.tvdbId, processableSeasons, {
        serviceId: this.currentServer.id,
        requestServiceType: 'sonarr',
        externalServiceId: sonarrSeries.id,
        externalServiceSlug: sonarrSeries.titleSlug,
        title: sonarrSeries.title,
        is4k: server4k,
        deferStatusReset: true,
        preserveInactiveServiceIdentity: true,
        mutationGuard: (callback) =>
          runWithServarrServiceSnapshot('sonarr', this.currentServer, callback),
      });
    }

    const updatedMedia = await getRepository(Media).findOneBy({
      tmdbId,
      mediaType: MediaType.TV,
    });
    const settingsForEpisodeAvailability = getSettings();
    const episodeMetadataProvider = seriesUsesAnimeMetadata
      ? settingsForEpisodeAvailability.metadataSettings.anime
      : settingsForEpisodeAvailability.metadataSettings.tv;
    const displayedEpisodeMetadataProvider = tmdbIdentifiesAnime
      ? settingsForEpisodeAvailability.metadataSettings.anime
      : settingsForEpisodeAvailability.metadataSettings.tv;
    if (
      updatedMedia &&
      Number.isSafeInteger(sonarrSeries.id) &&
      (sonarrSeries.id ?? 0) > 0 &&
      settingsForEpisodeAvailability.main.trackEpisodeAvailability &&
      episodeListingComplete &&
      episodeFiles
    ) {
      const episodeOrder = sonarrSeries.seasonType?.toLowerCase();
      const hasCompatibleEpisodeOrder =
        !sonarrSeries.useSceneNumbering &&
        (!episodeOrder ||
          episodeOrder === 'standard' ||
          episodeOrder === 'official');
      await runWithServarrServiceSnapshot('sonarr', this.currentServer, () =>
        episodeMetadataProvider === MetadataProviderType.TVDB &&
        displayedEpisodeMetadataProvider === MetadataProviderType.TVDB &&
        hasCompatibleEpisodeOrder
          ? this.syncEpisodeAvailabilityForSeries(
              updatedMedia,
              sonarrSeries,
              processableSeasons,
              seasonMappings,
              episodeFiles,
              server4k
            )
          : clearSonarrEpisodeAvailabilityForSeries(
              this.currentServer.id,
              sonarrSeries.id!
            )
      );
    }
    if (updatedMedia && this.isAnimeSeries(sonarrSeries)) {
      await this.persistAnimeIdentifiers(updatedMedia, sonarrSeries);
    }
    await upsertMediaSearchMetadata(updatedMedia?.id, {
      title: tvShow.name,
      alternateTitle: tvShow.original_name,
      releaseDate: tvShow.first_air_date,
      genres: tvShow.genres.map((genre) => genre.name).join(', '),
      runtime: tvShow.episode_run_time[0]
        ? `${tvShow.episode_run_time[0]} minutes`
        : undefined,
      creator: tvShow.created_by.map((creator) => creator.name).join(', '),
      studio: tvShow.production_companies
        .map((company) => company.name)
        .join(', '),
      network: tvShow.networks.map((network) => network.name).join(', '),
      format: 'Series',
      provider: this.currentServer.name,
      externalIds: [
        tmdbId,
        sonarrSeries.tvdbId,
        sonarrSeries.imdbId,
        ...(sonarrSeries.malIds ?? []).map((id) => `mal:${id}`),
        ...(sonarrSeries.aniListIds ?? []).map((id) => `anilist:${id}`),
      ]
        .filter(Boolean)
        .join(' '),
    });

    return tmdbId;
  }

  private async syncEpisodeAvailabilityForSeries(
    media: Media,
    sonarrSeries: SonarrSeries,
    processableSeasons: ProcessableSeason[],
    seasonMappings: ReturnType<typeof getSeasonMappingsForTvdbIdentifier>,
    episodes: Awaited<ReturnType<SonarrAPI['getEpisodes']>>,
    server4k: boolean
  ): Promise<void> {
    const databaseSeasons = await getRepository(Season).find({
      where: { media: { id: media.id } },
    });
    const databaseSeasonByNumber = new Map(
      databaseSeasons.map((season) => [season.seasonNumber, season])
    );
    const metadataSeasonByExternalNumber = new Map<number, number>();
    const ambiguousExternalSeasonNumbers = new Set<number>();

    for (const season of processableSeasons) {
      const externalSeasonNumber = externalSeasonNumberFor(
        season.seasonNumber,
        seasonMappings
      );
      const existingSeasonNumber =
        metadataSeasonByExternalNumber.get(externalSeasonNumber);
      if (
        existingSeasonNumber !== undefined &&
        existingSeasonNumber !== season.seasonNumber
      ) {
        metadataSeasonByExternalNumber.delete(externalSeasonNumber);
        ambiguousExternalSeasonNumbers.add(externalSeasonNumber);
      } else if (!ambiguousExternalSeasonNumbers.has(externalSeasonNumber)) {
        metadataSeasonByExternalNumber.set(
          externalSeasonNumber,
          season.seasonNumber
        );
      }
    }

    const episodesBySeason = new Map<
      number,
      SonarrSeasonAvailabilitySync['episodes']
    >();
    for (const episode of episodes) {
      if (!episode.hasFile || !Number.isSafeInteger(episode.episodeNumber)) {
        continue;
      }
      const metadataSeasonNumber = metadataSeasonByExternalNumber.get(
        episode.seasonNumber
      );
      if (metadataSeasonNumber === undefined) continue;
      const databaseSeason = databaseSeasonByNumber.get(metadataSeasonNumber);
      if (!databaseSeason) continue;

      const is4k = this.resolutionAwareSingleServer
        ? is4kResolution(episode.fileResolution)
        : server4k;
      if (is4k === undefined) continue;

      const seasonEpisodes = episodesBySeason.get(databaseSeason.id) ?? [];
      seasonEpisodes.push({ episodeNumber: episode.episodeNumber, is4k });
      episodesBySeason.set(databaseSeason.id, seasonEpisodes);
    }

    await syncSonarrEpisodeAvailability(
      this.currentServer.id,
      sonarrSeries.id!,
      processableSeasons.flatMap((season) => {
        const databaseSeason = databaseSeasonByNumber.get(season.seasonNumber);
        return databaseSeason
          ? [
              {
                seasonId: databaseSeason.id,
                episodes: episodesBySeason.get(databaseSeason.id) ?? [],
              },
            ]
          : [];
      })
    );
  }

  private async applyMetadataProvider(
    tvShow: TmdbTvScanDetails | TmdbTvDetails,
    sonarrIdentifiesAnime = false
  ): Promise<TmdbTvScanDetails | TmdbTvDetails> {
    const metadataProvider =
      sonarrIdentifiesAnime ||
      tvShow.keywords.results.some((keyword) => keyword.id === ANIME_KEYWORD_ID)
        ? await getMetadataProvider('anime')
        : await getMetadataProvider('tv');

    return isTheMovieDbProvider(metadataProvider)
      ? tvShow
      : metadataProvider.getTvShow({ tvId: tvShow.id });
  }

  private isAnimeSeries(series: SonarrSeries): boolean {
    return (
      series.seriesType === 'anime' ||
      (series.malIds?.length ?? 0) > 0 ||
      (series.aniListIds?.length ?? 0) > 0
    );
  }

  private async persistAnimeIdentifiers(
    media: Media,
    series: SonarrSeries
  ): Promise<void> {
    const candidates = [
      ...(series.malIds ?? []).map((id) => ({
        provider: MediaIdentifierProvider.MAL,
        value: String(id),
      })),
      ...(series.aniListIds ?? []).map((id) => ({
        provider: MediaIdentifierProvider.ANILIST,
        value: String(id),
      })),
    ];
    const repository = getRepository(MediaIdentifier);

    for (const candidate of candidates) {
      const matching = await repository.find({
        where: candidate,
        relations: { media: true },
      });
      if (matching.some((identifier) => identifier.media?.id !== media.id)) {
        continue;
      }
      if (matching.some((identifier) => identifier.media?.id === media.id)) {
        continue;
      }
      await repository.save(
        new MediaIdentifier({
          media,
          provider: candidate.provider,
          value: candidate.value,
          canonical: false,
        })
      );
    }
  }

  private serverMatchesQuality(server: SonarrSettings, is4k: boolean): boolean {
    return (
      this.resolutionAwareSingleServer ||
      (this.enable4kShow && server.is4k) === is4k
    );
  }

  private serversForQuality(is4k: boolean): SonarrSettings[] {
    return this.servers.filter((server) =>
      this.serverMatchesQuality(server, is4k)
    );
  }

  private async existsInAnyServer(
    tvdbId: number,
    is4k: boolean
  ): Promise<boolean> {
    const servers = this.serversForQuality(is4k).filter(
      (server) => server.syncEnabled
    );

    for (const server of servers) {
      try {
        const api = new SonarrAPI({
          apiKey: server.apiKey,
          url: SonarrAPI.buildUrl(server, '/api/v3'),
        });
        const series = await api.getLibrarySeriesByTvdbId(tvdbId);
        const matchingSeries = series.find((show) => show.tvdbId === tvdbId);

        if (matchingSeries) {
          if (!this.resolutionAwareSingleServer) return true;
          const matchingSeriesId = matchingSeries.id;
          if (
            typeof matchingSeriesId !== 'number' ||
            !Number.isSafeInteger(matchingSeriesId) ||
            matchingSeriesId <= 0
          ) {
            return true;
          }

          const episodes = await api.getEpisodes(matchingSeriesId, true);
          const episodeFiles = episodes.filter(
            (episode) => episode.hasFile && episode.episodeFileId > 0
          );
          if (episodeFiles.length === 0) return true;

          if (
            episodeFiles.some((episode) => {
              const detected = is4kResolution(episode.fileResolution);
              return detected === undefined || detected === is4k;
            })
          ) {
            return true;
          }
        }
      } catch (e) {
        this.log(
          `Could not confirm series ${tvdbId} against Sonarr server ${server.name}. Skipping cleanup for it.`,
          'warn',
          { errorMessage: e.message }
        );
        return true;
      }
    }

    return false;
  }

  private async getMaterialSeasonNumbers(
    tmdbId: number
  ): Promise<Set<number> | undefined> {
    try {
      const tvShow = await this.applyMetadataProvider(
        await this.tmdb.getTvShowForScan({ tvId: tmdbId })
      );
      return new Set(
        tvShow.seasons
          .filter(
            (season) => season.season_number !== 0 && season.episode_count > 0
          )
          .map((season) => season.season_number)
      );
    } catch (e) {
      this.log(
        `Could not look up the seasons of orphaned show ${tmdbId}. Skipping cleanup for it.`,
        'warn',
        { errorMessage: e instanceof Error ? e.message : String(e) }
      );
      return;
    }
  }

  private async settleOrphanedShow(
    mediaSnapshot: Media,
    is4k: boolean
  ): Promise<boolean> {
    const statusField = is4k ? 'status4k' : 'status';
    const servers = this.serversForQuality(is4k).filter(
      (server) => server.syncEnabled
    );

    return runMediaEntityMutation(mediaSnapshot, () =>
      runWithServarrServiceSnapshots(
        'sonarr',
        servers,
        async () => {
          if (
            !mediaSnapshot.tvdbId ||
            (await this.existsInAnyServer(mediaSnapshot.tvdbId, is4k))
          ) {
            return false;
          }
          const materialSeasonNumbers = await this.getMaterialSeasonNumbers(
            mediaSnapshot.tmdbId
          );
          if (!materialSeasonNumbers) return false;

          return dataSource.transaction(async (manager) => {
            const mediaRepository = manager.getRepository(Media);
            const seasonRepository = manager.getRepository(Season);
            const seasonRequestRepository =
              manager.getRepository(SeasonRequest);
            const requestRepository = manager.getRepository(MediaRequest);
            const media = await mediaRepository.findOne({
              where: { id: mediaSnapshot.id, mediaType: MediaType.TV },
              relations: { seasons: true, requests: { seasons: true } },
            });

            if (
              !media ||
              media.tmdbId !== mediaSnapshot.tmdbId ||
              media.tvdbId !== mediaSnapshot.tvdbId
            ) {
              return false;
            }

            const approvedRequests = (media.requests ?? []).filter(
              (request) =>
                request.is4k === is4k &&
                request.status === MediaRequestStatus.APPROVED
            );
            const processingSeasons = media.seasons.filter(
              (season) => season[statusField] === MediaStatus.PROCESSING
            );

            if (
              media[statusField] !== MediaStatus.PROCESSING &&
              processingSeasons.length === 0 &&
              approvedRequests.length === 0
            ) {
              return false;
            }

            const changedSeasons: Season[] = [];
            for (const season of processingSeasons) {
              season[statusField] = MediaStatus.UNKNOWN;
              changedSeasons.push(season);
            }

            const seasonsByNumber = new Map(
              media.seasons.map((season) => [season.seasonNumber, season])
            );
            const changedSeasonRequests: SeasonRequest[] = [];
            const changedRequests: MediaRequest[] = [];
            const settledSeasonNumbers = new Set(
              processingSeasons
                .filter((season) => season.seasonNumber !== 0)
                .map((season) => season.seasonNumber)
            );
            const availableSeasonNumbers = new Set(
              media.seasons
                .filter(
                  (season) => season[statusField] === MediaStatus.AVAILABLE
                )
                .map((season) => season.seasonNumber)
            );

            for (const request of approvedRequests) {
              if ((request.seasons ?? []).length === 0) {
                request.status =
                  media[statusField] === MediaStatus.AVAILABLE
                    ? MediaRequestStatus.COMPLETED
                    : MediaRequestStatus.DECLINED;
                changedRequests.push(request);
                continue;
              }

              for (const requestedSeason of request.seasons ?? []) {
                if (
                  requestedSeason.status === MediaRequestStatus.DECLINED ||
                  requestedSeason.status === MediaRequestStatus.COMPLETED ||
                  requestedSeason.status === MediaRequestStatus.FAILED
                ) {
                  continue;
                }

                requestedSeason.status = availableSeasonNumbers.has(
                  requestedSeason.seasonNumber
                )
                  ? MediaRequestStatus.COMPLETED
                  : MediaRequestStatus.DECLINED;
                if (requestedSeason.seasonNumber !== 0) {
                  settledSeasonNumbers.add(requestedSeason.seasonNumber);
                }
                changedSeasonRequests.push(requestedSeason);
              }

              const hasOutstandingSelection = (request.seasons ?? []).some(
                (season) =>
                  isActiveSeasonRequest(season) &&
                  season.status !== MediaRequestStatus.COMPLETED &&
                  season.status !== MediaRequestStatus.FAILED
              );
              if (!hasOutstandingSelection) {
                request.status = (request.seasons ?? []).some(
                  (season) => season.status === MediaRequestStatus.COMPLETED
                )
                  ? MediaRequestStatus.COMPLETED
                  : MediaRequestStatus.DECLINED;
                changedRequests.push(request);
              }
            }

            const rollupSeasonNumbers = new Set([
              ...materialSeasonNumbers,
              ...settledSeasonNumbers,
              ...media.seasons
                .filter(
                  (season) =>
                    season.seasonNumber !== 0 &&
                    season[statusField] !== MediaStatus.UNKNOWN
                )
                .map((season) => season.seasonNumber),
            ]);
            const allMaterialSeasonsAvailable =
              rollupSeasonNumbers.size > 0 &&
              [...rollupSeasonNumbers].every(
                (seasonNumber) =>
                  seasonsByNumber.get(seasonNumber)?.[statusField] ===
                  MediaStatus.AVAILABLE
              );
            const hasAvailableSeason = media.seasons.some(
              (season) =>
                season.seasonNumber !== 0 &&
                (season[statusField] === MediaStatus.PARTIALLY_AVAILABLE ||
                  season[statusField] === MediaStatus.AVAILABLE)
            );
            const hasProcessingSeason = media.seasons.some(
              (season) =>
                season.seasonNumber !== 0 &&
                season[statusField] === MediaStatus.PROCESSING
            );
            const nextMediaStatus = allMaterialSeasonsAvailable
              ? MediaStatus.AVAILABLE
              : hasAvailableSeason
                ? MediaStatus.PARTIALLY_AVAILABLE
                : hasProcessingSeason
                  ? MediaStatus.PROCESSING
                  : media[statusField] === MediaStatus.DELETED
                    ? MediaStatus.DELETED
                    : MediaStatus.UNKNOWN;

            if (changedSeasons.length > 0) {
              await seasonRepository.save(changedSeasons);
            }
            if (changedSeasonRequests.length > 0) {
              await seasonRequestRepository.save(changedSeasonRequests);
            }
            if (changedRequests.length > 0) {
              await requestRepository.save(changedRequests);
            }
            if (media[statusField] !== nextMediaStatus) {
              await mediaRepository.update(media.id, {
                [statusField]: nextMediaStatus,
              });
            }

            return (
              changedSeasons.length > 0 ||
              changedSeasonRequests.length > 0 ||
              changedRequests.length > 0 ||
              media[statusField] !== nextMediaStatus
            );
          });
        },
        {
          requireExactAuthoritySet: true,
          includeCurrent: (server) =>
            server.syncEnabled && this.serverMatchesQuality(server, is4k),
        }
      )
    );
  }

  private async cleanupOrphanedShowsForQuality(
    is4k: boolean,
    didScan: boolean
  ): Promise<void> {
    const quality = is4k ? '4K ' : '';
    if (!didScan) {
      this.log(
        `Skipping orphaned ${quality}show cleanup: no ${quality}Sonarr servers were scanned.`,
        'info'
      );
      return;
    }
    if (this.hasShowScanFailures(is4k)) {
      this.log(
        `Skipping orphaned ${quality}show cleanup after an incomplete series lookup.`,
        'warn'
      );
      return;
    }

    const statusField = is4k ? 'status4k' : 'status';
    const where: FindOptionsWhere<Media>[] = [
      { mediaType: MediaType.TV, [statusField]: MediaStatus.PROCESSING },
      {
        mediaType: MediaType.TV,
        seasons: { [statusField]: MediaStatus.PROCESSING },
      },
      {
        mediaType: MediaType.TV,
        requests: { is4k, status: MediaRequestStatus.APPROVED },
      },
    ];
    const visitedMedia = new Set<number>();
    const scannedTvdbIds = is4k ? this.scanned4kTvdbIds : this.scannedTvdbIds;
    const scannedTmdbIds = is4k ? this.scanned4kTmdbIds : this.scannedTmdbIds;

    await forEachMediaCleanupBatch(
      where,
      async (media) => {
        if (visitedMedia.has(media.id)) return;
        visitedMedia.add(media.id);
        if (
          !media.tvdbId ||
          scannedTvdbIds.has(media.tvdbId) ||
          scannedTmdbIds.has(media.tmdbId)
        ) {
          return;
        }

        const changed = await this.settleOrphanedShow(media, is4k);
        if (changed) {
          this.log(
            `Settled ${quality.toLowerCase()}orphaned Sonarr state for show ${media.tmdbId} (tvdb: ${media.tvdbId}).`,
            'info'
          );
        }
      },
      { relations: { seasons: true, requests: { seasons: true } } }
    );
  }

  private async cleanupOrphanedShows(): Promise<void> {
    await this.cleanupOrphanedShowsForQuality(false, this.didScanStandard);
    if (this.enable4kShow) {
      await this.cleanupOrphanedShowsForQuality(true, this.didScan4k);
    }
  }
}

export const sonarrScanner = new SonarrScanner();
