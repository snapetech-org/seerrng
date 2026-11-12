import CachedImage from '@app/components/Common/CachedImage';
import Header from '@app/components/Common/Header';
import ListView from '@app/components/Common/ListView';
import PageErrorMessage from '@app/components/Common/PageErrorMessage';
import PageTitle from '@app/components/Common/PageTitle';
import type { FilterOptions } from '@app/components/Discover/constants';
import {
  prepareFilterValues,
  withDefaultTmdbRatingMinimumVotes,
} from '@app/components/Discover/constants';
import MediaDiscoveryControls from '@app/components/Discover/MediaDiscoveryControls';
import { studios } from '@app/components/Discover/StudioSlider';
import FollowButton from '@app/components/Following/FollowButton';
import CatalogControls, {
  libraryView,
} from '@app/components/Persius/CatalogControls';
import persiusMessages from '@app/components/Persius/messages';
import usePersius from '@app/components/Persius/usePersius';
import useDiscover from '@app/hooks/useDiscover';
import useDiscoverScrollRestoration from '@app/hooks/useDiscoverScrollRestoration';
import { useSearchActivityReporter } from '@app/hooks/useSearchActivity';
import useUpstreamTheme from '@app/hooks/useUpstreamTheme';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import type { ProductionCompany } from '@server/models/common';
import type { MovieResult } from '@server/models/Search';
import { useRouter } from 'next/router';
import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Discover.DiscoverMovies', {
  movies: 'Movies',
  studioMovies: '{studio} Movies',
  loadErrorTitle: 'Movies Could Not Be Loaded',
  loadErrorDescription:
    'The discovery request failed. Try again or adjust the filters.',
  retryDescription: 'Retry loading movies using the current filters.',
});

interface DiscoverMoviesProps {
  studio?: ProductionCompany;
  titleOverride?: string;
  initialFilters?: FilterOptions;
  randomizeOrder?: boolean;
  mediaFilters?: ReactNode;
}

const DiscoverMovies = ({
  studio,
  titleOverride,
  initialFilters,
  randomizeOrder,
  mediaFilters,
}: DiscoverMoviesProps = {}) => {
  const intl = useIntl();
  const persius = usePersius();
  const upstream = useUpstreamTheme();
  const router = useRouter();
  const { hasPermission } = useUser();
  const preparedFilters = withDefaultTmdbRatingMinimumVotes({
    ...initialFilters,
    ...prepareFilterValues(router.query),
    ...(studio ? { studio: studio.id.toString() } : {}),
  });
  const discover = useDiscover<MovieResult, unknown, FilterOptions>(
    '/api/v1/discover/movies',
    preparedFilters,
    {
      randomizeOrder: randomizeOrder ?? (!persius && !preparedFilters.sortBy),
      availableQuality: preparedFilters.availability,
      hideAvailable: !persius && !preparedFilters.availability,
      availabilityView: persius
        ? libraryView(router.query.libraryView)
        : undefined,
      recoverSinglePageFailure: true,
    }
  );
  useSearchActivityReporter(
    Boolean(preparedFilters.search || preparedFilters.availability) &&
      (discover.isLoadingInitialData ||
        discover.isValidating ||
        discover.isSearchingFilteredResults),
    'movies-discovery'
  );
  useDiscoverScrollRestoration({
    mediaType: 'movie',
    itemCount: discover.titles.length,
    shuffleSeed: discover.shuffleSeed,
    isLoading: discover.isLoadingInitialData || discover.isLoadingMore,
    isReachingEnd: discover.isReachingEnd,
    fetchMore: discover.fetchMore,
  });
  const title = studio
    ? intl.formatMessage(messages.studioMovies, { studio: studio.name })
    : (titleOverride ?? intl.formatMessage(messages.movies));
  const curatedStudio = studio
    ? studios.find((item) => item.url.endsWith(`/${studio.id}`))
    : undefined;
  const studioLogo =
    curatedStudio?.image ??
    (studio?.logoPath
      ? `https://image.tmdb.org/t/p/original${studio.logoPath}`
      : undefined);
  return (
    <>
      <PageTitle title={title} />
      <div className={upstream ? 'upstream-discovery-header' : 'mb-4'}>
        <Header>{title}</Header>
        {persius && (
          <p className="persius-description">
            {intl.formatMessage(persiusMessages.moviesDescription)}
          </p>
        )}
        {mediaFilters}
        {studioLogo && (
          <div className="relative mx-auto my-4 h-20 w-full max-w-sm sm:h-24">
            <CachedImage
              type="tmdb"
              src={studioLogo}
              alt={studio?.name ?? ''}
              className={`object-contain ${
                curatedStudio?.logoTone === 'white' ? 'brightness-0 invert' : ''
              }`}
              fill
            />
          </div>
        )}
        {studio && hasPermission(Permission.REQUEST) && (
          <div className="app-action-row" data-action-placement="leading">
            <FollowButton
              input={{
                kind: 'tmdb-studio',
                subjectKey: `tmdb:studio:${studio.id}`,
                subjectLabel: studio.name,
                conditions: { ref: { tmdbId: studio.id } },
              }}
            />
          </div>
        )}
        {persius ? (
          <CatalogControls
            type="movie"
            filters={preparedFilters}
            count={discover.titles.length}
          />
        ) : (
          <MediaDiscoveryControls
            type="movie"
            currentFilters={preparedFilters}
          />
        )}
      </div>
      {discover.error && (
        <PageErrorMessage
          title={intl.formatMessage(messages.loadErrorTitle)}
          description={intl.formatMessage(messages.loadErrorDescription)}
          retry={{
            onClick: () => discover.mutate?.(),
            tooltip: intl.formatMessage(messages.retryDescription),
            busy: discover.isValidating,
          }}
        />
      )}
      {(!discover.error || discover.titles.length > 0) && (
        <ListView
          enableDiscoverNavigation
          items={discover.titles}
          isEmpty={discover.isEmpty}
          isLoading={
            discover.isLoadingInitialData ||
            discover.isSearchingFilteredResults ||
            (discover.isLoadingMore && discover.titles.length > 0)
          }
          isReachingEnd={!!discover.error || discover.isReachingEnd}
          onScrollBottom={discover.fetchMore}
        />
      )}
    </>
  );
};
export default DiscoverMovies;
