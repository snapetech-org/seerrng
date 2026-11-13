import CachedImage from '@app/components/Common/CachedImage';
import StatusBadgeMini from '@app/components/Common/StatusBadgeMini';
import ExternalLinkBlock from '@app/components/ExternalLinkBlock';
import MetadataAttribution from '@app/components/MediaDetails/MetadataAttribution';
import PersonCard from '@app/components/PersonCard';
import Slider from '@app/components/Slider';
import useSettings from '@app/hooks/useSettings';
import { useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import { getTmdbPosterImageUrl } from '@app/utils/imageCache';
import { getViewerAvailabilityPresentation } from '@app/utils/viewerAvailabilityPresentation';
import { ArrowRightCircleIcon } from '@heroicons/react/24/outline';
import type { MovieDetails } from '@server/models/Movie';
import type { TvDetails } from '@server/models/Tv';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.UpstreamVideoDetails', {
  overview: 'Overview',
  cast: 'Cast',
  fullCrew: 'View Full Crew',
  status: 'Status',
  releaseDate: 'Release Date',
  releaseDateCount: '{count, plural, one {Release Date} other {Release Dates}}',
  theatrical: 'Theatrical',
  digital: 'Digital',
  physical: 'Physical',
  episodeRuntime: 'Episode Runtime',
  creator: 'Creator',
  firstAirDate: 'First Air Date',
  nextAirDate: 'Next Air Date',
  language: 'Original Language',
  originalTitle: 'Original Title',
  country: 'Production Countries',
  budget: 'Budget',
  revenue: 'Revenue',
  seasons: 'Seasons',
  seasonCount: '{count, plural, one {# Season} other {# Seasons}}',
  episodes: 'Episodes',
  network: 'Network',
  studio: 'Studios',
  streamingProviders: 'Streaming Providers',
  overviewUnavailable: 'Overview unavailable',
  minutes: '{minutes} minutes',
  collection: 'View',
});

type Release = {
  type: number;
  release_date: string;
  certification?: string;
};

