import Alert from '@app/components/Common/Alert';
import Button from '@app/components/Common/Button';
import Header from '@app/components/Common/Header';
import ListView from '@app/components/Common/ListView';
import PageTitle from '@app/components/Common/PageTitle';
import { getFilterToggleButtonClass } from '@app/components/Discover/FilterPanel/CompactFilterSelect';
import RequestModal from '@app/components/RequestModal';
import useDebouncedState from '@app/hooks/useDebouncedState';
import useDiscover from '@app/hooks/useDiscover';
import { useSearchActivityReporter } from '@app/hooks/useSearchActivity';
import { useBatchUpdateQueryParams } from '@app/hooks/useUpdateQueryParams';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import { MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/24/solid';
import type { MagazineResult } from '@server/models/Magazine';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Discover.DiscoverMagazines', {
  magazines: 'Magazines',
  search: 'Search tracked magazines',
  searchPublic: 'Search public magazine catalog',
  searchPlaceholder: 'Magazine title',
  unavailable: 'Magazine discovery is unavailable right now.',
  unavailableHint: 'Check the LazyLibrarian connection in service settings.',
  publicUnavailableHint:
    'Check the Google Books API key in Settings > Main and try again.',
  trackedCatalog: 'Tracked titles',
  publicCatalog: 'Public catalog',
  magazineCatalogSource: 'Magazine catalog source',
  catalogHint:
    'Search magazines tracked by LazyLibrarian, or request another title by name.',
  publicCatalogHint:
    'Search Google Books for magazine titles. Requests and issue tracking still use LazyLibrarian.',
  suggestedSearches: 'Suggested searches',
  requestTitle: 'Request “{title}”',
  noResults: 'No tracked magazines match this title.',
  noPublicResults: 'No public magazine titles match this search.',
});

const suggestedMagazineSearches = [
  'National Geographic',
  'Time',
  'Vogue',
  'The New Yorker',
  'Scientific American',
  'Wired',
];

