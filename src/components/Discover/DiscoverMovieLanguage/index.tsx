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

const messages = defineMessages('components.Discover.DiscoverMovieLanguage', {
  languageMovies: '{language} Movies',
});

const DiscoverMovieLanguage = () => {
  const router = useRouter();
  const intl = useIntl();
  const language =
    typeof router.query.language === 'string' ? router.query.language : '';

  const {
    isLoadingInitialData,
    isEmpty,
    isLoadingMore,
    isReachingEnd,
    titles,
    fetchMore,
    error,
  } = useDiscover<
    MovieResult,
    {
      originalLanguage: {
        iso_639_1: string;
        english_name: string;
        name: string;
      };
    }
  >(`/api/v1/discover/movies/language/${language}`, undefined, {
    enabled: !!language,
  });

  const title =
    isLoadingInitialData || error || !language
      ? intl.formatMessage(globalMessages.movies)
      : intl.formatMessage(messages.languageMovies, {
          language: intl.formatDisplayName(language, {
            type: 'language',
            fallback: 'none',
          }),
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

export default DiscoverMovieLanguage;
