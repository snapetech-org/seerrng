import CollectionSummaryCard from '@app/components/CollectionDetails/CollectionSummaryCard';
import DetailDisclosureButton from '@app/components/MediaDetails/DetailDisclosureButton';
import ExpandableCreditList from '@app/components/MediaDetails/ExpandableCreditList';
import MediaDetailArtwork from '@app/components/MediaDetails/MediaDetailArtwork';
import MediaQualitySelect from '@app/components/MediaDetails/MediaQualitySelect';
import MetadataAttribution from '@app/components/MediaDetails/MetadataAttribution';
import MovieSummaryCard from '@app/components/MediaDetails/MovieSummaryCard';
import SubjectTagVisibilityPanel from '@app/components/MediaDetails/SubjectTagVisibilityPanel';
import VideoRatings from '@app/components/MediaDetails/VideoRatings';
import { subjectTagClassName } from '@app/components/MediaDetails/subjectTagStyle';
import MediaSlider from '@app/components/MediaSlider';
import useDetailDisclosurePins from '@app/hooks/useDetailDisclosurePins';
import useWatchStatus from '@app/hooks/useWatchStatus';
import defineMessages from '@app/utils/defineMessages';
import type { RatingResponse } from '@server/api/ratings';
import { MediaStatus } from '@server/constants/media';
import type { MovieDetails } from '@server/models/Movie';
import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.MovieDetails.Layout', {
  mediaAndFormat: 'Media & Format',
  releaseDate: 'Release Date',
  runtime: 'Runtime',
  genres: 'Genres',
  director: 'Director',
  screenplay: 'Screenplay',
  studio: 'Studio',
  hd: 'HD',
  ultraHd: '4K',
  overview: 'Overview',
  overviewUnavailable: 'Overview unavailable',
  viewCast: 'Cast',
  viewCollection: 'Collection',
  viewCrew: 'Crew',
  subjectTags: 'Subject Tags',
  fullCastList: 'Full Cast List',
  fullCrewList: 'Full Crew List',
  noCast: 'No Cast Information Available',
  noCrew: 'No Crew Information Available',
  noTags: 'No subject tags available',
  movieDetails: 'Details',
  status: 'Status',
  releaseDates: 'Release Dates',
  revenue: 'Revenue',
  budget: 'Budget',
  language: 'Language',
  country: 'Country',
  studios: 'Studios',
  notAvailable: 'Not available',
  minutes: '{minutes} minutes',
  recommendations: 'Recommendations',
  similar: 'Similar Titles',
  theatrical: 'Theatrical',
  digital: 'Digital',
  physical: 'Physical',
  quality: 'Quality',
});

interface MovieDetailsLayoutProps {
  data: MovieDetails;
  ratingData?: RatingResponse;
  sortedCrew: MovieDetails['credits']['crew'];
  filteredReleases: {
    type: number;
    release_date: string;
  }[];
  show4kAvailability: boolean;
  primaryActions: ReactNode;
  secondaryActions: ReactNode;
  indexerSearchAction: ReactNode;
  indexerCompanionActions: ReactNode;
  reportIssueAction: ReactNode;
  requestAction: ReactNode;
  playbackActions?: (is4k: boolean) => ReactNode;
}

const availableStatuses = new Set([
  MediaStatus.PARTIALLY_AVAILABLE,
  MediaStatus.AVAILABLE,
]);

