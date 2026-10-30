import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import Header from '@app/components/Common/Header';
import PageTitle from '@app/components/Common/PageTitle';
import type { FilterOptions } from '@app/components/Discover/constants';
import useDiscover from '@app/hooks/useDiscover';
import useSettings from '@app/hooks/useSettings';
import { Permission, useUser } from '@app/hooks/useUser';
import {
  getUserServiceAvailability,
  isConfiguredMediaCategoryEnabled,
} from '@app/utils/serviceAvailability';
import { getViewerAvailabilityPresentation } from '@app/utils/viewerAvailabilityPresentation';
import { CheckIcon, ClockIcon, PlusIcon } from '@heroicons/react/24/outline';
import { MediaStatus } from '@server/constants/media';
import type { MovieResult } from '@server/models/Search';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';
import { calendarDate } from './format';
import messages from './messages';

const RequestModal = dynamic(() => import('@app/components/RequestModal'), {
  ssr: false,
});

export function ReleaseCard({
  movie,
  genreNames,
  onRequest,
}: {
  movie: MovieResult;
  genreNames: string[];
  onRequest?: () => void;
}) {
  const intl = useIntl();
  const { currentSettings } = useSettings();
  const day = calendarDate(movie.releaseDate);
  if (!day) return null;
  const availability = getViewerAvailabilityPresentation(
    movie.mediaInfo?.status,
    currentSettings.otherUsersAvailability,
    movie.mediaInfo?.viewerRequestCoverage?.standard
  );
  const available =
    movie.mediaInfo?.status === MediaStatus.AVAILABLE && !availability.hidden;
  const requested =
    movie.mediaInfo?.status === MediaStatus.PENDING ||
    movie.mediaInfo?.status === MediaStatus.PROCESSING;
  return (
    <article className="persius-release">
      <time className="persius-release-date" dateTime={movie.releaseDate}>
        <span>{intl.formatDate(day, { month: 'short' })}</span>
        <strong>{intl.formatDate(day, { day: 'numeric' })}</strong>
      </time>
      <Link
        className="persius-release-art"
        href={`/movie/${movie.id}`}
        aria-label={movie.title}
      >
        <CachedImage
          type="tmdb"
          src={
            movie.backdropPath || movie.posterPath
              ? `https://image.tmdb.org/t/p/w500${movie.backdropPath || movie.posterPath}`
              : '/images/seerr_poster_not_found.png'
          }
          alt=""
          fill
          sizes="120px"
        />
      </Link>
      <div className="persius-release-copy">
        <Link href={`/movie/${movie.id}`} title={movie.title}>
          {movie.title}
        </Link>
        <p>{genreNames.join(', ')}</p>
        {available || requested ? (
          <span
            className="persius-status"
            data-tone={available ? 'success' : 'warning'}
          >
            {available ? (
              <CheckIcon aria-hidden="true" />
            ) : (
              <ClockIcon aria-hidden="true" />
            )}
            {intl.formatMessage(
              available
                ? availability.shared
                  ? messages.sharedLibrary
                  : messages.inLibrary
                : messages.requested
            )}
          </span>
        ) : onRequest && movie.mediaInfo?.status !== MediaStatus.BLOCKLISTED ? (
          <button
            className="persius-button"
            data-tone="subtle"
            type="button"
            onClick={onRequest}
          >
            <PlusIcon aria-hidden="true" />
            {intl.formatMessage(messages.request)}
          </button>
        ) : null}
      </div>
    </article>
  );
}

export default function ComingSoon() {
  const intl = useIntl();
  const { user, hasPermission } = useUser();
  const { currentSettings } = useSettings();
  const services = getUserServiceAvailability(
    currentSettings,
    user?.settings?.enabledMediaCategories,
    hasPermission(Permission.ADMIN)
  );
  const enabled = isConfiguredMediaCategoryEnabled('movie', services);
  const [today] = useState(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  const [requestId, setRequestId] = useState<number>();
  const discover = useDiscover<MovieResult, unknown, FilterOptions>(
    '/api/v1/discover/movies',
    { primaryReleaseDateGte: today, sortBy: 'primary_release_date.asc' },
    { enabled, hideAvailable: false, hideErrorWithResults: false }
  );
  const { data: genres } = useSWR<{ id: number; name: string }[]>(
    enabled ? '/api/v1/genres/movie' : null
  );
  const groups = new Map<string, MovieResult[]>();
  for (const movie of [...discover.titles]
    .filter(
      (item) => item.releaseDate >= today && calendarDate(item.releaseDate)
    )
    .sort(
      (a, b) =>
        a.releaseDate.localeCompare(b.releaseDate) ||
        a.title.localeCompare(b.title)
    )) {
    const month = movie.releaseDate.slice(0, 7);
    groups.set(month, [...(groups.get(month) ?? []), movie]);
  }
  const canRequest = hasPermission(
    [
      Permission.REQUEST,
      Permission.REQUEST_MOVIE,
      Permission.REQUEST_4K,
      Permission.REQUEST_4K_MOVIE,
    ],
    { type: 'or' }
  );
  return (
    <div className="persius-coming-soon">
      <PageTitle title={intl.formatMessage(messages.comingSoon)} />
      <Header>{intl.formatMessage(messages.comingSoon)}</Header>
      <p className="persius-description">
        {intl.formatMessage(messages.comingSoonDescription)}
      </p>
      {discover.isLoadingInitialData && (
        <p role="status">{intl.formatMessage(messages.loading)}</p>
      )}
      {discover.error && (
        <p role="alert">
          {intl.formatMessage(messages.failed)}{' '}
          <Button onClick={() => discover.mutate?.()}>
            {intl.formatMessage(messages.retry)}
          </Button>
        </p>
      )}
      {!discover.isLoadingInitialData && !discover.error && !groups.size && (
        <p role="status">{intl.formatMessage(messages.empty)}</p>
      )}
      {[...groups].map(([month, movies]) => (
        <section className="persius-release-month" key={month}>
          <h2>
            {intl.formatDate(calendarDate(`${month}-01`)!, {
              month: 'long',
              year: 'numeric',
            })}
          </h2>
          <div className="persius-release-grid">
            {movies.map((movie) => (
              <ReleaseCard
                movie={movie}
                key={movie.id}
                genreNames={movie.genreIds
                  .map((id) => genres?.find((genre) => genre.id === id)?.name)
                  .filter((name): name is string => Boolean(name))}
                onRequest={
                  canRequest ? () => setRequestId(movie.id) : undefined
                }
              />
            ))}
          </div>
        </section>
      ))}
      {!discover.isReachingEnd && enabled && !discover.isLoadingInitialData && (
        <Button disabled={discover.isLoadingMore} onClick={discover.fetchMore}>
          {intl.formatMessage(
            discover.isLoadingMore ? messages.loading : messages.moreReleases
          )}
        </Button>
      )}
      <p className="persius-calendar-link">
        <Link href="/calendar">
          {intl.formatMessage(messages.releaseCalendar)}
        </Link>
      </p>
      {requestId !== undefined && (
        <RequestModal
          key={requestId}
          tmdbId={requestId}
          type="movie"
          show
          onCancel={() => setRequestId(undefined)}
          onComplete={() => {
            setRequestId(undefined);
            discover.mutate?.();
          }}
        />
      )}
    </div>
  );
}
