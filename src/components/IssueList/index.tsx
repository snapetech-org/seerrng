import Button from '@app/components/Common/Button';
import Header from '@app/components/Common/Header';
import LoadingSpinner, {
  PageStatus,
} from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import {
  CompactSelect,
  FilterResetButton,
  getFilterToggleButtonClass,
  type CompactSelectOption,
} from '@app/components/Discover/FilterPanel/CompactFilterSelect';
import { BOOK_GENRES } from '@app/components/Discover/FilterPanel/libraryFilterUtils';
import MediaFilterOption from '@app/components/Discover/MediaFilterOption';
import { tvNetworks } from '@app/components/Discover/NetworkSlider';
import { PinnedFilterSectionGroup } from '@app/components/Discover/PinnedFilterSection';
import { studios } from '@app/components/Discover/StudioSlider';
import FocusedIssue from '@app/components/IssueList/FocusedIssue';
import IssueItem from '@app/components/IssueList/IssueItem';
import UpstreamIssueItem from '@app/components/IssueList/UpstreamIssueItem';
import useDebouncedState from '@app/hooks/useDebouncedState';
import useMediaFilterPin from '@app/hooks/useMediaFilterPin';
import { useSearchActivityReporter } from '@app/hooks/useSearchActivity';
import {
  getPositiveQueryParamNumber,
  useUpdateQueryParams,
} from '@app/hooks/useUpdateQueryParams';
import useUpstreamTheme from '@app/hooks/useUpstreamTheme';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import {
  BarsArrowDownIcon,
  BarsArrowUpIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import {
  BarsArrowDownIcon as UpstreamSortIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FunnelIcon,
} from '@heroicons/react/24/solid';
import { MediaType } from '@server/constants/media';
import type { TmdbGenre } from '@server/api/themoviedb/interfaces';
import type { IssueResultsResponse } from '@server/interfaces/api/issueInterfaces';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.IssueList', {
  issues: 'Issues',
  allIssues: 'All Issues',
  taskFilters: 'Task Filters',
  mediaFilters: 'Media Filters',
  filters: 'Filters',
  clearFilters: 'Clear Filters',
  sortBy: 'Sort By',
  sortDate: 'Date',
  sortModified: 'Last Modified',
  sortStatus: 'Status',
  timePeriod: 'Time Period',
  sevenDays: 'Last 7 Days',
  fourteenDays: 'Last 14 Days',
  thirtyDays: 'Last 30 Days',
  sixMonths: 'Last 6 Months',
  allTime: 'All Time',
  search: 'Keyword Search',
  searchIssues: 'Search Issues',
  allMedia: 'All Media',
  movies: 'Movies',
  series: 'Series',
  music: 'Music',
  books: 'Books',
  comics: 'Comics',
  magazines: 'Magazines',
  issueType: 'Issue Type',
  releaseDate: 'Release Date',
  releaseYear: 'Release Year',
  firstPublished: 'First Published',
  genres: 'Genres',
  studio: 'Studio',
  network: 'Network',
  albumType: 'Album Type',
  album: 'Album',
  ep: 'EP',
  single: 'Single',
  any: 'Any',
  audio: 'Audio',
  video: 'Video',
  subtitle: 'Subtitle',
  other: 'Other',
  showAllIssues: 'Show All Issues',
  sortAdded: 'Most Recent',
  moreIssueFilters: 'More issue filters',
});

type Filter = 'all' | 'open' | 'resolved';
type Sort = 'added' | 'modified' | 'status';
type Direction = 'asc' | 'desc';
type TimeFrame = '7d' | '14d' | '30d' | '6m' | 'all';
type MediaFilter =
  'all' | 'movie' | 'tv' | 'music' | 'book' | 'comic' | 'magazine';
type IssueTypeFilter = 'all' | 'audio' | 'video' | 'subtitle' | 'other';