const MovieDetailsLayout = ({
  data,
  ratingData,
  sortedCrew,
  filteredReleases,
  show4kAvailability,
  primaryActions,
  secondaryActions,
  indexerSearchAction,
  indexerCompanionActions,
  reportIssueAction,
  requestAction,
  playbackActions,
}: MovieDetailsLayoutProps) => {
  const intl = useIntl();
  const { data: watchedStatus } = useWatchStatus(
    'movie',
    data.id,
    Boolean(data.mediaInfo)
  );
  const { pins, togglePinned } = useDetailDisclosurePins('movie');
  const [showDetails, setShowDetails] = useState(false);
  useEffect(() => {
    setShowDetails(pins.details);
  }, [pins.details, data.id]);
  const [showCollection, setShowCollection] = useState(false);
  const [showCast, setShowCast] = useState(false);
  const [showCrew, setShowCrew] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState<'hd' | '4k'>(() =>
    show4kAvailability &&
    !availableStatuses.has(data.mediaInfo?.status as MediaStatus) &&
    availableStatuses.has(data.mediaInfo?.status4k as MediaStatus)
      ? '4k'
      : 'hd'
  );
  useEffect(() => {
    setShowCollection(pins.collection);
  }, [pins.collection, data.id]);
  useEffect(() => {
    setShowCast(pins.cast);
  }, [pins.cast]);
  useEffect(() => {
    setShowCrew(pins.crew);
  }, [pins.crew]);
  useEffect(() => {
    setShowTags(pins.subjectTags);
  }, [pins.subjectTags]);
  const unavailable = intl.formatMessage(messages.notAvailable);
  const featuredCrew = sortedCrew.slice(0, 6);
  const featuredCrewGroups = [0, 1, 2].map((column) =>
    [featuredCrew[column], featuredCrew[column + 3]].filter(Boolean)
  );
  const castCredits = useMemo(
    () =>
      data.credits.cast.map((person) => ({
        id: person.id,
        name: person.name,
        role: person.character,
        profilePath: person.profilePath,
      })),
    [data.credits.cast]
  );
  const crewCredits = useMemo(
    () =>
      data.credits.crew.map((person) => ({
        id: person.id,
        name: person.name,
        role: person.job,
        profilePath: person.profilePath,
      })),
    [data.credits.crew]
  );
  const displayedReleases =
    filteredReleases.length > 0
      ? filteredReleases.slice(0, 3)
      : data.releaseDate
        ? [{ type: 3, release_date: data.releaseDate }]
        : [];
  const releaseTypeLabel = (type: number) =>
    intl.formatMessage(
      type === 4
        ? messages.digital
        : type === 5
          ? messages.physical
          : messages.theatrical
    );
  const formatCurrency = (value: number) =>
    value > 0
      ? intl.formatNumber(value, { currency: 'USD', style: 'currency' })
      : unavailable;
  const originalLanguage =
    intl.formatDisplayName(data.originalLanguage, {
      type: 'language',
      fallback: 'none',
    }) ??
    data.spokenLanguages.find(
      (language) => language.iso_639_1 === data.originalLanguage
    )?.name ??
    unavailable;

  const availableFormats = [
    availableStatuses.has(data.mediaInfo?.status as MediaStatus)
      ? 'HD'
      : undefined,
    availableStatuses.has(data.mediaInfo?.status4k as MediaStatus)
      ? '4K'
      : undefined,
  ].filter(Boolean);

  return (
    <div className="media-page">
      <article className="media-detail-card app-card-main refreshed-card-surface refreshed-detail-text relative overflow-hidden rounded-xl border border-gray-700 p-3 shadow-lg shadow-gray-950/20">
        {data.backdropPath && (
          <MediaDetailArtwork
            type="tmdb"
            src={`https://image.tmdb.org/t/p/original${data.backdropPath}`}
          />
        )}

        <div className="relative z-10">
          <MovieSummaryCard
            data={data}
            sortedCrew={sortedCrew}
            supplementalDirectors={data.supplementalMetadata?.directors}
            supplementalWriters={data.supplementalMetadata?.writers}
            show4kAvailability={show4kAvailability}
            watchedStatus={watchedStatus}
          />
          <section className="app-card-inset refreshed-inset-surface card-spacing-before rounded-lg border border-gray-700 p-3">
            <h2 className="media-inset-heading">
              {intl.formatMessage(messages.overview)}
            </h2>
            {data.tagline && (
              <p className="mt-1 text-sm text-indigo-300 italic">
                {data.tagline}
              </p>
            )}
            <p className="refreshed-detail-text-muted mt-4 text-sm leading-5">
              {data.overview ||
                intl.formatMessage(messages.overviewUnavailable)}
            </p>

            <MetadataAttribution sources={data.metadataSources} />

            {featuredCrew.length > 0 && (
              <div className="detail-three-column-grid card:border-t-0 card:pt-0 mt-4 grid border-t border-gray-600 pt-3">
                {featuredCrewGroups.map((group, groupIndex) => (
                  <dl
                    key={`featured-crew-${groupIndex}`}
                    className={`media-detail-rows grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] content-start gap-x-3 text-xs ${groupIndex > 0 ? `media-detail-column-divider ${groupIndex === 1 ? 'card:pr-3' : ''}` : 'card:pr-3'}`}
                  >
                    {group.map((person) => (
                      <div
                        className="contents"
                        key={`${person.id}-${person.creditId}`}
                      >
                        <dt className="font-medium text-gray-100">
                          {person.job}:
                        </dt>
                        <dd className="m-0 truncate">
                          <Link
                            href={`/person/${person.id}`}
                            className="text-indigo-300 hover:text-indigo-200 hover:underline focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                          >
                            {person.name}
                          </Link>
                        </dd>
                      </div>
                    ))}
                  </dl>
                ))}
              </div>
            )}
          </section>
          <div className="media-detail-disclosure-row">
            {data.collection && (
              <DetailDisclosureButton
                label={intl.formatMessage(messages.viewCollection)}
                open={showCollection}
                onClick={() => setShowCollection((open) => !open)}
                pinned={pins.collection}
                onPinClick={() => void togglePinned('collection')}
              />
            )}
            <DetailDisclosureButton
              label={intl.formatMessage(messages.viewCast)}
              open={showCast}
              onClick={() => setShowCast((open) => !open)}
              pinned={pins.cast}
              onPinClick={() => void togglePinned('cast')}
            />
            <DetailDisclosureButton
              label={intl.formatMessage(messages.viewCrew)}
              open={showCrew}
              onClick={() => setShowCrew((open) => !open)}
              pinned={pins.crew}
              onPinClick={() => void togglePinned('crew')}
            />
            <DetailDisclosureButton
              label={intl.formatMessage(messages.subjectTags)}
              open={showTags}
              onClick={() => setShowTags((open) => !open)}
              pinned={pins.subjectTags}
              onPinClick={() => void togglePinned('subjectTags')}
            />
            <DetailDisclosureButton
              label={intl.formatMessage(messages.movieDetails)}
              open={showDetails}
              onClick={() => setShowDetails((open) => !open)}
              pinned={pins.details}
              onPinClick={() => void togglePinned('details')}
              controls="movie-additional-details"
            />
          </div>
          {data.collection && showCollection && (
            <CollectionSummaryCard
              key={data.collection.id}
              collection={data.collection}
            />
          )}
          {showCast && (
            <ExpandableCreditList
              title={intl.formatMessage(messages.fullCastList)}
              credits={castCredits}
              emptyLabel={intl.formatMessage(messages.noCast)}
            />
          )}
          {showCrew && (
            <ExpandableCreditList
              title={intl.formatMessage(messages.fullCrewList)}
              credits={crewCredits}
              emptyLabel={intl.formatMessage(messages.noCrew)}
            />
          )}
          {showTags && (
            <section className="app-card-inset refreshed-inset-surface card-spacing-before rounded-lg border border-gray-700 p-3">
              <SubjectTagVisibilityPanel
                contentId="movie-subject-tags-content"
                hasTags={data.keywords.length > 0}
                title={intl.formatMessage(messages.subjectTags)}
              >
                {data.keywords.length === 0 ? (
                  <p className="refreshed-detail-text-muted text-xs">
                    {intl.formatMessage(messages.noTags)}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {data.keywords.map((keyword, index) => (
                      <Link
                        key={keyword.id}
                        href={`/discover/movies/keyword?keywords=${keyword.id}`}
                        className={subjectTagClassName(index)}
                      >
                        {keyword.name}
                      </Link>
                    ))}
                  </div>
                )}
              </SubjectTagVisibilityPanel>
            </section>
          )}
          {showDetails && (
            <section
              id="movie-additional-details"
              className="app-card-inset refreshed-inset-surface card-spacing-before rounded-lg border border-gray-700 p-3"
            >
              <h2 className="media-inset-heading detail-card-heading-after">
                {intl.formatMessage(messages.movieDetails)}
              </h2>
              <div
                className="detail-three-column-grid grid"
                data-table-layout="movie-details-table"
              >
                <dl className="media-detail-rows grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] content-start gap-x-3 text-xs">
                  <dt className="font-medium text-gray-100">
                    {intl.formatMessage(messages.status)}:
                  </dt>
                  <dd className="m-0">{data.status || unavailable}</dd>
                  <dt className="font-medium text-gray-100">
                    {intl.formatMessage(messages.releaseDates)}:
                  </dt>
                  <dd className="m-0 min-w-0">
                    {displayedReleases.length > 0
                      ? displayedReleases.map((release, index) => (
                          <span
                            className="block"
                            key={`${release.type}-${index}`}
                          >
                            {releaseTypeLabel(release.type)} ·{' '}
                            {intl.formatDate(release.release_date, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              timeZone: 'UTC',
                            })}
                          </span>
                        ))
                      : unavailable}
                  </dd>
                </dl>

                <dl className="media-detail-rows media-detail-column-divider card:pr-3 grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] content-start gap-x-3 text-xs">
                  <dt className="font-medium text-gray-100">
                    {intl.formatMessage(messages.revenue)}:
                  </dt>
                  <dd className="m-0 truncate">
                    {formatCurrency(data.revenue)}
                  </dd>
                  <dt className="font-medium text-gray-100">
                    {intl.formatMessage(messages.budget)}:
                  </dt>
                  <dd className="m-0 truncate">
                    {formatCurrency(data.budget)}
                  </dd>
                  <dt className="font-medium text-gray-100">
                    {intl.formatMessage(messages.language)}:
                  </dt>
                  <dd className="m-0 truncate">
                    <Link
                      href={`/discover/movies/language/${data.originalLanguage}`}
                      className="text-indigo-300 hover:text-indigo-200 hover:underline focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                    >
                      {originalLanguage}
                    </Link>
                  </dd>
                  <dt className="font-medium text-gray-100">
                    {intl.formatMessage(messages.country)}:
                  </dt>
                  <dd className="m-0 min-w-0">
                    {data.productionCountries.length > 0
                      ? data.productionCountries.map((country, index) => (
                          <span key={country.iso_3166_1}>
                            {index > 0 && ', '}
                            <Link
                              href={`/discover/movies?country=${country.iso_3166_1}`}
                              className="text-indigo-300 hover:text-indigo-200 hover:underline focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                            >
                              {intl.formatDisplayName(country.iso_3166_1, {
                                type: 'region',
                                fallback: 'none',
                              }) ?? country.name}
                            </Link>
                          </span>
                        ))
                      : unavailable}
                  </dd>
                </dl>

                <dl className="media-detail-rows media-detail-column-divider grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] content-start gap-x-3 text-xs">
                  <dt className="font-medium text-gray-100">
                    {intl.formatMessage(messages.studios)}:
                  </dt>
                  <dd className="m-0 min-w-0">
                    {data.productionCompanies.length > 0
                      ? data.productionCompanies.slice(0, 4).map((studio) =>
                          studio.id > 0 ? (
                            <Link
                              key={studio.id}
                              href={`/discover/movies/studio/${studio.id}`}
                              className="block truncate text-indigo-300 hover:text-indigo-200 hover:underline focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                            >
                              {studio.name}
                            </Link>
                          ) : (
                            <span className="block truncate" key={studio.name}>
                              {studio.name}
                            </span>
                          )
                        )
                      : unavailable}
                  </dd>
                </dl>
              </div>
            </section>
          )}
          <div className="media-rating-row">
            <MediaQualitySelect
              value={selectedQuality}
              options={[
                {
                  label: 'HD',
                  value: 'hd',
                  disabled: !availableFormats.includes('HD'),
                },
                ...(show4kAvailability
                  ? ([
                      {
                        label: '4K',
                        value: '4k',
                        disabled: !availableFormats.includes('4K'),
                      },
                    ] as const)
                  : []),
              ]}
              onChange={setSelectedQuality}
              label={intl.formatMessage(messages.quality)}
            />
            <VideoRatings
              mediaType="movie"
              id={data.id}
              voteAverage={data.voteAverage}
              voteCount={data.voteCount}
              ratings={ratingData}
            />
          </div>
          <div className="media-primary-action-row">
            {playbackActions?.(selectedQuality === '4k')}
            {primaryActions}
            {secondaryActions}
            <div className="media-primary-report-action">
              {reportIssueAction}
            </div>
          </div>
          <div className="media-request-action-row">
            <div className="media-request-search-action">
              {indexerSearchAction}
              {indexerCompanionActions}
            </div>
            <div className="media-request-submit-action">{requestAction}</div>
          </div>
        </div>
      </article>

      <MediaSlider
        sliderKey="recommendations"
        title={intl.formatMessage(messages.recommendations)}
        url={`/api/v1/movie/${data.id}/recommendations`}
        linkUrl={`/movie/${data.id}/recommendations`}
        hideWhenEmpty
      />
      <MediaSlider
        sliderKey="similar"
        title={intl.formatMessage(messages.similar)}
        url={`/api/v1/movie/${data.id}/similar`}
        linkUrl={`/movie/${data.id}/similar`}
        hideWhenEmpty
      />
      <div className="extra-bottom-space relative" />
    </div>
  );
};

export default MovieDetailsLayout;
