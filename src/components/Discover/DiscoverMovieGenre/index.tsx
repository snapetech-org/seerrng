import Header from '@app/components/Common/Header';
import ListView from '@app/components/Common/ListView';
import PageTitle from '@app/components/Common/PageTitle';
import useDiscover from '@app/hooks/useDiscover';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type { MovieResult } from '@server/models/Search';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Discover.DiscoverMovieGenre', {
  genreMovies: '{genre} Movies',
});

const DiscoverMovieGenre = () => {
  const router = useRouter();
  const intl = useIntl();
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

  const title =
    isLoadingInitialData || error || !firstResultData?.genre?.name
      ? intl.formatMessage(globalMessages.movies)
      : intl.formatMessage(messages.genreMovies, {
          genre: firstResultData?.genre.name,
        });

  if (error) {
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
      <div>
        <Header>{title}</Header>
      </div>
      <ListView
        enableDiscoverNavigation
        items={titles}
        isEmpty={isEmpty}
        isLoading={
          isLoadingInitialData || (isLoadingMore && (titles?.length ?? 0) > 0)
        }
        isReachingEnd={isReachingEnd}
        onScrollBottom={fetchMore}
      />
    </>
  );
};

export default DiscoverMovieGenre;
