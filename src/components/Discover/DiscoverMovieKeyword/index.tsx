import Header from '@app/components/Common/Header';
import ListView from '@app/components/Common/ListView';
import PageTitle from '@app/components/Common/PageTitle';
import useDiscover, { encodeURIExtraParams } from '@app/hooks/useDiscover';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type { TmdbKeyword } from '@server/api/themoviedb/interfaces';
import type { MovieResult } from '@server/models/Search';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Discover.DiscoverMovieKeyword', {
  keywordMovies: '{keywordTitle} Movies',
});

const DiscoverMovieKeyword = () => {
  const router = useRouter();
  const intl = useIntl();
  const keywords =
    typeof router.query.keywords === 'string' ? router.query.keywords : '';

  const {
    isLoadingInitialData,
    isEmpty,
    isLoadingMore,
    isReachingEnd,
    titles,
    fetchMore,
    error,
    firstResultData,
  } = useDiscover<MovieResult, { keywords: TmdbKeyword[] }>(
    `/api/v1/discover/movies`,
    {
      keywords: encodeURIExtraParams(keywords),
    },
    { enabled: !!keywords }
  );

  const title =
    isLoadingInitialData || error || !firstResultData?.keywords?.length
      ? intl.formatMessage(globalMessages.movies)
      : intl.formatMessage(messages.keywordMovies, {
          keywordTitle: firstResultData?.keywords
            .map((k) => `${k.name[0].toUpperCase()}${k.name.substring(1)}`)
            .join(', '),
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

export default DiscoverMovieKeyword;
