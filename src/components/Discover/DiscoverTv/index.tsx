import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import Header from '@app/components/Common/Header';
import ListView from '@app/components/Common/ListView';
import PageErrorMessage from '@app/components/Common/PageErrorMessage';
import PageTitle from '@app/components/Common/PageTitle';
import StarSlashIcon from '@app/components/Common/StarSlashIcon';
import type { FilterOptions } from '@app/components/Discover/constants';
import {
  prepareFilterValues,
  withDefaultTmdbRatingMinimumVotes,
} from '@app/components/Discover/constants';
import MediaDiscoveryControls from '@app/components/Discover/MediaDiscoveryControls';
import { tvNetworks } from '@app/components/Discover/NetworkSlider';
import useDiscover from '@app/hooks/useDiscover';
import useDiscoverScrollRestoration from '@app/hooks/useDiscoverScrollRestoration';
import { useSearchActivityReporter } from '@app/hooks/useSearchActivity';
import defineMessages from '@app/utils/defineMessages';
import { StarIcon } from '@heroicons/react/24/outline';
import type { TvNetwork } from '@server/models/common';
import type { TvResult } from '@server/models/Search';
import { useRouter } from 'next/router';
import { useState, type ReactNode } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Discover.DiscoverTv', {
  series: 'Series',
  networkSeries: '{network} Series',
  disableWatchlistPreview: 'Disable Watchlist',
  enableWatchlistPreview: 'Enable Watchlist',
  watchlistPreviewHelp: 'Enable or disable the Watchlist buttons.',
  loadErrorTitle: 'Series Could Not Be Loaded',
  loadErrorDescription:
    'The discovery service did not respond, please try again.',
  retryDescription: 'Retry loading series using the current filters.',
});
interface DiscoverTvProps {
  network?: TvNetwork;
  titleOverride?: string;
  initialFilters?: FilterOptions;
  randomizeOrder?: boolean;
  mediaFilters?: ReactNode;
}

const DiscoverTv = ({
  network,
  titleOverride,
  initialFilters,
  randomizeOrder,
  mediaFilters,
}: DiscoverTvProps = {}) => {
  const intl = useIntl();
  const router = useRouter();
  const watchlistPreview =
    process.env.NODE_ENV === 'development' &&
    router.pathname === '/discover/tv';
  const [watchlistPreviewDisabled, setWatchlistPreviewDisabled] =
    useState(false);
  const preparedFilters = withDefaultTmdbRatingMinimumVotes({
    ...initialFilters,
    ...prepareFilterValues(router.query),
    ...(network ? { network: network.id.toString() } : {}),
  });
  const discover = useDiscover<TvResult, never, FilterOptions>(
    '/api/v1/discover/tv',
    preparedFilters,
    {
      randomizeOrder: randomizeOrder ?? !preparedFilters.sortBy,
      availableQuality: preparedFilters.availability,
      hideAvailable: !preparedFilters.availability,
    }
  );
  useSearchActivityReporter(
    discover.isLoadingInitialData ||
      discover.isLoadingMore ||
      discover.isValidating ||
      discover.isSearchingAvailableQuality,
    'series-discovery'
  );
  useDiscoverScrollRestoration({
    mediaType: 'tv',
    itemCount: discover.titles.length,
    shuffleSeed: discover.shuffleSeed,
    isLoading: discover.isLoadingInitialData || discover.isLoadingMore,
    isReachingEnd: discover.isReachingEnd,
    fetchMore: discover.fetchMore,
  });
  const title = network
    ? intl.formatMessage(messages.networkSeries, { network: network.name })
    : (titleOverride ?? intl.formatMessage(messages.series));
  const curatedNetwork = network
    ? tvNetworks.find((item) => item.url.endsWith(`/${network.id}`))
    : undefined;
  const networkLogo =
    curatedNetwork?.image ??
    (network?.logoPath
      ? `https://image.tmdb.org/t/p/original${network.logoPath}`
      : undefined);
  return (
    <>
      <PageTitle title={title} />
      <div className="app-filter-section-gap">
        <Header>{title}</Header>
        {mediaFilters}
        {networkLogo && (
          <div className="catalog-branding">
            <CachedImage
              type="tmdb"
              src={networkLogo}
              alt={network?.name ?? ''}
              data-logo-tone={curatedNetwork?.logoTone}
              fill
            />
          </div>
        )}
        <MediaDiscoveryControls type="tv" currentFilters={preparedFilters} />
        {watchlistPreview && (
          <Button
            type="button"
            buttonType="warning"
            title={intl.formatMessage(messages.watchlistPreviewHelp)}
            aria-pressed={watchlistPreviewDisabled}
            onClick={() => setWatchlistPreviewDisabled((disabled) => !disabled)}
          >
            {watchlistPreviewDisabled ? (
              <StarIcon aria-hidden="true" />
            ) : (
              <StarSlashIcon />
            )}
            {intl.formatMessage(
              watchlistPreviewDisabled
                ? messages.enableWatchlistPreview
                : messages.disableWatchlistPreview
            )}
          </Button>
        )}
      </div>
      {discover.error ? (
        <PageErrorMessage
          title={intl.formatMessage(messages.loadErrorTitle)}
          description={intl.formatMessage(messages.loadErrorDescription)}
          retry={{
            onClick: () => discover.mutate?.(),
            tooltip: intl.formatMessage(messages.retryDescription),
            busy: discover.isValidating,
          }}
        />
      ) : (
        <ListView
          posterTitleWeight="regular"
          enableDiscoverNavigation
          watchlistPreview={watchlistPreview}
          watchlistPreviewDisabled={watchlistPreviewDisabled}
          items={discover.titles}
          isEmpty={discover.isEmpty}
          isLoading={
            discover.isLoadingInitialData ||
            discover.isSearchingAvailableQuality ||
            (discover.isLoadingMore && discover.titles.length > 0)
          }
          isReachingEnd={discover.isReachingEnd}
          onScrollBottom={discover.fetchMore}
        />
      )}
    </>
  );
};
export default DiscoverTv;
