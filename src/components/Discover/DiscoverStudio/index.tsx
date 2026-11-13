import CachedImage from '@app/components/Common/CachedImage';
import Header from '@app/components/Common/Header';
import ListView from '@app/components/Common/ListView';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import DiscoverMovies from '@app/components/Discover/DiscoverMovies';
import useDiscover from '@app/hooks/useDiscover';
import useUpstreamTheme from '@app/hooks/useUpstreamTheme';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type { ProductionCompany } from '@server/models/common';
import type { MovieResult } from '@server/models/Search';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Discover.DiscoverStudio', {
  studioMovies: '{studio} Movies',
});

const DiscoverMovieStudio = () => {
  const router = useRouter();
  const intl = useIntl();
  const upstream = useUpstreamTheme();
  const title = intl.formatMessage(globalMessages.movies);
  const studioId =
    typeof router.query.studioId === 'string' ? router.query.studioId : '';
  const isWaitingForRoute = upstream && !studioId;
  const upstreamDiscover = useDiscover<MovieResult, { studio: ProductionCompany }>(
    `/api/v1/discover/movies/studio/${studioId}`,
    undefined,
    { enabled: upstream && !!studioId }
  );
  const { data: studio, error } = useSWR<ProductionCompany>(
    !upstream && studioId ? `/api/v1/studio/${studioId}` : null
  );

  if (upstream) {
    if (upstreamDiscover.error) {
      return <ErrorPage statusCode={500} />;
    }

    const upstreamTitle =
      upstreamDiscover.isLoadingInitialData || isWaitingForRoute
        ? intl.formatMessage(globalMessages.loading)
        : intl.formatMessage(messages.studioMovies, {
            studio: upstreamDiscover.firstResultData?.studio.name,
          });

    return (
      <>
        <PageTitle title={upstreamTitle} />
        <div className="mb-5 mt-1">
          <Header>
            {upstreamDiscover.firstResultData?.studio.logoPath ? (
              <div className="relative mb-6 flex h-24 justify-center sm:h-32">
                <CachedImage
                  type="tmdb"
                  src={`https://image.tmdb.org/t/p/w780_filter(duotone,ffffff,bababa)${upstreamDiscover.firstResultData.studio.logoPath}`}
                  alt={upstreamDiscover.firstResultData.studio.name}
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

  if (!studio) {
    return (
      <>
        <PageTitle title={title} />
        <Header>{title}</Header>
        <LoadingSpinner />
      </>
    );
  }

  return <DiscoverMovies studio={studio} />;
};

export default DiscoverMovieStudio;
