import Header from '@app/components/Common/Header';
import ListView from '@app/components/Common/ListView';
import PageTitle from '@app/components/Common/PageTitle';
import useDiscover from '@app/hooks/useDiscover';
import useUpstreamTheme from '@app/hooks/useUpstreamTheme';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type { TvResult } from '@server/models/Search';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.DiscoverTvUpcoming', {
  upcomingtv: 'Upcoming Series',
});

const DiscoverTvUpcoming = () => {
  const intl = useIntl();
  const upstream = useUpstreamTheme();

  const {
    isLoadingInitialData,
    isEmpty,
    isLoadingMore,
    isReachingEnd,
    titles,
    fetchMore,
    error,
  } = useDiscover<TvResult>('/api/v1/discover/tv/upcoming');

  const title = intl.formatMessage(messages.upcomingtv);

  if (error) {
    if (upstream) {
      return <ErrorPage statusCode={500} />;
    }

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
      <PageTitle title={intl.formatMessage(messages.upcomingtv)} />
      <div className={upstream ? 'upstream-discovery-header' : undefined}>
        <Header>{intl.formatMessage(messages.upcomingtv)}</Header>
      </div>
      <ListView
        enableDiscoverNavigation
        items={titles}
        isEmpty={isEmpty}
        isReachingEnd={isReachingEnd}
        isLoading={
          isLoadingInitialData || (isLoadingMore && (titles?.length ?? 0) > 0)
        }
        onScrollBottom={fetchMore}
      />
    </>
  );
};

export default DiscoverTvUpcoming;
