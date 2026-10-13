import TheMovieDb from '@server/api/themoviedb';
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
import MediaRequest, {
  runWithRequestAdmission,
} from '@server/entity/MediaRequest';
import Season from '@server/entity/Season';
import SeasonRequest, {
  isActiveSeasonRequest,
} from '@server/entity/SeasonRequest';
import type { AudioPlaybackFormat } from '@server/lib/audioPlaybackFormat';
import {
  normalizeExternalBookId,
  normalizeMusicBrainzId,
} from '@server/lib/externalIds';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import AsyncLock from '@server/utils/asyncLock';
import { randomUUID } from 'crypto';
import type { Repository } from 'typeorm';

// Default scan rates (can be overidden)
const BUNDLE_SIZE = 20;
const UPDATE_RATE = 4 * 1000;

const dedupeIdentifierCandidates = (
  identifiers: {
    provider: MediaIdentifierProvider;
    value: string;
  }[]
) => {
  const seen = new Set<string>();

  return identifiers
    .map((identifier) => ({
      ...identifier,
      value: normalizeExternalBookId(identifier.value, identifier.provider),
    }))
    .filter((identifier) => {
      const key = `${identifier.provider}:${identifier.value}`;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
};

export type StatusBase = {
  running: boolean;
  progress: number;
  total: number;
};

export interface RunnableScanner<T> {
  run: () => Promise<void>;
  status: () => T & StatusBase;
}

export interface MediaIds {
  tmdbId: number;
  imdbId?: string;
  tvdbId?: number;
  isHama?: boolean;
}

export interface ProcessOptions {
  is4k?: boolean;
  mediaAddedAt?: Date;
  ratingKey?: string;
  jellyfinMediaId?: string;
  audioFormats?: AudioPlaybackFormat[];
  imdbId?: string;
  serviceId?: number;
  externalServiceId?: number;
  externalServiceSlug?: string;
  title?: string;
  processing?: boolean;
  hasFile?: boolean;
  deferStatusReset?: boolean;
  preserveInactiveServiceIdentity?: boolean;
  secondaryIdentifiers?: {
    provider: MediaIdentifierProvider;
    value: string;
  }[];
  bookServiceType?: 'ebook' | 'audiobook';
  audiobookLibrarySource?: { serviceId: number; itemId: string };
  comicServiceType?: 'mylar' | 'kapowarr' | 'backissue';
  mutationGuard?: <Result>(callback: () => Promise<Result>) => Promise<Result>;
  outerMutationGuard?: <Result>(
    callback: () => Promise<Result>
  ) => Promise<Result>;
}

export interface ProcessableSeason {
  seasonNumber: number;
  totalEpisodes: number;
  episodes: number;
  episodes4k: number;
  is4kOverride?: boolean;
  processing?: boolean;
}

class BaseScanner<T> {
  private bundleSize;
  private updateRate;
  protected progress = 0;
  protected items: T[] = [];
  protected totalSize?: number = 0;
  protected scannerName: string;
  protected enable4kMovie = false;
  protected enable4kShow = false;
  protected sessionId: string;
  protected running = false;
  readonly asyncLock = new AsyncLock();
  readonly tmdb = new TheMovieDb();
  private deferredMovieStatusResets = new Map<
    string,
    { tmdbId: number; is4k: boolean }
  >();
  private processingMovieKeys = new Set<string>();
  private failedMovieKeys = new Set<string>();
  private deferredSeasonStatusResets = new Map<
    string,
    {
      tmdbId: number;
      tvdbIds: Set<number>;
      is4k: boolean;
      seasonNumbers: Set<number>;
    }
  >();
  private processingSeasonKeys = new Set<string>();
  private failedShowKeys = new Set<string>();
  private failedShowTvdbKeys = new Set<string>();
  private failedShowProfiles = new Set<boolean>();

  private movieStatusKey(tmdbId: number, is4k: boolean): string {
    return `${tmdbId}:${is4k ? '4k' : 'standard'}`;
  }

  private seasonStatusKey(
    tmdbId: number,
    is4k: boolean,
    seasonNumber: number
  ): string {
    return `${this.movieStatusKey(tmdbId, is4k)}:${seasonNumber}`;
  }

  protected markMovieScanFailed(tmdbId: number, is4k: boolean): void {
    this.failedMovieKeys.add(this.movieStatusKey(tmdbId, is4k));
  }

  protected markShowScanFailed(
    tvdbId: number,
    is4k: boolean,
    tmdbId?: number
  ): void {
    this.failedShowProfiles.add(is4k);
    this.failedShowTvdbKeys.add(this.movieStatusKey(tvdbId, is4k));
    if (tmdbId !== undefined) {
      this.failedShowKeys.add(this.movieStatusKey(tmdbId, is4k));
    }
  }

  protected hasShowScanFailures(is4k: boolean): boolean {
    return this.failedShowProfiles.has(is4k);
  }

  protected async resolveDeferredMovieStatusResets(
    is4k: boolean,
    mutationGuard: <Result>(callback: () => Promise<Result>) => Promise<Result>
  ): Promise<void> {
    const statusField = is4k ? 'status4k' : 'status';

    for (const candidate of this.deferredMovieStatusResets.values()) {
      const key = this.movieStatusKey(candidate.tmdbId, is4k);
      if (
        candidate.is4k !== is4k ||
        this.processingMovieKeys.has(key) ||
        this.failedMovieKeys.has(key)
      ) {
        continue;
      }

      await runWithRequestAdmission(
        [`request-media:${MediaType.MOVIE}:${candidate.tmdbId}`],
        () =>
          this.asyncLock.dispatch(candidate.tmdbId, () =>
            mutationGuard(() =>
              dataSource.transaction(async (manager) => {
                const mediaRepository = manager.getRepository(Media);
                const requestRepository = manager.getRepository(MediaRequest);
                const media = await mediaRepository.findOne({
                  where: {
                    tmdbId: candidate.tmdbId,
                    mediaType: MediaType.MOVIE,
                  },
                  relations: { requests: true },
                });

                if (
                  !media ||
                  media[statusField] !== MediaStatus.PROCESSING ||
                  this.processingMovieKeys.has(key)
                ) {
                  return;
                }

                media[statusField] = MediaStatus.UNKNOWN;
                await mediaRepository.save(media);
                await this.declineOrphanedRequests(
                  media,
                  is4k,
                  requestRepository
                );
              })
            )
          )
      );
    }
  }

  protected async resolveDeferredSeasonStatusResets(
    is4k: boolean,
    mutationGuard: <Result>(callback: () => Promise<Result>) => Promise<Result>
  ): Promise<void> {
    const statusField = is4k ? 'status4k' : 'status';

    for (const candidate of this.deferredSeasonStatusResets.values()) {
      if (candidate.is4k !== is4k) continue;
      if (
        this.failedShowKeys.has(this.movieStatusKey(candidate.tmdbId, is4k)) ||
        [...candidate.tvdbIds].some((tvdbId) =>
          this.failedShowTvdbKeys.has(this.movieStatusKey(tvdbId, is4k))
        )
      ) {
        continue;
      }

      const staleSeasonNumbers = [...candidate.seasonNumbers].filter(
        (seasonNumber) =>
          !this.processingSeasonKeys.has(
            this.seasonStatusKey(candidate.tmdbId, is4k, seasonNumber)
          )
      );
      if (staleSeasonNumbers.length === 0) continue;

      await runWithRequestAdmission(
        [`request-media:${MediaType.TV}:${candidate.tmdbId}`],
        () =>
          this.asyncLock.dispatch(candidate.tmdbId, () =>
            mutationGuard(() =>
              dataSource.transaction(async (manager) => {
                const mediaRepository = manager.getRepository(Media);
                const seasonRepository = manager.getRepository(Season);
                const seasonRequestRepository =
                  manager.getRepository(SeasonRequest);
                const requestRepository = manager.getRepository(MediaRequest);
                const media = await mediaRepository.findOne({
                  where: {
                    tmdbId: candidate.tmdbId,
                    mediaType: MediaType.TV,
                  },
                  relations: { seasons: true, requests: { seasons: true } },
                });
                if (!media) return;

                const stale = new Set(staleSeasonNumbers);
                const changedSeasons = media.seasons.filter(
                  (season) =>
                    stale.has(season.seasonNumber) &&
                    season[statusField] === MediaStatus.PROCESSING
                );
                if (changedSeasons.length === 0) return;

                for (const season of changedSeasons) {
                  season[statusField] = MediaStatus.UNKNOWN;
                }

                const remainingKnownSeason = media.seasons.some(
                  (season) =>
                    season[statusField] === MediaStatus.PROCESSING ||
                    season[statusField] === MediaStatus.PARTIALLY_AVAILABLE ||
                    season[statusField] === MediaStatus.AVAILABLE
                );
                const resetAggregate =
                  media[statusField] === MediaStatus.PROCESSING &&
                  !remainingKnownSeason;

                const affectedNumbers = new Set(
                  changedSeasons.map((season) => season.seasonNumber)
                );
                const changedRequests: MediaRequest[] = [];
                const changedRequestSeasons: SeasonRequest[] = [];

                for (const request of media.requests ?? []) {
                  if (
                    request.is4k !== is4k ||
                    request.status !== MediaRequestStatus.APPROVED
                  ) {
                    continue;
                  }

                  let requestSelectionChanged = false;
                  for (const requestedSeason of request.seasons ?? []) {
                    if (
                      affectedNumbers.has(requestedSeason.seasonNumber) &&
                      requestedSeason.status !== MediaRequestStatus.DECLINED &&
                      requestedSeason.status !== MediaRequestStatus.COMPLETED &&
                      requestedSeason.status !== MediaRequestStatus.FAILED
                    ) {
                      requestedSeason.status = MediaRequestStatus.DECLINED;
                      changedRequestSeasons.push(requestedSeason);
                      requestSelectionChanged = true;
                    }
                  }

                  if (!requestSelectionChanged) continue;

                  const hasActiveSelection = (request.seasons ?? []).some(
                    (season) =>
                      isActiveSeasonRequest(season) &&
                      season.status !== MediaRequestStatus.COMPLETED &&
                      season.status !== MediaRequestStatus.FAILED
                  );
                  const hasCompletedSelection = (request.seasons ?? []).some(
                    (season) => season.status === MediaRequestStatus.COMPLETED
                  );

                  if (!hasActiveSelection) {
                    request.status = hasCompletedSelection
                      ? MediaRequestStatus.COMPLETED
                      : MediaRequestStatus.DECLINED;
                    changedRequests.push(request);
                  }
                }

                await seasonRepository.save(changedSeasons);
                if (resetAggregate) {
                  await mediaRepository.update(media.id, {
                    [statusField]: MediaStatus.UNKNOWN,
                  });
                }
                if (changedRequestSeasons.length > 0) {
                  await seasonRequestRepository.save(changedRequestSeasons);
                }
                if (changedRequests.length > 0) {
                  await requestRepository.save(changedRequests);
                }
              })
            )
          )
      );
    }
  }

  private runProcessMutation<Result>(
    guard: ProcessOptions['mutationGuard'],
    callback: () => Promise<Result>
  ): Promise<Result> {
    return guard ? guard(callback) : callback();
  }

  protected constructor(
    scannerName: string,
    {
      updateRate,
      bundleSize,
    }: {
      updateRate?: number;
      bundleSize?: number;
    } = {}
  ) {
    this.scannerName = scannerName;
    this.bundleSize = bundleSize ?? BUNDLE_SIZE;
    this.updateRate = updateRate ?? UPDATE_RATE;
  }

  private async getExisting(tmdbId: number, mediaType: MediaType) {
    const mediaRepository = getRepository(Media);

    const existing = await mediaRepository.findOne({
      where: { tmdbId: tmdbId, mediaType },
    });

    return existing;
  }

  protected async processMovie(
    tmdbId: number,
    {
      is4k = false,
      mediaAddedAt,
      ratingKey,
      jellyfinMediaId,
      imdbId,
      serviceId,
      externalServiceId,
      externalServiceSlug,
      processing = false,
      title = 'Unknown Title',
      hasFile = true,
      deferStatusReset = false,
      preserveInactiveServiceIdentity = false,
      mutationGuard,
      outerMutationGuard,
    }: ProcessOptions = {}
  ): Promise<void> {
    const mediaRepository = getRepository(Media);

    await this.runProcessMutation(outerMutationGuard, () =>
      runWithRequestAdmission(
        [`request-media:${MediaType.MOVIE}:${tmdbId}`],
        () =>
          this.asyncLock.dispatch(tmdbId, () =>
            this.runProcessMutation(mutationGuard, async () => {
              const existing = await this.getExisting(tmdbId, MediaType.MOVIE);

              if (existing) {
                let changedExisting = false;
                const statusField = is4k ? 'status4k' : 'status';
                const previousStatus = existing[statusField];

                if (deferStatusReset) {
                  const key = this.movieStatusKey(tmdbId, is4k);
                  if (processing) this.processingMovieKeys.add(key);
                  if (
                    !processing &&
                    !hasFile &&
                    previousStatus === MediaStatus.PROCESSING
                  ) {
                    this.deferredMovieStatusResets.set(key, { tmdbId, is4k });
                  }
                }

                if (previousStatus !== MediaStatus.AVAILABLE) {
                  existing[statusField] =
                    !processing && hasFile
                      ? MediaStatus.AVAILABLE
                      : !processing &&
                          !hasFile &&
                          previousStatus === MediaStatus.PROCESSING
                        ? deferStatusReset
                          ? MediaStatus.PROCESSING
                          : MediaStatus.UNKNOWN
                        : processing
                          ? previousStatus === MediaStatus.DELETED
                            ? MediaStatus.DELETED
                            : MediaStatus.PROCESSING
                          : previousStatus;

                  if (existing[statusField] !== previousStatus) {
                    if (mediaAddedAt) {
                      existing.mediaAddedAt = mediaAddedAt;
                    }
                    changedExisting = true;
                  }
                }

                if (
                  !changedExisting &&
                  !existing.mediaAddedAt &&
                  mediaAddedAt
                ) {
                  existing.mediaAddedAt = mediaAddedAt;
                  changedExisting = true;
                }

                if (
                  ratingKey &&
                  existing[is4k ? 'ratingKey4k' : 'ratingKey'] !== ratingKey
                ) {
                  existing[is4k ? 'ratingKey4k' : 'ratingKey'] = ratingKey;
                  changedExisting = true;
                }

                if (
                  jellyfinMediaId &&
                  existing[is4k ? 'jellyfinMediaId4k' : 'jellyfinMediaId'] !==
                    jellyfinMediaId
                ) {
                  existing[is4k ? 'jellyfinMediaId4k' : 'jellyfinMediaId'] =
                    jellyfinMediaId;
                  changedExisting = true;
                }

                if (imdbId && !existing.imdbId) {
                  existing.imdbId = imdbId;
                  changedExisting = true;
                }

                const mayUpdateServiceIdentity =
                  !preserveInactiveServiceIdentity || processing || hasFile;

                if (
                  serviceId !== undefined &&
                  mayUpdateServiceIdentity &&
                  existing[is4k ? 'serviceId4k' : 'serviceId'] !== serviceId
                ) {
                  existing[is4k ? 'serviceId4k' : 'serviceId'] = serviceId;
                  changedExisting = true;
                }

                if (
                  externalServiceId !== undefined &&
                  mayUpdateServiceIdentity &&
                  existing[
                    is4k ? 'externalServiceId4k' : 'externalServiceId'
                  ] !== externalServiceId
                ) {
                  existing[is4k ? 'externalServiceId4k' : 'externalServiceId'] =
                    externalServiceId;
                  changedExisting = true;
                }

                if (
                  externalServiceSlug !== undefined &&
                  mayUpdateServiceIdentity &&
                  existing[
                    is4k ? 'externalServiceSlug4k' : 'externalServiceSlug'
                  ] !== externalServiceSlug
                ) {
                  existing[
                    is4k ? 'externalServiceSlug4k' : 'externalServiceSlug'
                  ] = externalServiceSlug;
                  changedExisting = true;
                }

                if (changedExisting) {
                  await mediaRepository.save(existing);
                  this.log(
                    `Media for ${title} exists. Changes were detected and the title will be updated.`,
                    'info'
                  );
                } else {
                  this.log(
                    `Title already exists and no changes detected for ${title}`
                  );
                }
              } else {
                if (!processing && !hasFile) {
                  return;
                }

                const newMedia = new Media();
                newMedia.tmdbId = tmdbId;
                newMedia.imdbId = imdbId;

                newMedia.status =
                  !is4k && !processing
                    ? MediaStatus.AVAILABLE
                    : !is4k && processing
                      ? MediaStatus.PROCESSING
                      : MediaStatus.UNKNOWN;
                newMedia.status4k =
                  is4k && this.enable4kMovie && !processing
                    ? MediaStatus.AVAILABLE
                    : is4k && this.enable4kMovie && processing
                      ? MediaStatus.PROCESSING
                      : MediaStatus.UNKNOWN;
                newMedia.mediaType = MediaType.MOVIE;
                const mayUpdateServiceIdentity =
                  !preserveInactiveServiceIdentity || processing || hasFile;
                newMedia.serviceId =
                  !is4k && mayUpdateServiceIdentity ? serviceId : undefined;
                newMedia.serviceId4k =
                  is4k && mayUpdateServiceIdentity ? serviceId : undefined;
                newMedia.externalServiceId =
                  !is4k && mayUpdateServiceIdentity
                    ? externalServiceId
                    : undefined;
                newMedia.externalServiceId4k =
                  is4k && mayUpdateServiceIdentity
                    ? externalServiceId
                    : undefined;
                newMedia.externalServiceSlug =
                  !is4k && mayUpdateServiceIdentity
                    ? externalServiceSlug
                    : undefined;
                newMedia.externalServiceSlug4k =
                  is4k && mayUpdateServiceIdentity
                    ? externalServiceSlug
                    : undefined;

                if (mediaAddedAt) {
                  newMedia.mediaAddedAt = mediaAddedAt;
                }

                if (ratingKey) {
                  newMedia.ratingKey = !is4k ? ratingKey : undefined;
                  newMedia.ratingKey4k =
                    is4k && this.enable4kMovie ? ratingKey : undefined;
                }

                if (jellyfinMediaId) {
                  newMedia.jellyfinMediaId = !is4k
                    ? jellyfinMediaId
                    : undefined;
                  newMedia.jellyfinMediaId4k =
                    is4k && this.enable4kMovie ? jellyfinMediaId : undefined;
                }

                await mediaRepository.save(newMedia);
                this.log(`Saved new media: ${title}`);
              }
            })
          )
      )
    );
  }

  protected async processMusic(
    mbId: string,
    {
      mediaAddedAt,
      ratingKey,
      serviceId,
      externalServiceId,
      externalServiceSlug,
      jellyfinMediaId,
      audioFormats = [],
      processing = false,
      title = 'Unknown Album',
      hasFile = true,
      mutationGuard,
      outerMutationGuard,
    }: ProcessOptions = {}
  ): Promise<void> {
    const mediaRepository = getRepository(Media);
    const normalizedMbId = normalizeMusicBrainzId(mbId);

    await this.runProcessMutation(outerMutationGuard, () =>
      runWithRequestAdmission(
        [`request-canonical:music:${normalizedMbId}`],
        () =>
          this.asyncLock.dispatch(normalizedMbId, () =>
            this.runProcessMutation(mutationGuard, async () => {
              const existing = await mediaRepository.findOne({
                where: [
                  { mbId: normalizedMbId, mediaType: MediaType.MUSIC },
                  ...(serviceId !== undefined && externalServiceId !== undefined
                    ? [
                        {
                          serviceId,
                          externalServiceId,
                          mediaType: MediaType.MUSIC,
                        },
                      ]
                    : []),
                ],
              });

              if (existing) {
                let changedExisting = false;
                const previousStatus = existing.status;
                const isAvailableOnService = !processing && hasFile;

                existing.status =
                  !processing && hasFile
                    ? MediaStatus.AVAILABLE
                    : !processing &&
                        !hasFile &&
                        previousStatus === MediaStatus.PROCESSING
                      ? MediaStatus.UNKNOWN
                      : processing
                        ? previousStatus === MediaStatus.DELETED
                          ? MediaStatus.DELETED
                          : MediaStatus.PROCESSING
                        : previousStatus;

                if (existing.status !== previousStatus) {
                  changedExisting = true;
                  if (mediaAddedAt) {
                    existing.mediaAddedAt = mediaAddedAt;
                  }
                }

                if (!existing.mediaAddedAt && mediaAddedAt) {
                  existing.mediaAddedAt = mediaAddedAt;
                  changedExisting = true;
                }

                if (
                  serviceId !== undefined &&
                  existing.serviceId !== serviceId
                ) {
                  existing.serviceId = serviceId;
                  changedExisting = true;
                }

                if (serviceId !== undefined) {
                  const currentAvailableServiceIds =
                    existing.availableMusicServiceIds ?? [];
                  const nextAvailableServiceIds = isAvailableOnService
                    ? [...new Set([...currentAvailableServiceIds, serviceId])]
                    : currentAvailableServiceIds.filter(
                        (availableServiceId) => availableServiceId !== serviceId
                      );
                  if (
                    existing.availableMusicServiceIds === null ||
                    existing.availableMusicServiceIds === undefined ||
                    nextAvailableServiceIds.length !==
                      currentAvailableServiceIds.length ||
                    nextAvailableServiceIds.some(
                      (availableServiceId, index) =>
                        availableServiceId !== currentAvailableServiceIds[index]
                    )
                  ) {
                    existing.availableMusicServiceIds = nextAvailableServiceIds;
                    changedExisting = true;
                  }
                  if (
                    nextAvailableServiceIds.length > 0 &&
                    existing.status !== MediaStatus.AVAILABLE
                  ) {
                    existing.status = MediaStatus.AVAILABLE;
                    changedExisting = true;
                  }
                }

                if (
                  externalServiceId !== undefined &&
                  existing.externalServiceId !== externalServiceId
                ) {
                  existing.externalServiceId = externalServiceId;
                  changedExisting = true;
                }

                if (
                  externalServiceSlug !== undefined &&
                  existing.externalServiceSlug !== externalServiceSlug
                ) {
                  existing.externalServiceSlug = externalServiceSlug;
                  changedExisting = true;
                }

                if (
                  jellyfinMediaId !== undefined &&
                  existing.jellyfinMediaId !== jellyfinMediaId
                ) {
                  existing.jellyfinMediaId = jellyfinMediaId;
                  changedExisting = true;
                }

                if (
                  ratingKey !== undefined &&
                  existing.ratingKey !== ratingKey
                ) {
                  existing.ratingKey = ratingKey;
                  changedExisting = true;
                }

                if (
                  ratingKey !== undefined &&
                  audioFormats.includes('mp3') &&
                  existing.ratingKeyMp3 !== ratingKey
                ) {
                  existing.ratingKeyMp3 = ratingKey;
                  changedExisting = true;
                }
                if (
                  ratingKey !== undefined &&
                  audioFormats.includes('flac') &&
                  existing.ratingKeyFlac !== ratingKey
                ) {
                  existing.ratingKeyFlac = ratingKey;
                  changedExisting = true;
                }
                if (
                  jellyfinMediaId !== undefined &&
                  audioFormats.includes('mp3') &&
                  existing.jellyfinMediaIdMp3 !== jellyfinMediaId
                ) {
                  existing.jellyfinMediaIdMp3 = jellyfinMediaId;
                  changedExisting = true;
                }
                if (
                  jellyfinMediaId !== undefined &&
                  audioFormats.includes('flac') &&
                  existing.jellyfinMediaIdFlac !== jellyfinMediaId
                ) {
                  existing.jellyfinMediaIdFlac = jellyfinMediaId;
                  changedExisting = true;
                }

                if (changedExisting) {
                  await mediaRepository.save(existing);
                  this.log(`Updating existing album: ${title}`, 'info');
                }
              } else if (processing || hasFile) {
                await mediaRepository.save(
                  new Media({
                    tmdbId: 0,
                    mbId: normalizedMbId,
                    mediaType: MediaType.MUSIC,
                    mediaAddedAt,
                    ratingKey,
                    ratingKeyMp3:
                      ratingKey && audioFormats.includes('mp3')
                        ? ratingKey
                        : undefined,
                    ratingKeyFlac:
                      ratingKey && audioFormats.includes('flac')
                        ? ratingKey
                        : undefined,
                    serviceId,
                    availableMusicServiceIds:
                      serviceId !== undefined && !processing && hasFile
                        ? [serviceId]
                        : serviceId !== undefined
                          ? []
                          : undefined,
                    externalServiceId,
                    externalServiceSlug,
                    jellyfinMediaId,
                    jellyfinMediaIdMp3:
                      jellyfinMediaId && audioFormats.includes('mp3')
                        ? jellyfinMediaId
                        : undefined,
                    jellyfinMediaIdFlac:
                      jellyfinMediaId && audioFormats.includes('flac')
                        ? jellyfinMediaId
                        : undefined,
                    status:
                      !processing && hasFile
                        ? MediaStatus.AVAILABLE
                        : processing
                          ? MediaStatus.PROCESSING
                          : MediaStatus.UNKNOWN,
                    status4k: MediaStatus.UNKNOWN,
                  })
                );
                this.log(`Saved new album: ${title}`);
              }
            })
          )
      )
    );
  }

  protected async processBook(
    provider: MediaIdentifierProvider,
    value: string,
    {
      mediaAddedAt,
      ratingKey,
      serviceId,
      externalServiceId,
      externalServiceSlug,
      processing = false,
      title = 'Unknown Book',
      hasFile = true,
      secondaryIdentifiers = [],
      bookServiceType = 'ebook',
      audiobookLibrarySource,
      mutationGuard,
      outerMutationGuard,
    }: ProcessOptions = {}
  ): Promise<void> {
    const normalizedValue = normalizeExternalBookId(value, provider);
    const lockKey = `${provider}:${normalizedValue}`;
    const identifierCandidates = dedupeIdentifierCandidates([
      { provider, value: normalizedValue },
      ...secondaryIdentifiers,
    ]);

    await this.runProcessMutation(outerMutationGuard, () =>
      runWithRequestAdmission(
        identifierCandidates.map(
          (identifier) =>
            `request-canonical:book:${identifier.provider}:${identifier.value}`
        ),
        () =>
          this.asyncLock.dispatch(lockKey, () =>
            this.runProcessMutation(mutationGuard, () =>
              dataSource.transaction(async (manager) => {
                const mediaRepository = manager.getRepository(Media);
                const identifierRepository =
                  manager.getRepository(MediaIdentifier);
                const candidateKeys = new Set(
                  identifierCandidates.map(
                    (identifier) => `${identifier.provider}:${identifier.value}`
                  )
                );
                const existingIdentifiers = await identifierRepository.find({
                  where: identifierCandidates.map((identifier) => ({
                    provider: identifier.provider,
                    value: identifier.value,
                  })),
                  relations: { media: true },
                  order: { id: 'ASC' },
                });
                const orphanedIdentifiers = existingIdentifiers.filter(
                  (identifier) => !identifier.media
                );

                if (orphanedIdentifiers.length > 0) {
                  await identifierRepository.remove(orphanedIdentifiers);
                  this.log(
                    `Removed ${orphanedIdentifiers.length} orphaned identifier(s) while processing book: ${title}`,
                    'warn'
                  );
                }

                const linkedIdentifiers = existingIdentifiers.filter(
                  (identifier) => !!identifier.media
                );
                const existingIdentifier =
                  linkedIdentifiers.find(
                    (identifier) =>
                      identifier.provider === provider &&
                      identifier.value === normalizedValue &&
                      identifier.media.mediaType === MediaType.BOOK
                  ) ??
                  linkedIdentifiers.find(
                    (identifier) =>
                      identifier.media.mediaType === MediaType.BOOK
                  );
                const existing =
                  existingIdentifier?.media.mediaType === MediaType.BOOK
                    ? existingIdentifier.media
                    : undefined;

                if (existing) {
                  let changedExisting = false;
                  const previousStatus = existing.status;
                  const hasAvailableOtherBookFormat =
                    previousStatus === MediaStatus.AVAILABLE &&
                    processing &&
                    (bookServiceType === 'audiobook'
                      ? existing.serviceId != null &&
                        existing.externalServiceId != null
                      : (existing.audiobookServiceId != null &&
                          existing.audiobookExternalServiceId != null) ||
                        (existing.audiobookLibraryServiceId != null &&
                          existing.audiobookLibraryItemId != null));

                  existing.status =
                    !processing && hasFile
                      ? MediaStatus.AVAILABLE
                      : !processing &&
                          !hasFile &&
                          previousStatus === MediaStatus.PROCESSING
                        ? MediaStatus.UNKNOWN
                        : processing
                          ? hasAvailableOtherBookFormat
                            ? MediaStatus.AVAILABLE
                            : previousStatus === MediaStatus.DELETED
                              ? MediaStatus.DELETED
                              : MediaStatus.PROCESSING
                          : previousStatus;

                  if (existing.status !== previousStatus) {
                    changedExisting = true;
                    if (mediaAddedAt) {
                      existing.mediaAddedAt = mediaAddedAt;
                    }
                  }

                  if (!existing.mediaAddedAt && mediaAddedAt) {
                    existing.mediaAddedAt = mediaAddedAt;
                    changedExisting = true;
                  }

                  if (
                    bookServiceType === 'audiobook' &&
                    serviceId !== undefined &&
                    existing.audiobookServiceId !== serviceId
                  ) {
                    existing.audiobookServiceId = serviceId;
                    changedExisting = true;
                  } else if (
                    bookServiceType === 'ebook' &&
                    serviceId !== undefined &&
                    existing.serviceId !== serviceId
                  ) {
                    existing.serviceId = serviceId;
                    changedExisting = true;
                  }

                  if (
                    bookServiceType === 'audiobook' &&
                    externalServiceId !== undefined &&
                    existing.audiobookExternalServiceId !== externalServiceId
                  ) {
                    existing.audiobookExternalServiceId = externalServiceId;
                    changedExisting = true;
                  } else if (
                    bookServiceType === 'ebook' &&
                    externalServiceId !== undefined &&
                    existing.externalServiceId !== externalServiceId
                  ) {
                    existing.externalServiceId = externalServiceId;
                    changedExisting = true;
                  }

                  if (
                    bookServiceType === 'audiobook' &&
                    externalServiceSlug !== undefined &&
                    existing.audiobookExternalServiceSlug !==
                      externalServiceSlug
                  ) {
                    existing.audiobookExternalServiceSlug = externalServiceSlug;
                    changedExisting = true;
                  } else if (
                    bookServiceType === 'ebook' &&
                    externalServiceSlug !== undefined &&
                    existing.externalServiceSlug !== externalServiceSlug
                  ) {
                    existing.externalServiceSlug = externalServiceSlug;
                    changedExisting = true;
                  }

                  if (
                    audiobookLibrarySource &&
                    (existing.audiobookLibraryServiceId !==
                      audiobookLibrarySource.serviceId ||
                      existing.audiobookLibraryItemId !==
                        audiobookLibrarySource.itemId)
                  ) {
                    existing.audiobookLibraryServiceId =
                      audiobookLibrarySource.serviceId;
                    existing.audiobookLibraryItemId =
                      audiobookLibrarySource.itemId;
                    changedExisting = true;
                  }

                  if (
                    ratingKey !== undefined &&
                    existing.ratingKey !== ratingKey
                  ) {
                    existing.ratingKey = ratingKey;
                    changedExisting = true;
                  }

                  if (changedExisting) {
                    await mediaRepository.save(existing);
                    this.log(`Updating existing book: ${title}`, 'info');
                  }

                  const existingKeys = new Set(
                    (
                      await identifierRepository.find({
                        where: [
                          { media: { id: existing.id } },
                          ...identifierCandidates.map((identifier) => ({
                            provider: identifier.provider,
                            value: identifier.value,
                          })),
                        ],
                        relations: { media: true },
                      })
                    )
                      .filter(
                        (identifier) =>
                          !!identifier.media &&
                          (identifier.media.id !== existing.id ||
                            candidateKeys.has(
                              `${identifier.provider}:${identifier.value}`
                            ))
                      )
                      .map(
                        (identifier) =>
                          `${identifier.provider}:${identifier.value}`
                      )
                  );
                  const missingIdentifiers = identifierCandidates.filter(
                    (identifier) =>
                      !existingKeys.has(
                        `${identifier.provider}:${identifier.value}`
                      )
                  );

                  if (missingIdentifiers.length) {
                    await identifierRepository.save(
                      missingIdentifiers.map(
                        (identifier) =>
                          new MediaIdentifier({
                            media: existing,
                            provider: identifier.provider,
                            value: identifier.value,
                            canonical: false,
                          })
                      )
                    );
                  }
                } else if (processing || hasFile) {
                  const media = await mediaRepository.save(
                    new Media({
                      tmdbId: 0,
                      mediaType: MediaType.BOOK,
                      mediaAddedAt,
                      ratingKey,
                      serviceId:
                        bookServiceType === 'ebook' ? serviceId : undefined,
                      externalServiceId:
                        bookServiceType === 'ebook'
                          ? externalServiceId
                          : undefined,
                      externalServiceSlug:
                        bookServiceType === 'ebook'
                          ? externalServiceSlug
                          : undefined,
                      audiobookServiceId:
                        bookServiceType === 'audiobook' ? serviceId : undefined,
                      audiobookExternalServiceId:
                        bookServiceType === 'audiobook'
                          ? externalServiceId
                          : undefined,
                      audiobookExternalServiceSlug:
                        bookServiceType === 'audiobook'
                          ? externalServiceSlug
                          : undefined,
                      audiobookLibraryServiceId:
                        audiobookLibrarySource?.serviceId,
                      audiobookLibraryItemId: audiobookLibrarySource?.itemId,
                      status:
                        !processing && hasFile
                          ? MediaStatus.AVAILABLE
                          : processing
                            ? MediaStatus.PROCESSING
                            : MediaStatus.UNKNOWN,
                      status4k: MediaStatus.UNKNOWN,
                    })
                  );

                  await identifierRepository.save(
                    identifierCandidates.map(
                      (identifier, index) =>
                        new MediaIdentifier({
                          media,
                          provider: identifier.provider,
                          value: identifier.value,
                          canonical: index === 0,
                        })
                    )
                  );
                  this.log(`Saved new book: ${title}`);
                }
              })
            )
          )
      )
    );
  }

  /**
   * processComic mirrors processBook's identifier-based upsert but without
   * the dual-format complexity: a comic only ever has one canonical
   * identifier (its ComicVine volume ID) and one destination, so there's no
   * multi-identifier merging or ebook/audiobook branching to do.
   */
  protected async processComic(
    value: string,
    {
      mediaAddedAt,
      serviceId,
      externalServiceId,
      externalServiceSlug,
      processing = false,
      title = 'Unknown Comic',
      hasFile = true,
      comicServiceType = 'mylar',
      mutationGuard,
      outerMutationGuard,
    }: ProcessOptions = {}
  ): Promise<void> {
    const provider = MediaIdentifierProvider.COMICVINE;
    const lockKey = `${provider}:${value}`;

    await this.runProcessMutation(outerMutationGuard, () =>
      runWithRequestAdmission(
        [`request-canonical:comic:${provider}:${value}`],
        () =>
          this.asyncLock.dispatch(lockKey, () =>
            this.runProcessMutation(mutationGuard, () =>
              dataSource.transaction(async (manager) => {
                const mediaRepository = manager.getRepository(Media);
                const identifierRepository =
                  manager.getRepository(MediaIdentifier);

                const existingIdentifier = await identifierRepository.findOne({
                  where: { provider, value },
                  relations: { media: true },
                });
                const existing =
                  existingIdentifier?.media?.mediaType === MediaType.COMIC
                    ? existingIdentifier.media
                    : undefined;

                if (existing) {
                  let changedExisting = false;
                  const previousStatus = existing.status;

                  existing.status =
                    !processing && hasFile
                      ? MediaStatus.AVAILABLE
                      : !processing &&
                          !hasFile &&
                          previousStatus === MediaStatus.PROCESSING
                        ? MediaStatus.UNKNOWN
                        : processing
                          ? previousStatus === MediaStatus.DELETED
                            ? MediaStatus.DELETED
                            : MediaStatus.PROCESSING
                          : previousStatus;

                  if (existing.status !== previousStatus) {
                    changedExisting = true;
                    if (mediaAddedAt) {
                      existing.mediaAddedAt = mediaAddedAt;
                    }
                  }

                  if (!existing.mediaAddedAt && mediaAddedAt) {
                    existing.mediaAddedAt = mediaAddedAt;
                    changedExisting = true;
                  }

                  if (
                    serviceId !== undefined &&
                    existing.serviceId !== serviceId
                  ) {
                    existing.serviceId = serviceId;
                    changedExisting = true;
                  }

                  if (
                    externalServiceId !== undefined &&
                    existing.externalServiceId !== externalServiceId
                  ) {
                    existing.externalServiceId = externalServiceId;
                    changedExisting = true;
                  }

                  if (
                    externalServiceSlug !== undefined &&
                    existing.externalServiceSlug !== externalServiceSlug
                  ) {
                    existing.externalServiceSlug = externalServiceSlug;
                    changedExisting = true;
                  }

                  if (existing.comicServiceType !== comicServiceType) {
                    existing.comicServiceType = comicServiceType;
                    changedExisting = true;
                  }

                  if (changedExisting) {
                    await mediaRepository.save(existing);
                    this.log(`Updating existing comic: ${title}`, 'info');
                  }
                } else if (processing || hasFile) {
                  const media = await mediaRepository.save(
                    new Media({
                      tmdbId: 0,
                      mediaType: MediaType.COMIC,
                      mediaAddedAt,
                      serviceId,
                      externalServiceId,
                      externalServiceSlug,
                      comicServiceType,
                      status:
                        !processing && hasFile
                          ? MediaStatus.AVAILABLE
                          : processing
                            ? MediaStatus.PROCESSING
                            : MediaStatus.UNKNOWN,
                      status4k: MediaStatus.UNKNOWN,
                    })
                  );

                  await identifierRepository.save(
                    new MediaIdentifier({
                      media,
                      provider,
                      value,
                      canonical: true,
                    })
                  );
                  this.log(`Saved new comic: ${title}`);
                }
              })
            )
          )
      )
    );
  }

  protected async processMagazine(
    value: string,
    {
      mediaAddedAt,
      serviceId,
      externalServiceId,
      externalServiceSlug,
      processing = false,
      title = 'Unknown Magazine',
      hasFile = true,
      mutationGuard,
      outerMutationGuard,
    }: ProcessOptions = {}
  ): Promise<void> {
    const provider = MediaIdentifierProvider.LAZYLIBRARIAN;
    const lockKey = `${provider}:${value}`;

    await this.runProcessMutation(outerMutationGuard, () =>
      runWithRequestAdmission(
        [`request-canonical:magazine:${provider}:${value}`],
        () =>
          this.asyncLock.dispatch(lockKey, () =>
            this.runProcessMutation(mutationGuard, () =>
              dataSource.transaction(async (manager) => {
                const mediaRepository = manager.getRepository(Media);
                const identifierRepository =
                  manager.getRepository(MediaIdentifier);
                const existingIdentifier = await identifierRepository.findOne({
                  where: { provider, value },
                  relations: { media: true },
                });
                const existing =
                  existingIdentifier?.media?.mediaType === MediaType.MAGAZINE
                    ? existingIdentifier.media
                    : undefined;

                if (existing) {
                  let changed = false;
                  const previousStatus = existing.status;
                  existing.status = hasFile
                    ? MediaStatus.AVAILABLE
                    : processing
                      ? previousStatus === MediaStatus.DELETED
                        ? MediaStatus.DELETED
                        : MediaStatus.PROCESSING
                      : previousStatus === MediaStatus.AVAILABLE
                        ? MediaStatus.UNKNOWN
                        : previousStatus;
                  if (existing.status !== previousStatus) changed = true;
                  if (mediaAddedAt && !existing.mediaAddedAt) {
                    existing.mediaAddedAt = mediaAddedAt;
                    changed = true;
                  }
                  if (
                    serviceId !== undefined &&
                    existing.serviceId !== serviceId
                  ) {
                    existing.serviceId = serviceId;
                    changed = true;
                  }
                  if (
                    externalServiceId !== undefined &&
                    existing.externalServiceId !== externalServiceId
                  ) {
                    existing.externalServiceId = externalServiceId;
                    changed = true;
                  }
                  if (
                    externalServiceSlug !== undefined &&
                    existing.externalServiceSlug !== externalServiceSlug
                  ) {
                    existing.externalServiceSlug = externalServiceSlug;
                    changed = true;
                  }
                  if (changed) {
                    await mediaRepository.save(existing);
                    this.log(`Updating existing magazine: ${title}`);
                  }
                } else if (processing || hasFile) {
                  const media = await mediaRepository.save(
                    new Media({
                      tmdbId: 0,
                      mediaType: MediaType.MAGAZINE,
                      mediaAddedAt,
                      serviceId,
                      externalServiceId,
                      externalServiceSlug,
                      status: hasFile
                        ? MediaStatus.AVAILABLE
                        : MediaStatus.PROCESSING,
                      status4k: MediaStatus.UNKNOWN,
                    })
                  );
                  await identifierRepository.save(
                    new MediaIdentifier({
                      media,
                      provider,
                      value,
                      canonical: true,
                    })
                  );
                  this.log(`Saved new magazine: ${title}`);
                }
              })
            )
          )
      )
    );
  }

  /**
   * processShow takes a TMDB ID and an array of ProcessableSeasons, which
   * should include the total episodes a sesaon has + the total available
   * episodes that each season currently has. Unlike processMovie, this method
   * does not take an `is4k` option. We handle both the 4k _and_ non 4k status
   * in one method.
   *
   * Note: If 4k is not enable, ProcessableSeasons should combine their episode counts
   * into the normal episodes properties and avoid using the 4k properties.
   */
  protected async processShow(
    tmdbId: number,
    tvdbId: number | undefined,
    seasons: ProcessableSeason[],
    {
      mediaAddedAt,
      ratingKey,
      jellyfinMediaId,
      serviceId,
      externalServiceId,
      externalServiceSlug,
      is4k = false,
      title = 'Unknown Title',
      deferStatusReset = false,
      preserveInactiveServiceIdentity = false,
      mutationGuard,
      outerMutationGuard,
    }: ProcessOptions = {}
  ): Promise<void> {
    const mediaRepository = getRepository(Media);

    await this.runProcessMutation(outerMutationGuard, () =>
      runWithRequestAdmission([`request-media:${MediaType.TV}:${tmdbId}`], () =>
        this.asyncLock.dispatch(tmdbId, () =>
          this.runProcessMutation(mutationGuard, async () => {
            const media = await this.getExisting(tmdbId, MediaType.TV);

            const newSeasons: Season[] = [];

            const currentStandardSeasonsAvailable = (
              media?.seasons.filter(
                (season) => season.status === MediaStatus.AVAILABLE
              ) ?? []
            ).length;

            const current4kSeasonsAvailable = (
              media?.seasons.filter(
                (season) => season.status4k === MediaStatus.AVAILABLE
              ) ?? []
            ).length;

            for (const season of seasons) {
              const existingSeason = media?.seasons.find(
                (es) => es.seasonNumber === season.seasonNumber
              );

              // We update the rating keys and jellyfinMediaId in the seasons loop because we need episode counts
              if (
                media &&
                season.episodes > 0 &&
                media.ratingKey !== ratingKey
              ) {
                media.ratingKey = ratingKey;
              }

              if (
                media &&
                season.episodes4k > 0 &&
                this.enable4kShow &&
                media.ratingKey4k !== ratingKey
              ) {
                media.ratingKey4k = ratingKey;
              }

              if (
                media &&
                season.episodes > 0 &&
                media.jellyfinMediaId !== jellyfinMediaId
              ) {
                media.jellyfinMediaId = jellyfinMediaId;
              }

              if (
                media &&
                season.episodes4k > 0 &&
                this.enable4kShow &&
                media.jellyfinMediaId4k !== jellyfinMediaId
              ) {
                media.jellyfinMediaId4k = jellyfinMediaId;
              }

              if (existingSeason) {
                // Here we update seasons if they already exist.
                // If the season is already marked as available, we
                // force it to stay available (to avoid competing scanners)
                if (deferStatusReset) {
                  if (season.is4kOverride && season.processing) {
                    this.processingSeasonKeys.add(
                      this.seasonStatusKey(tmdbId, true, season.seasonNumber)
                    );
                  } else if (!season.is4kOverride && season.processing) {
                    this.processingSeasonKeys.add(
                      this.seasonStatusKey(tmdbId, false, season.seasonNumber)
                    );
                  }

                  if (
                    !season.is4kOverride &&
                    !season.processing &&
                    season.episodes === 0 &&
                    existingSeason.status === MediaStatus.PROCESSING
                  ) {
                    const key = this.movieStatusKey(tmdbId, false);
                    const candidate = this.deferredSeasonStatusResets.get(
                      key
                    ) ?? {
                      tmdbId,
                      tvdbIds: new Set<number>(),
                      is4k: false,
                      seasonNumbers: new Set<number>(),
                    };
                    if (tvdbId !== undefined) {
                      candidate.tvdbIds.add(tvdbId);
                    }
                    candidate.seasonNumbers.add(season.seasonNumber);
                    this.deferredSeasonStatusResets.set(key, candidate);
                  }

                  if (
                    season.is4kOverride &&
                    !season.processing &&
                    season.episodes4k === 0 &&
                    existingSeason.status4k === MediaStatus.PROCESSING
                  ) {
                    const key = this.movieStatusKey(tmdbId, true);
                    const candidate = this.deferredSeasonStatusResets.get(
                      key
                    ) ?? {
                      tmdbId,
                      tvdbIds: new Set<number>(),
                      is4k: true,
                      seasonNumbers: new Set<number>(),
                    };
                    if (tvdbId !== undefined) {
                      candidate.tvdbIds.add(tvdbId);
                    }
                    candidate.seasonNumbers.add(season.seasonNumber);
                    this.deferredSeasonStatusResets.set(key, candidate);
                  }
                }

                existingSeason.status =
                  (season.totalEpisodes === season.episodes &&
                    season.episodes > 0) ||
                  existingSeason.status === MediaStatus.AVAILABLE
                    ? MediaStatus.AVAILABLE
                    : season.episodes > 0
                      ? MediaStatus.PARTIALLY_AVAILABLE
                      : !season.is4kOverride &&
                          season.processing &&
                          existingSeason.status !== MediaStatus.DELETED
                        ? MediaStatus.PROCESSING
                        : !season.is4kOverride &&
                            !season.processing &&
                            season.episodes === 0 &&
                            existingSeason.status === MediaStatus.PROCESSING
                          ? deferStatusReset
                            ? MediaStatus.PROCESSING
                            : MediaStatus.UNKNOWN
                          : existingSeason.status;

                // Same thing here, except we only do updates if 4k is enabled
                existingSeason.status4k =
                  (this.enable4kShow &&
                    season.episodes4k === season.totalEpisodes &&
                    season.episodes4k > 0) ||
                  existingSeason.status4k === MediaStatus.AVAILABLE
                    ? MediaStatus.AVAILABLE
                    : this.enable4kShow && season.episodes4k > 0
                      ? MediaStatus.PARTIALLY_AVAILABLE
                      : season.is4kOverride &&
                          season.processing &&
                          existingSeason.status4k !== MediaStatus.DELETED
                        ? MediaStatus.PROCESSING
                        : season.is4kOverride &&
                            !season.processing &&
                            season.episodes4k === 0 &&
                            existingSeason.status4k === MediaStatus.PROCESSING
                          ? deferStatusReset
                            ? MediaStatus.PROCESSING
                            : MediaStatus.UNKNOWN
                          : existingSeason.status4k;
              } else {
                newSeasons.push(
                  new Season({
                    seasonNumber: season.seasonNumber,
                    status:
                      season.totalEpisodes === season.episodes &&
                      season.episodes > 0
                        ? MediaStatus.AVAILABLE
                        : season.episodes > 0
                          ? MediaStatus.PARTIALLY_AVAILABLE
                          : !season.is4kOverride && season.processing
                            ? MediaStatus.PROCESSING
                            : MediaStatus.UNKNOWN,
                    status4k:
                      this.enable4kShow &&
                      season.totalEpisodes === season.episodes4k &&
                      season.episodes4k > 0
                        ? MediaStatus.AVAILABLE
                        : this.enable4kShow && season.episodes4k > 0
                          ? MediaStatus.PARTIALLY_AVAILABLE
                          : season.is4kOverride && season.processing
                            ? MediaStatus.PROCESSING
                            : MediaStatus.UNKNOWN,
                  })
                );
              }
            }

            const hasQualityActivity = seasons.some((season) =>
              is4k
                ? season.is4kOverride &&
                  (season.processing || season.episodes4k > 0)
                : !season.is4kOverride &&
                  (season.processing || season.episodes > 0)
            );
            const mayUpdateServiceIdentity =
              !preserveInactiveServiceIdentity || hasQualityActivity;

            if (media) {
              media.seasons = [...media.seasons, ...newSeasons];

              const newStandardSeasonsAvailable = (
                media.seasons.filter(
                  (season) => season.status === MediaStatus.AVAILABLE
                ) ?? []
              ).length;

              const new4kSeasonsAvailable = (
                media.seasons.filter(
                  (season) => season.status4k === MediaStatus.AVAILABLE
                ) ?? []
              ).length;

              // If at least one new season has become available, update
              // the lastSeasonChange field so we can trigger notifications
              if (
                newStandardSeasonsAvailable > currentStandardSeasonsAvailable
              ) {
                this.log(
                  `Detected ${
                    newStandardSeasonsAvailable -
                    currentStandardSeasonsAvailable
                  } new standard season(s) for ${title}`,
                  'debug'
                );
                media.lastSeasonChange = new Date();

                if (mediaAddedAt) {
                  media.mediaAddedAt = mediaAddedAt;
                }
              }

              if (new4kSeasonsAvailable > current4kSeasonsAvailable) {
                this.log(
                  `Detected ${
                    new4kSeasonsAvailable - current4kSeasonsAvailable
                  } new 4K season(s) for ${title}`,
                  'debug'
                );
                media.lastSeasonChange = new Date();
              }

              if (!media.mediaAddedAt && mediaAddedAt) {
                media.mediaAddedAt = mediaAddedAt;
              }

              if (serviceId !== undefined && mayUpdateServiceIdentity) {
                media[is4k ? 'serviceId4k' : 'serviceId'] = serviceId;
              }

              if (externalServiceId !== undefined && mayUpdateServiceIdentity) {
                media[is4k ? 'externalServiceId4k' : 'externalServiceId'] =
                  externalServiceId;
              }

              if (
                externalServiceSlug !== undefined &&
                mayUpdateServiceIdentity
              ) {
                media[is4k ? 'externalServiceSlug4k' : 'externalServiceSlug'] =
                  externalServiceSlug;
              }

              const nonSpecialSeasons = media.seasons.filter(
                (s) => s.seasonNumber !== 0
              );

              // DB-only seasons block the rollup unless UNKNOWN (orphan
              // placeholders can never be revisited by a scan and would pin
              // the show forever). TMDB seasons with no announced episodes
              // (empty placeholders) never count toward the rollup either.
              const countsTowardsRollup = (
                s: Season,
                statusKey: 'status' | 'status4k'
              ): boolean => {
                const scannedSeason = seasons.find(
                  (season) => season.seasonNumber === s.seasonNumber
                );

                if (scannedSeason) {
                  return scannedSeason.totalEpisodes > 0;
                }

                return s[statusKey] !== MediaStatus.UNKNOWN;
              };

              const standardSeasonsForRollup = nonSpecialSeasons.filter((s) =>
                countsTowardsRollup(s, 'status')
              );
              const isAllStandardSeasonsAvailable =
                standardSeasonsForRollup.length > 0 &&
                standardSeasonsForRollup.every(
                  (s) => s.status === MediaStatus.AVAILABLE
                );

              const seasons4kForRollup = nonSpecialSeasons.filter((s) =>
                countsTowardsRollup(s, 'status4k')
              );
              const isAll4kSeasonsAvailable =
                seasons4kForRollup.length > 0 &&
                seasons4kForRollup.every(
                  (s) => s.status4k === MediaStatus.AVAILABLE
                );

              media.status = isAllStandardSeasonsAvailable
                ? MediaStatus.AVAILABLE
                : media.seasons.some(
                      (season) =>
                        season.status === MediaStatus.PARTIALLY_AVAILABLE ||
                        season.status === MediaStatus.AVAILABLE
                    )
                  ? MediaStatus.PARTIALLY_AVAILABLE
                  : (!seasons.length && media.status !== MediaStatus.DELETED) ||
                      media.seasons.some(
                        (season) => season.status === MediaStatus.PROCESSING
                      )
                    ? MediaStatus.PROCESSING
                    : media.status === MediaStatus.DELETED
                      ? MediaStatus.DELETED
                      : MediaStatus.UNKNOWN;
              media.status4k =
                isAll4kSeasonsAvailable && this.enable4kShow
                  ? MediaStatus.AVAILABLE
                  : this.enable4kShow &&
                      media.seasons.some(
                        (season) =>
                          season.status4k === MediaStatus.PARTIALLY_AVAILABLE ||
                          season.status4k === MediaStatus.AVAILABLE
                      )
                    ? MediaStatus.PARTIALLY_AVAILABLE
                    : (!seasons.length &&
                          media.status4k !== MediaStatus.DELETED) ||
                        media.seasons.some(
                          (season) => season.status4k === MediaStatus.PROCESSING
                        )
                      ? MediaStatus.PROCESSING
                      : media.status4k === MediaStatus.DELETED
                        ? MediaStatus.DELETED
                        : MediaStatus.UNKNOWN;
              await mediaRepository.save(media);
              this.log(`Updating existing title: ${title}`);
            } else {
              // For new media, check actual newSeasons objects instead of scanner
              // input to determine overall availability status
              const nonSpecialNewSeasons = newSeasons.filter(
                (s) => s.seasonNumber !== 0
              );

              // Empty TMDB placeholder seasons (no announced episodes) never
              // count toward the rollup.
              const newSeasonsForRollup = nonSpecialNewSeasons.filter(
                (s) =>
                  (seasons.find(
                    (season) => season.seasonNumber === s.seasonNumber
                  )?.totalEpisodes ?? 0) > 0
              );
              const isAllStandardSeasonsAvailable =
                newSeasonsForRollup.length > 0 &&
                newSeasonsForRollup.every(
                  (s) => s.status === MediaStatus.AVAILABLE
                );

              const isAll4kSeasonsAvailable =
                newSeasonsForRollup.length > 0 &&
                newSeasonsForRollup.every(
                  (s) => s.status4k === MediaStatus.AVAILABLE
                );

              const newMedia = new Media({
                mediaType: MediaType.TV,
                seasons: newSeasons,
                tmdbId,
                tvdbId,
                mediaAddedAt,
                serviceId:
                  !is4k && mayUpdateServiceIdentity ? serviceId : undefined,
                serviceId4k:
                  is4k && mayUpdateServiceIdentity ? serviceId : undefined,
                externalServiceId:
                  !is4k && mayUpdateServiceIdentity
                    ? externalServiceId
                    : undefined,
                externalServiceId4k:
                  is4k && mayUpdateServiceIdentity
                    ? externalServiceId
                    : undefined,
                externalServiceSlug:
                  !is4k && mayUpdateServiceIdentity
                    ? externalServiceSlug
                    : undefined,
                externalServiceSlug4k:
                  is4k && mayUpdateServiceIdentity
                    ? externalServiceSlug
                    : undefined,
                ratingKey: newSeasons.some(
                  (sn) =>
                    sn.status === MediaStatus.PARTIALLY_AVAILABLE ||
                    sn.status === MediaStatus.AVAILABLE
                )
                  ? ratingKey
                  : undefined,
                ratingKey4k:
                  this.enable4kShow &&
                  newSeasons.some(
                    (sn) =>
                      sn.status4k === MediaStatus.PARTIALLY_AVAILABLE ||
                      sn.status4k === MediaStatus.AVAILABLE
                  )
                    ? ratingKey
                    : undefined,
                jellyfinMediaId: newSeasons.some(
                  (sn) =>
                    sn.status === MediaStatus.PARTIALLY_AVAILABLE ||
                    sn.status === MediaStatus.AVAILABLE
                )
                  ? jellyfinMediaId
                  : undefined,
                jellyfinMediaId4k:
                  this.enable4kShow &&
                  newSeasons.some(
                    (sn) =>
                      sn.status4k === MediaStatus.PARTIALLY_AVAILABLE ||
                      sn.status4k === MediaStatus.AVAILABLE
                  )
                    ? jellyfinMediaId
                    : undefined,
                status: isAllStandardSeasonsAvailable
                  ? MediaStatus.AVAILABLE
                  : newSeasons.some(
                        (season) =>
                          season.status === MediaStatus.PARTIALLY_AVAILABLE ||
                          season.status === MediaStatus.AVAILABLE
                      )
                    ? MediaStatus.PARTIALLY_AVAILABLE
                    : newSeasons.some(
                          (season) => season.status === MediaStatus.PROCESSING
                        )
                      ? MediaStatus.PROCESSING
                      : MediaStatus.UNKNOWN,
                status4k:
                  isAll4kSeasonsAvailable && this.enable4kShow
                    ? MediaStatus.AVAILABLE
                    : this.enable4kShow &&
                        newSeasons.some(
                          (season) =>
                            season.status4k ===
                              MediaStatus.PARTIALLY_AVAILABLE ||
                            season.status4k === MediaStatus.AVAILABLE
                        )
                      ? MediaStatus.PARTIALLY_AVAILABLE
                      : newSeasons.some(
                            (season) =>
                              season.status4k === MediaStatus.PROCESSING
                          )
                        ? MediaStatus.PROCESSING
                        : MediaStatus.UNKNOWN,
              });
              await mediaRepository.save(newMedia);
              this.log(`Saved ${title}`);
            }
          })
        )
      )
    );
  }

  /**
   * Declines APPROVED requests bound to media that has been orphaned before completion.
   * DECLINED clears the duplicate-request guard so the user can re-request it.
   * Callers must load the requests relation on the media.
   */
  protected async declineOrphanedRequests(
    media: Media,
    is4k: boolean,
    requestRepository: Repository<MediaRequest> = getRepository(MediaRequest)
  ): Promise<void> {
    if (media.requests === undefined) {
      throw new Error(
        `declineOrphanedRequests called for media ${media.id} without the 'requests' relation loaded`
      );
    }
    const orphanedRequests = (media.requests ?? []).filter(
      (request) =>
        request.is4k === is4k && request.status === MediaRequestStatus.APPROVED
    );

    for (const request of orphanedRequests) {
      request.status = MediaRequestStatus.DECLINED;
      // Ensure that the media relation is set so the AfterUpdate
      // notification hook can resolve it
      request.media = media;
      await requestRepository.save(request);
      this.log(
        `Declined orphaned ${
          media.mediaType === MediaType.MOVIE ? 'movie' : 'series'
        } request ${request.id} for ${media.tmdbId} not found in any Sonarr/Radarr server.`,
        'info'
      );
    }
  }

  /**
   * Call startRun from child class whenever a run is starting to
   * ensure required values are set
   *
   * Returns the session ID which is requried for the cleanup method
   */
  protected startRun(): string | undefined {
    if (this.running) {
      this.log(
        'Scan already running. Skipping overlapping invocation.',
        'warn'
      );
      return;
    }

    const settings = getSettings();
    const sessionId = randomUUID();
    this.sessionId = sessionId;
    this.deferredMovieStatusResets.clear();
    this.processingMovieKeys.clear();
    this.failedMovieKeys.clear();
    this.deferredSeasonStatusResets.clear();
    this.processingSeasonKeys.clear();
    this.failedShowKeys.clear();
    this.failedShowTvdbKeys.clear();
    this.failedShowProfiles.clear();

    this.log('Scan starting', 'info', { sessionId });

    this.enable4kMovie = settings.radarr.some((radarr) => radarr.is4k);
    if (this.enable4kMovie) {
      this.log(
        'At least one 4K Radarr server was detected. 4K movie detection is now enabled',
        'info'
      );
    }

    this.enable4kShow = settings.sonarr.some((sonarr) => sonarr.is4k);
    if (this.enable4kShow) {
      this.log(
        'At least one 4K Sonarr server was detected. 4K series detection is now enabled',
        'info'
      );
    }

    this.running = true;

    return sessionId;
  }

  /**
   * Call at end of run loop to perform cleanup
   */
  protected endRun(sessionId: string): void {
    if (this.sessionId === sessionId) {
      this.running = false;
    }
  }

  public cancel(): void {
    this.running = false;
  }

  protected async loop(
    processFn: (item: T) => Promise<void>,
    {
      start = 0,
      end = this.bundleSize,
      sessionId,
      updateRate = this.updateRate,
    }: {
      start?: number;
      end?: number;
      sessionId?: string;
      updateRate?: number;
    } = {}
  ): Promise<void> {
    const slicedItems = this.items.slice(start, end);

    if (!this.running) {
      throw new Error('Sync was aborted.');
    }

    if (this.sessionId !== sessionId) {
      throw new Error('New session was started. Old session aborted.');
    }

    if (start < this.items.length) {
      this.progress = start;
      await this.processItems(processFn, slicedItems);

      await new Promise<void>((resolve, reject) =>
        setTimeout(() => {
          this.loop(processFn, {
            start: start + this.bundleSize,
            end: end + this.bundleSize,
            sessionId,
            updateRate,
          })
            .then(() => resolve())
            .catch((e) => reject(new Error(e.message)));
        }, updateRate)
      );
    }
  }

  private async processItems(
    processFn: (items: T) => Promise<void>,
    items: T[]
  ) {
    await Promise.all(
      items.map(async (item) => {
        await processFn(item);
      })
    );
  }

  protected log(
    message: string,
    level: 'info' | 'error' | 'debug' | 'warn' = 'debug',
    optional?: Record<string, unknown>
  ): void {
    logger[level](message, { label: this.scannerName, ...optional });
  }

  get protectedUpdateRate(): number {
    return this.updateRate;
  }

  get protectedBundleSize(): number {
    return this.bundleSize;
  }
}

export default BaseScanner;
