import CachedImage from '@app/components/Common/CachedImage';
import { OptionalDisclosure } from '@app/components/Persius/Primitives';
import Slider from '@app/components/Slider';
import TitleCard from '@app/components/TitleCard';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { getTmdbPosterImageUrl } from '@app/utils/imageCache';
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
  if (!enabled) return <>{children}</>;
  return (
    <div
      className="upstream-media-page"
      data-native-composition="upstream"
      data-media-type="collection"
    >
      {data.backdropPath && (
        <div className="upstream-media-backdrop">
          <CachedImage
            type="tmdb"
            src={`https://image.tmdb.org/t/p/original${data.backdropPath}`}
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
