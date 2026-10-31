import Alert from '@app/components/Common/Alert';
import ApiMessageText from '@app/components/Common/ApiMessageText';
import Button from '@app/components/Common/Button';
import Header from '@app/components/Common/Header';
import ListView from '@app/components/Common/ListView';
import PageTitle from '@app/components/Common/PageTitle';
import useDebouncedState from '@app/hooks/useDebouncedState';
import useDiscover from '@app/hooks/useDiscover';
import useDiscoverScrollRestoration from '@app/hooks/useDiscoverScrollRestoration';
import { useSearchActivityReporter } from '@app/hooks/useSearchActivity';
import { useBatchUpdateQueryParams } from '@app/hooks/useUpdateQueryParams';
import defineMessages from '@app/utils/defineMessages';
import { MagnifyingGlassIcon } from '@heroicons/react/24/solid';
import type { ComicResult } from '@server/models/Comic';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Discover.DiscoverComics', {
  comics: 'Comics',
  search: 'Keyword Search',
  searchComics: 'Search Comics',
  unavailable: 'Comic discovery is unavailable right now.',
  unavailableHint: 'ComicVine could not be reached. Try again.',
  noComicVineKey:
    'Comic discovery requires a ComicVine API key configured in settings.',
  publisher: 'Publisher',
  startYear: 'Start year',
  minIssues: 'Min issues',
  maxIssues: 'Max issues',
  applyFilters: 'Apply filters',
  indexing: 'Building comic index',
  indexingProgress:
    'ComicVine volumes indexed: {indexed} of {expected}. Filters will become available when the first scan finishes.',
  indexingRetry:
    'The index is retrying after a provider response. Already indexed volumes are saved.',
  indexingOrder:
    'ComicVine returned an unstable volume order. The index is retrying without showing incomplete filtered results.',
  issueRangeError: 'Minimum issues cannot exceed maximum issues.',
});

interface DiscoverComicsProps {
  titleOverride?: string;
}

