import Header from '@app/components/Common/Header';
import ListView from '@app/components/Common/ListView';
import PageTitle from '@app/components/Common/PageTitle';
import FollowButton from '@app/components/Following/FollowButton';
import useDiscover from '@app/hooks/useDiscover';
import useUpstreamTheme from '@app/hooks/useUpstreamTheme';
import { Permission, useUser } from '@app/hooks/useUser';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type { MovieResult } from '@server/models/Search';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Discover.DiscoverMovieGenre', {
  genreMovies: '{genre} Movies',
  moreOptions: 'More options',
});

const DiscoverMovieGenre = () => {
  const router = useRouter();
  const intl = useIntl();
  const upstream = useUpstreamTheme();
  const { hasPermission } = useUser();
  const genreId =
    typeof router.query.genreId === 'string' ? router.query.genreId : '';

  const {
    isLoadingInitialData,
    isEmpty,
    isLoadingMore,
    isReachingEnd,
    titles,
    fetchMore,
    error,
    firstResultData,
  } = useDiscover<MovieResult, { genre: { id: number; name: string } }>(
    `/api/v1/discover/movies/genre/${genreId}`,
    undefined,
    { enabled: !!genreId }
  );

  const isWaitingForRoute = upstream && !genreId;
  const title = upstream
    ? isLoadingInitialData || isWaitingForRoute
      ? intl.formatMessage(globalMessages.loading)
      : intl.formatMessage(messages.genreMovies, {
          genre: firstResultData?.genre.name,
        })
    : isLoadingInitialData || error || !firstResultData?.genre?.name
      ? intl.formatMessage(globalMessages.movies)
      : intl.formatMessage(messages.genreMovies, {
          genre: firstResultData?.genre.name,
        });
  const followAction =
    firstResultData?.genre && hasPermission(Permission.REQUEST) ? (
      <FollowButton
        input={{
          kind: 'tmdb-genre',
          subjectKey: `tmdb:genre:movie:${firstResultData.genre.id}`,
          subjectLabel: firstResultData.genre.name,
          conditions: {
            ref: {
              genreId: firstResultData.genre.id,
              mediaType: 'movie',
            },
          },
        }}
      />
    ) : null;

  if (error) {
    if (upstream) return <ErrorPage statusCode={500} />;

    return (
      <>
        <PageTitle title={title} />
        <Header>{title}</Header>
        <ErrorPage statusCode={500} />
      </>
    );
  }

  return (
    <>
      <PageTitle title={title} />
      <div className={upstream ? 'mb-5 mt-1' : undefined}>
        <Header>{title}</Header>
        {followAction &&
          (upstream ? (
            <details className="upstream-search-more">
              <summary>
                {intl.formatMessage(messages.moreOptions)}
                <ChevronDownIcon aria-hidden="true" />
              </summary>
              <div
                className="app-action-row mt-2"
                data-action-placement="leading"
              >
                {followAction}
              </div>
            </details>
          ) : (
            <div className="app-action-row" data-action-placement="leading">
              {followAction}
            </div>
          ))}
      </div>
      <ListView
        enableDiscoverNavigation
        items={titles}
        isEmpty={isEmpty}
        isLoading={
          isLoadingInitialData ||
          isWaitingForRoute ||
          (isLoadingMore && (titles?.length ?? 0) > 0)
        }
        isReachingEnd={isReachingEnd}
        onScrollBottom={fetchMore}
      />
    </>
  );
};

export default DiscoverMovieGenre;