const IssueList = () => {
  const intl = useIntl();
  const router = useRouter();
  const upstream = useUpstreamTheme();
  const focusedIssueId = getPositiveQueryParamNumber(router.query.issue);
  const [filter, setFilter] = useState<Filter>(upstream ? 'open' : 'all');
  const [sort, setSort] = useState<Sort>('added');
  const [direction, setDirection] = useState<Direction>('desc');
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('all');
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const mediaPin = useMediaFilterPin<MediaFilter>({
    scope: 'issues',
    selected: mediaFilter,
    values: ['all', 'movie', 'tv', 'music', 'book'],
    restore: setMediaFilter,
  });
  const [issueTypeFilter, setIssueTypeFilter] =
    useState<IssueTypeFilter>('all');
  const [releaseYearFilter, setReleaseYearFilter] = useState('any');
  const [genreFilter, setGenreFilter] = useState('');
  const [studioFilter, setStudioFilter] = useState('');
  const [networkFilter, setNetworkFilter] = useState('');
  const [albumTypeFilter, setAlbumTypeFilter] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [search, debouncedSearch, setSearch] = useDebouncedState('');
  const page = getPositiveQueryParamNumber(router.query.page, 1) ?? 1;
  const pageIndex = page - 1;
  const updateQueryParams = useUpdateQueryParams({ page: page.toString() });
  const params = new URLSearchParams({
    take: String(pageSize),
    skip: String(pageIndex * pageSize),
    filter,
    sort,
    sortDirection: direction,
    timeFrame,
    mediaType: mediaFilter,
    issueType: issueTypeFilter,
  });
  if (mediaFilter !== 'all') {
    if (releaseYearFilter !== 'any') {
      params.set('releaseYear', releaseYearFilter);
    }
    if (genreFilter) params.set('genre', genreFilter);
    if (mediaFilter === 'movie' && studioFilter) {
      params.set('studio', studioFilter);
    }
    if (mediaFilter === 'tv' && networkFilter) {
      params.set('network', networkFilter);
    }
    if (mediaFilter === 'music' && albumTypeFilter) {
      params.set('albumType', albumTypeFilter);
    }
  }
  if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
  const { data, error, isValidating } = useSWR<IssueResultsResponse>(
    `/api/v1/issue?${params.toString()}`
  );
  useSearchActivityReporter(
    Boolean(search.trim()) &&
      (search.trim() !== debouncedSearch.trim() || isValidating),
    'issues-keyword'
  );
  const { data: availableGenres } = useSWR<TmdbGenre[]>(
    mediaFilter === 'movie' || mediaFilter === 'tv'
      ? `/api/v1/genres/${mediaFilter}`
      : null
  );

  const pendingHeading = upstream ? null : (
    <>
      <PageTitle title={intl.formatMessage(messages.issues)} />
      <div className="page-title-row">
        <h2 className="page-title">{intl.formatMessage(messages.issues)}</h2>
      </div>
    </>
  );

  if (!data && !error)
    return (
      <>
        {pendingHeading}
        <LoadingSpinner />
      </>
    );
  if (!data)
    return (
      <>
        {pendingHeading}
        <ErrorPage statusCode={500} />
      </>
    );

  const resetPage = () => page !== 1 && updateQueryParams('page', '1');
  const clearMediaSpecificFilters = () => {
    setReleaseYearFilter('any');
    setGenreFilter('');
    setStudioFilter('');
    setNetworkFilter('');
    setAlbumTypeFilter('');
  };
  const changePage = (nextPage: number) => {
    updateQueryParams('page', String(nextPage));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const updateSort = (nextSort: Sort) => {
    setDirection(
      sort === nextSort ? (direction === 'asc' ? 'desc' : 'asc') : 'desc'
    );
    setSort(nextSort);
    resetPage();
  };
  const clearFilters = () => {
    setFilter('all');
    setTimeFrame('all');
    setMediaFilter('all');
    setIssueTypeFilter('all');
    clearMediaSpecificFilters();
    setSearch('');
    setSort('added');
    setDirection('desc');
    resetPage();
  };
  const totalPages = Math.max(data.pageInfo.pages, 1);
  const currentYear = new Date().getFullYear();
  const yearOptions: CompactSelectOption[] = [
    { label: intl.formatMessage(messages.any), value: 'any' },
    ...Array.from({ length: currentYear - 1969 }, (_, index) => {
      const year = currentYear - index;
      return { label: year.toString(), value: year.toString() };
    }),
    { label: '<1970', value: 'before-1970' },
  ];
  const genreOptions: CompactSelectOption[] = [
    { label: intl.formatMessage(messages.any), value: '' },
    ...(mediaFilter === 'movie' || mediaFilter === 'tv'
      ? (availableGenres ?? []).map((genre) => ({
          label: genre.name,
          value: genre.name.toLocaleLowerCase(),
        }))
      : mediaFilter === 'music'
        ? [
            'Alternative',
            'Classical',
            'Country',
            'Electronic',
            'Hip-Hop',
            'Jazz',
            'Metal',
            'Pop',
            'Rock',
          ].map((genre) => ({
            label: genre,
            value: genre.toLocaleLowerCase(),
          }))
        : BOOK_GENRES.map(([, label]) => ({
            label,
            value: label.toLocaleLowerCase(),
          }))),
  ];
  const issueTypeOptions: CompactSelectOption[] = [
    { label: intl.formatMessage(messages.any), value: 'all' },
    { label: intl.formatMessage(messages.audio), value: 'audio' },
    { label: intl.formatMessage(messages.video), value: 'video' },
    { label: intl.formatMessage(messages.subtitle), value: 'subtitle' },
    { label: intl.formatMessage(messages.other), value: 'other' },
  ];
  const timeFrameOptions: CompactSelectOption[] = [
    { label: intl.formatMessage(messages.allTime), value: 'all' },
    { label: intl.formatMessage(messages.sevenDays), value: '7d' },
    { label: intl.formatMessage(messages.fourteenDays), value: '14d' },
    { label: intl.formatMessage(messages.thirtyDays), value: '30d' },
    { label: intl.formatMessage(messages.sixMonths), value: '6m' },
  ];

  const pinMediaType =
    mediaFilter === 'tv'
      ? 'tv'
      : mediaFilter === 'music'
        ? 'music'
        : mediaFilter === 'book'
          ? 'book'
          : 'movie';
  const extendedFilters = (
    <PinnedFilterSectionGroup
      mediaType={pinMediaType}
      sections={[
        {
          section: 'taskFilters',
          label: intl.formatMessage(messages.taskFilters),
          children: (
            <div className="app-filter-row">
              <FilterResetButton
                label={intl.formatMessage(messages.clearFilters)}
                selected={
                  filter === 'all' &&
                  timeFrame === 'all' &&
                  mediaFilter === 'all' &&
                  issueTypeFilter === 'all' &&
                  releaseYearFilter === 'any' &&
                  !genreFilter &&
                  !studioFilter &&
                  !networkFilter &&
                  !albumTypeFilter &&
                  !search &&
                  sort === 'added' &&
                  direction === 'desc'
                }
                onClick={clearFilters}
              />
              {(
                [
                  ['all', messages.allIssues, data.counts?.all ?? 0],
                  ['open', globalMessages.open, data.counts?.open ?? 0],
                  [
                    'resolved',
                    globalMessages.resolved,
                    data.counts?.resolved ?? 0,
                  ],
                ] as const
              ).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => {
                    setFilter(value);
                    resetPage();
                  }}
                  className={getFilterToggleButtonClass(filter === value)}
                >
                  {intl.formatMessage(label)}
                  <span className="app-filter-count">{count}</span>
                </button>
              ))}
              <CompactSelect
                label={intl.formatMessage(messages.issueType)}
                value={issueTypeFilter}
                options={issueTypeOptions}
                onChange={(value) => {
                  setIssueTypeFilter(value as IssueTypeFilter);
                  resetPage();
                }}
              />
            </div>
          ),
        },
        {
          section: 'mediaFilters',
          label: intl.formatMessage(messages.mediaFilters),
          children: (
            <div className="app-filter-row">
              {(
                [
                  ['all', messages.allMedia],
                  ['movie', messages.movies],
                  ['tv', messages.series],
                  ['music', messages.music],
                  ['book', messages.books],
                  ['comic', messages.comics],
                  ['magazine', messages.magazines],
                ] as const
              ).map(([value, label]) => (
                <MediaFilterOption
                  key={value}
                  pin={mediaPin}
                  value={value}
                  label={intl.formatMessage(label)}
                  selected={mediaFilter === value}
                >
                  <button
                    type="button"
                    aria-pressed={mediaFilter === value}
                    onClick={() => {
                      setMediaFilter(value);
                      clearMediaSpecificFilters();
                      resetPage();
                    }}
                    className="app-control-shadow-exempt app-filter-segment-focus"
                  >
                    {intl.formatMessage(label)}
                  </button>
                </MediaFilterOption>
              ))}
            </div>
          ),
        },
        {
          section: 'filters',
          label: intl.formatMessage(messages.filters),
          children: (
            <div className="app-filter-row">
              <CompactSelect
                label={intl.formatMessage(messages.timePeriod)}
                value={timeFrame}
                options={timeFrameOptions}
                onChange={(value) => {
                  setTimeFrame(value as TimeFrame);
                  resetPage();
                }}
              />
              <label className="discover-filter-control app-filter-search-control">
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
                  onChange={(event) => {
                    setSearch(event.target.value);
                    resetPage();
                  }}
                  placeholder={intl.formatMessage(messages.searchIssues)}
                  aria-label={intl.formatMessage(messages.searchIssues)}
                  className="app-filter-search-input"
                />
              </label>
              {mediaFilter !== 'all' &&
                mediaFilter !== 'comic' &&
                mediaFilter !== 'magazine' && (
                  <>
                    <CompactSelect
                      label={intl.formatMessage(
                        mediaFilter === 'music'
                          ? messages.releaseYear
                          : mediaFilter === 'book'
                            ? messages.firstPublished
                            : messages.releaseDate
                      )}
                      value={releaseYearFilter}
                      options={yearOptions}
                      onChange={(value) => {
                        setReleaseYearFilter(value);
                        resetPage();
                      }}
                    />
                    <CompactSelect
                      label={intl.formatMessage(messages.genres)}
                      value={genreFilter}
                      options={genreOptions}
                      onChange={(value) => {
                        setGenreFilter(value);
                        resetPage();
                      }}
                    />
                  </>
                )}
              {mediaFilter === 'movie' && (
                <CompactSelect
                  label={intl.formatMessage(messages.studio)}
                  value={studioFilter}
                  options={[
                    { label: intl.formatMessage(messages.any), value: '' },
                    ...studios.map((studio) => ({
                      label: studio.name,
                      value: studio.name.toLocaleLowerCase(),
                    })),
                  ]}
                  onChange={(value) => {
                    setStudioFilter(value);
                    resetPage();
                  }}
                />
              )}
              {mediaFilter === 'tv' && (
                <CompactSelect
                  label={intl.formatMessage(messages.network)}
                  value={networkFilter}
                  options={[
                    { label: intl.formatMessage(messages.any), value: '' },
                    ...tvNetworks.map((network) => ({
                      label: network.name,
                      value: network.name.toLocaleLowerCase(),
                    })),
                  ]}
                  onChange={(value) => {
                    setNetworkFilter(value);
                    resetPage();
                  }}
                />
              )}
              {mediaFilter === 'music' && (
                <CompactSelect
                  label={intl.formatMessage(messages.albumType)}
                  value={albumTypeFilter}
                  options={[
                    { label: intl.formatMessage(messages.any), value: '' },
                    {
                      label: intl.formatMessage(messages.album),
                      value: 'album',
                    },
                    { label: intl.formatMessage(messages.ep), value: 'ep' },
                    {
                      label: intl.formatMessage(messages.single),
                      value: 'single',
                    },
                  ]}
                  onChange={(value) => {
                    setAlbumTypeFilter(value);
                    resetPage();
                  }}
                />
              )}
            </div>
          ),
        },
        {
          section: 'sortBy',
          label: intl.formatMessage(messages.sortBy),
          children: (
            <div className="app-filter-row">
              {(
                [
                  ['added', messages.sortDate],
                  ['modified', messages.sortModified],
                  ['status', messages.sortStatus],
                ] as const
              ).map(([value, label]) => {
                const active = sort === value;
                const Icon =
                  active && direction === 'asc'
                    ? BarsArrowUpIcon
                    : BarsArrowDownIcon;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => updateSort(value)}
                    className={getFilterToggleButtonClass(active)}
                  >
                    {intl.formatMessage(label)}
                    <Icon />
                  </button>
                );
              })}
            </div>
          ),
        },
      ]}
    />
  );

  return (
    <>
      <PageTitle title={intl.formatMessage(messages.issues)} />
      {upstream ? (
        <div className="mb-4 flex flex-col justify-between lg:flex-row lg:items-end">
          <Header>{intl.formatMessage(messages.issues)}</Header>
          <div className="mt-2 flex flex-grow flex-col sm:flex-row lg:flex-grow-0">
            <div className="mb-2 flex flex-grow sm:mb-0 sm:mr-2 lg:flex-grow-0">
              <span className="inline-flex cursor-default items-center rounded-l-md border border-r-0 border-gray-500 bg-gray-800 px-3 text-sm text-gray-100">
                <FunnelIcon className="h-6 w-6" />
              </span>
              <select
                id="filter"
                name="filter"
                onChange={(event) => {
                  setFilter(event.target.value as Filter);
                  resetPage();
                }}
                value={filter}
                className="rounded-r-only"
              >
                <option value="all">{intl.formatMessage(globalMessages.all)}</option>
                <option value="open">{intl.formatMessage(globalMessages.open)}</option>
                <option value="resolved">
                  {intl.formatMessage(globalMessages.resolved)}
                </option>
              </select>
            </div>
            <div className="mb-2 flex flex-grow sm:mb-0 lg:flex-grow-0">
              <span className="inline-flex cursor-default items-center rounded-l-md border border-r-0 border-gray-500 bg-gray-800 px-3 text-gray-100 sm:text-sm">
                <UpstreamSortIcon className="h-6 w-6" />
              </span>
              <select
                id="sort"
                name="sort"
                onChange={(event) => {
                  setSort(event.target.value as Sort);
                  setDirection('desc');
                  resetPage();
                }}
                value={sort === 'status' ? 'added' : sort}
                className="rounded-r-only"
              >
                <option value="added">
                  {intl.formatMessage(messages.sortAdded)}
                </option>
                <option value="modified">
                  {intl.formatMessage(messages.sortModified)}
                </option>
              </select>
            </div>
          </div>
        </div>
      ) : (
        <div className="page-title-row">
          <h2 className="page-title">{intl.formatMessage(messages.issues)}</h2>
          <PageStatus />
        </div>
      )}
      {focusedIssueId && (
        <FocusedIssue key={focusedIssueId} issueId={focusedIssueId} />
      )}
      {upstream ? (
        <details className="mb-4">
          <summary className="cursor-pointer py-3 text-sm font-semibold text-gray-300">
            {intl.formatMessage(messages.moreIssueFilters)}
          </summary>
          {extendedFilters}
        </details>
      ) : (
        extendedFilters
      )}
      {upstream ? (
        <div>
          {data.results
            .filter((issue) => issue.id !== focusedIssueId)
            .map((issue) => (
              <div className="py-2" key={`issue-item-${issue.id}`}>
                {issue.media.mediaType === MediaType.MOVIE ||
                issue.media.mediaType === MediaType.TV ? (
                  <UpstreamIssueItem issue={issue} />
                ) : (
                  <IssueItem issue={issue} />
                )}
              </div>
            ))}
        </div>
      ) : (
        <div className="card-stack card-spacing-before">
          {data.results
            .filter((issue) => issue.id !== focusedIssueId)
            .map((issue) => (
              <IssueItem key={`issue-item-${issue.id}`} issue={issue} />
            ))}
        </div>
      )}
      {data.results.length === 0 &&
        (upstream ? (
          <div className="flex w-full flex-col items-center justify-center py-24 text-white">
            <span className="text-2xl text-gray-400">
              {intl.formatMessage(globalMessages.noresults)}
            </span>
            {filter !== 'all' && (
              <div className="mt-4">
                <Button
                  buttonType="primary"
                  onClick={() => {
                    setFilter('all');
                    resetPage();
                  }}
                >
                  {intl.formatMessage(messages.showAllIssues)}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="app-card-main refreshed-card-surface flex min-h-16 w-full flex-col items-center justify-center rounded-xl border border-gray-700 px-4 py-4 text-white">
            <span className="refreshed-detail-text text-sm">
              {intl.formatMessage(globalMessages.noresults)}
            </span>
            {filter !== 'all' && (
              <Button
                buttonType="primary"
                className="mt-3"
                onClick={() => setFilter('all')}
              >
                {intl.formatMessage(messages.showAllIssues)}
              </Button>
            )}
          </div>
        ))}
      {upstream ? (
        <div className="actions">
          <nav
            className="mb-3 flex flex-col items-center space-y-3 sm:flex-row sm:space-y-0"
            aria-label="Pagination"
          >
            <div className="hidden lg:flex lg:flex-1">
              <p className="text-sm">
                {data.results.length > 0 &&
                  intl.formatMessage(globalMessages.showingresults, {
                    from: pageIndex * pageSize + 1,
                    to:
                      data.results.length < pageSize
                        ? pageIndex * pageSize + data.results.length
                        : (pageIndex + 1) * pageSize,
                    total: data.pageInfo.results,
                    strong: (message: React.ReactNode) => (
                      <span className="font-medium">{message}</span>
                    ),
                  })}
              </p>
            </div>
            <div className="flex justify-center sm:flex-1 sm:justify-start lg:justify-center">
              <span className="-mt-3 items-center truncate text-sm sm:mt-0">
                {intl.formatMessage(globalMessages.resultsperpage, {
                  pageSize: (
                    <select
                      id="pageSize"
                      name="pageSize"
                      onChange={(event) => {
                        setPageSize(Number(event.target.value));
                        resetPage();
                      }}
                      value={pageSize}
                      className="short inline"
                    >
                      <option value="5">5</option>
                      <option value="10">10</option>
                      <option value="25">25</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                    </select>
                  ),
                })}
              </span>
            </div>
            <div className="flex flex-auto justify-center space-x-2 sm:flex-1 sm:justify-end">
              <Button
                disabled={pageIndex <= 0}
                onClick={() => changePage(page - 1)}
              >
                <ChevronLeftIcon />
                <span>{intl.formatMessage(globalMessages.previous)}</span>
              </Button>
              <Button
                disabled={pageIndex + 1 >= totalPages}
                onClick={() => changePage(page + 1)}
              >
                <span>{intl.formatMessage(globalMessages.next)}</span>
                <ChevronRightIcon />
              </Button>
            </div>
          </nav>
        </div>
      ) : (
        <PaginationFooter
          page={page}
          pageSize={pageSize}
          totalPages={totalPages}
          onPageChange={changePage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            resetPage();
          }}
        />
      )}
    </>
  );
};

export default IssueList;
