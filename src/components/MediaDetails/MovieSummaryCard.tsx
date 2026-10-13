import CachedImage from '@app/components/Common/CachedImage';
import WatchedBadge from '@app/components/Common/WatchedBadge';
import AvailabilityValue from '@app/components/MediaDetails/AvailabilityValue';
import useSettings from '@app/hooks/useSettings';
import defineMessages from '@app/utils/defineMessages';
import { getTmdbPosterImageUrl } from '@app/utils/imageCache';
import { getViewerAvailabilityPresentation } from '@app/utils/viewerAvailabilityPresentation';
import { MediaStatus } from '@server/constants/media';
import type { MovieDetails } from '@server/models/Movie';
import type { WatchStatusResponse } from '@server/models/WatchStatus';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.MovieSummaryCard', {
  mediaAndFormat: 'Media & Format',
  releaseDate: 'Release Date',
  runtime: 'Runtime',
  genres: 'Genres',
  director: 'Director',
  screenplay: 'Screenplay',
  studio: 'Studio',
  hd: 'HD',
  ultraHd: '4K',
  notAvailable: 'Not Available',
  availabilityHidden: 'Hidden',
  sharedAvailability: 'Shared: {status}',
  sharedFormat: '{quality} (shared)',
  minutes: '{minutes} minutes',
  ratings: 'Ratings',
  watched: 'Watched',
});

export type MovieSummaryData = Pick<
  MovieDetails,
  | 'id'
  | 'title'
  | 'posterPath'
  | 'releaseDate'
  | 'runtime'
  | 'genres'
  | 'productionCompanies'
  | 'mediaInfo'
>;

const getAvailabilityText = (
  status: MediaStatus | undefined,
  unavailable: string
) => {
  switch (status) {
    case MediaStatus.AVAILABLE:
      return 'Available';
    case MediaStatus.PARTIALLY_AVAILABLE:
      return 'Partially Available';
    case MediaStatus.PROCESSING:
      return 'Processing';
    case MediaStatus.PENDING:
      return 'Requested';
    case MediaStatus.BLOCKLISTED:
      return 'Blocklisted';
    default:
      return unavailable;
  }
};

