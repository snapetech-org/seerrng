import CachedImage from '@app/components/Common/CachedImage';
import StatusBadgeMini from '@app/components/Common/StatusBadgeMini';
import ExternalLinkBlock from '@app/components/ExternalLinkBlock';
import MetadataAttribution from '@app/components/MediaDetails/MetadataAttribution';
import useSettings from '@app/hooks/useSettings';
import defineMessages from '@app/utils/defineMessages';
import { getTmdbPosterImageUrl } from '@app/utils/imageCache';
import { getViewerAvailabilityPresentation } from '@app/utils/viewerAvailabilityPresentation';
import { ArrowRightCircleIcon } from '@heroicons/react/24/outline';
import { UserIcon } from '@heroicons/react/24/solid';
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
  episodeRuntime: 'Episode Runtime',
  creator: 'Creator',
  firstAirDate: 'First Air Date',
  lastAirDate: 'Last Air Date',
  language: 'Original Language',
  budget: 'Budget',
  revenue: 'Revenue',
  seasons: 'Seasons',
  seasonCount: '{count, plural, one {# Season} other {# Seasons}}',
  episodes: 'Episodes',
  network: 'Network',
  studio: 'Studios',
  overviewUnavailable: 'Overview unavailable',
  minutes: '{minutes} minutes',
});

/** Upstream v3.5.1 hierarchy: artwork header/actions, open overview and facts,
 * then cast and related content. Action slots retain the native permission,
 * request and provider handlers; theme packages cannot execute code. */
export default function UpstreamVideoDetails({
  data,
  mediaType,
  actions,
  ratings,
  seasons,
  children,
}: {
  data: MovieDetails | TvDetails;
  mediaType: 'movie' | 'tv';
  actions: ReactNode;
  ratings: ReactNode;
  seasons?: ReactNode;
  children: ReactNode;
}) {
  const intl = useIntl();
  const { currentSettings } = useSettings();
  const movie = 'title' in data ? data : undefined;
  const tv = 'name' in data ? data : undefined;
  const title = movie?.title ?? tv?.name ?? '';
  const date = movie?.releaseDate ?? tv?.firstAirDate;
  const runtime = movie?.runtime ?? tv?.episodeRunTime?.[0];
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
      minimumFractionDigits: 2,
    });
  const facts: [string, ReactNode][] = [
    [intl.formatMessage(messages.status), data.status],
    ...(date
      ? [
          [
            intl.formatMessage(
              tv ? messages.firstAirDate : messages.releaseDate
            ),
            intl.formatDate(date, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            }),
          ] as [string, ReactNode],
        ]
      : []),
    ...(tv?.lastAirDate
      ? [
          [
            intl.formatMessage(messages.lastAirDate),
            intl.formatDate(tv.lastAirDate, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            }),
          ] as [string, ReactNode],
        ]
      : []),
    ...(tv && runtime
      ? [
          [
            intl.formatMessage(messages.episodeRuntime),
            intl.formatMessage(messages.minutes, { minutes: runtime }),
          ] as [string, ReactNode],
        ]
      : []),
    [
      intl.formatMessage(messages.language),
      intl.formatDisplayName(data.originalLanguage, { type: 'language' }),
    ],
    ...(movie?.budget
      ? [
          [intl.formatMessage(messages.budget), currency(movie.budget)] as [
            string,
            ReactNode,
          ],
        ]
      : []),
    ...(movie?.revenue
      ? [
          [intl.formatMessage(messages.revenue), currency(movie.revenue)] as [
            string,
            ReactNode,
          ],
        ]
      : []),
    ...(tv
      ? ([
          [intl.formatMessage(messages.seasons), tv.numberOfSeasons],
          [intl.formatMessage(messages.episodes), tv.numberOfEpisodes],
          [
            intl.formatMessage(messages.network),
            tv.networks.map((n) => n.name).join(', '),
          ],
        ] as [string, ReactNode][])
      : []),
    [
      intl.formatMessage(messages.studio),
      data.productionCompanies.map((c) => c.name).join(', '),
    ],
  ];
  return (
    <div className="upstream-media-page" data-native-composition="upstream">
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
        <div
          className="upstream-media-poster"
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
            {date && (
              <span className="upstream-media-year"> ({date.slice(0, 4)})</span>
            )}
          </h1>
          <div className="upstream-media-attributes">
            {tv ? (
              <span>
                {intl.formatMessage(messages.seasonCount, {
                  count: tv.numberOfSeasons,
                })}
              </span>
            ) : runtime ? (
              <span>
                {intl.formatMessage(messages.minutes, { minutes: runtime })}
              </span>
            ) : null}
            {data.genres.map((genre) => (
              <Link
                key={genre.id}
                href={`/discover/${mediaType === 'movie' ? 'movies' : 'tv'}?genre=${genre.id}`}
              >
                {genre.name}
              </Link>
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
          <ul className="upstream-media-crew">
            {tv?.createdBy.map((person) => (
              <li key={`creator-${person.id}`}>
                <span>{intl.formatMessage(messages.creator)}</span>
                <Link href={`/person/${person.id}`}>{person.name}</Link>
              </li>
            ))}
            {data.credits.crew
              .filter((p) =>
                ['Director', 'Writer', 'Screenplay', 'Creator'].includes(p.job)
              )
              .slice(0, 6)
              .map((person) => (
                <li key={`${person.id}-${person.job}`}>
                  <span>{person.job}</span>
                  <Link href={`/person/${person.id}`}>{person.name}</Link>
                </li>
              ))}
          </ul>
          {data.credits.crew.length > 0 && (
            <Link
              className="upstream-full-crew"
              href={`/${mediaType}/${data.id}/crew`}
            >
              {intl.formatMessage(messages.fullCrew)}
              <ArrowRightCircleIcon aria-hidden="true" />
            </Link>
          )}
          <MetadataAttribution sources={data.metadataSources} />
          {seasons && (
            <section className="upstream-seasons-section">
              <h2>{intl.formatMessage(messages.seasons)}</h2>
              {seasons}
            </section>
          )}
        </section>
        <aside className="upstream-media-facts">
          <div className="upstream-media-ratings">{ratings}</div>
          <dl>
            {facts
              .filter(
                ([, value]) =>
                  value !== undefined && value !== null && value !== ''
              )
              .map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>
          <div className="upstream-external-links">
            <ExternalLinkBlock
              mediaType={mediaType}
              tmdbId={data.id}
              tvdbId={data.externalIds.tvdbId}
              imdbId={data.externalIds.imdbId}
            />
          </div>
        </aside>
      </div>
      {data.credits.cast.length > 0 && (
        <section className="upstream-media-cast">
          <h2>
            <Link
              className="upstream-cast-heading"
              href={`/${mediaType}/${data.id}/cast`}
            >
              {intl.formatMessage(messages.cast)}
              <ArrowRightCircleIcon aria-hidden="true" />
            </Link>
          </h2>
          <div className="upstream-media-cast-track">
            {data.credits.cast.slice(0, 20).map((person, index) => (
              <Link href={`/person/${person.id}`} key={`${person.id}-${index}`}>
                <div className="upstream-media-cast-image">
                  {person.profilePath ? (
                    <CachedImage
                      type="tmdb"
                      src={getTmdbPosterImageUrl(person.profilePath)!}
                      alt=""
                      fill
                    />
                  ) : (
                    <UserIcon aria-hidden="true" />
                  )}
                </div>
                <strong>{person.name}</strong>
                <span>{person.character}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
      {children}
    </div>
  );
}