const DiscoverMagazines = () => {
  const intl = useIntl();
  const router = useRouter();
  const [isRouteReady, setIsRouteReady] = useState(false);
  useEffect(() => {
    if (router.isReady) {
      setIsRouteReady(true);
    }
  }, [router.isReady]);
  const routeQuery = isRouteReady ? router.query : {};
  const update = useBatchUpdateQueryParams(routeQuery);
  const { hasPermission } = useUser();
  const query = typeof routeQuery.query === 'string' ? routeQuery.query : '';
  const catalog = routeQuery.catalog === 'public' ? 'public' : 'tracked';
  const [search, debouncedSearch, setSearch] = useDebouncedState(query);
  const [requestTitle, setRequestTitle] = useState('');
  const routedSearchRef = useRef(query.trim());
  const pendingRouteSearchRef = useRef<string | null>(null);
  useEffect(() => {
    routedSearchRef.current = query.trim();
    pendingRouteSearchRef.current = query.trim();
    setSearch(query);
  }, [query, setSearch]);

  const discover = useDiscover<MagazineResult>(
    '/api/v1/discover/magazines',
    { query, catalog: catalog === 'public' ? 'public' : undefined },
    {
      enabled: isRouteReady,
      showErrorToast: false,
      hideErrorWithResults: false,
    }
  );
  useSearchActivityReporter(
    Boolean(search.trim()) &&
      (search.trim() !== query.trim() ||
        discover.isLoadingInitialData ||
        discover.isValidating),
    'magazines-keyword'
  );
  useEffect(() => {
    const nextSearch = debouncedSearch.trim();
    if (pendingRouteSearchRef.current !== null) {
      if (nextSearch !== pendingRouteSearchRef.current) {
        return;
      }
      pendingRouteSearchRef.current = null;
    }
    if (nextSearch !== routedSearchRef.current) {
      routedSearchRef.current = nextSearch;
      update({ query: nextSearch || undefined, page: undefined });
    }
  }, [debouncedSearch, update]);

  const title = intl.formatMessage(messages.magazines);
  const isPublicCatalog = catalog === 'public';
  const providerMessage = (
    discover.error as { response?: { data?: { message?: string } } } | undefined
  )?.response?.data?.message;
  const canRequest = hasPermission(
    [Permission.REQUEST, Permission.REQUEST_MAGAZINE],
    { type: 'or' }
  );

  return (
    <>
      <PageTitle title={title} />
      <div className="app-filter-section-gap">
        <Header>{title}</Header>
        <p className="description mt-2">
          {intl.formatMessage(
            isPublicCatalog ? messages.publicCatalogHint : messages.catalogHint
          )}
        </p>
        <div className="app-filter-row">
          <div
            className="app-filter-row"
            role="group"
            aria-label={intl.formatMessage(messages.magazineCatalogSource)}
          >
            {(
              [
                ['tracked', messages.trackedCatalog],
                ['public', messages.publicCatalog],
              ] as const
            ).map(([source, label]) => (
              <button
                key={source}
                type="button"
                className={getFilterToggleButtonClass(catalog === source)}
                aria-pressed={catalog === source}
                onClick={() => {
                  void router.replace(
                    {
                      pathname: router.pathname,
                      query: {
                        ...router.query,
                        query: search.trim() || undefined,
                        catalog: source === 'public' ? source : undefined,
                        page: undefined,
                      },
                    },
                    undefined,
                    { shallow: true }
                  );
                }}
              >
                {intl.formatMessage(label)}
              </button>
            ))}
          </div>
          <form
            className="discover-filter-control app-filter-search-control"
            onSubmit={(event) => {
              event.preventDefault();
              const nextSearch = search.trim();
              routedSearchRef.current = nextSearch;
              update({ query: nextSearch || undefined, page: undefined });
            }}
          >
            <span
              className={`discover-filter-control-label ${
                search.trim() ? 'discover-filter-control-label-active' : ''
              }`}
            >
              <MagnifyingGlassIcon aria-hidden="true" />
              {intl.formatMessage(
                isPublicCatalog ? messages.searchPublic : messages.search
              )}
            </span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={intl.formatMessage(messages.searchPlaceholder)}
              aria-label={intl.formatMessage(
                isPublicCatalog ? messages.searchPublic : messages.search
              )}
              className="app-filter-search-input"
            />
          </form>
          {canRequest && search.trim() && (
            <Button
              buttonType="primary"
              buttonSize="sm"
              onClick={() => setRequestTitle(search.trim())}
            >
              <PlusIcon />
              <span>
                {intl.formatMessage(messages.requestTitle, {
                  title: search.trim(),
                })}
              </span>
            </Button>
          )}
        </div>
        {isPublicCatalog && !search.trim() && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold text-gray-400">
              {intl.formatMessage(messages.suggestedSearches)}
            </p>
            <div className="app-filter-row">
              {suggestedMagazineSearches.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className={getFilterToggleButtonClass(false)}
                  onClick={() => setSearch(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {requestTitle && (
        <RequestModal
          magazineTitle={requestTitle}
          show={true}
          type="magazine"
          onComplete={() => setRequestTitle('')}
          onCancel={() => setRequestTitle('')}
        />
      )}
      {discover.error && (
        <Alert
          title={providerMessage ?? intl.formatMessage(messages.unavailable)}
          type="warning"
        >
          {intl.formatMessage(
            isPublicCatalog
              ? messages.publicUnavailableHint
              : messages.unavailableHint
          )}
        </Alert>
      )}
      {!discover.error &&
        !discover.isLoadingInitialData &&
        discover.isEmpty && (
          <Alert
            title={intl.formatMessage(
              isPublicCatalog ? messages.noPublicResults : messages.noResults
            )}
            type="info"
          />
        )}
      {(!discover.error || discover.titles.length > 0) && (
        <ListView
          items={discover.titles}
          isEmpty={discover.isEmpty}
          isLoading={
            discover.isLoadingInitialData ||
            (discover.isLoadingMore && discover.titles.length > 0)
          }
          isReachingEnd={discover.isReachingEnd}
          onScrollBottom={discover.fetchMore}
        />
      )}
    </>
  );
};

export default DiscoverMagazines;
