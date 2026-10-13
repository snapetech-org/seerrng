import TitleCard from '@app/components/TitleCard';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import type { MediaStatus } from '@server/constants/media';
import type { ViewerRequestCoverage } from '@server/lib/viewerRequestCoverage';
import type { MovieDetails } from '@server/models/Movie';
import type { TvDetails } from '@server/models/Tv';
import axios from 'axios';
import { useMemo } from 'react';
import { useInView } from 'react-intersection-observer';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

export interface TmdbTitleCardProps {
  id: number;
  tmdbId: number;
  tvdbId?: number;
  type: 'movie' | 'tv';
  title?: string;
  posterPath?: string;
  summary?: string;
  year?: string;
  status?: MediaStatus;
  status4k?: MediaStatus;
  viewerRequestCoverage?: ViewerRequestCoverage;
  canExpand?: boolean;
  isAddedToWatchlist?: boolean;
  mutateParent?: () => void;
}

const messages = defineMessages('components.TitleCard', {
  metadataFallback: '{provider} lookup failed. Showing saved details.',
  metadataUnavailable: '{provider} lookup failed. Try again later.',
});

const isMovie = (movie: MovieDetails | TvDetails): movie is MovieDetails => {
  return (movie as MovieDetails).title !== undefined;
};

const getSupplementalPosterPath = (
  title: MovieDetails | TvDetails
): string | undefined => {
  return title.supplementalMetadata?.posterUrl;
};

const TmdbTitleCard = ({
  id,
  tmdbId,
  tvdbId,
  type,
  title: fallbackTitle,
  posterPath: fallbackPosterPath,
  summary: fallbackSummary,
  year: fallbackYear,
  status: fallbackStatus,
  status4k: fallbackStatus4k,
  viewerRequestCoverage: fallbackViewerRequestCoverage,
  canExpand,
  isAddedToWatchlist = false,
  mutateParent,
}: TmdbTitleCardProps) => {
  const intl = useIntl();
  const { hasPermission } = useUser();

  const { ref, inView } = useInView({
    rootMargin: '100% 0px',
    triggerOnce: true,
  });
  const url = useMemo(
    () =>
      type === 'movie' ? `/api/v1/movie/${tmdbId}` : `/api/v1/tv/${tmdbId}`,
    [tmdbId, type]
  );
  const { data: title, error } = useSWR<MovieDetails | TvDetails>(
    inView ? url : null,
    {
      dedupingInterval: 30000,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  const hasDescriptiveFallback = !!(
    fallbackTitle ||
    fallbackPosterPath ||
    fallbackSummary ||
    fallbackYear
  );
  const hasFallback = !!(
    hasDescriptiveFallback ||
    fallbackStatus !== undefined ||
    fallbackStatus4k !== undefined
  );
  const fallbackTitleText =
    fallbackTitle ??
    `${intl.formatMessage(
      type === 'movie' ? globalMessages.movie : globalMessages.tvshow
    )} ${tmdbId}`;
  const cachedSummary = [
    fallbackSummary,
    error
      ? intl.formatMessage(messages.metadataFallback, { provider: 'TMDB' })
      : undefined,
  ]
    .filter(Boolean)
    .join('\n\n');
  const unavailableSummary = error
    ? intl.formatMessage(messages.metadataUnavailable, { provider: 'TMDB' })
    : undefined;
  const renderFallback = () => (
    <div ref={ref}>
      <TitleCard
        id={tmdbId}
        title={fallbackTitleText}
        image={fallbackPosterPath}
        enablePosterFallbackLookup
        summary={cachedSummary || undefined}
        year={fallbackYear}
        status={fallbackStatus}
        status4k={fallbackStatus4k}
        viewerRequestCoverage={fallbackViewerRequestCoverage}
        mediaType={type}
        isAddedToWatchlist={isAddedToWatchlist}
        canExpand={canExpand}
        mutateParent={mutateParent}
      />
    </div>
  );

  if (!title && !error && hasFallback) {
    return renderFallback();
  }

  if (!title && !error) {
    return (
      <div ref={ref}>
        <TitleCard.Placeholder canExpand={canExpand} />
      </div>
    );
  }

  if (!title) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      if (hasDescriptiveFallback) {
        return renderFallback();
      }

      return hasPermission(Permission.ADMIN) ? (
        <TitleCard.ErrorCard
          id={id}
          tmdbId={tmdbId}
          tvdbId={tvdbId}
          type={type}
        />
      ) : null;
    }

    if (hasFallback) {
      return renderFallback();
    }

    return (
      <div ref={ref}>
        <TitleCard
          id={tmdbId}
          title={fallbackTitleText}
          mediaType={type}
          summary={unavailableSummary}
          canExpand={canExpand}
          isAddedToWatchlist={isAddedToWatchlist}
          mutateParent={mutateParent}
        />
      </div>
    );
  }

  return isMovie(title) ? (
    <TitleCard
      key={title.id}
      id={title.id}
      isAddedToWatchlist={
        title.mediaInfo?.watchlists?.length || isAddedToWatchlist
      }
      image={title.posterPath || getSupplementalPosterPath(title)}
      fallbackImage={getSupplementalPosterPath(title)}
      status={title.mediaInfo?.status}
      status4k={title.mediaInfo?.status4k}
      viewerRequestCoverage={title.mediaInfo?.viewerRequestCoverage}
      summary={
        [
          title.overview,
          error
            ? intl.formatMessage(messages.metadataFallback, {
                provider: 'TMDB',
              })
            : undefined,
        ]
          .filter(Boolean)
          .join('\n\n') || undefined
      }
      title={title.title}
      userScore={title.voteAverage}
      voteCount={title.voteCount}
      year={title.releaseDate}
      mediaType={'movie'}
      inProgress={(title.mediaInfo?.downloadStatus ?? []).length > 0}
      inProgress4k={(title.mediaInfo?.downloadStatus4k ?? []).length > 0}
      canExpand={canExpand}
      mutateParent={mutateParent}
    />
  ) : (
    <TitleCard
      key={title.id}
      id={title.id}
      isAddedToWatchlist={
        title.mediaInfo?.watchlists?.length || isAddedToWatchlist
      }
      image={title.posterPath || getSupplementalPosterPath(title)}
      fallbackImage={getSupplementalPosterPath(title)}
      status={title.mediaInfo?.status}
      status4k={title.mediaInfo?.status4k}
      viewerRequestCoverage={title.mediaInfo?.viewerRequestCoverage}
      summary={
        [
          title.overview,
          error
            ? intl.formatMessage(messages.metadataFallback, {
                provider: 'TMDB',
              })
            : undefined,
        ]
          .filter(Boolean)
          .join('\n\n') || undefined
      }
      title={title.name}
      userScore={title.voteAverage}
      voteCount={title.voteCount}
      year={title.firstAirDate}
      mediaType={'tv'}
      inProgress={(title.mediaInfo?.downloadStatus ?? []).length > 0}
      inProgress4k={(title.mediaInfo?.downloadStatus4k ?? []).length > 0}
      canExpand={canExpand}
      mutateParent={mutateParent}
    />
  );
};

export default TmdbTitleCard;
