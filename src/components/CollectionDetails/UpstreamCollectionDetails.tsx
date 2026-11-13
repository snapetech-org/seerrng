import CachedImage from '@app/components/Common/CachedImage';
import { OptionalDisclosure } from '@app/components/Persius/Primitives';
import Slider from '@app/components/Slider';
import StatusBadge from '@app/components/StatusBadge';
import TitleCard from '@app/components/TitleCard';
import useSettings from '@app/hooks/useSettings';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { getTmdbPosterImageUrl } from '@app/utils/imageCache';
import { MediaStatus } from '@server/constants/media';
import type { Collection } from '@server/models/Collection';
import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.UpstreamCollectionDetails', {
  overview: 'Overview',
  movies: '{count, plural, one {# Movie} other {# Movies}}',
});

/** Source collection flow; native selection/playback tools retain their existing owner. */
export default function UpstreamCollectionDetails({
  enabled,
  data,
  attributes,
  actions,
  children,
  onRefresh,
}: {
  enabled: boolean;
  data: Collection;
  attributes: ReactNode;
  actions: ReactNode;
  children: ReactNode;
  onRefresh: () => void;
}) {
  const intl = useIntl();
  const settings = useSettings();
  const { hasPermission } = useUser();
  if (!enabled) return <>{children}</>;
  const blockedParts = data.parts.filter(
    (part) => part.mediaInfo?.status === MediaStatus.BLOCKLISTED
  );
  const collectionStatus = blockedParts.length
    ? MediaStatus.BLOCKLISTED
    : data.parts.length > 0 &&
        data.parts.every(
          (part) => part.mediaInfo?.status === MediaStatus.AVAILABLE
        )
      ? MediaStatus.AVAILABLE
      : data.parts.some(
            (part) => part.mediaInfo?.status === MediaStatus.AVAILABLE
          )
        ? MediaStatus.PARTIALLY_AVAILABLE
        : MediaStatus.UNKNOWN;
  const collectionStatus4k =
    data.parts.length > 0 &&
    data.parts.every(
      (part) => part.mediaInfo?.status4k === MediaStatus.AVAILABLE
    )
      ? MediaStatus.AVAILABLE
      : data.parts.some(
            (part) => part.mediaInfo?.status4k === MediaStatus.AVAILABLE
          )
        ? MediaStatus.PARTIALLY_AVAILABLE
        : MediaStatus.UNKNOWN;
  const downloadStatus = data.parts.flatMap(
    (part) => part.mediaInfo?.downloadStatus ?? []
  );
  const downloadStatus4k = data.parts.flatMap(
    (part) => part.mediaInfo?.downloadStatus4k ?? []
  );
  const fourKEnabled =
    settings.currentSettings.movie4kEnabled &&
    hasPermission([Permission.REQUEST_4K, Permission.REQUEST_4K_MOVIE], {
      type: 'or',
    });
  return (
    <div
      className="upstream-media-page"
      data-native-composition="upstream"
      data-media-type="collection"
      style={{ height: 493 }}
    >
      {data.backdropPath && (
        <div className="upstream-media-backdrop">
          <CachedImage
            type="tmdb"
            src={`https://image.tmdb.org/t/p/w1920_and_h800_multi_faces/${data.backdropPath}`}
            alt=""
            fill
            priority
          />
        </div>
      )}
      <header className="upstream-media-header">
        <div className="upstream-media-poster">
          <CachedImage
            type="tmdb"
            src={
              getTmdbPosterImageUrl(data.posterPath) ||
              '/images/seerr_poster_not_found.png'
            }
            alt=""
            fill
            priority
            sizes="(min-width:1280px) 208px, (min-width:768px) 176px, 128px"
          />
        </div>
        <div className="upstream-media-title">
          <div className="upstream-media-status">
            <StatusBadge
              status={collectionStatus}
              downloadItem={downloadStatus}
              title={data.parts.map((part) => part.title)}
              statusLabelOverride={
                blockedParts.length > 0 && blockedParts.length < data.parts.length
                  ? intl.formatMessage(globalMessages.partiallyblocklisted)
                  : undefined
              }
              inProgress={downloadStatus.length > 0}
            />
            {fourKEnabled && (
              <StatusBadge
                status={collectionStatus4k}
                downloadItem={downloadStatus4k}
                title={data.parts.map((part) => part.title)}
                is4k
                inProgress={downloadStatus4k.length > 0}
              />
            )}
          </div>
          <h1>{data.name}</h1>
          <div className="upstream-media-attributes">
            <span>
              {intl.formatMessage(messages.movies, {
                count: data.parts.length,
              })}
            </span>
            {attributes}
          </div>
        </div>
        <div className="upstream-media-actions">{actions}</div>
      </header>
      {data.overview && (
        <div className="upstream-media-overview">
          <section className="upstream-media-overview-copy">
            <h2>{intl.formatMessage(messages.overview)}</h2>
            <p>{data.overview}</p>
          </section>
        </div>
      )}
      <Slider
        heading={
          <h2 className="page-heading">
            {intl.formatMessage(globalMessages.movies)}
          </h2>
        }
        sliderKey={`collection-movies-${data.id}`}
        isLoading={false}
        isEmpty={data.parts.length === 0}
        items={data.parts.map((part) => (
          <TitleCard
            key={part.id}
            id={part.id}
            mediaType="movie"
            image={part.posterPath}
            summary={part.overview}
            year={part.releaseDate}
            title={part.title}
            userScore={part.voteAverage}
            voteCount={part.voteCount}
            status={part.mediaInfo?.status}
            status4k={part.mediaInfo?.status4k}
            viewerRequestCoverage={part.mediaInfo?.viewerRequestCoverage}
            isAddedToWatchlist={part.mediaInfo?.watchlists?.length ?? 0}
            mutateParent={onRefresh}
          />
        ))}
      />
      <OptionalDisclosure enabled className="upstream-extra-tools">
        {children}
      </OptionalDisclosure>
    </div>
  );
}
