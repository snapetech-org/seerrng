import BlocklistModal from '@app/components/BlocklistModal';
import CollectionAssociationsButton from '@app/components/CollectionDetails/CollectionAssociationsButton';
import CollectionMetadataDisclosures from '@app/components/CollectionDetails/CollectionMetadataDisclosures';
import CollectionPlayOnDeviceButton from '@app/components/CollectionDetails/CollectionPlayOnDeviceButton';
import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import FormatRequestControl from '@app/components/Common/FormatRequestControl';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import MediaServerPlayButton from '@app/components/Common/MediaServerPlayButton';
import PageTitle from '@app/components/Common/PageTitle';
import SelectionCircle from '@app/components/Common/SelectionCircle';
import ThreeItemScroll from '@app/components/Common/ThreeItemScroll';
import Tooltip from '@app/components/Common/Tooltip';
import MediaDetailArtwork from '@app/components/MediaDetails/MediaDetailArtwork';
import MediaQualitySelect from '@app/components/MediaDetails/MediaQualitySelect';
import MovieSummaryCard from '@app/components/MediaDetails/MovieSummaryCard';
import useCollectionAvailability from '@app/hooks/useCollectionAvailability';
import useCollectionMemberDetails from '@app/hooks/useCollectionMemberDetails';
import useSettings from '@app/hooks/useSettings';
import useToasts from '@app/hooks/useToasts';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import { encodeApiPathSegment } from '@app/utils/apiPath';
import {
  collectionPartHasQuality,
  orderCollectionPartsOldestFirst,
  reconcileCollectionPlaybackSelection,
} from '@app/utils/collectionPlaybackSelection';
import {
  averageCollectionRatings,
  getCollectionMemberRatings,
} from '@app/utils/collectionRatings';
import { sortCrewPriority } from '@app/utils/creditHelpers';
import defineMessages from '@app/utils/defineMessages';
import {
  getTmdbPosterImageUrl,
  getTmdbPosterImageVariants,
} from '@app/utils/imageCache';
import { getMovieTrailerUrl } from '@app/utils/movieTrailer';
import { refreshIntervalHelper } from '@app/utils/refreshIntervalHelper';
import { getViewerAvailabilityPresentation } from '@app/utils/viewerAvailabilityPresentation';
import {
  CheckCircleIcon,
  EyeSlashIcon,
  FilmIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { MediaStatus } from '@server/constants/media';
import type { Collection } from '@server/models/Collection';
import axios from 'axios';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';
import CollectionRatings from './CollectionRatings';
import CollectionServerActions from './CollectionServerActions';

const RequestModal = dynamic(() => import('@app/components/RequestModal'), {
  ssr: false,
});

const messages = defineMessages('components.CollectionDetails', {
  overview: 'Overview',
  overviewUnavailable: 'Overview unavailable',
  collectionSize: 'Collection Size',
  genres: 'Genres',
  collection: 'Collection',
  availability: 'Availability',
  available: 'Available',
  notAvailable: 'Not Available',
  releaseDate: 'Release Date',
  userScore: 'TMDB User Score',
  tmdb: 'TMDB',
  rtCritics: 'RT Critics',
  rtAudience: 'RT Audience',
  imdb: 'IMDb',
  requestUnavailable:
    'Every movie in this collection is already available or requested.',
  request4kUnavailable:
    'Every 4K movie in this collection is already available or requested.',
  selection: 'Select this movie for playback and collection creation',
  quality: 'Quality',
  chooseQuality: 'Choose HD or 4K before starting playback.',
  noQualitySelection: 'No selected movies are available in this quality.',
  partialPlayback: 'Not all selected titles are available in this quality.',
  ratingsFailed: 'Some collection details or ratings could not be loaded.',
  retry: 'Retry',
  selectAll: 'Select All',
  selectNone: 'Clear Selection',
  selectAllHelp: 'Select every available item for playback.',
  selectNoneHelp: 'Clear the playback selection.',
  watchTrailer: 'Watch Trailer',
  trailerHelp:
    'Watch the trailer for {title}, the first movie in this collection, in a new browser window.',
  noTrailer: 'No trailer is available for the first movie in this collection.',
  loadingTrailer: 'Loading the first movie’s trailer.',
});

interface CollectionDetailsProps {
  collection?: Collection;
}

const requestableStatuses = new Set([MediaStatus.UNKNOWN, MediaStatus.DELETED]);

const CollectionDetails = ({ collection }: CollectionDetailsProps) => {
  const intl = useIntl();
  const router = useRouter();
  const settings = useSettings();
  const { hasPermission } = useUser();
  const { addToast } = useToasts();
  const [requestModal, setRequestModal] = useState(false);
  const [is4k, setIs4k] = useState(false);
  const [playbackQuality, setPlaybackQuality] = useState<'hd' | '4k'>('hd');
  const [showBlocklistModal, setShowBlocklistModal] = useState(false);
  const [isBlocklistUpdating, setIsBlocklistUpdating] = useState(false);
  const [selectedMediaIds, setSelectedMediaIds] = useState<number[]>([]);
  const [hasManualPlaybackSelection, setHasManualPlaybackSelection] =
    useState(false);
  const collectionId =
    typeof router.query.collectionId === 'string'
      ? router.query.collectionId
      : (collection?.id?.toString() ?? '');

  const getDownloadItems = (value?: Collection) => ({
    downloadStatus: value?.parts.flatMap(
      (part) => part.mediaInfo?.downloadStatus ?? []
    ),
    downloadStatus4k: value?.parts.flatMap(
      (part) => part.mediaInfo?.downloadStatus4k ?? []
    ),
  });
  const {
    data,
    error,
    mutate: revalidate,
  } = useSWR<Collection>(
    collectionId
      ? `/api/v1/collection/${encodeApiPathSegment(collectionId)}`
      : null,
    {
      fallbackData: collection,
      revalidateOnMount: true,
      refreshInterval: refreshIntervalHelper(
        getDownloadItems(collection),
        15_000
      ),
    }
  );
  const { data: genres } = useSWR<{ id: number; name: string }[]>(
    '/api/v1/genres/movie'
  );
  const availability = useCollectionAvailability(collectionId, data);

  const orderedParts = useMemo(
    () => orderCollectionPartsOldestFirst(data?.parts ?? []),
    [data?.parts]
  );
  const isPartQualityHidden = (
    part: Collection['parts'][number],
    is4k: boolean
  ) =>
    getViewerAvailabilityPresentation(
      part.mediaInfo?.[is4k ? 'status4k' : 'status'],
      settings.currentSettings.otherUsersAvailability,
      part.mediaInfo?.viewerRequestCoverage?.[is4k ? 'fourK' : 'standard']
    ).hidden;
  const {
    data: members,
    isLoading: membersLoading,
    mutate: refreshMembers,
  } = useCollectionMemberDetails(orderedParts);
  const averages = averageCollectionRatings(orderedParts, members);
  const memberById = new Map(members?.map((member) => [member.id, member]));
  const firstPart = orderedParts[0];
  const trailerUrl = getMovieTrailerUrl(
    firstPart
      ? memberById.get(firstPart.id)?.details?.relatedVideos
      : undefined,
    settings.currentSettings.youtubeUrl
  );
  useEffect(() => {
    setPlaybackQuality('hd');
    setSelectedMediaIds([]);
    setHasManualPlaybackSelection(false);
  }, [collectionId]);
  const selectedPlaybackParts = orderedParts.filter(
    (part) => !hasManualPlaybackSelection || selectedMediaIds.includes(part.id)
  );
  const playableSelectedParts = selectedPlaybackParts.filter((part) =>
    collectionPartHasQuality(part, playbackQuality)
  );
  const effectivePlaybackMediaIds = playableSelectedParts.map(
    (part) => part.mediaInfo!.id
  );
  const allSelectedPlaybackAvailable =
    selectedPlaybackParts.length > 0 &&
    playableSelectedParts.length === selectedPlaybackParts.length;
  const selectedPlaybackIsShared = selectedPlaybackParts.some(
    (part) =>
      getViewerAvailabilityPresentation(
        part.mediaInfo?.[playbackQuality === '4k' ? 'status4k' : 'status'],
        settings.currentSettings.otherUsersAvailability,
        part.mediaInfo?.viewerRequestCoverage?.[
          playbackQuality === '4k' ? 'fourK' : 'standard'
        ]
      ).hidePlayback
  );
  const playbackUnavailableReason = !playbackQuality
    ? intl.formatMessage(messages.chooseQuality)
    : playableSelectedParts.length === 0
      ? intl.formatMessage(messages.noQualitySelection)
      : !allSelectedPlaybackAvailable
        ? intl.formatMessage(messages.partialPlayback)
        : undefined;
  useEffect(() => {
    setSelectedMediaIds((current) =>
      reconcileCollectionPlaybackSelection(
        current,
        orderedParts.map((part) => part.id),
        hasManualPlaybackSelection
      )
    );
  }, [orderedParts, hasManualPlaybackSelection]);

  if (!data && !error) return <LoadingSpinner />;
  if (!data) return <ErrorPage statusCode={404} />;

  const blocklistedParts = data.parts.filter(
    (part) => part.mediaInfo?.status === MediaStatus.BLOCKLISTED
  );
  const isCollectionBlocklisted = blocklistedParts.length > 0;
  const canUseBlocklist = hasPermission(Permission.MANAGE_BLOCKLIST);
  const canRequest = hasPermission(
    [Permission.REQUEST, Permission.REQUEST_MOVIE],
    { type: 'or' }
  );
  const canRequest4k =
    settings.currentSettings.movie4kEnabled &&
    hasPermission([Permission.REQUEST_4K, Permission.REQUEST_4K_MOVIE], {
      type: 'or',
    });
  const hasRequestable = data.parts.some((part) =>
    requestableStatuses.has(part.mediaInfo?.status ?? MediaStatus.UNKNOWN)
  );
  const hasRequestable4k = data.parts.some((part) =>
    requestableStatuses.has(part.mediaInfo?.status4k ?? MediaStatus.UNKNOWN)
  );
  const genreIds = [
    ...new Set(data.parts.flatMap((part) => part.genreIds ?? [])),
  ];
  const openRequest = (request4k: boolean) => {
    setIs4k(request4k);
    setRequestModal(true);
  };
  const togglePart = (mediaId: number) => {
    setHasManualPlaybackSelection(true);
    setSelectedMediaIds((current) =>
      current.includes(mediaId)
        ? current.filter((id) => id !== mediaId)
        : [...current, mediaId]
    );
  };
  const onBlocklist = async () => {
    setIsBlocklistUpdating(true);
    try {
      await axios.post(
        `/api/v1/blocklist/collection/${encodeApiPathSegment(data.id)}`
      );
      addToast(
        <span>
          {intl.formatMessage(globalMessages.blocklistSuccess, {
            title: data.name,
            strong: (value: ReactNode) => <strong>{value}</strong>,
          })}
        </span>,
        { appearance: 'success', autoDismiss: true }
      );
      await revalidate();
    } catch {
      addToast(intl.formatMessage(globalMessages.blocklistError), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setIsBlocklistUpdating(false);
      setShowBlocklistModal(false);
    }
  };

  const requestOptions = [
    ...(canRequest
      ? [
          {
            id: 'hd',
            label: 'HD',
            onClick: () => openRequest(false),
            disabled: !hasRequestable,
            disabledReason: intl.formatMessage(messages.requestUnavailable),
          },
        ]
      : []),
    ...(canRequest4k
      ? [
          {
            id: '4k',
            label: '4K',
            onClick: () => openRequest(true),
            disabled: !hasRequestable4k,
            disabledReason: intl.formatMessage(messages.request4kUnavailable),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageTitle title={data.name} />
      {requestModal && (
        <RequestModal
          tmdbId={data.id}
          show
          type="collection"
          is4k={is4k}
          onComplete={() => {
            void revalidate();
            setRequestModal(false);
          }}
          onCancel={() => setRequestModal(false)}
        />
      )}
      {showBlocklistModal && (
        <BlocklistModal
          tmdbId={data.id}
          type="collection"
          show
          onCancel={() => setShowBlocklistModal(false)}
          onComplete={onBlocklist}
          isUpdating={isBlocklistUpdating}
        />
      )}

      <article className="movie-collection-card media-detail-card app-card-main refreshed-card-surface refreshed-detail-text relative overflow-hidden rounded-xl border border-gray-700 p-3 shadow-lg shadow-gray-950/20">
        {data.backdropPath && (
          <MediaDetailArtwork
            type="tmdb"
            src={`https://image.tmdb.org/t/p/original${data.backdropPath}`}
          />
        )}

        <div className="relative z-10">
          <div className="app-card-sub detail-item-surface detail-summary-card collection-summary-header">
            <div className="collection-summary-poster">
              <CachedImage
                type="tmdb"
                src={
                  data.posterPath
                    ? getTmdbPosterImageUrl(data.posterPath)
                    : '/images/seerr_poster_not_found.png'
                }
                variants={getTmdbPosterImageVariants(data.posterPath)}
                alt=""
                fill
                priority
                sizes="(min-width: 640px) 80px, 64px"
                className="collection-summary-poster-image"
              />
            </div>
            <div className="collection-summary-details">
              <h1 className="collection-summary-title">{data.name}</h1>
              <dl className="collection-summary-table detail-card-heading-spacing">
                <dt className="collection-summary-overview-label">
                  {intl.formatMessage(messages.overview)}:
                </dt>
                <dd className="collection-summary-overview-value">
                  {data.overview ||
                    intl.formatMessage(messages.overviewUnavailable)}
                </dd>
                <dt className="collection-summary-genres-label">
                  {intl.formatMessage(messages.genres)}:
                </dt>
                <dd className="collection-summary-genres-value">
                  {genreIds.length > 0
                    ? genreIds.map((genreId, index) => (
                        <span key={genreId}>
                          {index > 0 && ', '}
                          <Link href={`/discover/movies?genre=${genreId}`}>
                            {genres?.find((genre) => genre.id === genreId)
                              ?.name ?? genreId}
                          </Link>
                        </span>
                      ))
                    : intl.formatMessage(messages.notAvailable)}
                </dd>
                <div className="collection-summary-size">
                  <dt className="collection-summary-size-label">
                    {intl.formatMessage(messages.collectionSize)}:
                  </dt>
                  <dd className="collection-summary-size-value">
                    {data.parts.length}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="media-rating-row">
            <MediaQualitySelect
              value={playbackQuality}
              autoSelectAvailable={false}
              label={intl.formatMessage(messages.quality)}
              options={[
                {
                  label: 'HD',
                  value: 'hd',
                  disabled: !orderedParts.some(
                    (part) =>
                      collectionPartHasQuality(part, 'hd') &&
                      !isPartQualityHidden(part, false)
                  ),
                },
                {
                  label: '4K',
                  value: '4k',
                  disabled: !orderedParts.some(
                    (part) =>
                      collectionPartHasQuality(part, '4k') &&
                      !isPartQualityHidden(part, true)
                  ),
                },
              ]}
              onChange={setPlaybackQuality}
            />
            {!selectedPlaybackIsShared && (
              <>
                <MediaServerPlayButton
                  collectionMediaIds={effectivePlaybackMediaIds}
                  defaultIs4k={playbackQuality === '4k'}
                  disabled={!allSelectedPlaybackAvailable}
                  disabledReason={playbackUnavailableReason}
                />
                <CollectionPlayOnDeviceButton
                  mediaIds={effectivePlaybackMediaIds}
                  is4k={playbackQuality === '4k'}
                  disabledReason={playbackUnavailableReason}
                />
              </>
            )}
            <CollectionRatings
              ratings={averages}
              total={orderedParts.length}
              loading={membersLoading}
            />
          </div>
          {members?.some((member) => member.failed) && (
            <div className="collection-summary-status" role="status">
              <span>{intl.formatMessage(messages.ratingsFailed)}</span>
              <Button onClick={() => void refreshMembers()}>
                {intl.formatMessage(messages.retry)}
              </Button>
            </div>
          )}

          <div className="media-primary-action-row">
            {canUseBlocklist && (
              <Tooltip
                content={intl.formatMessage(
                  isCollectionBlocklisted
                    ? globalMessages.alreadyBlocklisted
                    : globalMessages.addToBlocklist
                )}
              >
                <Button
                  buttonType="blocklist"
                  buttonSize="standard"
                  disabled={isCollectionBlocklisted}
                  disabledReason={intl.formatMessage(
                    globalMessages.alreadyBlocklisted
                  )}
                  onClick={() => setShowBlocklistModal(true)}
                  aria-label={intl.formatMessage(globalMessages.addToBlocklist)}
                >
                  <EyeSlashIcon className="!me-0" />
                </Button>
              </Tooltip>
            )}
            {trailerUrl ? (
              <Button
                as="a"
                href={trailerUrl}
                target="_blank"
                rel="noopener noreferrer"
                buttonType="trailer"
                buttonSize="sm"
                title={intl.formatMessage(messages.trailerHelp, {
                  title: firstPart?.title ?? data.name,
                })}
              >
                <FilmIcon />
                <span>{intl.formatMessage(messages.watchTrailer)}</span>
              </Button>
            ) : (
              <Button
                buttonType="trailer"
                buttonSize="sm"
                disabled
                disabledReason={intl.formatMessage(
                  membersLoading ? messages.loadingTrailer : messages.noTrailer
                )}
              >
                <FilmIcon />
                <span>{intl.formatMessage(messages.watchTrailer)}</span>
              </Button>
            )}
            <CollectionAssociationsButton parts={data.parts} />
            <FormatRequestControl options={requestOptions} />
          </div>

          <CollectionMetadataDisclosures parts={data.parts} />

          <div className="media-detail-disclosure-row collection-detail-disclosure-row collection-selection-action-row">
            <Button
              buttonType="association"
              title={intl.formatMessage(messages.selectAllHelp)}
              onClick={() => {
                setHasManualPlaybackSelection(true);
                setSelectedMediaIds(orderedParts.map((part) => part.id));
              }}
            >
              <CheckCircleIcon />
              <span>{intl.formatMessage(messages.selectAll)}</span>
            </Button>
            <Button
              buttonType="association"
              title={intl.formatMessage(messages.selectNoneHelp)}
              onClick={() => {
                setHasManualPlaybackSelection(true);
                setSelectedMediaIds([]);
              }}
            >
              <XMarkIcon />
              <span>{intl.formatMessage(messages.selectNone)}</span>
            </Button>
            {availability.supported && (
              <CollectionServerActions
                key={collectionId}
                id={collectionId}
                title={data.name}
                availability={availability.data}
                error={availability.error}
                revalidate={availability.mutate}
              />
            )}
          </div>

          <div className="card-spacing-before">
            <ThreeItemScroll label={data.name}>
              {orderedParts.map((part) => {
                const member = memberById.get(part.id);
                const details = member?.details;
                return (
                  <MovieSummaryCard
                    key={part.id}
                    data={{
                      id: part.id,
                      title: details?.title ?? part.title,
                      posterPath: details?.posterPath ?? part.posterPath,
                      releaseDate: details?.releaseDate ?? part.releaseDate,
                      runtime: details?.runtime,
                      productionCompanies: details?.productionCompanies ?? [],
                      genres:
                        details?.genres ??
                        part.genreIds.map((id) => ({
                          id,
                          name:
                            genres?.find((genre) => genre.id === id)?.name ??
                            String(id),
                        })),
                      mediaInfo: part.mediaInfo,
                    }}
                    sortedCrew={sortCrewPriority(details?.credits.crew ?? [])}
                    show4kAvailability={true}
                    href={`/movie/${part.id}`}
                    selection={
                      <SelectionCircle
                        onClick={() => togglePart(part.id)}
                        selected={selectedMediaIds.includes(part.id)}
                        label={intl.formatMessage(messages.selection)}
                      />
                    }
                    ratings={
                      <CollectionRatings
                        ratings={getCollectionMemberRatings(
                          part,
                          member?.ratings
                        )}
                        loading={membersLoading}
                      />
                    }
                  />
                );
              })}
            </ThreeItemScroll>
          </div>
        </div>
      </article>
    </>
  );
};

export default CollectionDetails;
