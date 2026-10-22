import Button from '@app/components/Common/Button';
import Header from '@app/components/Common/Header';
import ListView from '@app/components/Common/ListView';
import PageTitle from '@app/components/Common/PageTitle';
import {
  CompactSelect,
  FilterResetButton,
  type CompactSelectOption,
} from '@app/components/Discover/FilterPanel/CompactFilterSelect';
import useDiscover from '@app/hooks/useDiscover';
import useSettings from '@app/hooks/useSettings';
import {
  getPositiveQueryParamNumber,
  useBatchUpdateQueryParams,
} from '@app/hooks/useUpdateQueryParams';
import { Permission, useUser } from '@app/hooks/useUser';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import {
  getUserServiceAvailability,
  isDiscoverWatchlistTypeEnabled,
} from '@app/utils/serviceAvailability';
import { MediaType } from '@server/constants/media';
import {
  WATCHLIST_SORT_OPTIONS,
  type WatchlistFilters,
  type WatchlistItem,
  type WatchlistResponse,
  type WatchlistSort,
} from '@server/interfaces/api/discoverInterfaces';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Discover.DiscoverWatchlist', {
  discoverwatchlist: 'Your Watchlist',
  watchlist: 'Watchlist',
  title: 'Title',
  searchTitles: 'Search titles',
  mediaType: 'Media Type',
  allTypes: 'All Types',
  movies: 'Movies',
  series: 'Series',
  music: 'Music',
  books: 'Books',
  comics: 'Comics',
  magazines: 'Magazines',
  sortBy: 'Sort By',
  addedOrder: 'Added Order',
  recentlyAdded: 'Recently Added',
  titleAscending: 'Title (A to Z)',
  titleDescending: 'Title (Z to A)',
  applyFilters: 'Apply Filters',
  clearFilters: 'Clear Filters',
  plexFilterUnavailable:
    'Filters are unavailable while Plex Watchlist items are combined. Local items keep their saved order, and Plex items keep Plex ordering.',
});

const mediaTypeMessages = {
  [MediaType.MOVIE]: messages.movies,
  [MediaType.TV]: messages.series,
  [MediaType.MUSIC]: messages.music,
  [MediaType.BOOK]: messages.books,
  [MediaType.COMIC]: messages.comics,
  [MediaType.MAGAZINE]: messages.magazines,
} as const;

const mediaTypes = Object.keys(
  mediaTypeMessages
) as WatchlistItem['mediaType'][];

type WatchlistFilterDraft = {
  search: string;
  mediaType: 'all' | WatchlistItem['mediaType'];
  sortBy: 'added' | WatchlistSort;
};

const getWatchlistFilterDraft = (
  filters: WatchlistFilters
): WatchlistFilterDraft => ({
  search: filters.search ?? '',
  mediaType: filters.mediaType ?? 'all',
  sortBy: filters.sortBy ?? 'added',
});

