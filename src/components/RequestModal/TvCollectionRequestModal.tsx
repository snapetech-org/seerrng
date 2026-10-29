import CollectionSummaryCard from '@app/components/CollectionDetails/CollectionSummaryCard';
import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import Modal from '@app/components/Common/Modal';
import SelectionCircle from '@app/components/Common/SelectionCircle';
import AvailabilityValue from '@app/components/MediaDetails/AvailabilityValue';
import MediaQualitySelect from '@app/components/MediaDetails/MediaQualitySelect';
import AdvancedOptionsDisclosureButton from '@app/components/RequestModal/AdvancedOptionsDisclosureButton';
import type { RequestOverrides } from '@app/components/RequestModal/AdvancedRequester';
import AdvancedRequester from '@app/components/RequestModal/AdvancedRequester';
import QuotaDisplay from '@app/components/RequestModal/QuotaDisplay';
import RequestMediaCard from '@app/components/RequestModal/RequestMediaCard';
import VideoCollectionRequestFilters, {
  EMPTY_VIDEO_COLLECTION_FILTERS,
  matchesVideoCollectionFilters,
  type VideoCollectionFilters,
} from '@app/components/RequestModal/VideoCollectionRequestFilters';
import useAdvancedOptionsDisclosure from '@app/hooks/useAdvancedOptionsDisclosure';
import useSettings from '@app/hooks/useSettings';
import useToasts from '@app/hooks/useToasts';
import { useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import { mapWithConcurrency } from '@app/utils/concurrency';
import defineMessages from '@app/utils/defineMessages';
import { getTmdbPosterImageUrl } from '@app/utils/imageCache';
import {
  getAvailableEpisodesBySeason,
  getRequestableTvSelections,
  isActiveSeasonRequest,
  mergeEpisodeNumbersBySeason,
} from '@app/utils/tvRequestSelection';
import { Transition } from '@headlessui/react';
import { ArrowDownTrayIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { MediaRequestStatus, MediaStatus } from '@server/constants/media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import type { SeasonEpisodeSelection } from '@server/interfaces/api/seasonInterfaces';
import type { QuotaResponse } from '@server/interfaces/api/userInterfaces';
import { Permission } from '@server/lib/permissions';
import type {
  CuratedCollection,
  CuratedCollectionMember,
} from '@server/models/CuratedCollection';
import type { PlaybackCatalogResponse } from '@server/models/Playback';
import type { TvDetails } from '@server/models/Tv';
import axios from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR, { mutate } from 'swr';

const messages = defineMessages('components.TvCollectionRequestModal', {
  requestSuccess: '<strong>{title}</strong> requested successfully!',
  requestcollectiontitle: 'Request Collection',
  requestcollection4ktitle: 'Request Collection in 4K',
  requesterror: 'Something went wrong while submitting the request.',
  requestpartial: '{created} requested; {failed} failed.',
  selectItemsToRequest: 'Select at least one series to request.',
  selection: 'Select this series to request',
  selectAll: 'Select every series that is ready to request',
  advancedOptions: 'Advanced Options',
  quality: 'Quality',
  hd: 'HD',
  ultraHd: '4K',
  requested: 'Requested',
  available: 'Available',
  partiallyAvailable: 'Partially Available',
  processing: 'Processing',
  blocklisted: 'Blocklisted',
  notAvailable: 'Not Available',
  quotaRestricted: 'The selected user cannot make more series requests.',
  detailsUnavailable: 'Series request details could not be loaded.',
  missingTvdb:
    'This series needs an individual request to select its TVDB match.',
});

const activeRequest = (status: MediaRequestStatus) =>
  status !== MediaRequestStatus.DECLINED &&
  status !== MediaRequestStatus.FAILED &&
  status !== MediaRequestStatus.COMPLETED;

const requestableSelections = (
  detail: TvDetails | undefined,
  is4k: boolean,
  includeSpecials: boolean,
  catalog?: PlaybackCatalogResponse
): SeasonEpisodeSelection[] => {
  if (!detail?.externalIds.tvdbId) return [];
  const seasons = detail.seasons.filter(
    (season) =>
      season.episodeCount > 0 && (includeSpecials || season.seasonNumber > 0)
  );
  const requests = (detail.mediaInfo?.requests ?? []).filter(
    (request) => request.is4k === is4k && activeRequest(request.status)
  );
  const coveredSeasons = seasons
    .filter((season) => {
      const mediaSeason = detail.mediaInfo?.seasons?.find(
        (existing) => existing.seasonNumber === season.seasonNumber
      );
      const status = mediaSeason?.[is4k ? 'status4k' : 'status'];
      return (
        status === MediaStatus.AVAILABLE ||
        status === MediaStatus.PROCESSING ||
        status === MediaStatus.BLOCKLISTED ||
        requests.some((request) =>
          request.seasons.some(
            (requested) =>
              isActiveSeasonRequest(requested) &&
              requested.seasonNumber === season.seasonNumber &&
              requested.episodeNumbers == null
          )
        )
      );
    })
    .map((season) => season.seasonNumber);
  const pendingEpisodes: Record<number, number[]> = {};
  requests
    .flatMap((request) => request.seasons.filter(isActiveSeasonRequest))
    .forEach((season) => {
      if (season.episodeNumbers) {
        pendingEpisodes[season.seasonNumber] = [
          ...new Set([
            ...(pendingEpisodes[season.seasonNumber] ?? []),
            ...season.episodeNumbers,
          ]),
        ];
      }
    });
  const blockedEpisodes = mergeEpisodeNumbersBySeason(
    getAvailableEpisodesBySeason(catalog),
    pendingEpisodes
  );
  return getRequestableTvSelections(
    seasons.map((season) => ({ seasonNumber: season.seasonNumber })),
    seasons,
    coveredSeasons,
    blockedEpisodes
  );
};

interface Props {
  collectionId: string;
  initialSelectedIds: string[];
  is4k?: boolean;
  onCancel?: () => void;
  onComplete?: (newStatus: MediaStatus, is4k?: boolean) => void;
  onUpdating?: (isUpdating: boolean) => void;
}

const TvCollectionRequestModal = ({
  collectionId,
  initialSelectedIds,
  is4k = false,
  onCancel,
  onComplete,
  onUpdating,
}: Props) => {
  const intl = useIntl();
  const settings = useSettings();
  const { user, hasPermission } = useUser();
  const { addToast } = useToasts();
  const [selectedParts, setSelectedParts] =
    useState<string[]>(initialSelectedIds);
  const [filters, setFilters] = useState<VideoCollectionFilters>({
    ...EMPTY_VIDEO_COLLECTION_FILTERS,
  });
  const [requestOverrides, setRequestOverrides] = useState<RequestOverrides>();
  const [selectedIs4k, setSelectedIs4k] = useState(is4k);
  const [qualityRevision, setQualityRevision] = useState(0);
  const effectiveIs4k = requestOverrides?.is4k ?? selectedIs4k;
  const {
    open: advancedOptionsOpen,
    pinned: advancedOptionsPinned,
    toggleOpen: toggleAdvancedOptions,
    togglePin: toggleAdvancedOptionsPin,
  } = useAdvancedOptionsDisclosure('tv');
  const [requestedByPortal, setRequestedByPortal] =
    useState<HTMLDivElement | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const mountedRef = useRef(true);
  const submissionActiveRef = useRef(false);
  const {
    data,
    error,
    mutate: revalidateCollection,
  } = useSWR<CuratedCollection>(
    '/api/v1/collection-catalog/tv/' + encodeURIComponent(collectionId),
    { revalidateOnMount: true }
  );
  const { data: details, error: detailsError } = useSWR<
    Record<string, TvDetails>
  >(
    data
      ? [
          'tv-collection-request-details',
          collectionId,
          data.parts.map((part) => part.id).join(','),
        ]
      : null,
    async () => {
      const results = await mapWithConcurrency(
        data?.parts ?? [],
        5,
        async (part) => {
          try {
            const response = await axios.get<TvDetails>(
              '/api/v1/tv/' + part.id
            );
            return [part.id, response.data] as const;
          } catch {
            return null;
          }
        }
      );
      return Object.fromEntries(
        results.filter(
          (result): result is readonly [string, TvDetails] => result !== null
        )
      );
    }
  );
  const { data: catalogs, error: catalogsError } = useSWR<
    Record<string, PlaybackCatalogResponse | undefined>
  >(
    details
      ? [
          'tv-collection-request-catalogs',
          collectionId,
          effectiveIs4k,
          Object.values(details)
            .map((detail) => detail.mediaInfo?.id)
            .join(','),
        ]
      : null,
    async () => {
      const results = await mapWithConcurrency(
        Object.entries(details ?? {}),
        5,
        async ([id, detail]) => {
          if (!detail.mediaInfo?.id) return [id, undefined] as const;
          try {
            const response = await axios.get<PlaybackCatalogResponse>(
              '/api/v1/playback/media/' +
                detail.mediaInfo.id +
                (effectiveIs4k ? '?is4k=true' : '')
            );
            return [id, response.data] as const;
          } catch {
            return [id, undefined] as const;
          }
        }
      );
      return Object.fromEntries(results);
    }
  );
  const canManageSelectedUser = hasPermission(
    [Permission.MANAGE_REQUESTS, Permission.MANAGE_USERS],
    { type: 'or' }
  );
  const quotaUserId = requestOverrides?.user?.id ?? user?.id;
  const { data: quota, error: quotaError } = useSWR<QuotaResponse>(
    user && (!requestOverrides?.user?.id || canManageSelectedUser)
      ? '/api/v1/user/' + quotaUserId + '/quota'
      : null
  );
  const includeSpecials = settings.currentSettings.enableSpecialEpisodes;
  const selectionsFor = (id: string) =>
    requestableSelections(
      details?.[id],
      effectiveIs4k,
      includeSpecials,
      catalogs?.[id]
    );
  const canRequestPart = (part: CuratedCollectionMember) =>
    part.mediaInfo?.[effectiveIs4k ? 'status4k' : 'status'] !==
      MediaStatus.BLOCKLISTED && selectionsFor(part.id).length > 0;
  const blocklistVisibility = hasPermission(
    [Permission.MANAGE_BLOCKLIST, Permission.VIEW_BLOCKLIST],
    { type: 'or' }
  );
  const visibleParts = (data?.parts ?? []).filter(
    (part) =>
      matchesVideoCollectionFilters(part, filters, 'tv') &&
      (blocklistVisibility ||
        part.mediaInfo?.[effectiveIs4k ? 'status4k' : 'status'] !==
          MediaStatus.BLOCKLISTED)
  );
  const requestableParts = visibleParts.filter(canRequestPart);
  const selectedRequestableParts = requestableParts.filter((part) =>
    selectedParts.includes(part.id)
  );
  const selectedSeasonCount = selectedRequestableParts.reduce(
    (count, part) => count + selectionsFor(part.id).length,
    0
  );
  const remaining = (quota?.tv.remaining ?? 0) - selectedSeasonCount;
  const quotaLimit = !!quota?.tv.limit && !requestOverrides?.ignoreQuota;
  const canSelectAll =
    !quotaLimit ||
    requestableParts.reduce(
      (count, part) => count + selectionsFor(part.id).length,
      0
    ) <= (quota?.tv.remaining ?? 0);
  const allSelected =
    requestableParts.length > 0 &&
    requestableParts.every((part) => selectedParts.includes(part.id));

  const togglePart = (part: CuratedCollectionMember) => {
    if (!canRequestPart(part)) return;
    if (selectedParts.includes(part.id)) {
      setSelectedParts((current) => current.filter((id) => id !== part.id));
    } else if (!quotaLimit || selectionsFor(part.id).length <= remaining) {
      setSelectedParts((current) => [...current, part.id]);
    }
  };
  const toggleAllParts = () => {
    if (!canSelectAll) return;
    setSelectedParts(
      allSelected ? [] : requestableParts.map((part) => part.id)
    );
  };

  useEffect(() => {
    onUpdating?.(isUpdating);
  }, [isUpdating, onUpdating]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const quotaRestricted =
    !!quota?.tv.restricted && !requestOverrides?.ignoreQuota;
  const requestDisabled =
    !data ||
    !quota ||
    selectedRequestableParts.length === 0 ||
    isUpdating ||
    quotaRestricted ||
    (quotaLimit && remaining < 0) ||
    !details ||
    (!catalogs && !catalogsError);
  const requestDisabledReason = isUpdating
    ? intl.formatMessage(globalMessages.requesting)
    : selectedRequestableParts.length === 0
      ? intl.formatMessage(messages.selectItemsToRequest)
      : quotaRestricted || (quotaLimit && remaining < 0)
        ? intl.formatMessage(messages.quotaRestricted)
        : undefined;
  const sendRequest = useCallback(async () => {
    if (submissionActiveRef.current || requestDisabled) return;
    submissionActiveRef.current = true;
    setIsUpdating(true);
    try {
      const outcomes = await mapWithConcurrency(
        selectedRequestableParts,
        5,
        async (part) => {
          const detail = details?.[part.id];
          const selections = requestableSelections(
            detail,
            effectiveIs4k,
            includeSpecials,
            catalogs?.[part.id]
          );
          if (!detail?.externalIds.tvdbId || selections.length === 0) {
            return { id: part.id, succeeded: false } as const;
          }
          try {
            await axios.post<MediaRequest>('/api/v1/request', {
              mediaId: detail.id,
              tvdbId: detail.externalIds.tvdbId,
              mediaType: 'tv',
              is4k: effectiveIs4k,
              seasons: selections.map((selection) => selection.seasonNumber),
              seasonRequests: settings.currentSettings.partialRequestsEnabled
                ? selections
                : undefined,
              ignoreQuota: requestOverrides?.ignoreQuota,
              serverId: requestOverrides?.server,
              profileId: requestOverrides?.profile,
              rootFolder: requestOverrides?.folder,
              languageProfileId: requestOverrides?.language,
              userId: requestOverrides?.user?.id,
              tags: requestOverrides?.tags,
            });
            return { id: part.id, succeeded: true } as const;
          } catch {
            return { id: part.id, succeeded: false } as const;
          }
        }
      );
      const successes = outcomes.filter((outcome) => outcome.succeeded);
      const failedIds = outcomes
        .filter((outcome) => !outcome.succeeded)
        .map((outcome) => outcome.id);
      if (successes.length > 0) {
        void mutate('/api/v1/request/count').catch(() => undefined);
        await revalidateCollection().catch(() => undefined);
      }
      if (mountedRef.current) {
        if (failedIds.length > 0) setSelectedParts(failedIds);
        if (successes.length > 0 && failedIds.length === 0) {
          onComplete?.(MediaStatus.PARTIALLY_AVAILABLE, effectiveIs4k);
        }
        if (failedIds.length === 0) {
          addToast(
            <span>
              {intl.formatMessage(messages.requestSuccess, {
                title: data?.name,
                strong: (message: React.ReactNode) => (
                  <strong>{message}</strong>
                ),
              })}
            </span>,
            { appearance: 'success', autoDismiss: true }
          );
        } else if (successes.length > 0) {
          addToast(
            intl.formatMessage(messages.requestpartial, {
              created: successes.length,
              failed: failedIds.length,
            }),
            { appearance: 'warning' }
          );
        } else {
          addToast(intl.formatMessage(messages.requesterror), {
            appearance: 'error',
            autoDismiss: true,
          });
        }
      }
    } finally {
      submissionActiveRef.current = false;
      if (mountedRef.current) setIsUpdating(false);
    }
  }, [
    addToast,
    catalogs,
    data?.name,
    details,
    effectiveIs4k,
    includeSpecials,
    intl,
    onComplete,
    revalidateCollection,
    requestDisabled,
    requestOverrides,
    selectedRequestableParts,
    settings.currentSettings.partialRequestsEnabled,
  ]);

  const columnSize = Math.ceil(visibleParts.length / 2);
  const columns = [
    visibleParts.slice(0, columnSize),
    visibleParts.slice(columnSize),
  ].filter((column) => column.length > 0);
  const canUseAdvancedOptions = hasPermission(
    [Permission.REQUEST_ADVANCED, Permission.MANAGE_REQUESTS],
    { type: 'or' }
  );
  const getAvailabilityMessage = (status?: MediaStatus) => {
    switch (status) {
      case MediaStatus.AVAILABLE:
        return messages.available;
      case MediaStatus.PARTIALLY_AVAILABLE:
        return messages.partiallyAvailable;
      case MediaStatus.PROCESSING:
        return messages.processing;
      case MediaStatus.PENDING:
        return messages.requested;
      case MediaStatus.BLOCKLISTED:
        return messages.blocklisted;
      default:
        return messages.notAvailable;
    }
  };

  return (
    <Transition show appear>
      <Modal
        backgroundClickable
        onCancel={onCancel}
        onOk={sendRequest}
        hideActions
        alignTop
        title={intl.formatMessage(
          effectiveIs4k
            ? messages.requestcollection4ktitle
            : messages.requestcollectiontitle
        )}
        okText={intl.formatMessage(globalMessages.request)}
        okDisabled={requestDisabled}
        cancelButtonType="danger"
        okButtonType="success"
        actionButtonSize="standard"
        dialogClass="app-card-main request-modal-site-surface sm:max-w-5xl"
      >
        <RequestMediaCard
          artwork={
            data?.backdropPath
              ? 'https://image.tmdb.org/t/p/original' + data.backdropPath
              : getTmdbPosterImageUrl(data?.posterPath, 'original')
          }
          artworkType="tmdb"
        >
          {((!data && !error) ||
            (!details && !detailsError) ||
            (!catalogs && !catalogsError) ||
            (!quota && !quotaError)) && (
            <p role="status">{intl.formatMessage(globalMessages.loading)}</p>
          )}
          {(error || catalogsError || quotaError) && (
            <p role="alert">{intl.formatMessage(globalMessages.error)}</p>
          )}
          {data && (
            <CollectionSummaryCard
              collection={{
                id: data.id,
                name: data.name,
                posterPath: data.posterPath,
              }}
              kind="tv"
              selectionSize={{
                selected: selectedRequestableParts.length,
                visible: visibleParts.length,
              }}
            />
          )}
          {(quota?.tv.limit ?? 0) > 0 && (
            <QuotaDisplay
              mediaType="tv"
              quota={quota?.tv}
              userOverride={
                requestOverrides?.user && requestOverrides.user.id !== user?.id
                  ? requestOverrides.user.id
                  : undefined
              }
              remaining={remaining}
            />
          )}
          {detailsError && (
            <p role="alert">
              {intl.formatMessage(messages.detailsUnavailable)}
            </p>
          )}
          <VideoCollectionRequestFilters
            kind="tv"
            filters={filters}
            onChange={setFilters}
          />
          <div className="card-spacing-before card:grid-cols-2 grid grid-cols-1 items-start gap-2">
            {columns.map((columnParts, columnIndex) => (
              <section
                key={'collection-column-' + columnIndex}
                className="app-card-inset refreshed-inset-surface overflow-hidden rounded-lg border border-gray-700 p-2"
              >
                <div className="media-inset-table-heading request-divider-dark grid grid-cols-[2rem_40px_minmax(0,1fr)] items-center gap-x-2 border-b px-2 pb-2">
                  {columnIndex === 0 ? (
                    <SelectionCircle
                      disabled={requestableParts.length === 0 || !canSelectAll}
                      onClick={toggleAllParts}
                      selected={allSelected}
                      label={intl.formatMessage(messages.selectAll)}
                    />
                  ) : (
                    <span aria-hidden="true" />
                  )}
                  <span className="media-inset-poster-column-heading text-start">
                    {intl.formatMessage(globalMessages.tvshow)}
                  </span>
                </div>
                <div className="scrollable-card -me-3 max-h-[228px] space-y-0.5 overflow-y-auto pe-3 pt-1">
                  {columnParts.map((part) => {
                    const selected =
                      selectedParts.includes(part.id) && canRequestPart(part);
                    const selectionDisabled =
                      !canRequestPart(part) ||
                      (quotaLimit &&
                        !selected &&
                        selectionsFor(part.id).length > remaining);
                    const hdStatus = part.mediaInfo?.status;
                    const ultraHdStatus = part.mediaInfo?.status4k;
                    return (
                      <div
                        key={'part-' + part.id}
                        className="app-card-inset refreshed-inset-surface grid min-h-[54px] grid-cols-[2rem_40px_minmax(0,1fr)] items-center gap-x-2 rounded-lg border border-gray-700 px-2"
                      >
                        <SelectionCircle
                          disabled={selectionDisabled}
                          onClick={() => togglePart(part)}
                          selected={selected}
                          label={intl.formatMessage(messages.selection)}
                        />
                        <div className="relative h-[46px] w-[35px] justify-self-center overflow-hidden rounded-md ring-1 ring-gray-700">
                          <CachedImage
                            type="tmdb"
                            src={
                              part.posterPath
                                ? getTmdbPosterImageUrl(part.posterPath)
                                : '/images/seerr_poster_not_found.png'
                            }
                            alt=""
                            fill
                            sizes="35px"
                            className="object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm leading-5 font-semibold text-gray-100">
                            {part.title}
                          </div>
                          <dl className="grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] gap-x-1 text-xs leading-4">
                            <dt className="font-medium text-gray-100">
                              {intl.formatMessage(messages.hd)}:
                            </dt>
                            <dd className="m-0 truncate font-medium">
                              <AvailabilityValue status={hdStatus}>
                                {intl.formatMessage(
                                  getAvailabilityMessage(hdStatus)
                                )}
                              </AvailabilityValue>
                            </dd>
                            <dt className="font-medium text-gray-100">
                              {intl.formatMessage(messages.ultraHd)}:
                            </dt>
                            <dd className="m-0 truncate font-medium">
                              <AvailabilityValue status={ultraHdStatus}>
                                {intl.formatMessage(
                                  getAvailabilityMessage(ultraHdStatus)
                                )}
                              </AvailabilityValue>
                            </dd>
                          </dl>
                          {!details?.[part.id]?.externalIds.tvdbId &&
                            details?.[part.id] && (
                              <div className="text-xs text-amber-300">
                                {intl.formatMessage(messages.missingTvdb)}
                              </div>
                            )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          <div className="mt-2 flex items-center">
            <MediaQualitySelect
              value={effectiveIs4k ? '4k' : 'hd'}
              options={[
                { label: 'HD', value: 'hd' },
                { label: '4K', value: '4k' },
              ]}
              onChange={(quality) => {
                setSelectedIs4k(quality === '4k');
                setRequestOverrides(undefined);
                setQualityRevision((current) => current + 1);
              }}
              label={intl.formatMessage(messages.quality)}
              autoSelectAvailable={false}
              purpose="request"
            />
          </div>

          {canUseAdvancedOptions && (
            <AdvancedRequester
              key={(selectedIs4k ? '4k' : 'hd') + '-' + qualityRevision}
              type="tv"
              is4k={selectedIs4k}
              quota={quota}
              expanded={advancedOptionsOpen}
              panelOnly
              rootFolderTable
              allow4kServerSelection
              requestedByPortal={requestedByPortal}
              onChange={setRequestOverrides}
            />
          )}
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <div className="me-auto flex items-center gap-2">
              {canUseAdvancedOptions && (
                <AdvancedOptionsDisclosureButton
                  label={intl.formatMessage(messages.advancedOptions)}
                  open={advancedOptionsOpen}
                  pinned={advancedOptionsPinned}
                  onToggle={toggleAdvancedOptions}
                  onPin={toggleAdvancedOptionsPin}
                />
              )}
            </div>
            <div
              className="compact-control flex items-center"
              ref={setRequestedByPortal}
            />
            <Button
              type="button"
              onClick={onCancel}
              data-testid="modal-cancel-button"
              buttonType="danger"
              buttonSize="standard"
            >
              <XMarkIcon aria-hidden="true" />
              {intl.formatMessage(globalMessages.cancel)}
            </Button>
            <Button
              type="button"
              disabled={requestDisabled}
              disabledReason={requestDisabledReason}
              onClick={() => void sendRequest()}
              data-testid="modal-ok-button"
              buttonType="success"
              buttonSize="standard"
            >
              <ArrowDownTrayIcon aria-hidden="true" />
              {intl.formatMessage(globalMessages.request)}
            </Button>
          </div>
        </RequestMediaCard>
      </Modal>
    </Transition>
  );
};

export default TvCollectionRequestModal;
