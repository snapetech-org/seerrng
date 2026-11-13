import Header from '@app/components/Common/Header';
import ListView from '@app/components/Common/ListView';
import PageTitle from '@app/components/Common/PageTitle';
import DiscoverBooks from '@app/components/Discover/DiscoverBooks';
import DiscoverMediaTabs, {
  type DiscoverMediaType,
} from '@app/components/Discover/DiscoverMediaTabs';
import DiscoverMovies from '@app/components/Discover/DiscoverMovies';
import DiscoverMusic from '@app/components/Discover/DiscoverMusic';
import DiscoverTv from '@app/components/Discover/DiscoverTv';
import { getFilterToggleButtonClass } from '@app/components/Discover/FilterPanel/CompactFilterSelect';
import useDiscover from '@app/hooks/useDiscover';
import useUpstreamTheme from '@app/hooks/useUpstreamTheme';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type {
  MovieResult,
  PersonResult,
  TvResult,
} from '@server/models/Search';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Discover', {
  trending: 'Trending',
  timeWindow: 'Time Window',
  timeWindowDay: 'Daily',
  timeWindowWeek: 'Weekly',
});

type TimeWindow = 'day' | 'week';

const UpstreamTrending = () => {
  const intl = useIntl();
  const router = useRouter();
  const currentMediaType: 'all' | 'movie' | 'tv' =
    router.query.mediaType === 'movie' || router.query.mediaType === 'tv'
      ? router.query.mediaType
      : 'all';
  const [currentTimeWindow, setCurrentTimeWindow] = useState<TimeWindow>('day');
  const {
    isLoadingInitialData,
    isEmpty,
    isLoadingMore,
    isReachingEnd,
    titles,
    fetchMore,
    error,
  } = useDiscover<MovieResult | TvResult | PersonResult>(
    '/api/v1/discover/trending',
    { mediaType: currentMediaType, timeWindow: currentTimeWindow }
  );

  if (error) {
    return <ErrorPage statusCode={500} />;
  }

  return (
    <>
      <PageTitle title={intl.formatMessage(messages.trending)} />
      <div className="upstream-discovery-header">
        <Header>{intl.formatMessage(messages.trending)}</Header>
      </div>
      <DiscoverMediaTabs
        selected={currentMediaType}
        basePath="/discover/trending"
      />
      <div
        className="app-filter-row"
        role="group"
        aria-label={intl.formatMessage(messages.timeWindow)}
      >
        <button
          type="button"
          className={getFilterToggleButtonClass(currentTimeWindow === 'day')}
          aria-pressed={currentTimeWindow === 'day'}
          onClick={() => setCurrentTimeWindow('day')}
        >
          {intl.formatMessage(messages.timeWindowDay)}
        </button>
        <button
          type="button"
          className={getFilterToggleButtonClass(currentTimeWindow === 'week')}
          aria-pressed={currentTimeWindow === 'week'}
          onClick={() => setCurrentTimeWindow('week')}
        >
          {intl.formatMessage(messages.timeWindowWeek)}
        </button>
      </div>
      <ListView
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

const SeerrNgTrending = () => {
  const intl = useIntl();
  const router = useRouter();
  const mediaType: DiscoverMediaType =
    router.query.mediaType === 'tv' ||
    router.query.mediaType === 'music' ||
    router.query.mediaType === 'book' ||
    router.query.mediaType === 'audiobook'
      ? router.query.mediaType
      : 'movie';
  const title = intl.formatMessage(messages.trending);
  const mediaFilters = (
    <DiscoverMediaTabs selected={mediaType} basePath="/discover/trending" />
  );

  switch (mediaType) {
    case 'tv':
      return (
        <DiscoverTv
          titleOverride={title}
          initialFilters={{ sortBy: 'popularity.desc' }}
          randomizeOrder={false}
          mediaFilters={mediaFilters}
        />
      );
    case 'music':
      return (
        <DiscoverMusic titleOverride={title} mediaFilters={mediaFilters} />
      );
    case 'book':
    case 'audiobook':
      return (
        <DiscoverBooks
          format={mediaType === 'audiobook' ? 'audiobook' : 'ebook'}
          titleOverride={title}
          mediaFilters={mediaFilters}
          showFormatTabs={false}
        />
      );
    default:
      return (
        <DiscoverMovies
          titleOverride={title}
          initialFilters={{ sortBy: 'popularity.desc' }}
          randomizeOrder={false}
          mediaFilters={mediaFilters}
        />
      );
  }
};

const Trending = () => {
  const upstream = useUpstreamTheme();
  const router = useRouter();
  const mediaType = router.query.mediaType;
  const upstreamMediaType =
    mediaType === undefined ||
    mediaType === 'all' ||
    mediaType === 'movie' ||
    mediaType === 'tv';

  return upstream && upstreamMediaType ? (
    <UpstreamTrending />
  ) : (
    <SeerrNgTrending />
  );
};

export default Trending;