const DiscoverWatchlist = () => {
  const intl = useIntl();
  const router = useRouter();
  const userId = getPositiveQueryParamNumber(router.query.userId);
  const { user } = useUser({
    id: userId,
  });
  const { user: currentUser, hasPermission } = useUser();
  const isProfileWatchlist = router.pathname.startsWith('/profile');
  const isUserWatchlist =
    isProfileWatchlist || router.pathname.startsWith('/users/');
  const targetUserId = isProfileWatchlist ? currentUser?.id : userId;
  const watchlistPath = targetUserId ? `user/${targetUserId}` : 'discover';
  const watchlistEnabled = !isUserWatchlist || targetUserId !== undefined;
  const { currentSettings } = useSettings();
  const enabledMediaCategories = currentUser?.settings?.enabledMediaCategories;
  const isAdmin = hasPermission(Permission.ADMIN);
  const serviceAvailability = useMemo(
    () =>
      getUserServiceAvailability(
        currentSettings,
        enabledMediaCategories,
        isAdmin
      ),
    [currentSettings, enabledMediaCategories, isAdmin]
  );
  const updateQueryParams = useBatchUpdateQueryParams(router.query);
  const availableMediaTypes = useMemo(
    () =>
      mediaTypes.filter((mediaType) =>
        isDiscoverWatchlistTypeEnabled(mediaType, serviceAvailability)
      ),
    [serviceAvailability]
  );
  const routeFilters = useMemo<WatchlistFilters>(() => {
    const search =
      typeof router.query.search === 'string' &&
      router.query.search.trim().length <= 100
        ? router.query.search.trim() || undefined
        : undefined;
    const mediaType = availableMediaTypes.includes(
      router.query.mediaType as WatchlistItem['mediaType']
    )
      ? (router.query.mediaType as WatchlistItem['mediaType'])
      : undefined;
    const sortBy = WATCHLIST_SORT_OPTIONS.includes(
      router.query.sortBy as WatchlistSort
    )
      ? (router.query.sortBy as WatchlistSort)
      : undefined;

    return { search, mediaType, sortBy };
  }, [
    availableMediaTypes,
    router.query.mediaType,
    router.query.search,
    router.query.sortBy,
  ]);
  const [filterDraft, setFilterDraft] = useState(() =>
    getWatchlistFilterDraft(routeFilters)
  );
  useEffect(() => {
    setFilterDraft(getWatchlistFilterDraft(routeFilters));
  }, [routeFilters]);

  const {
    isLoadingInitialData,
    isEmpty,
    isLoadingMore,
    isValidating,
    titles,
    fetchMore,
    error,
    mutate,
    firstResultData,
  } = useDiscover<
    WatchlistItem,
    Pick<WatchlistResponse, 'filtersSupported'>,
    WatchlistFilters
  >(`/api/v1/${watchlistPath}/watchlist`, routeFilters, {
    enabled: watchlistEnabled,
  });
  const filtersSupported = firstResultData?.filtersSupported;
  const hasRouteFilters = Boolean(
    routeFilters.search || routeFilters.mediaType || routeFilters.sortBy
  );
  const hasInvalidRouteFilters =
    router.isReady &&
    (['search', 'mediaType', 'sortBy'] as const).some((key) => {
      const queryValue = router.query[key];
      if (queryValue === undefined) {
        return false;
      }

      const normalizedValue = routeFilters[key];
      return (
        typeof queryValue !== 'string' ||
        (normalizedValue === undefined
          ? queryValue.length > 0
          : queryValue !== normalizedValue)
      );
    });

  useEffect(() => {
    if (filtersSupported === false && hasRouteFilters) {
      updateQueryParams(
        {
          search: undefined,
          mediaType: undefined,
          sortBy: undefined,
          page: undefined,
        },
        { shallow: true, scroll: false }
      );
    } else if (hasInvalidRouteFilters) {
      updateQueryParams(
        {
          search: routeFilters.search,
          mediaType: routeFilters.mediaType,
          sortBy: routeFilters.sortBy,
          page: undefined,
        },
        { shallow: true, scroll: false }
      );
    }
  }, [
    filtersSupported,
    hasInvalidRouteFilters,
    hasRouteFilters,
    routeFilters,
    updateQueryParams,
  ]);

  const mediaTypeOptions: CompactSelectOption[] = [
    { value: 'all', label: intl.formatMessage(messages.allTypes) },
    ...availableMediaTypes.map((mediaType) => ({
      value: mediaType,
      label: intl.formatMessage(mediaTypeMessages[mediaType]),
    })),
  ];
  const sortOptions: CompactSelectOption[] = [
    { value: 'added', label: intl.formatMessage(messages.addedOrder) },
    {
      value: 'added-desc',
      label: intl.formatMessage(messages.recentlyAdded),
    },
    {
      value: 'title-asc',
      label: intl.formatMessage(messages.titleAscending),
    },
    {
      value: 'title-desc',
      label: intl.formatMessage(messages.titleDescending),
    },
  ];
  const hasActiveFilters = hasRouteFilters;

  const applyFilters = () => {
    updateQueryParams(
      {
        search: filterDraft.search.trim() || undefined,
        mediaType:
          filterDraft.mediaType === 'all' ? undefined : filterDraft.mediaType,
        sortBy: filterDraft.sortBy === 'added' ? undefined : filterDraft.sortBy,
        page: undefined,
      },
      { shallow: true, scroll: false }
    );
  };

  const clearFilters = () => {
    setFilterDraft(getWatchlistFilterDraft({}));
    updateQueryParams(
      {
        search: undefined,
        mediaType: undefined,
        sortBy: undefined,
        page: undefined,
      },
      { shallow: true, scroll: false }
    );
  };
  const visibleTitles = titles.filter((item) =>
    isDiscoverWatchlistTypeEnabled(item.mediaType, currentSettings)
  );
  const hasMoreTitles =
    (firstResultData?.totalResults ?? titles.length) > titles.length;

  useEffect(() => {
    if (
      !isLoadingInitialData &&
      !isLoadingMore &&
      !isValidating &&
      titles.length > 0 &&
      visibleTitles.length === 0 &&
      hasMoreTitles
    ) {
      fetchMore();
    }
  }, [
    fetchMore,
    hasMoreTitles,
    isLoadingInitialData,
    isLoadingMore,
    isValidating,
    titles.length,
    visibleTitles.length,
  ]);

  const title = intl.formatMessage(
    userId ? messages.watchlist : messages.discoverwatchlist
  );

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
      <PageTitle title={[title, userId ? user?.displayName : '']} />
      <div className="app-filter-section-gap">
        <Header
          subtext={
            userId ? (
              <Link href={`/users/${user?.id}`} className="hover:underline">
                {user?.displayName}
              </Link>
            ) : (
              ''
            )
          }
        >
          {title}
        </Header>
        {filtersSupported === true && (
          <div className="app-filter-row" data-testid="watchlist-filters">
            <div
              className="discover-filter-control app-filter-search-control"
              role="search"
            >
              <span
                className={`discover-filter-control-label ${
                  filterDraft.search.trim()
                    ? 'discover-filter-control-label-active'
                    : ''
                }`}
              >
                {intl.formatMessage(messages.title)}
              </span>
              <input
                aria-label={intl.formatMessage(messages.searchTitles)}
                className="app-filter-search-input"
                data-testid="watchlist-title-search"
                maxLength={100}
                onChange={(event) =>
                  setFilterDraft((draft) => ({
                    ...draft,
                    search: event.target.value,
                  }))
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    applyFilters();
                  }
                }}
                placeholder={intl.formatMessage(messages.searchTitles)}
                type="search"
                value={filterDraft.search}
              />
            </div>
            <CompactSelect
              label={intl.formatMessage(messages.mediaType)}
              onChange={(value) =>
                setFilterDraft((draft) => ({
                  ...draft,
                  mediaType: value as WatchlistFilterDraft['mediaType'],
                }))
              }
              options={mediaTypeOptions}
              value={filterDraft.mediaType}
            />
            <CompactSelect
              label={intl.formatMessage(messages.sortBy)}
              onChange={(value) =>
                setFilterDraft((draft) => ({
                  ...draft,
                  sortBy: value as WatchlistFilterDraft['sortBy'],
                }))
              }
              options={sortOptions}
              value={filterDraft.sortBy}
            />
            <Button
              buttonSize="sm"
              buttonType="primary"
              data-testid="watchlist-apply-filters"
              onClick={applyFilters}
              type="button"
            >
              {intl.formatMessage(messages.applyFilters)}
            </Button>
            {hasActiveFilters && (
              <FilterResetButton
                label={intl.formatMessage(messages.clearFilters)}
                onClick={clearFilters}
                selected
              />
            )}
          </div>
        )}
        {filtersSupported === false && (
          <p className="description">
            {intl.formatMessage(messages.plexFilterUnavailable)}
          </p>
        )}
      </div>
      <ListView
        enableDiscoverNavigation
        plexItems={visibleTitles}
        isEmpty={isEmpty || (!hasMoreTitles && visibleTitles.length === 0)}
        isLoading={
          isLoadingInitialData || (isLoadingMore && (titles?.length ?? 0) > 0)
        }
        isReachingEnd={!hasMoreTitles}
        onScrollBottom={fetchMore}
        mutateParent={mutate}
      />
    </>
  );
};

export default DiscoverWatchlist;