const MovieSummaryCard = ({
  data,
  sortedCrew,
  show4kAvailability,
  href,
  selection,
  ratings,
  standalone = false,
  availabilityFooter,
  watchedStatus,
  onSelect,
  artwork,
  supplementalDirectors = [],
  supplementalWriters = [],
}: {
  data: MovieSummaryData;
  sortedCrew: MovieDetails['credits']['crew'];
  show4kAvailability: boolean;
  href?: string;
  selection?: ReactNode;
  ratings?: ReactNode;
  standalone?: boolean;
  availabilityFooter?: ReactNode;
  watchedStatus?: WatchStatusResponse;
  onSelect?: () => void;
  artwork?: ReactNode;
  supplementalDirectors?: string[];
  supplementalWriters?: string[];
}) => {
  const intl = useIntl();
  const settings = useSettings();
  const unavailable = intl.formatMessage(messages.notAvailable);
  const directors = sortedCrew.filter((person) => person.job === 'Director');
  const screenplay = sortedCrew.find((person) =>
    ['Screenplay', 'Writer', 'Story'].includes(person.job)
  );
  const normalizedCrewNames = new Set(
    sortedCrew.map((person) => person.name.trim().toLocaleLowerCase())
  );
  const fallbackDirectors = supplementalDirectors.filter(
    (name) => !normalizedCrewNames.has(name.trim().toLocaleLowerCase())
  );
  const fallbackWriters = supplementalWriters.filter(
    (name) => !normalizedCrewNames.has(name.trim().toLocaleLowerCase())
  );
  const available = (status?: MediaStatus) =>
    status === MediaStatus.AVAILABLE ||
    status === MediaStatus.PARTIALLY_AVAILABLE;
  const standardAvailability = getViewerAvailabilityPresentation(
    data.mediaInfo?.status,
    settings.currentSettings.otherUsersAvailability,
    data.mediaInfo?.viewerRequestCoverage?.standard
  );
  const fourKAvailability = getViewerAvailabilityPresentation(
    data.mediaInfo?.status4k,
    settings.currentSettings.otherUsersAvailability,
    data.mediaInfo?.viewerRequestCoverage?.fourK
  );
  const formatLabel = (quality: string, shared: boolean) =>
    shared ? intl.formatMessage(messages.sharedFormat, { quality }) : quality;
  const formats = [
    available(data.mediaInfo?.status) && !standardAvailability.hidden
      ? formatLabel('HD', standardAvailability.shared)
      : undefined,
    available(data.mediaInfo?.status4k) && !fourKAvailability.hidden
      ? formatLabel('4K', fourKAvailability.shared)
      : undefined,
  ].filter(Boolean);
  const availabilityText = (
    status: MediaStatus | undefined,
    shared: boolean,
    hidden: boolean
  ) => {
    if (hidden) return intl.formatMessage(messages.availabilityHidden);
    const text = getAvailabilityText(status, unavailable);
    return shared
      ? intl.formatMessage(messages.sharedAvailability, { status: text })
      : text;
  };
  const mediaAndFormat =
    'Movie' + (formats.length ? ' · ' + formats.join(' + ') : '');
  const title =
    data.title +
    (data.releaseDate ? ' (' + data.releaseDate.slice(0, 4) + ')' : '');
  const Title = href ? 'h3' : 'h1';
  return (
    <div
      className={`detail-summary-card movie-summary-card ${selection ? 'movie-summary-card-with-selection' : ''} ${standalone ? 'detail-summary-standalone app-card-main refreshed-card-surface' : ratings ? 'app-card-sub detail-item-surface movie-summary-with-ratings' : 'app-card-inset refreshed-inset-surface'}`}
    >
      {artwork}
      {selection && <div className="movie-summary-selection">{selection}</div>}
      <div
        className="collection-summary-poster"
        data-testid="media-details-poster"
      >
        <CachedImage
          type="tmdb"
          src={
            getTmdbPosterImageUrl(data.posterPath) ||
            '/images/seerr_poster_not_found.png'
          }
          alt=""
          fill
          sizes="(min-width: 640px) 80px, 64px"
          className="collection-summary-poster-image"
        />
        {href && (
          <Link
            href={href}
            onClick={onSelect}
            aria-label={data.title}
            className="movie-summary-poster-link"
          />
        )}
      </div>

      <div className="relative z-10 flex min-w-0 flex-col">
        <Title className="movie-summary-title" data-testid="media-title">
          {href ? (
            <Link href={href} onClick={onSelect}>
              {title}
            </Link>
          ) : (
            title
          )}
        </Title>

        <div
          className={`movie-summary-fields detail-card-heading-spacing grid min-w-0 flex-1 ${ratings ? 'movie-summary-fields-with-ratings' : 'detail-three-column-grid'}`}
          data-table-layout="movie-title-details-table"
        >
          <div className="detail-paired-column-span min-w-0">
            <dl className="media-detail-rows detail-paired-columns grid min-w-0 content-start text-xs">
              <dt className="card:col-start-1 card:row-start-1 font-medium text-gray-100">
                {intl.formatMessage(messages.mediaAndFormat)}:
              </dt>
              <dd className="card:col-start-3 card:row-start-1 m-0 truncate">
                {mediaAndFormat}
              </dd>
              <dt className="card:col-start-1 card:row-start-2 font-medium text-gray-100">
                {intl.formatMessage(messages.releaseDate)}:
              </dt>
              <dd className="card:col-start-3 card:row-start-2 m-0 truncate">
                {data.releaseDate
                  ? intl.formatDate(data.releaseDate, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      timeZone: 'UTC',
                    })
                  : unavailable}
              </dd>
              <dt className="card:col-start-1 card:row-start-3 font-medium text-gray-100">
                {intl.formatMessage(messages.runtime)}:
              </dt>
              <dd className="card:col-start-3 card:row-start-3 m-0 truncate">
                {data.runtime
                  ? intl.formatMessage(messages.minutes, {
                      minutes: data.runtime,
                    })
                  : unavailable}
              </dd>
              <div className="media-detail-rows media-detail-column-divider card:col-span-1 card:col-start-5 card:row-span-3 card:row-start-1 col-span-2 grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] content-start gap-x-3">
                <dt className="font-medium text-gray-100">
                  {intl.formatMessage(messages.director)}:
                </dt>
                <dd className="m-0 truncate">
                  {directors.length > 0 || fallbackDirectors.length > 0 ? (
                    <>
                      {directors.slice(0, 2).map((person, index) => (
                        <span key={`${person.id}-${person.creditId}`}>
                          {index > 0 && ', '}
                          <Link
                            href={`/person/${person.id}`}
                            className="text-indigo-300 hover:text-indigo-200 hover:underline focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                          >
                            {person.name}
                          </Link>
                        </span>
                      ))}
                      {fallbackDirectors.slice(0, 2).map((name, index) => (
                        <span key={`fallback-director-${name}`}>
                          {(directors.length > 0 || index > 0) && ', '}
                          {name}
                        </span>
                      ))}
                    </>
                  ) : (
                    unavailable
                  )}
                </dd>
                <dt className="font-medium text-gray-100">
                  {intl.formatMessage(messages.screenplay)}:
                </dt>
                <dd className="m-0 truncate">
                  {screenplay || fallbackWriters.length > 0 ? (
                    <>
                      {screenplay && (
                        <Link
                          href={`/person/${screenplay.id}`}
                          className="text-indigo-300 hover:text-indigo-200 hover:underline focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                        >
                          {screenplay.name}
                        </Link>
                      )}
                      {fallbackWriters.slice(0, 2).map((name, index) => (
                        <span key={`fallback-writer-${name}`}>
                          {(screenplay || index > 0) && ', '}
                          {name}
                        </span>
                      ))}
                    </>
                  ) : (
                    unavailable
                  )}
                </dd>
                <dt className="font-medium text-gray-100">
                  {intl.formatMessage(messages.studio)}:
                </dt>
                <dd className="m-0 truncate">
                  {data.productionCompanies[0]?.id > 0 ? (
                    <Link
                      href={`/discover/movies/studio/${data.productionCompanies[0].id}`}
                      className="text-indigo-300 hover:text-indigo-200 hover:underline focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                    >
                      {data.productionCompanies[0].name}
                    </Link>
                  ) : data.productionCompanies[0] ? (
                    data.productionCompanies[0].name
                  ) : (
                    unavailable
                  )}
                </dd>
              </div>

              <dt className="card:col-start-1 card:row-start-4 font-medium text-gray-100">
                {intl.formatMessage(messages.genres)}:
              </dt>
              <dd
                className="card:col-span-3 card:col-start-3 card:row-start-4 m-0 min-w-0 break-words"
                data-testid="media-details-genres"
              >
                {data.genres.length > 0
                  ? data.genres.map((genre, index) => (
                      <span key={`${genre.id}-${genre.name}`}>
                        {index > 0 && ', '}
                        {genre.id > 0 ? (
                          <Link
                            href={`/discover/movies?genre=${genre.id}`}
                            className="text-indigo-300 hover:text-indigo-200 hover:underline focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                          >
                            {genre.name}
                          </Link>
                        ) : (
                          genre.name
                        )}
                      </span>
                    ))
                  : unavailable}
              </dd>
            </dl>
          </div>

          <div className="media-detail-column-divider flex min-w-0 flex-col text-xs leading-4">
            <dl className="media-detail-rows grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] content-start gap-x-3">
              <dt className="font-medium text-gray-100">
                {intl.formatMessage(messages.hd)}:
              </dt>
              <dd className="m-0 truncate">
                <AvailabilityValue
                  tone={standardAvailability.shared ? 'shared' : undefined}
                  status={
                    standardAvailability.hidden
                      ? undefined
                      : data.mediaInfo?.status
                  }
                >
                  {availabilityText(
                    data.mediaInfo?.status,
                    standardAvailability.shared,
                    standardAvailability.hidden
                  )}
                </AvailabilityValue>
              </dd>
              {show4kAvailability && (
                <>
                  <dt className="font-medium text-gray-100">
                    {intl.formatMessage(messages.ultraHd)}:
                  </dt>
                  <dd className="m-0 truncate">
                    <AvailabilityValue
                      tone={fourKAvailability.shared ? 'shared' : undefined}
                      status={
                        fourKAvailability.hidden
                          ? undefined
                          : data.mediaInfo?.status4k
                      }
                    >
                      {availabilityText(
                        data.mediaInfo?.status4k,
                        fourKAvailability.shared,
                        fourKAvailability.hidden
                      )}
                    </AvailabilityValue>
                  </dd>
                </>
              )}
              {!!watchedStatus?.availableCount && (
                <>
                  <dt className="card:row-start-5 font-medium text-gray-100">
                    {intl.formatMessage(messages.watched)}:
                  </dt>
                  <dd className="card:row-start-5 m-0">
                    <WatchedBadge
                      status={watchedStatus}
                      className="detail-watched-button"
                      showUnwatched
                    />
                  </dd>
                </>
              )}
            </dl>
            {availabilityFooter && (
              <div className="detail-summary-footer">{availabilityFooter}</div>
            )}
          </div>
          {ratings && (
            <div className="movie-summary-ratings-row">
              <div className="movie-summary-ratings-empty" aria-hidden="true" />
              <div
                className="movie-summary-ratings-values"
                aria-label={intl.formatMessage(messages.ratings)}
              >
                {ratings}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export default MovieSummaryCard;
