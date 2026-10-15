import CollectionSummaryCard from '@app/components/CollectionDetails/CollectionSummaryCard';
import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import Modal from '@app/components/Common/Modal';
import SelectionCircle from '@app/components/Common/SelectionCircle';
import {
  CompactSelect,
  FilterResetButton,
} from '@app/components/Discover/FilterPanel/CompactFilterSelect';
import MusicReleaseTypeSelect from '@app/components/Discover/FilterPanel/MusicReleaseTypeSelect';
import AvailabilityValue from '@app/components/MediaDetails/AvailabilityValue';
import MediaQualitySelect from '@app/components/MediaDetails/MediaQualitySelect';
import AdvancedOptionsDisclosureButton from '@app/components/RequestModal/AdvancedOptionsDisclosureButton';
import AdvancedRequester, {
  type RequestOverrides,
} from '@app/components/RequestModal/AdvancedRequester';
import QuotaDisplay from '@app/components/RequestModal/QuotaDisplay';
import RequestMediaCard from '@app/components/RequestModal/RequestMediaCard';
import {
  createRequestDestination,
  isRequestDestinationAvailable,
  isRequestDestinationRequested,
} from '@app/components/RequestModal/requestAvailability';
import useAdvancedOptionsDisclosure from '@app/hooks/useAdvancedOptionsDisclosure';
import useToasts from '@app/hooks/useToasts';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import { memberHasQuality } from '@app/utils/curatedCollectionSelection';
import defineMessages from '@app/utils/defineMessages';
import {
  DEFAULT_MUSIC_COLLECTION_FILTERS,
  filterMusicCollection,
  musicCollectionFilterOptions,
  type MusicCollectionFilters,
} from '@app/utils/musicCollectionFilters';
import {
  getMusicServiceQuality,
  isMusicServiceForQuality,
} from '@app/utils/musicService';
import { Transition } from '@headlessui/react';
import { ArrowDownTrayIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { MediaStatus } from '@server/constants/media';
import type { BulkMediaRequestResponse } from '@server/interfaces/api/requestInterfaces';
import type { ServiceCommonServer } from '@server/interfaces/api/serviceInterfaces';
import type { QuotaResponse } from '@server/interfaces/api/userInterfaces';
import type {
  CuratedCollection,
  CuratedCollectionMember,
} from '@server/models/CuratedCollection';
import axios from 'axios';
import { useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR, { mutate } from 'swr';

const messages = defineMessages('components.RequestModal.MusicCollection', {
  requestcollectiontitle: 'Request Collection',
  selectItemsToRequest: 'Select at least one album to request.',
  selection: 'Select this album to request',
  selectAll: 'Select every album that is ready to request',
  advancedOptions: 'Advanced Options',
  quality: 'Quality',
  hd: 'MP3',
  ultraHd: 'FLAC',
  album: 'Album',
  available: 'Available',
  requested: 'Requested',
  blocklisted: 'Blocklisted',
  notAvailable: 'Not Available',
  quotaRestricted:
    'The selected albums exceed the remaining music request quota.',
  serviceUnavailable: 'No matching music destination is configured.',
  requesterror: 'Something went wrong while submitting the request.',
  summary: '{created} requested; {failed} failed.',
  clearFilters: 'Clear Filters',
  releaseYear: 'Release Year',
  genres: 'Genres',
  any: 'Any',
  unknown: 'Unknown',
});

interface Props {
  collectionId: string;
  initialSelectedIds: string[];
  initialFormat: 'mp3' | 'flac';
  onCancel: () => void;
  onComplete: () => void;
}

export default function MusicCollectionRequestModal({
  collectionId,
  initialSelectedIds,
  initialFormat,
  onCancel,
  onComplete,
}: Props) {
  const intl = useIntl();
  const { user, hasPermission } = useUser();
  const { addToast } = useToasts();
  const [selectedParts, setSelectedParts] = useState(initialSelectedIds);
  const [filters, setFilters] = useState<MusicCollectionFilters>({
    ...DEFAULT_MUSIC_COLLECTION_FILTERS,
  });
  const [selectedFormat, setSelectedFormat] = useState(initialFormat);
  const [qualityRevision, setQualityRevision] = useState(0);
  const [requestOverrides, setRequestOverrides] = useState<RequestOverrides>();
  const [isUpdating, setIsUpdating] = useState(false);
  const submissionActive = useRef(false);
  const [requestedByPortal, setRequestedByPortal] =
    useState<HTMLDivElement | null>(null);
  const {
    open: advancedOptionsOpen,
    pinned: advancedOptionsPinned,
    toggleOpen: toggleAdvancedOptions,
    togglePin: toggleAdvancedOptionsPin,
  } = useAdvancedOptionsDisclosure('music');
  const endpoint =
    '/api/v1/collection-catalog/music/' + encodeURIComponent(collectionId);
  const {
    data,
    error,
    mutate: refreshCollection,
  } = useSWR<CuratedCollection>(endpoint);
  const { data: services, error: servicesError } = useSWR<
    ServiceCommonServer[]
  >('/api/v1/service/lidarr');
  const initialService = services?.find((service) =>
    isMusicServiceForQuality(service, selectedFormat)
  );
  const service =
    services?.find((service) => service.id === requestOverrides?.server) ??
    initialService;
  const destination = createRequestDestination(
    'lidarr',
    'music',
    service,
    requestOverrides
  );
  const { data: quota, error: quotaError } = useSWR<QuotaResponse>(
    user
      ? '/api/v1/user/' + (requestOverrides?.user?.id ?? user.id) + '/quota'
      : null
  );
  const canUseAdvancedOptions = hasPermission(
    [Permission.REQUEST_ADVANCED, Permission.MANAGE_REQUESTS],
    { type: 'or' }
  );
  const blocklistVisibility = hasPermission(
    [Permission.MANAGE_BLOCKLIST, Permission.VIEW_BLOCKLIST],
    { type: 'or' }
  );
  const filterOptions = musicCollectionFilterOptions(data?.parts ?? []);
  const visibleParts = filterMusicCollection(data?.parts ?? [], filters)
    .filter(
      (part) =>
        initialSelectedIds.includes(part.id) &&
        (blocklistVisibility ||
          part.mediaInfo?.status !== MediaStatus.BLOCKLISTED)
    )
    .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
  const statusFor = (part: CuratedCollectionMember, format: 'mp3' | 'flac') => {
    if (part.mediaInfo?.status === MediaStatus.BLOCKLISTED)
      return MediaStatus.BLOCKLISTED;
    if (memberHasQuality(part, 'music', format === 'flac'))
      return MediaStatus.AVAILABLE;
    const target = createRequestDestination(
      'lidarr',
      'music',
      services?.find((item) => isMusicServiceForQuality(item, format)),
      undefined
    );
    if (isRequestDestinationAvailable(part.mediaInfo, target))
      return MediaStatus.AVAILABLE;
    if (isRequestDestinationRequested(part.mediaInfo?.requests, target))
      return MediaStatus.PENDING;
    return MediaStatus.UNKNOWN;
  };
  const ready = (part: CuratedCollectionMember) =>
    !!destination &&
    !(
      getMusicServiceQuality(service) === 'mp3' &&
      memberHasQuality(part, 'music', false)
    ) &&
    !(
      getMusicServiceQuality(service) === 'flac' &&
      memberHasQuality(part, 'music', true)
    ) &&
    part.mediaInfo?.status !== MediaStatus.BLOCKLISTED &&
    !isRequestDestinationAvailable(part.mediaInfo, destination) &&
    !isRequestDestinationRequested(part.mediaInfo?.requests, destination);
  const unrequestedParts = visibleParts.filter(ready).map((part) => part.id);
  const effectiveSelected = selectedParts.filter((id) =>
    unrequestedParts.includes(id)
  );
  const currentlyRemaining =
    (quota?.music.remaining ?? 0) - effectiveSelected.length;
  const quotaRestricted =
    !!quota?.music.restricted ||
    (!!quota?.music.limit && currentlyRemaining < 0);
  const requestDisabled =
    !effectiveSelected.length ||
    isUpdating ||
    !service ||
    !quota ||
    quotaRestricted;
  const requestDisabledReason = !service
    ? intl.formatMessage(messages.serviceUnavailable)
    : quotaRestricted
      ? intl.formatMessage(messages.quotaRestricted)
      : !effectiveSelected.length
        ? intl.formatMessage(messages.selectItemsToRequest)
        : undefined;
  const selectAllDisabled =
    isUpdating ||
    !unrequestedParts.length ||
    (!!quota?.music.limit &&
      (quota.music.remaining ?? 0) < unrequestedParts.length);
  const isAllParts = () =>
    unrequestedParts.every((id) => effectiveSelected.includes(id));
  const isSelectedPart = (id: string) => effectiveSelected.includes(id);
  const togglePart = (id: string) =>
    setSelectedParts((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id]
    );
  const toggleAllParts = () =>
    setSelectedParts(isAllParts() ? [] : unrequestedParts);
  const columnSize = Math.ceil(visibleParts.length / 2);
  const visiblePartColumns = [
    visibleParts.slice(0, columnSize),
    visibleParts.slice(columnSize),
  ].filter((parts) => parts.length);
  const getAvailabilityMessage = (status?: MediaStatus) =>
    status === MediaStatus.AVAILABLE
      ? messages.available
      : status === MediaStatus.PENDING
        ? messages.requested
        : status === MediaStatus.BLOCKLISTED
          ? messages.blocklisted
          : messages.notAvailable;
  const sendRequest = async () => {
    if (submissionActive.current || requestDisabled) return;
    submissionActive.current = true;
    setIsUpdating(true);
    const completed = new Set<string>();
    let created = 0;
    let failed = 0;
    try {
      for (let offset = 0; offset < effectiveSelected.length; offset += 100) {
        const ids = effectiveSelected.slice(offset, offset + 100);
        const response = await axios.post<BulkMediaRequestResponse>(
          '/api/v1/request/bulk',
          {
            mediaType: 'music',
            items: ids.map((mediaId) => ({
              mediaId,
              title: visibleParts.find((part) => part.id === mediaId)?.title,
            })),
            serverId: service?.id,
            profileId: requestOverrides?.profile,
            metadataProfileId: requestOverrides?.metadataProfile,
            rootFolder: requestOverrides?.folder,
            userId: requestOverrides?.user?.id,
            tags: requestOverrides?.tags,
          }
        );
        const failedIds = new Set(
          response.data.failed.map((item) => item.mediaId)
        );
        ids
          .filter((id) => !failedIds.has(id))
          .forEach((id) => completed.add(id));
        created += response.data.created.length;
        failed += response.data.failed.length;
      }
      addToast(intl.formatMessage(messages.summary, { created, failed }), {
        appearance: failed ? 'warning' : 'success',
        autoDismiss: true,
      });
      if (!failed) onComplete();
    } catch {
      addToast(intl.formatMessage(messages.requesterror), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setSelectedParts((current) => current.filter((id) => !completed.has(id)));
      void refreshCollection();
      void mutate('/api/v1/request/count');
      submissionActive.current = false;
      setIsUpdating(false);
    }
  };
  return (
    <Transition show appear>
      <Modal
        backgroundClickable={!isUpdating}
        onCancel={isUpdating ? undefined : onCancel}
        onOk={sendRequest}
        hideActions
        alignTop
        title={intl.formatMessage(messages.requestcollectiontitle)}
        okText={intl.formatMessage(globalMessages.request)}
        okDisabled={requestDisabled}
        cancelButtonType="danger"
        okButtonType="success"
        actionButtonSize="standard"
        dialogClass="app-card-main request-modal-site-surface sm:max-w-5xl"
      >
        <RequestMediaCard artwork={data?.posterPath} artworkType="music">
          {((!data && !error) ||
            (!services && !servicesError) ||
            (!quota && !quotaError)) && (
            <p role="status">{intl.formatMessage(globalMessages.loading)}</p>
          )}
          {(error || servicesError || quotaError) && (
            <p role="alert">{intl.formatMessage(globalMessages.error)}</p>
          )}
          {data && (
            <CollectionSummaryCard
              kind="music"
              collection={{
                id: data.id,
                name: data.name,
                posterPath: data.posterPath ?? undefined,
              }}
              selectionSize={{
                selected: effectiveSelected.length,
                visible: visibleParts.length,
              }}
            />
          )}
          {(quota?.music.limit ?? 0) > 0 && (
            <QuotaDisplay
              mediaType="music"
              quota={quota?.music}
              userOverride={
                requestOverrides?.user && requestOverrides.user.id !== user?.id
                  ? requestOverrides.user.id
                  : undefined
              }
              remaining={currentlyRemaining}
            />
          )}

          <div className="card-spacing-before flex flex-wrap items-center gap-2">
            <FilterResetButton
              label={intl.formatMessage(messages.clearFilters)}
              selected={
                filters.releaseType === 'Album' &&
                !filters.year &&
                !filters.genre
              }
              onClick={() =>
                setFilters({ ...DEFAULT_MUSIC_COLLECTION_FILTERS })
              }
            />
            <CompactSelect
              label={intl.formatMessage(messages.releaseYear)}
              value={filters.year}
              options={[
                { value: '', label: intl.formatMessage(messages.any) },
                ...filterOptions.years,
                ...(filterOptions.unknownYear
                  ? [
                      {
                        value: 'unknown',
                        label: intl.formatMessage(messages.unknown),
                      },
                    ]
                  : []),
              ]}
              onChange={(year) => setFilters({ ...filters, year })}
            />
            <MusicReleaseTypeSelect
              value={filters.releaseType}
              onChange={(releaseType) =>
                setFilters({ ...filters, releaseType })
              }
            />
            <CompactSelect
              label={intl.formatMessage(messages.genres)}
              value={filters.genre}
              options={[
                { value: '', label: intl.formatMessage(messages.any) },
                ...filterOptions.genres,
              ]}
              onChange={(genre) => setFilters({ ...filters, genre })}
            />
          </div>

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
                  <span className="media-inset-poster-column-heading text-left">
                    {intl.formatMessage(messages.album)}
                  </span>
                </div>
                <div className="scrollable-card -mr-3 max-h-[228px] space-y-0.5 overflow-y-auto pt-1 pr-3">
                  {columnParts.map((part) => {
                    const presentation = ready(part) ? 'ready' : 'covered';
                    const selected = isSelectedPart(part.id);
                    const quotaBlocked =
                      !!quota?.music.limit &&
                      currentlyRemaining <= 0 &&
                      !selected;
                    const selectionDisabled =
                      isUpdating || presentation !== 'ready' || quotaBlocked;
                    const hdStatus = statusFor(part, 'mp3');
                    const ultraHdStatus = statusFor(part, 'flac');

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
                            type="music"
                            src={
                              part.posterPath
                                ? part.posterPath
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
              value={
                getMusicServiceQuality(service) === 'flac'
                  ? 'flac'
                  : getMusicServiceQuality(service) === 'mp3'
                    ? 'mp3'
                    : selectedFormat
              }
              options={[
                {
                  label: 'MP3',
                  value: 'mp3',
                  disabled:
                    !!services &&
                    !services.some((item) =>
                      isMusicServiceForQuality(item, 'mp3')
                    ),
                },
                {
                  label: 'FLAC',
                  value: 'flac',
                  disabled:
                    !!services &&
                    !services.some((item) =>
                      isMusicServiceForQuality(item, 'flac')
                    ),
                },
              ]}
              onChange={(quality) => {
                setSelectedFormat(quality);
                setRequestOverrides(undefined);
                setQualityRevision((current) => current + 1);
              }}
              label={intl.formatMessage(messages.quality)}
              autoSelectAvailable={false}
              purpose="request"
            />
          </div>

          {canUseAdvancedOptions && initialService && (
            <AdvancedRequester
              key={selectedFormat + '-' + qualityRevision}
              type="music"
              is4k={false}
              defaultOverrides={{ server: initialService.id }}
              quota={quota}
              expanded={advancedOptionsOpen}
              panelOnly
              rootFolderTable
              requestedByPortal={requestedByPortal}
              onChange={(overrides) => setRequestOverrides(overrides)}
            />
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <div className="mr-auto flex items-center gap-2">
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
              disabled={isUpdating}
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
}