/** Seerr v3.5.1 detail-page hierarchy with SeerrNG's action and data slots. */
export default function UpstreamVideoDetails({
  data,
  mediaType,
  actions,
  ratings,
  seasons,
  sortedCrew,
  filteredReleases = [],
  children,
}: {
  data: MovieDetails | TvDetails;
  mediaType: 'movie' | 'tv';
  actions: ReactNode;
  ratings: ReactNode;
  seasons?: ReactNode;
  sortedCrew?: MovieDetails['credits']['crew'] | TvDetails['credits']['crew'];
  filteredReleases?: Release[];
  children: ReactNode;
}) {
  const intl = useIntl();
  const { currentSettings } = useSettings();
  const { user } = useUser();
  const movie = 'title' in data ? data : undefined;
  const tv = 'name' in data ? data : undefined;
  const title = movie?.title ?? tv?.name ?? '';
  const date = movie?.releaseDate ?? tv?.firstAirDate;
  const standard = getViewerAvailabilityPresentation(
    data.mediaInfo?.status,
    currentSettings.otherUsersAvailability,
    data.mediaInfo?.viewerRequestCoverage?.standard
  );
  const fourK = getViewerAvailabilityPresentation(
    data.mediaInfo?.status4k,
    currentSettings.otherUsersAvailability,
    data.mediaInfo?.viewerRequestCoverage?.fourK
  );
  const currency = (value: number) =>
    intl.formatNumber(value, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });
  const movieCrew = sortedCrew ?? data.credits.crew;
  const crew = [
    ...(tv?.createdBy.map((person) => ({ ...person, job: 'Creator' })) ?? []),
    ...movieCrew,
  ].slice(0, 6);
  const countryNames = data.productionCountries.map(
    (country) =>
      intl.formatDisplayName(country.iso_3166_1, {
        type: 'region',
        fallback: 'none',
      }) ?? country.name
  );
  const languageName = data.originalLanguage
    ? (intl.formatDisplayName(data.originalLanguage, {
        type: 'language',
        fallback: 'none',
      }) ??
      data.spokenLanguages.find(
        (language) => language.iso_639_1 === data.originalLanguage
      )?.name)
    : undefined;
  const seasonCount = tv?.seasons.filter(
    (season) => season.seasonNumber !== 0 && season.episodeCount !== 0
  ).length;
  const discoverRegion =
    user?.settings?.discoverRegion ?? currentSettings.discoverRegion ?? 'US';
  const streamingRegion =
    user?.settings?.streamingRegion ?? currentSettings.streamingRegion ?? 'US';
  const certification = movie
    ? filteredReleases.find((release) => release.certification)?.certification
    : tv?.contentRatings.results.find(
        (rating) => rating.iso_3166_1 === discoverRegion
      )?.rating;
  const streamingProviders =
    data.watchProviders?.find(
      (provider) => provider.iso_3166_1 === streamingRegion
    )?.flatrate ?? [];
  const genres = data.genres.map((genre) => (
    <Link
      key={genre.id}
      href={`/discover/${mediaType === 'movie' ? 'movies' : 'tv'}?genre=${genre.id}`}
      className="hover:underline"
    >
      {genre.name}
    </Link>
  ));
  const attributes = [
    ...(certification
      ? [
          <span className="upstream-media-certification" key="certification">
            {certification}
          </span>,
        ]
      : []),
    ...(movie?.runtime
      ? [intl.formatMessage(messages.minutes, { minutes: movie.runtime })]
      : []),
    ...(tv && seasonCount
      ? [intl.formatMessage(messages.seasonCount, { count: seasonCount })]
      : []),
    ...(genres.length ? [genres] : []),
  ];
  const dateFormatter: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  };
  const releaseKind = (type: number) =>
    intl.formatMessage(
      type === 4
        ? messages.digital
        : type === 5
          ? messages.physical
          : messages.theatrical
    );
  const facts: [string, ReactNode][] = [
    ...(movie?.originalTitle &&
    movie.originalLanguage !== intl.locale.slice(0, 2)
      ? [[intl.formatMessage(messages.originalTitle), movie.originalTitle] as [
          string,
          ReactNode,
        ]]
      : []),
    [intl.formatMessage(messages.status), data.status],
    ...(movie
      ? [
          [
            intl.formatMessage(messages.releaseDateCount, {
              count: filteredReleases.length || (movie.releaseDate ? 1 : 0),
            }),
            filteredReleases.length
              ? filteredReleases.map((release, index) => (
                  <span
                    className="upstream-release-date"
                    key={`${release.type}-${index}`}
                  >
                    <span aria-label={releaseKind(release.type)}>
                      {releaseKind(release.type)}
                    </span>
                    <span>
                      {intl.formatDate(release.release_date, dateFormatter)}
                    </span>
                  </span>
                ))
              : movie.releaseDate
                ? intl.formatDate(movie.releaseDate, dateFormatter)
                : undefined,
          ] as [string, ReactNode],
        ]
      : tv?.firstAirDate
        ? [
            [
              intl.formatMessage(messages.firstAirDate),
              intl.formatDate(tv.firstAirDate, dateFormatter),
            ] as [string, ReactNode],
          ]
        : []),
    ...(tv?.nextEpisodeToAir?.airDate
      ? [
          [
            intl.formatMessage(messages.nextAirDate),
            intl.formatDate(tv.nextEpisodeToAir.airDate, dateFormatter),
          ] as [string, ReactNode],
        ]
      : []),
    ...(tv?.episodeRunTime?.[0]
      ? [
          [
            intl.formatMessage(messages.episodeRuntime),
            intl.formatMessage(messages.minutes, {
              minutes: tv.episodeRunTime[0],
            }),
          ] as [string, ReactNode],
        ]
      : []),
    ...(languageName
      ? [
          [
            intl.formatMessage(messages.language),
            <Link
              href={`/discover/${mediaType === 'movie' ? 'movies' : 'tv'}/language/${data.originalLanguage}`}
            >
              {languageName}
            </Link>,
          ] as [string, ReactNode],
        ]
      : []),
    ...(countryNames.length
      ? [[intl.formatMessage(messages.country), countryNames.join(', ')] as [
          string,
          ReactNode,
        ]]
      : []),
    ...(movie?.budget
      ? [[intl.formatMessage(messages.budget), currency(movie.budget)] as [
          string,
          ReactNode,
        ]]
      : []),
    ...(movie?.revenue
      ? [[intl.formatMessage(messages.revenue), currency(movie.revenue)] as [
          string,
          ReactNode,
        ]]
      : []),
    ...(tv && seasonCount
      ? [
          [intl.formatMessage(messages.seasons), seasonCount] as [
            string,
            ReactNode,
          ],
        ]
      : []),
    ...(tv && tv.numberOfEpisodes > 0
      ? [
          [intl.formatMessage(messages.episodes), tv.numberOfEpisodes] as [
            string,
            ReactNode,
          ],
        ]
      : []),
    ...(tv?.networks.length
      ? [
          [
            intl.formatMessage(messages.network),
            tv.networks.map((network) => (
              <Link
                key={network.id}
                href={`/discover/tv/network/${network.id}`}
              >
                {network.name}
              </Link>
            )),
          ] as [string, ReactNode],
        ]
      : []),
    ...(streamingProviders.length
      ? [
          [
            intl.formatMessage(messages.streamingProviders),
            streamingProviders.map((provider) => (
              <span
                className="upstream-streaming-provider"
                key={provider.id}
                title={provider.name}
              >
                <CachedImage
                  type="tmdb"
                  src={`https://image.tmdb.org/t/p/w45/${provider.logoPath}`}
                  alt={provider.name}
                  width={32}
                  height={32}
                />
              </span>
            )),
          ] as [string, ReactNode],
        ]
      : []),
    ...(data.productionCompanies.length
      ? [
          [
            intl.formatMessage(messages.studio),
            data.productionCompanies.map((company) => (
              <Link
                key={company.id}
                href={`/discover/${mediaType}/studio/${company.id}`}
              >
                {company.name}
              </Link>
            )),
          ] as [string, ReactNode],
        ]
      : []),
  ];

  return (
    <div
      className="upstream-media-page"
      data-native-composition="upstream"
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
        <div className="upstream-media-poster" data-testid="media-details-poster">
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
            {!standard.hidden && data.mediaInfo?.status !== undefined && (
              <StatusBadgeMini
                status={data.mediaInfo.status}
                quality="HD"
                viewerHasRequestedCopy={
                  data.mediaInfo.viewerRequestCoverage?.standard
                }
              />
            )}
            {((mediaType === 'movie' && currentSettings.movie4kEnabled) ||
              (mediaType === 'tv' && currentSettings.series4kEnabled)) &&
              !fourK.hidden &&
              data.mediaInfo?.status4k !== undefined && (
                <StatusBadgeMini
                  status={data.mediaInfo.status4k}
                  quality="4K"
                  viewerHasRequestedCopy={
                    data.mediaInfo.viewerRequestCoverage?.fourK
                  }
                />
              )}
          </div>
          <h1 data-testid="media-title">
            {title}
            {date && <span className="upstream-media-year"> ({date.slice(0, 4)})</span>}
          </h1>
          <div className="upstream-media-attributes">
            {attributes.map((attribute, index) => (
              <span key={index}>{attribute}</span>
            ))}
          </div>
        </div>
        <div className="upstream-media-actions">{actions}</div>
      </header>
      <div className="upstream-media-overview">
        <section className="upstream-media-overview-copy">
          {movie?.tagline && (
            <p className="upstream-media-tagline">{movie.tagline}</p>
          )}
          <h2>{intl.formatMessage(messages.overview)}</h2>
          <p>
            {data.overview || intl.formatMessage(messages.overviewUnavailable)}
          </p>
          {data.credits.crew.length > 0 && (
            <>
              <ul className="upstream-media-crew">
                {crew.map((person, index) => (
                  <li key={`${person.id}-${person.job}-${index}`}>
                    <span>{person.job}</span>
                    <Link href={`/person/${person.id}`}>
                      {person.name}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="upstream-full-crew-wrap">
                <Link
                  className="upstream-full-crew"
                  href={`/${mediaType}/${data.id}/crew`}
                >
                  {intl.formatMessage(messages.fullCrew)}
                  <ArrowRightCircleIcon aria-hidden="true" />
                </Link>
              </div>
            </>
          )}
          {movie?.keywords.length ? (
            <div className="upstream-media-keywords">
              {movie.keywords.map((keyword) => (
                <Link
                  href={`/discover/movies?keywords=${keyword.id}`}
                  key={keyword.id}
                >
                  <span>{keyword.name}</span>
                </Link>
              ))}
            </div>
          ) : null}
          <MetadataAttribution sources={data.metadataSources} />
          {seasons && (
            <section className="upstream-seasons-section">
              <h2>{intl.formatMessage(messages.seasons)}</h2>
              {seasons}
            </section>
          )}
        </section>
        <aside className="upstream-media-overview-right">
          {movie?.collection && (
            <Link
              href={`/collection/${movie.collection.id}`}
              className="upstream-collection-card"
            >
              {movie.collection.backdropPath && (
                <CachedImage
                  type="tmdb"
                  src={`https://image.tmdb.org/t/p/w1440_and_h320_multi_faces/${movie.collection.backdropPath}`}
                  alt=""
                  fill
                />
              )}
              <span>{movie.collection.name}</span>
              <span className="upstream-collection-button">
                {intl.formatMessage(messages.collection)}
              </span>
            </Link>
          )}
          <div className="upstream-media-facts">
            <div className="upstream-media-ratings">{ratings}</div>
            <dl>
              {facts
                .filter(([, value]) => value !== undefined && value !== null && value !== '')
                .map(([label, value]) => (
                  <div className="upstream-media-fact" key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              <div className="upstream-media-fact upstream-media-external-links">
                <ExternalLinkBlock
                  mediaType={mediaType}
                  tmdbId={data.id}
                  tvdbId={data.externalIds.tvdbId}
                  imdbId={data.externalIds.imdbId}
                />
              </div>
            </dl>
          </div>
        </aside>
      </div>
      {data.credits.cast.length > 0 && (
        <Slider
          heading={
            <Link
              href={`/${mediaType}/${data.id}/cast`}
              className="slider-title"
            >
              <span>{intl.formatMessage(messages.cast)}</span>
              <ArrowRightCircleIcon aria-hidden="true" />
            </Link>
          }
          sliderKey="cast"
          isLoading={false}
          isEmpty={false}
          items={data.credits.cast.slice(0, 20).map((person) => (
            <PersonCard
              key={`cast-item-${person.id}`}
              personId={person.id}
              name={person.name}
              subName={person.character}
              profilePath={person.profilePath}
            />
          ))}
        />
      )}
      {children}
    </div>
  );
}
