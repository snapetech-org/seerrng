import BlocklistConfirmationModal from '@app/components/BlocklistConfirmationModal';
import CollectionAssociationsButton from '@app/components/CollectionDetails/CollectionAssociationsButton';
import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import FormatRequestControl from '@app/components/Common/FormatRequestControl';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import MediaServerPlayButton from '@app/components/Common/MediaServerPlayButton';
import PageTitle from '@app/components/Common/PageTitle';
import ThreeItemScroll from '@app/components/Common/ThreeItemScroll';
import Tooltip from '@app/components/Common/Tooltip';
import MediaDetailArtwork from '@app/components/MediaDetails/MediaDetailArtwork';
import MediaQualitySelect from '@app/components/MediaDetails/MediaQualitySelect';
import MusicRatings from '@app/components/MediaDetails/MusicRatings';
import useCollectionAvailability from '@app/hooks/useCollectionAvailability';
import useCuratedPosters from '@app/hooks/useCuratedPosters';
import useCuratedRatings from '@app/hooks/useCuratedRatings';
import useSettings from '@app/hooks/useSettings';
import useToasts from '@app/hooks/useToasts';
import { Permission, useUser } from '@app/hooks/useUser';
import {
  getCollectionMemberRatings,
  type CollectionRating,
} from '@app/utils/collectionRatings';
import { mapWithConcurrency } from '@app/utils/concurrency';
import {
  curatedPlaybackIds,
  memberHasQuality,
  reconcileCuratedSelection,
} from '@app/utils/curatedCollectionSelection';
import defineMessages from '@app/utils/defineMessages';
import { getTmdbPosterImageUrl } from '@app/utils/imageCache';
import {
  DEFAULT_MUSIC_COLLECTION_FILTERS,
  filterMusicCollection,
  type MusicCollectionFilters,
} from '@app/utils/musicCollectionFilters';
import { averageMusicRatings } from '@app/utils/musicRatings';
import { getSafeHref } from '@app/utils/safeUrl';
import { getViewerAvailabilityPresentation } from '@app/utils/viewerAvailabilityPresentation';
import {
  CheckCircleIcon,
  EyeSlashIcon,
  FilmIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { MediaStatus, MediaType } from '@server/constants/media';
import type { ServiceCommonServer } from '@server/interfaces/api/serviceInterfaces';
import type {
  CuratedCollection,
  CuratedCollectionMember,
} from '@server/models/CuratedCollection';
import type { TvDetails } from '@server/models/Tv';
import axios from 'axios';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';
import CollectionOverview from './CollectionOverview';
import CollectionPlayOnDeviceButton from './CollectionPlayOnDeviceButton';
import CollectionRatings from './CollectionRatings';
import CollectionServerActions from './CollectionServerActions';
import CuratedGenreLinks from './CuratedGenreLinks';
import CuratedMemberCard from './CuratedMemberCard';
import DiscographyRequestActions from './DiscographyRequestActions';
import MusicCollectionFilterRow from './MusicCollectionFilterRow';

const messages = defineMessages('components.CuratedCollection', {
  overview: 'Overview',
  genres: 'Genres',
  size: 'Collection Size',
  quality: 'Quality',
  selectAll: 'Select All',
  selectNone: 'Clear Selection',
  allHelp: 'Select every item for playback and initial collection creation.',
  visibleHelp:
    'Select all shown items for playback and collection creation. Hidden items are not selected.',
  noMatches: 'No items match these filters.',
  noneHelp: 'Clear the shared playback and collection selection.',
  failed: 'This collection could not be loaded. Try again.',
  retry: 'Retry',
  noPlayback: 'No selected items are available in this quality.',
  partialPlayback: 'Not all selected titles are available in this quality.',
  trailer: 'Watch Trailer',
  trailerHelp: 'Watch the trailer for the first series in this collection.',
  noTrailer: 'No trailer is available for the first series.',
  blocklistAll: 'Blocklist all series in this collection.',
  blocklistAllMusic: 'Blocklist all albums in this collection.',
  blocklistComplete: 'Series collection added to the blocklist.',
  blocklistPartial: 'Some series in the collection could not be blocklisted.',
  alreadyBlocklisted: 'Every series in this collection is already blocklisted.',
  blocklistCompleteMusic: 'Music collection added to the blocklist.',
  blocklistPartialMusic:
    'Some albums in the collection could not be blocklisted.',
  alreadyBlocklistedMusic:
    'Every album in this collection is already blocklisted.',
  confirmBlocklist:
    'Blocklist all {count} {count, plural, one {series} other {series}} in this collection?',
  confirmBlocklistMusic:
    'Blocklist all {count} {count, plural, one {album} other {albums}} in this collection?',
  noSeriesSelected: 'Select at least one series to request.',
  noAlbumSelected: 'Select at least one album to request.',
  noFormatService: 'No {format} service is configured.',
  empty: 'No collection members are listed by the provider.',
  discography: '{artist} Discography',
  ratings:
    'Average of {count} rated albums out of {total}; missing ratings are excluded.',
});

const TvCollectionRequestModal = dynamic(
  () => import('@app/components/RequestModal/TvCollectionRequestModal'),
  { ssr: false }
);
const MusicCollectionRequestModal = dynamic(
  () => import('@app/components/RequestModal/MusicCollectionRequestModal'),
  { ssr: false }
);

export default function CuratedCollectionDetails({
  kind,
  id,
  discographyArtist,
  returnAlbumId,
}: {
  kind: 'tv' | 'music';
  id: string;
  discographyArtist?: string;
  returnAlbumId?: string;
}) {
  const intl = useIntl();
  const settings = useSettings();
  const { hasPermission } = useUser();
  const { addToast } = useToasts();
  const endpoint = `/api/v1/collection-catalog/${kind}/${encodeURIComponent(id)}`;
  const { data, error, mutate } = useSWR<CuratedCollection>(
    id ? endpoint : null
  );
  const { data: musicServices } = useSWR<ServiceCommonServer[]>(
    kind === 'music' ? '/api/v1/service/lidarr' : null
  );
  const isDiscography = discographyArtist !== undefined;
  const availability = useCollectionAvailability(
    isDiscography ? '' : id,
    data,
    kind
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [manual, setManual] = useState(false);
  const [filters, setFilters] = useState<MusicCollectionFilters>({
    ...DEFAULT_MUSIC_COLLECTION_FILTERS,
  });
  const [quality, setQuality] = useState<'standard' | 'high'>('standard');
  const [showTvRequestModal, setShowTvRequestModal] = useState(false);
  const [requestIs4k, setRequestIs4k] = useState(false);
  const [musicRequestFormat, setMusicRequestFormat] = useState<
    'mp3' | 'flac'
  >();
  const [showBlocklistConfirmation, setShowBlocklistConfirmation] =
    useState(false);
  const [isBlocklisting, setIsBlocklisting] = useState(false);
  useEffect(() => {
    setManual(false);
    setSelected([]);
    setQuality('standard');
    setFilters({ ...DEFAULT_MUSIC_COLLECTION_FILTERS });
    setShowTvRequestModal(false);
    setMusicRequestFormat(undefined);
  }, [kind, id]);
  const ids = data?.parts.map((part) => part.id).join(',') ?? '';
  const visibleParts =
    kind === 'music'
      ? filterMusicCollection(data?.parts ?? [], filters)
      : (data?.parts ?? []);
  const visibleIds = visibleParts.map((part) => part.id).join(',');
  // Intersect during render as well: no action can submit a stale hidden selection.
  const shownSelection = selected.filter((memberId) =>
    visibleParts.some((part) => part.id === memberId)
  );
  const changeFilters = (next: MusicCollectionFilters) => {
    setFilters(next);
    void retryRatings();
    retryPosters();
    setManual(true);
    const shown = new Set(
      filterMusicCollection(data?.parts ?? [], next).map((part) => part.id)
    );
    setSelected((current) => current.filter((memberId) => shown.has(memberId)));
  };
  useEffect(() => {
    setSelected((current) =>
      reconcileCuratedSelection(
        visibleIds ? visibleIds.split(',') : [],
        current,
        manual
      )
    );
  }, [visibleIds, manual]);
  const {
    members,
    loading: loadingMembers,
    retry: retryRatings,
  } = useCuratedRatings(kind, id, ids ? ids.split(',') : []);
  const {
    posters,
    loading: loadingPosters,
    retry: retryPosters,
  } = useCuratedPosters(
    kind === 'music' ? id : '',
    kind === 'music' ? (data?.parts ?? []) : []
  );
  const first = data?.parts[0];
  const { data: firstShow } = useSWR<TvDetails>(
    kind === 'tv' && first ? `/api/v1/tv/${first.id}` : null
  );
  const trailer = firstShow?.relatedVideos?.find(
    (video) => video.type === 'Trailer'
  );
  const trailerUrl = getSafeHref(
    trailer?.url ??
      (trailer?.site === 'YouTube'
        ? `https://www.youtube.com/watch?v=${encodeURIComponent(trailer.key)}`
        : '')
  );
  if (!data)
    return error ? (
      <div role="alert">
        <p>{intl.formatMessage(messages.failed)}</p>
        <Button onClick={() => void mutate()}>
          {intl.formatMessage(messages.retry)}
        </Button>
      </div>
    ) : (
      <LoadingSpinner />
    );
  const parts = data.parts;
  const blocklistParts = parts.filter(
    (part) =>
      part.mediaInfo?.status !== MediaStatus.BLOCKLISTED &&
      (kind === 'music' ||
        (Number.isSafeInteger(Number(part.id)) && Number(part.id) > 0))
  );
  const alreadyBlocklisted = parts.length > 0 && blocklistParts.length === 0;
  const requestableTvIds = shownSelection.filter((memberId) => {
    const numericId = Number(memberId);
    return Number.isSafeInteger(numericId) && numericId > 0;
  });
  const canRequestTv = hasPermission(
    [Permission.REQUEST, Permission.REQUEST_TV],
    { type: 'or' }
  );
  const canRequestTv4k =
    settings.currentSettings.series4kEnabled &&
    hasPermission([Permission.REQUEST_4K, Permission.REQUEST_4K_TV], {
      type: 'or',
    });
  const startTvRequests = (is4k: boolean) => {
    setRequestIs4k(is4k);
    setShowTvRequestModal(true);
  };
  const requestOptions = [
    ...(canRequestTv
      ? [
          {
            id: 'hd',
            label: 'HD',
            onClick: () => startTvRequests(false),
            disabled: requestableTvIds.length === 0,
            disabledReason: intl.formatMessage(messages.noSeriesSelected),
          },
        ]
      : []),
    ...(canRequestTv4k
      ? [
          {
            id: '4k',
            label: '4K',
            onClick: () => startTvRequests(true),
            disabled: requestableTvIds.length === 0,
            disabledReason: intl.formatMessage(messages.noSeriesSelected),
          },
        ]
      : []),
  ];
  const requestableMusicIds = shownSelection.filter((memberId) =>
    parts.some(
      (part) =>
        part.id === memberId &&
        part.mediaInfo?.status !== MediaStatus.BLOCKLISTED
    )
  );
  const canRequestMusic = hasPermission(
    [Permission.REQUEST, Permission.REQUEST_MUSIC],
    { type: 'or' }
  );
  const startMusicRequests = (format: 'mp3' | 'flac') => {
    const service = musicServices?.find((candidate) =>
      candidate.name.toLocaleLowerCase().includes(format)
    );
    if (!service || requestableMusicIds.length === 0) return;
    setMusicRequestFormat(format);
  };
  const musicRequestOptions = canRequestMusic
    ? (['mp3', 'flac'] as const).map((format) => {
        const service = musicServices?.find((candidate) =>
          candidate.name.toLocaleLowerCase().includes(format)
        );
        return {
          id: format,
          label: format.toLocaleUpperCase(),
          onClick: () => startMusicRequests(format),
          disabled: !service || requestableMusicIds.length === 0,
          disabledReason: !service
            ? intl.formatMessage(messages.noFormatService, {
                format: format.toLocaleUpperCase(),
              })
            : requestableMusicIds.length === 0
              ? intl.formatMessage(messages.noAlbumSelected)
              : undefined,
        };
      })
    : [];
  const onBlocklistCollection = async () => {
    setIsBlocklisting(true);
    try {
      const succeeded = await mapWithConcurrency(
        blocklistParts,
        5,
        async (part) => {
          try {
            await axios.post(
              '/api/v1/blocklist',
              kind === 'music'
                ? {
                    externalId: part.id,
                    externalProvider: 'musicbrainz',
                    mediaType: MediaType.MUSIC,
                    title: part.title,
                  }
                : {
                    tmdbId: Number(part.id),
                    mediaType: 'tv',
                    title: part.title,
                  }
            );
            return true;
          } catch {
            return false;
          }
        }
      );
      const complete = succeeded.every(Boolean);
      addToast(
        intl.formatMessage(
          complete
            ? kind === 'music'
              ? messages.blocklistCompleteMusic
              : messages.blocklistComplete
            : kind === 'music'
              ? messages.blocklistPartialMusic
              : messages.blocklistPartial
        ),
        { appearance: complete ? 'success' : 'error', autoDismiss: true }
      );
      await mutate();
    } finally {
      setIsBlocklisting(false);
      setShowBlocklistConfirmation(false);
    }
  };
  const displayName = isDiscography
    ? intl.formatMessage(messages.discography, {
        artist: discographyArtist || data.name.replace(/ Collection$/, ''),
      })
    : data.name;
  const playbackIds = curatedPlaybackIds(
    visibleParts,
    shownSelection,
    kind,
    quality === 'high'
  );
  const allSelectedPlaybackAvailable =
    shownSelection.length > 0 && playbackIds.length === shownSelection.length;
  const playbackUnavailableReason =
    playbackIds.length === 0
      ? intl.formatMessage(messages.noPlayback)
      : !allSelectedPlaybackAvailable
        ? intl.formatMessage(messages.partialPlayback)
        : undefined;
  const qualityParts =
    kind === 'music'
      ? visibleParts.filter((part) => shownSelection.includes(part.id))
      : parts;
  const partQualityPresentation = (
    part: CuratedCollectionMember,
    high: boolean
  ) =>
    getViewerAvailabilityPresentation(
      part.mediaInfo?.[high ? 'status4k' : 'status'],
      settings.currentSettings.otherUsersAvailability,
      kind === 'tv'
        ? part.mediaInfo?.viewerRequestCoverage?.[high ? 'fourK' : 'standard']
        : undefined
    );
  const selectedPlaybackIsShared =
    kind === 'tv' &&
    visibleParts.some(
      (part) =>
        shownSelection.includes(part.id) &&
        partQualityPresentation(part, quality === 'high').hidePlayback
    );
  const memberRatings = (part: CuratedCollectionMember) =>
    getCollectionMemberRatings(
      {
        id: Number(part.id),
        voteAverage: part.voteAverage ?? 0,
        voteCount: part.voteCount ?? 0,
      },
      members?.find((member) => member.id === part.id)?.ratings
    ).map((rating) =>
      rating.source === 'tmdb'
        ? { ...rating, href: `https://www.themoviedb.org/tv/${part.id}` }
        : rating
    );
  const averages: CollectionRating[] = (
    ['critics', 'audience', 'imdb', 'metacritic', 'trakt', 'tmdb'] as const
  ).map((source) => {
    const values = parts.flatMap((part) =>
      memberRatings(part)
        .filter(
          (rating) => rating.source === source && rating.value !== undefined
        )
        .map((rating) => rating.value!)
    );
    return {
      source,
      count: values.length,
      value: values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : undefined,
    };
  });
  const musicAverages = averageMusicRatings(
    members.map(
      (member) =>
        member.musicRatings ?? (member.musicRating ? [member.musicRating] : [])
    )
  );
  const toggle = (memberId: string) => {
    setManual(true);
    setSelected((current) =>
      current.includes(memberId)
        ? current.filter((value) => value !== memberId)
        : [...current, memberId]
    );
  };
  return (
    <>
      <PageTitle title={displayName} />
      {showBlocklistConfirmation && (
        <BlocklistConfirmationModal
          show
          onCancel={() => setShowBlocklistConfirmation(false)}
          onComplete={() => void onBlocklistCollection()}
          isUpdating={isBlocklisting}
          confirmationText={intl.formatMessage(
            kind === 'music'
              ? messages.confirmBlocklistMusic
              : messages.confirmBlocklist,
            { count: blocklistParts.length }
          )}
        />
      )}
      {kind === 'tv' && showTvRequestModal && (
        <TvCollectionRequestModal
          collectionId={id}
          initialSelectedIds={requestableTvIds}
          is4k={requestIs4k}
          onComplete={() => {
            setShowTvRequestModal(false);
            void mutate();
          }}
          onCancel={() => setShowTvRequestModal(false)}
        />
      )}
      {kind === 'music' && musicRequestFormat && (
        <MusicCollectionRequestModal
          collectionId={id}
          initialSelectedIds={requestableMusicIds}
          initialFormat={musicRequestFormat}
          onComplete={() => {
            setMusicRequestFormat(undefined);
            void mutate();
          }}
          onCancel={() => setMusicRequestFormat(undefined)}
        />
      )}
      <article className="media-detail-card app-card-main refreshed-card-surface refreshed-detail-text relative overflow-hidden rounded-xl border border-gray-700 p-3 shadow-lg shadow-gray-950/20">
        {(kind === 'music' ? data.posterPath : data.backdropPath) && (
          <MediaDetailArtwork
            type={kind === 'music' ? 'music' : 'tmdb'}
            src={
              kind === 'music'
                ? data.posterPath!
                : `https://image.tmdb.org/t/p/original${data.backdropPath}`
            }
          />
        )}
        <div className="card-stack relative z-10">
          <div className="app-card-sub detail-item-surface detail-summary-card collection-summary-header">
            <div className="collection-summary-poster">
              <CachedImage
                type={kind === 'music' ? 'music' : 'tmdb'}
                src={
                  (kind === 'music'
                    ? data.posterPath
                    : getTmdbPosterImageUrl(first?.posterPath)) ||
                  '/images/seerr_poster_not_found.png'
                }
                alt=""
                fill
                sizes="80px"
                className="collection-summary-poster-image"
              />
            </div>
            <div className="collection-summary-details">
              <h1 className="collection-summary-title">{displayName}</h1>
              <dl className="collection-summary-table detail-card-heading-spacing">
                <dt className="collection-summary-overview-label">
                  {intl.formatMessage(messages.overview)}:
                </dt>
                <dd className="collection-summary-overview-value">
                  <CollectionOverview
                    text={data.overview || '—'}
                    source={data.overviewSource}
                  />
                </dd>
                <dt className="collection-summary-genres-label">
                  {intl.formatMessage(messages.genres)}:
                </dt>
                <dd className="collection-summary-genres-value">
                  <CuratedGenreLinks kind={kind} parts={parts} />
                </dd>
                <div className="collection-summary-size">
                  <dt className="collection-summary-size-label">
                    {intl.formatMessage(messages.size)}:
                  </dt>
                  <dd className="collection-summary-size-value">
                    {parts.length}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
          {!isDiscography && (
            <div className="media-rating-row">
              <div className="collection-playback-controls">
                <MediaQualitySelect
                  value={quality}
                  onChange={setQuality}
                  label={intl.formatMessage(messages.quality)}
                  autoSelectAvailable={kind === 'music'}
                  options={[
                    {
                      label: kind === 'music' ? 'MP3' : 'HD',
                      value: 'standard',
                      disabled: !qualityParts.some(
                        (part) =>
                          memberHasQuality(part, kind, false) &&
                          !partQualityPresentation(part, false).hidden
                      ),
                    },
                    {
                      label: kind === 'music' ? 'FLAC' : '4K',
                      value: 'high',
                      disabled: !qualityParts.some(
                        (part) =>
                          memberHasQuality(part, kind, true) &&
                          !partQualityPresentation(part, true).hidden
                      ),
                    },
                  ]}
                />
                {!selectedPlaybackIsShared && (
                  <>
                    <MediaServerPlayButton
                      collectionMediaIds={playbackIds}
                      defaultIs4k={quality === 'high'}
                      disabled={!allSelectedPlaybackAvailable}
                      disabledReason={playbackUnavailableReason}
                    />
                    <CollectionPlayOnDeviceButton
                      mediaIds={playbackIds}
                      is4k={quality === 'high'}
                      disabledReason={playbackUnavailableReason}
                    />
                  </>
                )}
              </div>
              <div className="collection-rating-links">
                {kind === 'tv' ? (
                  <CollectionRatings
                    ratings={averages}
                    total={parts.length}
                    loading={loadingMembers && !members.length}
                  />
                ) : (
                  <MusicRatings ratings={musicAverages} total={parts.length} />
                )}
              </div>
            </div>
          )}
          {isDiscography && (
            <div className="discography-ratings">
              <MusicRatings ratings={musicAverages} total={parts.length} />
            </div>
          )}
          {(kind === 'tv' || (kind === 'music' && !isDiscography)) && (
            <div
              className={[
                'media-primary-action-row',
                kind === 'music' ? 'music-collection-primary-action-row' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {hasPermission(Permission.MANAGE_BLOCKLIST) && (
                <Tooltip
                  content={intl.formatMessage(
                    alreadyBlocklisted
                      ? kind === 'music'
                        ? messages.alreadyBlocklistedMusic
                        : messages.alreadyBlocklisted
                      : kind === 'music'
                        ? messages.blocklistAllMusic
                        : messages.blocklistAll
                  )}
                >
                  <Button
                    buttonType="blocklist"
                    buttonSize="standard"
                    disabled={alreadyBlocklisted || isBlocklisting}
                    disabledReason={intl.formatMessage(
                      alreadyBlocklisted
                        ? kind === 'music'
                          ? messages.alreadyBlocklistedMusic
                          : messages.alreadyBlocklisted
                        : kind === 'music'
                          ? messages.blocklistAllMusic
                          : messages.blocklistAll
                    )}
                    onClick={() => setShowBlocklistConfirmation(true)}
                    aria-label={intl.formatMessage(
                      kind === 'music'
                        ? messages.blocklistAllMusic
                        : messages.blocklistAll
                    )}
                  >
                    <EyeSlashIcon className="!mr-0" />
                  </Button>
                </Tooltip>
              )}
              {kind === 'tv' && trailerUrl ? (
                <Button
                  as="a"
                  href={trailerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  buttonType="trailer"
                  buttonSize="sm"
                  title={intl.formatMessage(messages.trailerHelp)}
                >
                  <FilmIcon />
                  <span>{intl.formatMessage(messages.trailer)}</span>
                </Button>
              ) : kind === 'tv' ? (
                <Button
                  buttonType="trailer"
                  buttonSize="sm"
                  disabled
                  disabledReason={intl.formatMessage(messages.noTrailer)}
                >
                  <FilmIcon />
                  <span>{intl.formatMessage(messages.trailer)}</span>
                </Button>
              ) : null}
              <CollectionAssociationsButton
                parts={parts}
                mediaType={kind === 'tv' ? 'tv' : 'album'}
              />
              {kind === 'tv' ? (
                <FormatRequestControl options={requestOptions} />
              ) : (
                <FormatRequestControl options={musicRequestOptions} />
              )}
            </div>
          )}
          <div
            className={[
              'media-detail-disclosure-row',
              'collection-detail-disclosure-row',
              kind === 'tv' ? 'collection-selection-action-row' : '',
              kind === 'music' ? 'music-collection-action-row' : '',
              isDiscography ? 'discography-selection-row' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <Button
              buttonType="association"
              title={
                isDiscography
                  ? intl.formatMessage(messages.selectAll)
                  : intl.formatMessage(
                      kind === 'music' ? messages.visibleHelp : messages.allHelp
                    )
              }
              onClick={() => {
                setManual(true);
                setSelected(visibleParts.map((part) => part.id));
              }}
            >
              <CheckCircleIcon />
              <span>{intl.formatMessage(messages.selectAll)}</span>
            </Button>
            <Button
              buttonType="association"
              title={intl.formatMessage(
                isDiscography ? messages.selectNone : messages.noneHelp
              )}
              onClick={() => {
                setManual(true);
                setSelected([]);
              }}
            >
              <XMarkIcon />
              <span>{intl.formatMessage(messages.selectNone)}</span>
            </Button>
            {isDiscography ? (
              <DiscographyRequestActions
                items={visibleParts.filter((part) =>
                  shownSelection.includes(part.id)
                )}
                returnHref={
                  returnAlbumId ? `/music/${returnAlbumId}` : `/artist/${id}`
                }
              />
            ) : (
              <CollectionServerActions
                id={id}
                title={data.name}
                kind={kind}
                availability={availability.data}
                error={availability.error}
                revalidate={availability.mutate}
                visibleItemIds={visibleParts.map((part) => part.id)}
              />
            )}
          </div>
          {kind === 'music' && (
            <MusicCollectionFilterRow
              parts={parts}
              filters={filters}
              onChange={changeFilters}
              loading={loadingMembers || loadingPosters}
              selectedCount={shownSelection.length}
              totalCount={parts.length}
            />
          )}
          {!parts.length ? (
            <p>{intl.formatMessage(messages.empty)}</p>
          ) : !visibleParts.length ? (
            <p role="status">{intl.formatMessage(messages.noMatches)}</p>
          ) : (
            <ThreeItemScroll label={displayName}>
              {visibleParts.map((part) => (
                <CuratedMemberCard
                  key={part.id}
                  part={{
                    ...part,
                    posterPath: posters[part.id] ?? part.posterPath,
                  }}
                  kind={kind}
                  selected={shownSelection.includes(part.id)}
                  selectionLabel={isDiscography ? part.title : undefined}
                  toggle={() => toggle(part.id)}
                  ratings={
                    kind === 'tv' ? (
                      <CollectionRatings
                        ratings={memberRatings(part)}
                        loading={loadingMembers && !members.length}
                      />
                    ) : (
                      <MusicRatings
                        ratings={
                          members.find((member) => member.id === part.id)
                            ?.musicRatings
                        }
                        albumId={part.id}
                        albumTitle={part.title}
                        artist={part.network}
                      />
                    )
                  }
                />
              ))}
            </ThreeItemScroll>
          )}
        </div>
      </article>
    </>
  );
}
