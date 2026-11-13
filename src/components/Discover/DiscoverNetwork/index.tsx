import CachedImage from '@app/components/Common/CachedImage';
import Header from '@app/components/Common/Header';
import ListView from '@app/components/Common/ListView';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import DiscoverTv from '@app/components/Discover/DiscoverTv';
import useDiscover from '@app/hooks/useDiscover';
import useUpstreamTheme from '@app/hooks/useUpstreamTheme';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type { TvNetwork } from '@server/models/common';
import type { TvResult } from '@server/models/Search';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Discover.DiscoverNetwork', {
  networkSeries: '{network} Series',
});

const DiscoverTvNetwork = () => {
  const router = useRouter();
  const intl = useIntl();
  const upstream = useUpstreamTheme();
  const title = intl.formatMessage(globalMessages.tvshows);
  const networkId =
    typeof router.query.networkId === 'string' ? router.query.networkId : '';
  const isWaitingForRoute = upstream && !networkId;
  const upstreamDiscover = useDiscover<TvResult, { network: TvNetwork }>(
    `/api/v1/discover/tv/network/${networkId}`,
    undefined,
    { enabled: upstream && !!networkId }
  );
  const { data: network, error } = useSWR<TvNetwork>(
    !upstream && networkId ? `/api/v1/network/${networkId}` : null
  );

  if (upstream) {
    if (upstreamDiscover.error) {
      return <ErrorPage statusCode={500} />;
    }

    const upstreamTitle =
      upstreamDiscover.isLoadingInitialData || isWaitingForRoute
        ? intl.formatMessage(globalMessages.loading)
        : intl.formatMessage(messages.networkSeries, {
            network: upstreamDiscover.firstResultData?.network.name,
          });

    return (
      <>
        <PageTitle title={upstreamTitle} />
        <div className="mb-5 mt-1">
          <Header>
            {upstreamDiscover.firstResultData?.network.logoPath ? (
              <div className="relative mb-6 flex h-24 justify-center sm:h-32">
                <CachedImage
                  type="tmdb"
                  src={`https://image.tmdb.org/t/p/w780_filter(duotone,ffffff,bababa)${upstreamDiscover.firstResultData.network.logoPath}`}
                  alt={upstreamDiscover.firstResultData.network.name}
                  className="object-contain"
                  fill
                />
              </div>
            ) : (
              upstreamTitle
            )}
          </Header>
        </div>
        <ListView
          items={upstreamDiscover.titles}
          isEmpty={upstreamDiscover.isEmpty}
          isLoading={
            upstreamDiscover.isLoadingInitialData ||
            isWaitingForRoute ||
            (upstreamDiscover.isLoadingMore &&
              (upstreamDiscover.titles?.length ?? 0) > 0)
          }
          isReachingEnd={upstreamDiscover.isReachingEnd}
          onScrollBottom={upstreamDiscover.fetchMore}
        />
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageTitle title={title} />
        <Header>{title}</Header>
        <ErrorPage statusCode={500} />
      </>
    );
  }

  if (!network) {
    return (
      <>
        <PageTitle title={title} />
        <Header>{title}</Header>
        <LoadingSpinner />
      </>
    );
  }

  return <DiscoverTv network={network} />;
};

export default DiscoverTvNetwork;
