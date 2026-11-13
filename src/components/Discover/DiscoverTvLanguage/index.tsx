import Header from '@app/components/Common/Header';
import ListView from '@app/components/Common/ListView';
import PageTitle from '@app/components/Common/PageTitle';
import useDiscover from '@app/hooks/useDiscover';
import useUpstreamTheme from '@app/hooks/useUpstreamTheme';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type { TvResult } from '@server/models/Search';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Discover.DiscoverTvLanguage', {
  languageSeries: '{language} Series',
});

const DiscoverTvLanguage = () => {
  const router = useRouter();
  const intl = useIntl();
  const upstream = useUpstreamTheme();
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
    TvResult,
    {
      originalLanguage: {
        iso_639_1: string;
        english_name: string;
        name: string;
      };
    }
  >(`/api/v1/discover/tv/language/${language}`, undefined, {
    enabled: !!language,
  });

  const isWaitingForRoute = upstream && !language;
  const title = upstream
    ? isLoadingInitialData || isWaitingForRoute
      ? intl.formatMessage(globalMessages.loading)
      : intl.formatMessage(messages.languageSeries, {
          language: intl.formatDisplayName(language, {
            type: 'language',
            fallback: 'none',
          }),
        })
    : isLoadingInitialData || error || !language
      ? intl.formatMessage(globalMessages.tvshows)
      : intl.formatMessage(messages.languageSeries, {
          language: intl.formatDisplayName(language, {
            type: 'language',
            fallback: 'none',
          }),
        });

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

export default DiscoverTvLanguage;