const DiscoverComics = ({ titleOverride }: DiscoverComicsProps = {}) => {
  const intl = useIntl();
  const router = useRouter();
  const update = useBatchUpdateQueryParams({});
  const query =
    typeof router.query.query === 'string' ? router.query.query : '';
  const [search, debouncedSearch, setSearch] = useDebouncedState(query);
  const publisher =
    typeof router.query.publisher === 'string' ? router.query.publisher : '';
  const startYear =
    typeof router.query.startYear === 'string' ? router.query.startYear : '';
  const minIssues =
    typeof router.query.minIssues === 'string' ? router.query.minIssues : '';
  const maxIssues =
    typeof router.query.maxIssues === 'string' ? router.query.maxIssues : '';
  const [filterDraft, setFilterDraft] = useState({
    publisher,
    startYear,
    minIssues,
    maxIssues,
  });
  const [filterError, setFilterError] = useState(false);
  useEffect(() => {
    setFilterDraft({ publisher, startYear, minIssues, maxIssues });
  }, [publisher, startYear, minIssues, maxIssues]);
  const routedSearchRef = useRef(query.trim());
  useEffect(() => {
    routedSearchRef.current = query.trim();
    setSearch(query);
  }, [query, setSearch]);

  const discover = useDiscover<
    ComicResult,
    {
      indexing?: boolean;
      indexedResults?: number;
      expectedResults?: number;
      indexError?: string;
      comicVineConfigured?: boolean;
    }
  >(
    '/api/v1/discover/comics',
    { query, publisher, startYear, minIssues, maxIssues },
    {
      showErrorToast: false,
      hideErrorWithResults: false,
      revalidateOnMount: true,
      dedupingInterval: 0,
    }
  );
  const isIndexing = discover.firstResultData?.indexing;
  const refreshDiscovery = discover.mutate;
  useEffect(() => {
    if (!isIndexing) return;
    const interval = setInterval(() => refreshDiscovery?.(), 15_000);
    return () => clearInterval(interval);
  }, [isIndexing, refreshDiscovery]);
  useDiscoverScrollRestoration({
    mediaType: 'comic',
    itemCount: discover.titles.length,
    shuffleSeed: discover.shuffleSeed,
    isLoading: discover.isLoadingInitialData || discover.isLoadingMore,
    isReachingEnd: discover.isReachingEnd,
    fetchMore: discover.fetchMore,
  });
  useSearchActivityReporter(
    Boolean(search.trim()) &&
      (search.trim() !== query.trim() ||
        discover.isLoadingInitialData ||
        discover.isValidating),
    'comics-keyword'
  );
  useEffect(() => {
    const nextSearch = debouncedSearch.trim();

    if (nextSearch !== routedSearchRef.current) {
      routedSearchRef.current = nextSearch;
      update({ query: nextSearch || undefined, page: undefined });
    }
  }, [debouncedSearch, update]);

  const title = titleOverride ?? intl.formatMessage(messages.comics);
  const providerMessage = (
    discover.error as { response?: { data?: { message?: string } } } | undefined
  )?.response?.data?.message;

  return (
    <>
      <PageTitle title={title} />
      <div className="app-filter-section-gap">
        <Header>{title}</Header>
        <div className="app-filter-row">
          <form
            className="discover-filter-control app-filter-search-control"
            onSubmit={(e) => {
              e.preventDefault();
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
              {intl.formatMessage(messages.search)}
            </span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={intl.formatMessage(messages.searchComics)}
              aria-label={intl.formatMessage(messages.searchComics)}
              className="app-filter-search-input"
            />
          </form>
          <form
            className="app-filter-row"
            onSubmit={(event) => {
              event.preventDefault();
              if (
                filterDraft.minIssues !== '' &&
                filterDraft.maxIssues !== '' &&
                Number(filterDraft.minIssues) > Number(filterDraft.maxIssues)
              ) {
                setFilterError(true);
                return;
              }
              setFilterError(false);
              update({
                publisher: filterDraft.publisher.trim() || undefined,
                startYear: filterDraft.startYear || undefined,
                minIssues: filterDraft.minIssues || undefined,
                maxIssues: filterDraft.maxIssues || undefined,
                page: undefined,
              });
            }}
          >
            <input
              className="input input-lite w-40"
              aria-label={intl.formatMessage(messages.publisher)}
              placeholder={intl.formatMessage(messages.publisher)}
              maxLength={128}
              value={filterDraft.publisher}
              onChange={(event) =>
                setFilterDraft((draft) => ({
                  ...draft,
                  publisher: event.target.value,
                }))
              }
            />
            {(['startYear', 'minIssues', 'maxIssues'] as const).map((field) => (
              <input
                key={field}
                className="input input-lite w-28"
                aria-label={intl.formatMessage(messages[field])}
                placeholder={intl.formatMessage(messages[field])}
                type="number"
                min={field === 'startYear' ? 1800 : 0}
                max={field === 'startYear' ? 2200 : 100000}
                value={filterDraft[field]}
                onChange={(event) =>
                  setFilterDraft((draft) => ({
                    ...draft,
                    [field]: event.target.value,
                  }))
                }
              />
            ))}
            <Button buttonType="primary" buttonSize="sm" type="submit">
              {intl.formatMessage(messages.applyFilters)}
            </Button>
          </form>
        </div>
        {filterError && (
          <p className="mt-2 text-sm text-red-300" role="alert">
            {intl.formatMessage(messages.issueRangeError)}
          </p>
        )}
      </div>
      {discover.firstResultData?.indexing && (
        <Alert title={intl.formatMessage(messages.indexing)} type="info">
          {intl.formatMessage(messages.indexingProgress, {
            indexed: discover.firstResultData.indexedResults ?? 0,
            expected: discover.firstResultData.expectedResults ?? 0,
          })}
          {discover.firstResultData.indexError && (
            <span className="mt-1 block">
              {intl.formatMessage(
                discover.firstResultData.indexError === 'unstable-order'
                  ? messages.indexingOrder
                  : messages.indexingRetry
              )}
            </span>
          )}
        </Alert>
      )}
      {discover.error && (
        <Alert
          title={
            <ApiMessageText>
              {providerMessage ?? intl.formatMessage(messages.unavailable)}
            </ApiMessageText>
          }
          type="warning"
        >
          {intl.formatMessage(messages.unavailableHint)}
        </Alert>
      )}
      {!discover.error &&
        !discover.isLoadingInitialData &&
        !discover.isValidating &&
        discover.isEmpty &&
        discover.firstResultData?.comicVineConfigured === false &&
        !discover.firstResultData?.indexing && (
          <Alert
            title={intl.formatMessage(messages.noComicVineKey)}
            type="info"
          />
        )}
      {!discover.firstResultData?.indexing &&
        (!discover.error || discover.titles.length > 0) && (
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
export default DiscoverComics;
