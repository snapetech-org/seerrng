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
import useToasts from '@app/hooks/useToasts';
import { useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import { orderCollectionPartsOldestFirst } from '@app/utils/collectionPlaybackSelection';
import {
  getCollectionPartRequestPresentation,
  getCoveredCollectionPartIds,
} from '@app/utils/collectionRequestState';
import { mapWithConcurrency } from '@app/utils/concurrency';
import defineMessages from '@app/utils/defineMessages';
import { getTmdbPosterImageUrl } from '@app/utils/imageCache';
import { ArrowDownTrayIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { MediaStatus } from '@server/constants/media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import type { QuotaResponse } from '@server/interfaces/api/userInterfaces';
import { Permission } from '@server/lib/permissions';
import type { Collection } from '@server/models/Collection';
import axios from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR, { mutate } from 'swr';

const messages = defineMessages('components.RequestModal', {
  requestSuccess: '<strong>{title}</strong> requested successfully!',
  requestcollectiontitle: 'Request Collection',
  requestcollection4ktitle: 'Request Collection in 4K',
  requesterror: 'Something went wrong while submitting the request.',
  requestpartial: '{created} requested; {failed} failed.',
  selectItemsToRequest: 'Select at least one movie to request.',
  selection: 'Select this movie to request',
  selectAll: 'Select every movie that is ready to request',
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
  quotaRestricted: 'The selected user cannot make more movie requests.',
});

const COLLECTION_REQUEST_CONCURRENCY = 5;

interface RequestModalProps extends React.HTMLAttributes<HTMLDivElement> {
  tmdbId: number;
  is4k?: boolean;
  onCancel?: () => void;
  onComplete?: (newStatus: MediaStatus, is4k?: boolean) => void;
  onUpdating?: (isUpdating: boolean) => void;
}

const CollectionRequestModal = ({
  onCancel,
  onComplete,
  tmdbId,
  onUpdating,
  is4k = false,
}: RequestModalProps) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedIs4k, setSelectedIs4k] = useState(is4k);
  const [qualityRevision, setQualityRevision] = useState(0);
  const [selectedParts, setSelectedParts] = useState<number[]>([]);
  const [filters, setFilters] = useState<VideoCollectionFilters>({
    ...EMPTY_VIDEO_COLLECTION_FILTERS,
  });
  const [requestOverrides, setRequestOverrides] = useState<RequestOverrides>();
  const {
    open: advancedOptionsOpen,
    pinned: advancedOptionsPinned,
    toggleOpen: toggleAdvancedOptions,
    togglePin: toggleAdvancedOptionsPin,
  } = useAdvancedOptionsDisclosure('movie');
  const [requestedByPortal, setRequestedByPortal] =
    useState<HTMLDivElement | null>(null);
  const mountedRef = useRef(true);
  const submissionActiveRef = useRef(false);
  const { addToast } = useToasts();
  const {
    data,
    error,
    mutate: revalidateCollection,
  } = useSWR<Collection>(`/api/v1/collection/${tmdbId}`, {
    revalidateOnMount: true,
  });
  const intl = useIntl();
  const { user, hasPermission } = useUser();
  const canManageSelectedUser = hasPermission(
    [Permission.MANAGE_REQUESTS, Permission.MANAGE_USERS],
    { type: 'or' }
  );
  const quotaUserId = requestOverrides?.user?.id ?? user?.id;
  const { data: quota, error: quotaError } = useSWR<QuotaResponse>(
    user && (!requestOverrides?.user?.id || canManageSelectedUser)
      ? `/api/v1/user/${quotaUserId}/quota`
      : null
  );
  const effectiveIs4k = requestOverrides?.is4k ?? selectedIs4k;
  const filteredParts = (data?.parts ?? []).filter((part) =>
    matchesVideoCollectionFilters(part, filters, 'movie')
  );

  const getAllParts = (): number[] => {
    return filteredParts
      .filter(
        (part) =>
          part.mediaInfo?.[effectiveIs4k ? 'status4k' : 'status'] !==
          MediaStatus.BLOCKLISTED
      )
      .map((part) => part.id);
  };

  const getAllRequestedParts = (): number[] =>
    getCoveredCollectionPartIds(data?.parts ?? [], effectiveIs4k);

  const isSelectedPart = (tmdbId: number): boolean =>
    selectedRequestableParts.includes(tmdbId);

  const togglePart = (tmdbId: number): void => {
    // If this part already has a pending request, don't allow it to be toggled
    if (getAllRequestedParts().includes(tmdbId)) {
      return;
    }

    // If there are no more remaining requests available, block toggle
    if (
      quota?.movie.limit &&
      currentlyRemaining <= 0 &&
      !isSelectedPart(tmdbId)
    ) {
      return;
    }

    if (selectedParts.includes(tmdbId)) {
      setSelectedParts((parts) => parts.filter((partId) => partId !== tmdbId));
    } else {
      setSelectedParts((parts) => [...parts, tmdbId]);
    }
  };

  const unrequestedParts = getAllParts().filter(
    (tmdbId) => !getAllRequestedParts().includes(tmdbId)
  );
  const selectedRequestableParts = unrequestedParts.filter((id) =>
    selectedParts.includes(id)
  );
  const currentlyRemaining =
    (quota?.movie.remaining ?? 0) - selectedRequestableParts.length;

  const toggleAllParts = (): void => {
    // If the user has a quota and not enough requests for all parts, block toggleAllParts
    if (
      quota?.movie.limit &&
      (quota?.movie.remaining ?? 0) < unrequestedParts.length
    ) {
      return;
    }

    if (data && selectedRequestableParts.length < unrequestedParts.length) {
      setSelectedParts(unrequestedParts);
    } else {
      setSelectedParts([]);
    }
  };

  const isAllParts = (): boolean => {
    if (!data) {
      return false;
    }

    return (
      unrequestedParts.length > 0 &&
      unrequestedParts.every((part) => selectedParts.includes(part))
    );
  };

  useEffect(() => {
    if (onUpdating) {
      onUpdating(isUpdating);
    }
  }, [isUpdating, onUpdating]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const sendRequest = useCallback(async () => {
    if (submissionActiveRef.current) {
      return;
    }
    submissionActiveRef.current = true;
    setIsUpdating(true);

    try {
      const parts = filteredParts.filter(
        (part) =>
          selectedParts.includes(part.id) && unrequestedParts.includes(part.id)
      );
      const outcomes = await mapWithConcurrency(
        parts,
        COLLECTION_REQUEST_CONCURRENCY,
        async (part) => {
          try {
            await axios.post<MediaRequest>('/api/v1/request', {
              mediaId: part.id,
              mediaType: 'movie',
              is4k: effectiveIs4k,
              ignoreQuota: requestOverrides?.ignoreQuota,
              serverId: requestOverrides?.server,
              profileId: requestOverrides?.profile,
              rootFolder: requestOverrides?.folder,
              userId: requestOverrides?.user?.id,
              tags: requestOverrides?.tags,
            });
            return { id: part.id, succeeded: true } as const;
          } catch {
            return { id: part.id, succeeded: false } as const;
          }
        }
      );
      const succeededIds = new Set(
        outcomes
          .filter((outcome) => outcome.succeeded)
          .map((outcome) => outcome.id)
      );
      const failedIds = outcomes
        .filter((outcome) => !outcome.succeeded)
        .map((outcome) => outcome.id);
      const failedCount = outcomes.length - succeededIds.size;

      if (succeededIds.size > 0) {
        void mutate('/api/v1/request/count').catch(() => undefined);
      }

      if (succeededIds.size > 0 && failedCount > 0) {
        await revalidateCollection().catch(() => undefined);
        if (mountedRef.current) {
          setSelectedParts(failedIds);
        }
      }

      if (
        mountedRef.current &&
        onComplete &&
        succeededIds.size > 0 &&
        failedCount === 0
      ) {
        const coveredIds = new Set(
          getCoveredCollectionPartIds(data?.parts ?? [], effectiveIs4k)
        );
        succeededIds.forEach((id) => coveredIds.add(id));
        const requestableCollectionIds = (data?.parts ?? [])
          .filter(
            (part) =>
              part.mediaInfo?.[effectiveIs4k ? 'status4k' : 'status'] !==
              MediaStatus.BLOCKLISTED
          )
          .map((part) => part.id);
        onComplete(
          requestableCollectionIds.every((id) => coveredIds.has(id))
            ? MediaStatus.UNKNOWN
            : MediaStatus.PARTIALLY_AVAILABLE,
          effectiveIs4k
        );
      }

      if (mountedRef.current) {
        if (failedCount === 0) {
          addToast(
            <span>
              {intl.formatMessage(messages.requestSuccess, {
                title: data?.name,
                strong: (msg: React.ReactNode) => <strong>{msg}</strong>,
              })}
            </span>,
            { appearance: 'success', autoDismiss: true }
          );
        } else if (succeededIds.size > 0) {
          addToast(
            intl.formatMessage(messages.requestpartial, {
              created: succeededIds.size,
              failed: failedCount,
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
    } catch {
      if (mountedRef.current) {
        addToast(intl.formatMessage(messages.requesterror), {
          appearance: 'error',
          autoDismiss: true,
        });
      }
    } finally {
      submissionActiveRef.current = false;
      if (mountedRef.current) {
        setIsUpdating(false);
      }
    }
  }, [
    data?.parts,
    data?.name,
    onComplete,
    addToast,
    intl,
    selectedParts,
    filteredParts,
    unrequestedParts,
    effectiveIs4k,
    requestOverrides,
    revalidateCollection,
  ]);

  const blocklistVisibility = hasPermission(
    [Permission.MANAGE_BLOCKLIST, Permission.VIEW_BLOCKLIST],
    { type: 'or' }
  );
  const visibleParts = orderCollectionPartsOldestFirst(filteredParts).filter(
    (part) =>
      blocklistVisibility ||
      getCollectionPartRequestPresentation(part, effectiveIs4k) !==
        'blocklisted'
  );
  const columnSize = Math.ceil(visibleParts.length / 2);
  const visiblePartColumns = [
    visibleParts.slice(0, columnSize),
    visibleParts.slice(columnSize),
  ].filter((parts) => parts.length > 0);
  const selectAllDisabled =
    unrequestedParts.length === 0 ||
    (!!quota?.movie.limit &&
      (quota.movie.remaining ?? 0) < unrequestedParts.length);
  const quotaRestricted =
    !!quota?.movie.restricted && !requestOverrides?.ignoreQuota;
  const requestDisabled =
    !data ||
    !quota ||
    selectedRequestableParts.length === 0 ||
    isUpdating ||
    quotaRestricted;
  const requestDisabledReason = isUpdating
    ? intl.formatMessage(globalMessages.requesting)
    : selectedRequestableParts.length === 0
      ? intl.formatMessage(messages.selectItemsToRequest)
      : quotaRestricted
        ? intl.formatMessage(messages.quotaRestricted)
        : undefined;
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
            ? `https://image.tmdb.org/t/p/original${data.backdropPath}`
            : getTmdbPosterImageUrl(data?.posterPath, 'original')
        }
        artworkType="tmdb"
      >
        {((!data && !error) || (!quota && !quotaError)) && (
          <p role="status">{intl.formatMessage(globalMessages.loading)}</p>
        )}
        {(error || quotaError) && (
          <p role="alert">{intl.formatMessage(globalMessages.error)}</p>
        )}
        {data && (
          <CollectionSummaryCard
            collection={{
              id: data.id,
              name: data.name,
              posterPath: data.posterPath ?? undefined,
            }}
            selectionSize={{
              selected: selectedRequestableParts.length,
              visible: visibleParts.length,
            }}
          />
        )}
        {(quota?.movie.limit ?? 0) > 0 && (
          <QuotaDisplay
            mediaType="movie"
            quota={quota?.movie}
            userOverride={
              requestOverrides?.user && requestOverrides.user.id !== user?.id
                ? requestOverrides.user.id
                : undefined
            }
            remaining={currentlyRemaining}
          />
        )}

        <VideoCollectionRequestFilters
          kind="movie"
          filters={filters}
          onChange={setFilters}
        />

        <div className="card-spacing-before card:grid-cols-2 grid grid-cols-1 items-start gap-2">
          {visiblePartColumns.map((columnParts, columnIndex) => (
            <section
              key={`collection-column-${columnIndex}`}
              className="app-card-inset refreshed-inset-surface overflow-hidden rounded-lg border border-gray-700 p-2"
            >
              <div className="media-inset-table-heading request-divider-dark grid grid-cols-[2rem_40px_minmax(0,1fr)] items-center gap-x-2 border-b px-2 pb-2">
                {columnIndex === 0 ? (
                  <SelectionCircle
                    disabled={selectAllDisabled}
                    onClick={toggleAllParts}
                    selected={isAllParts() && unrequestedParts.length > 0}
                    label={intl.formatMessage(messages.selectAll)}
                  />
                ) : (
                  <span aria-hidden="true" />
                )}
                <span className="media-inset-poster-column-heading text-start">
                  {intl.formatMessage(globalMessages.movie)}
                </span>
              </div>
              <div className="scrollable-card -me-3 max-h-[228px] space-y-0.5 overflow-y-auto pe-3 pt-1">
                {columnParts.map((part) => {
                  const presentation = getCollectionPartRequestPresentation(
                    part,
                    effectiveIs4k
                  );
                  const selected = isSelectedPart(part.id);
                  const quotaBlocked =
                    !!quota?.movie.limit &&
                    currentlyRemaining <= 0 &&
                    !selected;
                  const selectionDisabled =
                    presentation !== 'ready' || quotaBlocked;
                  const hdStatus = part.mediaInfo?.status;
                  const ultraHdStatus = part.mediaInfo?.status4k;

                  return (
                    <div
                      key={`part-${part.id}`}
                      className="app-card-inset refreshed-inset-surface grid min-h-[54px] grid-cols-[2rem_40px_minmax(0,1fr)] items-center gap-x-2 rounded-lg border border-gray-700 px-2"
                    >
                      <SelectionCircle
                        disabled={selectionDisabled}
                        onClick={() => togglePart(part.id)}
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
            type="movie"
            is4k={selectedIs4k}
            quota={quota}
            expanded={advancedOptionsOpen}
            panelOnly
            rootFolderTable
            allow4kServerSelection
            requestedByPortal={requestedByPortal}
            onChange={(overrides) => setRequestOverrides(overrides)}
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
  );
};

export default CollectionRequestModal;
