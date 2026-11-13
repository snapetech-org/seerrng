import Header from '@app/components/Common/Header';
import ListView from '@app/components/Common/ListView';
import PageTitle from '@app/components/Common/PageTitle';
import useDiscover from '@app/hooks/useDiscover';
import useUpstreamTheme from '@app/hooks/useUpstreamTheme';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import DiscoverBooks from '@app/components/Discover/DiscoverBooks';
import DiscoverMediaTabs, {
  type DiscoverMediaType,
} from '@app/components/Discover/DiscoverMediaTabs';
import DiscoverMovies from '@app/components/Discover/DiscoverMovies';
import DiscoverMusic from '@app/components/Discover/DiscoverMusic';
import DiscoverTv from '@app/components/Discover/DiscoverTv';
import defineMessages from '@app/utils/defineMessages';
import { CircleStackIcon, FunnelIcon } from '@heroicons/react/24/solid';
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
  timeWindowDay: 'Daily',
  timeWindowWeek: 'Weekly',
});

type UpstreamMediaType = 'all' | 'movie' | 'tv';
type TimeWindow = 'day' | 'week';

const UpstreamTrending = () => {
  const intl = useIntl();
  const [currentMediaType, setCurrentMediaType] =
    useState<UpstreamMediaType>('all');
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
      <div className="mb-5 mt-1 flex flex-col justify-between lg:flex-row lg:items-end">
        <Header>{intl.formatMessage(messages.trending)}</Header>
        <div className="mt-2 flex flex-grow flex-col sm:flex-row lg:flex-grow-0">
          <div className="mb-2 flex flex-grow sm:mb-0 sm:mr-2 lg:flex-grow-0">
            <span className="inline-flex cursor-default items-center rounded-l-md border border-r-0 border-gray-500 bg-gray-800 px-3 text-sm text-gray-100">
              <CircleStackIcon className="h-6 w-6" />
            </span>
            <select
              id="mediaType"
              name="mediaType"
              onChange={(event) =>
                setCurrentMediaType(event.target.value as UpstreamMediaType)
              }
              value={currentMediaType}
              className="rounded-r-only"
            >
              <option value="all">{intl.formatMessage(globalMessages.all)}</option>
              <option value="movie">
                {intl.formatMessage(globalMessages.movies)}
              </option>
              <option value="tv">
                {intl.formatMessage(globalMessages.tvshows)}
              </option>
            </select>
          </div>
          <div className="mb-2 flex flex-grow sm:mb-0 sm:mr-2 lg:flex-grow-0">
            <span className="inline-flex cursor-default items-center rounded-l-md border border-r-0 border-gray-500 bg-gray-800 px-3 text-sm text-gray-100">
              <FunnelIcon className="h-6 w-6" />
            </span>
            <select
              id="timeWindow"
              name="timeWindow"
              onChange={(event) =>
                setCurrentTimeWindow(event.target.value as TimeWindow)
              }
              value={currentTimeWindow}
              className="rounded-r-only"
            >
              <option value="day">
                {intl.formatMessage(messages.timeWindowDay)}
              </option>
              <option value="week">
                {intl.formatMessage(messages.timeWindowWeek)}
              </option>
            </select>
          </div>
        </div>
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
  return upstream ? <UpstreamTrending /> : <SeerrNgTrending />;
};

export default Trending;
