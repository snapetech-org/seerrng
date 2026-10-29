import BlocklistedTagsBadge, {
  compactBlocklistSourceBadgeClass,
} from '@app/components/BlocklistedTagsBadge';
import Badge from '@app/components/Common/Badge';
import CachedImage from '@app/components/Common/CachedImage';
import LoadingSpinner, {
  PageStatus,
} from '@app/components/Common/LoadingSpinner';
import MediaTypeBadge, {
  getMediaTypeBadgeType,
} from '@app/components/Common/MediaTypeBadge';
import PageTitle from '@app/components/Common/PageTitle';
import PaginationFooter from '@app/components/Common/PaginationFooter';
import Tooltip from '@app/components/Common/Tooltip';
import {
  CompactSelect,
  FilterResetButton,
  getFilterToggleButtonClass,
  type CompactSelectOption,
} from '@app/components/Discover/FilterPanel/CompactFilterSelect';
import MediaFilterOption from '@app/components/Discover/MediaFilterOption';
import { PinnedFilterSectionGroup } from '@app/components/Discover/PinnedFilterSection';
import useDebouncedState from '@app/hooks/useDebouncedState';
import useMediaFilterPin from '@app/hooks/useMediaFilterPin';
import { useSearchActivityReporter } from '@app/hooks/useSearchActivity';
import useToasts from '@app/hooks/useToasts';
import {
  getPositiveQueryParamNumber,
  useUpdateQueryParams,
} from '@app/hooks/useUpdateQueryParams';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import {
  encodeApiPathSegment,
  normalizeExternalTitleId,
} from '@app/utils/apiPath';
import defineMessages from '@app/utils/defineMessages';
import { getTmdbPosterImageUrl } from '@app/utils/imageCache';
import { formatDurationMinutes } from '@app/utils/numberHelpers';
import {
  ArchiveBoxXMarkIcon,
  BarsArrowDownIcon,
  BarsArrowUpIcon,
  MagnifyingGlassIcon,
  TagIcon,
} from '@heroicons/react/24/outline';
import type {
  BlocklistItem,
  BlocklistResultsResponse,
} from '@server/interfaces/api/blocklistInterfaces';
import type { BookDetails } from '@server/models/Book';
import type { ComicDetails } from '@server/models/Comic';
import type { MagazineDetails } from '@server/models/Magazine';
import type { MovieDetails } from '@server/models/Movie';
import type { MusicDetails } from '@server/models/Music';
import type { TvDetails } from '@server/models/Tv';
import axios from 'axios';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { FormattedDate, useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Blocklist', {
  taskFilters: 'Task Filters',
  mediaFilters: 'Media Filters',
  filters: 'Filters',
  clearFilters: 'Clear Filters',
  all: 'All Blocklisted',
  manual: 'Manual',
  blocklistedTags: 'Blocklist Tag',
  search: 'Keyword Search',
  searchPlaceholder: 'Search Blocklist',
  allMedia: 'All Media',
  movies: 'Movies',
  series: 'Series',
  music: 'Music',
  books: 'Books',
  comics: 'Comics',
  magazines: 'Magazines',
  timePeriod: 'Time Period',
  allTime: 'All Time',
  sevenDays: 'Last 7 Days',
  fourteenDays: 'Last 14 Days',
  thirtyDays: 'Last 30 Days',
  sixMonths: 'Last 6 Months',
  mediaAndFormat: 'Media & Format',
  releaseDate: 'Release Date',
  firstPublished: 'First Published',
  runtime: 'Runtime',
  pages: 'Pages',
  issueCount: 'Issue Count',
  latestIssue: 'Latest Issue',
  genres: 'Genres',
  director: 'Director',
  creator: 'Creator',
  studio: 'Studio',
  network: 'Network',
  artist: 'Artist',
  albumType: 'Album Type',
  trackCount: 'Track Count',
  author: 'Author',
  publisher: 'Publisher',
  blocklistedBy: 'Blocked By',
  blocklistedOn: 'Blocked On',
  source: 'Source',
  manualSource: 'Manual',
  manualSourceTooltip: 'Someone explicitly blocked this title in Seerr.',
  unavailable: 'Not available',
  removeTooltip: 'Remove this item from the blocklist.',
  removeFailed: 'Unable to remove this item from the blocklist.',
  noResults: 'No blocklisted items match these filters',
  sortBy: 'Sort By',
  sortDate: 'Date',
  sortTitle: 'Title',
  sortMediaType: 'Media Type',
});

enum Filter {
  ALL = 'all',
  MANUAL = 'manual',
  BLOCKLISTEDTAGS = 'blocklistedTags',
}

type BlocklistTitle =
  | MovieDetails
  | TvDetails
  | MusicDetails
  | BookDetails
  | ComicDetails
  | MagazineDetails;
type TimeFrame = 'all' | '7d' | '14d' | '30d' | '6m';
type MediaFilter =
  'all' | 'movie' | 'tv' | 'music' | 'book' | 'comic' | 'magazine';
type LinkedDetailValue = {
  name: string;
  href?: string;
};
type LinkedDetail = {
  label: string;
  values: LinkedDetailValue[];
};
type GenreLink = {
  name: string;
  href: string;
};

const isMusic = (title: BlocklistTitle): title is MusicDetails =>
  (title as MusicDetails).mediaType === 'album';

const isBook = (title: BlocklistTitle): title is BookDetails =>
  (title as BookDetails).mediaType === 'book';

const isComic = (title: BlocklistTitle): title is ComicDetails =>
  (title as ComicDetails).mediaType === 'comic';

const isMagazine = (title: BlocklistTitle): title is MagazineDetails =>
  (title as MagazineDetails).mediaType === 'magazine';

const isMovie = (title: BlocklistTitle): title is MovieDetails =>
  !isMusic(title) &&
  !isBook(title) &&
  !isComic(title) &&
  !isMagazine(title) &&
  'releaseDate' in title;

const getTitle = (title: BlocklistTitle): string =>
  isMovie(title) ||
  isMusic(title) ||
  isBook(title) ||
  isComic(title) ||
  isMagazine(title)
    ? title.title
    : title.name;

const getYear = (title: BlocklistTitle): string | undefined => {
  const value = isMovie(title)
    ? title.releaseDate
    : isMusic(title)
      ? title.releaseDate
      : isBook(title)
        ? title.firstPublishYear?.toString()
        : isComic(title)
          ? title.startYear
          : isMagazine(title)
            ? title.latestIssue
            : title.firstAirDate;
  return value?.slice(0, 4);
};

const getRuntime = (
  title: BlocklistTitle,
  unavailable: string,
  intl: ReturnType<typeof useIntl>
): string => {
  if (isBook(title)) {
    return title.numberOfPages != null
      ? intl.formatNumber(title.numberOfPages)
      : unavailable;
  }
  if (isComic(title) || isMagazine(title)) {
    return title.issueCount != null
      ? intl.formatNumber(title.issueCount)
      : unavailable;
  }
  const minutes = isMovie(title)
    ? title.runtime
    : isMusic(title)
      ? Math.round(
          title.tracks.reduce((total, track) => total + track.length, 0) / 60000
        )
      : title.episodeRunTime[0];
  return minutes ? formatDurationMinutes(minutes, intl.locale) : unavailable;
};

const getGenres = (title: BlocklistTitle): GenreLink[] => {
  if (isBook(title)) {
    return (
      title.subjects?.slice(0, 3).map((subject) => ({
        name: subject,
        href: `/discover/books?subject=${encodeURIComponent(subject)}`,
      })) ?? []
    );
  }
  if (isMusic(title)) {
    return (
      title.tags?.releaseGroup
        ?.toSorted((left, right) => right.count - left.count)
        .slice(0, 3)
        .map((tag) => ({
          name: tag.tag,
          href: `/discover/music?genre=${encodeURIComponent(tag.tag)}`,
        })) ?? []
    );
  }
  if (isComic(title) || isMagazine(title)) {
    return [];
  }
  return title.genres.slice(0, 3).map((genre) => ({
    name: genre.name,
    href: isMovie(title)
      ? `/discover/movies/genre/${genre.id}`
      : `/discover/tv/genre/${genre.id}`,
  }));
};

const getSecondaryDetails = (
  title: BlocklistTitle,
  intl: ReturnType<typeof useIntl>
): LinkedDetail[] => {
  const unavailable = intl.formatMessage(messages.unavailable);
  if (isMovie(title)) {
    const director = title.credits.crew.find(
      (credit) => credit.job === 'Director'
    );
    const studio = title.productionCompanies[0];
    return [
      {
        label: intl.formatMessage(messages.director),
        values: [
          {
            name: director?.name ?? unavailable,
            href: director?.id ? `/person/${director.id}` : undefined,
          },
        ],
      },
      {
        label: intl.formatMessage(messages.studio),
        values: [
          {
            name: studio?.name ?? unavailable,
            href: studio?.id
              ? `/discover/movies/studio/${studio.id}`
              : undefined,
          },
        ],
      },
    ];
  }
  if (isComic(title)) {
    return [
      {
        label: intl.formatMessage(messages.publisher),
        values: [{ name: title.publisher ?? unavailable }],
      },
      {
        label: intl.formatMessage(messages.issueCount),
        values: [
          {
            name:
              title.issueCount != null
                ? intl.formatNumber(title.issueCount)
                : unavailable,
          },
        ],
      },
    ];
  }
  if (isMagazine(title)) {
    return [
      {
        label: intl.formatMessage(messages.latestIssue),
        values: [{ name: title.latestIssue ?? unavailable }],
      },
      {
        label: intl.formatMessage(messages.issueCount),
        values: [
          {
            name:
              title.issueCount != null
                ? intl.formatNumber(title.issueCount)
                : unavailable,
          },
        ],
      },
    ];
  }
  if (isMusic(title)) {
    return [
      {
        label: intl.formatMessage(messages.artist),
        values: [
          {
            name: title.artist.name,
            href: title.artist.id
              ? `/artist/${encodeApiPathSegment(title.artist.id)}`
              : undefined,
          },
        ],
      },
      {
        label: intl.formatMessage(messages.albumType),
        values: [{ name: title.type }],
      },
      {
        label: intl.formatMessage(messages.trackCount),
        values: [{ name: intl.formatNumber(title.tracks.length) }],
      },
    ];
  }
  if (isBook(title)) {
    return [
      {
        label: intl.formatMessage(messages.author),
        values: [
          {
            name: title.author ?? unavailable,
            href: title.authorId
              ? `/author/${encodeApiPathSegment(title.authorId)}`
              : undefined,
          },
        ],
      },
      {
        label: intl.formatMessage(messages.publisher),
        values: [{ name: title.publisher ?? unavailable }],
      },
    ];
  }
  return [
    {
      label: intl.formatMessage(messages.creator),
      values:
        title.createdBy.length > 0
          ? title.createdBy.map((creator) => ({
              name: creator.name,
              href: `/person/${creator.id}`,
            }))
          : [{ name: unavailable }],
    },
    {
      label: intl.formatMessage(messages.network),
      values:
        title.networks.length > 0
          ? title.networks.map((network) => ({
              name: network.name,
              href: `/discover/tv/network/${network.id}`,
            }))
          : [{ name: unavailable }],
    },
  ];
};

const Blocklist = () => {
  const [currentPageSize, setCurrentPageSize] = useState(10);
  const [searchFilter, debouncedSearchFilter, setSearchFilter] =
    useDebouncedState('');
  const [currentFilter, setCurrentFilter] = useState<Filter>(Filter.ALL);
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('all');
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const mediaPin = useMediaFilterPin<MediaFilter>({
    scope: 'blocklist',
    selected: mediaFilter,
    values: ['all', 'movie', 'tv', 'music', 'book'],
    restore: setMediaFilter,
  });
  const [sort, setSort] = useState<'date' | 'title' | 'mediaType'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const router = useRouter();
  const intl = useIntl();
  const page = getPositiveQueryParamNumber(router.query.page, 1) ?? 1;
  const pageIndex = page - 1;
  const updateQueryParams = useUpdateQueryParams({ page: page.toString() });
  const {
    data,
    error,
    isValidating,
    mutate: revalidate,
  } = useSWR<BlocklistResultsResponse>(
    `/api/v1/blocklist/?take=${currentPageSize}&skip=${pageIndex * currentPageSize}&filter=${currentFilter}${
      debouncedSearchFilter
        ? `&search=${encodeURIComponent(debouncedSearchFilter)}`
        : ''
    }&timeFrame=${timeFrame}&mediaType=${mediaFilter}&sort=${sort}&sortDirection=${sortDirection}`,
    { refreshInterval: 0, revalidateOnFocus: false }
  );
  useSearchActivityReporter(
    Boolean(searchFilter.trim()) &&
      (searchFilter.trim() !== debouncedSearchFilter.trim() || isValidating),
    'blocklist-keyword'
  );

  if (!data && error) {
    return (
      <>
        <PageTitle title={intl.formatMessage(globalMessages.blocklist)} />
        <div className="page-title-row">
          <h2 className="page-title">
            {intl.formatMessage(globalMessages.blocklist)}
          </h2>
        </div>
        <ErrorPage statusCode={500} />
      </>
    );
  }

  const resetPage = () => {
    if (router.query.page) {
      void router.replace({ pathname: router.pathname });
    }
  };
  const changePage = (nextPage: number) => {
    updateQueryParams('page', String(nextPage));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const filterOptions = [
    { value: Filter.ALL, label: messages.all, count: data?.counts.all ?? 0 },
    {
      value: Filter.MANUAL,
      label: messages.manual,
      count: data?.counts.manual ?? 0,
    },
    {
      value: Filter.BLOCKLISTEDTAGS,
      label: messages.blocklistedTags,
      count: data?.counts.blocklistedTags ?? 0,
    },
  ];
  const timeFrameOptions: CompactSelectOption[] = [
    { label: intl.formatMessage(messages.allTime), value: 'all' },
    { label: intl.formatMessage(messages.sevenDays), value: '7d' },
    { label: intl.formatMessage(messages.fourteenDays), value: '14d' },
    { label: intl.formatMessage(messages.thirtyDays), value: '30d' },
    { label: intl.formatMessage(messages.sixMonths), value: '6m' },
  ];
  const updateSort = (nextSort: typeof sort) => {
    setSortDirection(
      sort === nextSort
        ? sortDirection === 'asc'
          ? 'desc'
          : 'asc'
        : nextSort === 'title' || nextSort === 'mediaType'
          ? 'asc'
          : 'desc'
    );
    setSort(nextSort);
    resetPage();
  };
  const clearFilters = () => {
    setCurrentFilter(Filter.ALL);
    setTimeFrame('all');
    setMediaFilter('all');
    setSearchFilter('');
    setSort('date');
    setSortDirection('desc');
    resetPage();
  };

  const pinMediaType =
    mediaFilter === 'tv'
      ? 'tv'
      : mediaFilter === 'music'
        ? 'music'
        : mediaFilter === 'book'
          ? 'book'
          : 'movie';
  return (
    <>
      <PageTitle title={intl.formatMessage(globalMessages.blocklist)} />
      <div className="page-title-row">
        <h2 className="page-title">
          {intl.formatMessage(globalMessages.blocklist)}
        </h2>
        <PageStatus />
      </div>

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
                    currentFilter === Filter.ALL &&
                    timeFrame === 'all' &&
                    mediaFilter === 'all' &&
                    !searchFilter &&
                    sort === 'date' &&
                    sortDirection === 'desc'
                  }
                  onClick={clearFilters}
                />
                {filterOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={currentFilter === option.value}
                    onClick={() => {
                      setCurrentFilter(option.value);
                      resetPage();
                    }}
                    className={getFilterToggleButtonClass(
                      currentFilter === option.value
                    )}
                  >
                    {intl.formatMessage(option.label)}
                    <span className="app-filter-count">{option.count}</span>
                  </button>
                ))}
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
                      searchFilter.trim()
                        ? 'discover-filter-control-label-active'
                        : ''
                    }`}
                  >
                    <MagnifyingGlassIcon aria-hidden="true" />
                    {intl.formatMessage(messages.search)}
                  </span>
                  <input
                    type="search"
                    value={searchFilter}
                    onChange={(event) => {
                      setSearchFilter(event.target.value);
                      resetPage();
                    }}
                    placeholder={intl.formatMessage(messages.searchPlaceholder)}
                    aria-label={intl.formatMessage(messages.searchPlaceholder)}
                    className="app-filter-search-input"
                  />
                </label>
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
                    ['date', messages.sortDate],
                    ['title', messages.sortTitle],
                    ['mediaType', messages.sortMediaType],
                  ] as const
                ).map(([value, label]) => {
                  const active = sort === value;
                  const DirectionIcon =
                    active && sortDirection === 'asc'
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
                      <DirectionIcon />
                    </button>
                  );
                })}
              </div>
            ),
          },
        ]}
      />

      {!data ? (
        <LoadingSpinner />
      ) : data.results.length === 0 ? (
        <div className="app-card-main refreshed-card-surface flex min-h-16 w-full items-center justify-center rounded-xl border border-gray-700 px-4 py-4 text-sm">
          {intl.formatMessage(messages.noResults)}
        </div>
      ) : (
        <div className="card-stack">
          {data.results.map((item) => (
            <BlocklistedItem
              key={`${item.mediaType}-${item.externalId ?? item.tmdbId}`}
              item={item}
              revalidateList={() => void revalidate()}
            />
          ))}
        </div>
      )}

      <PaginationFooter
        page={page}
        pageSize={currentPageSize}
        totalPages={data?.pageInfo.pages ?? 1}
        onPageChange={changePage}
        onPageSizeChange={(size) => {
          setCurrentPageSize(size);
          resetPage();
        }}
      />
    </>
  );
};

interface BlocklistedItemProps {
  item: BlocklistItem;
  revalidateList: () => void;
}

const BlocklistedItem = ({ item, revalidateList }: BlocklistedItemProps) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const { addToast } = useToasts();
  const { ref, inView } = useInView({ triggerOnce: true });
  const intl = useIntl();
  const { hasPermission } = useUser();
  const externalTitleId =
    item.externalId &&
    ['music', 'book', 'comic', 'magazine'].includes(item.mediaType)
      ? normalizeExternalTitleId(item.mediaType, item.externalId)
      : item.externalId;
  const url =
    item.mediaType === 'movie'
      ? `/api/v1/movie/${item.tmdbId}`
      : item.mediaType === 'tv'
        ? `/api/v1/tv/${item.tmdbId}`
        : item.mediaType === 'music' && externalTitleId
          ? `/api/v1/music/${encodeApiPathSegment(externalTitleId)}`
          : item.mediaType === 'book' && externalTitleId
            ? `/api/v1/book/${encodeApiPathSegment(externalTitleId)}`
            : item.mediaType === 'comic' && externalTitleId
              ? `/api/v1/comic/${encodeApiPathSegment(externalTitleId)}`
              : item.mediaType === 'magazine' && externalTitleId
                ? `/api/v1/magazine/${encodeApiPathSegment(externalTitleId)}`
                : null;
  const mediaHref =
    item.mediaType === 'movie'
      ? `/movie/${item.tmdbId}`
      : item.mediaType === 'tv'
        ? `/tv/${item.tmdbId}`
        : item.mediaType === 'music' && externalTitleId
          ? `/music/${encodeApiPathSegment(externalTitleId)}`
          : item.mediaType === 'book' && externalTitleId
            ? `/book/${encodeApiPathSegment(externalTitleId)}`
            : item.mediaType === 'comic' && externalTitleId
              ? `/comic/${encodeApiPathSegment(externalTitleId)}`
              : item.mediaType === 'magazine' && externalTitleId
                ? `/magazine/${encodeApiPathSegment(externalTitleId)}`
                : '/';
  const { data: title, error } = useSWR<BlocklistTitle>(inView ? url : null);

  if (!title && !error) {
    return (
      <div
        ref={ref}
        className="h-36 w-full animate-pulse rounded-xl bg-gray-800/50"
      />
    );
  }

  const displayTitle = title
    ? getTitle(title)
    : (item.title ?? 'Unknown title');
  const year = title ? getYear(title) : undefined;
  const unavailable = intl.formatMessage(messages.unavailable);
  const posterPath = title?.posterPath;
  const posterSrc =
    title && (isBook(title) || isMusic(title) || isComic(title))
      ? posterPath
      : posterPath
        ? getTmdbPosterImageUrl(posterPath)
        : undefined;
  const posterType =
    title && isBook(title)
      ? 'book'
      : title && isMusic(title)
        ? 'music'
        : 'tmdb';
  const backdropSrc = title
    ? isMusic(title)
      ? (title.artistBackdrop ?? title.artistThumb ?? title.posterPath)
      : isBook(title)
        ? title.posterPath
        : isComic(title) || isMagazine(title)
          ? title.posterPath
          : title.backdropPath
            ? `https://image.tmdb.org/t/p/w1920_and_h800_multi_faces/${title.backdropPath}`
            : posterSrc
    : undefined;
  const backdropType =
    title && isBook(title)
      ? 'book'
      : title && isMusic(title)
        ? 'music'
        : 'tmdb';
  const secondaryDetails = title ? getSecondaryDetails(title, intl) : [];
  const genres = title ? getGenres(title) : [];
  const releaseDate = title
    ? isMovie(title)
      ? title.releaseDate
      : isMusic(title)
        ? title.releaseDate
        : isBook(title)
          ? title.firstPublishYear?.toString()
          : isComic(title)
            ? title.startYear
            : isMagazine(title)
              ? title.latestIssue
              : title.firstAirDate
    : undefined;

  const removeFromBlocklist = async () => {
    setIsUpdating(true);
    try {
      await axios.delete(
        `/api/v1/blocklist/${
          item.mediaType === 'music' ||
          item.mediaType === 'book' ||
          item.mediaType === 'comic' ||
          item.mediaType === 'magazine'
            ? encodeApiPathSegment(externalTitleId ?? '')
            : item.tmdbId
        }?mediaType=${item.mediaType}`
      );
      addToast(
        <span>
          {intl.formatMessage(globalMessages.removeFromBlocklistSuccess, {
            title: displayTitle,
            strong: (message: React.ReactNode) => <strong>{message}</strong>,
          })}
        </span>,
        { appearance: 'success', autoDismiss: true }
      );
      revalidateList();
    } catch {
      addToast(intl.formatMessage(messages.removeFailed), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <article
      ref={ref}
      data-interface-role="blocklist-card"
      className="app-card-main refreshed-card-surface relative overflow-hidden rounded-xl border border-gray-700 p-3 shadow-lg shadow-gray-950/20"
    >
      {backdropSrc && (
        <div className="absolute inset-0 z-0">
          <CachedImage
            type={backdropType}
            src={backdropSrc}
            alt=""
            fill
            sizes="100vw"
            className="object-cover object-center"
          />
          <div className="refreshed-artwork-scrim" />
          <div className="refreshed-artwork-gradient" />
        </div>
      )}
      <div className="relative z-10 grid min-w-0 grid-cols-[64px_minmax(0,1fr)] gap-3 sm:grid-cols-[80px_minmax(0,1fr)]">
        <Link
          href={mediaHref}
          className="detail-card-poster relative block overflow-hidden rounded-lg ring-1 ring-gray-600 transition hover:ring-indigo-400"
        >
          <CachedImage
            type={posterType}
            src={posterSrc ?? '/images/seerr_poster_not_found.png'}
            alt=""
            fill
            sizes="(min-width: 640px) 80px, 64px"
            className="object-cover"
          />
          <span className="pointer-events-none absolute top-1 left-1/2 z-10 w-[calc(100%-0.375rem)] -translate-x-1/2">
            <MediaTypeBadge
              mediaType={getMediaTypeBadgeType(item.mediaType) ?? 'movie'}
              variant="compact"
              className="h-[18px] w-full justify-center gap-0.5 px-1 py-0 text-[9px] shadow-sm [&_svg]:h-2.5 [&_svg]:w-2.5"
            />
          </span>
        </Link>

        <div className="flex min-w-0 flex-col">
          <Link
            href={mediaHref}
            className="detail-summary-title block truncate text-lg leading-5 font-semibold text-white hover:underline"
          >
            {displayTitle}
            {year ? ` (${year})` : ''}
          </Link>
          <div className="detail-card-heading-spacing detail-three-column-grid grid min-h-0 min-w-0 flex-1">
            <div className="detail-paired-column-span min-w-0">
              <dl className="media-detail-rows refreshed-detail-text detail-paired-columns grid min-w-0 content-start text-xs">
                <dt className="card:col-start-1 card:row-start-1 font-medium text-gray-100">
                  {intl.formatMessage(messages.mediaAndFormat)}:
                </dt>
                <dd className="card:col-start-3 card:row-start-1 m-0 truncate">
                  {item.mediaType === 'tv'
                    ? 'Series'
                    : item.mediaType === 'music'
                      ? 'Music · Album'
                      : item.mediaType === 'book'
                        ? 'Book'
                        : item.mediaType === 'comic'
                          ? 'Comic'
                          : item.mediaType === 'magazine'
                            ? 'Magazine'
                            : item.mediaType === 'movie'
                              ? 'Movie'
                              : item.mediaType}
                </dd>
                <dt className="card:col-start-1 card:row-start-2 font-medium text-gray-100">
                  {intl.formatMessage(
                    title && isBook(title)
                      ? messages.firstPublished
                      : title && isMagazine(title)
                        ? messages.latestIssue
                        : messages.releaseDate
                  )}
                  :
                </dt>
                <dd className="card:col-start-3 card:row-start-2 m-0 truncate">
                  {releaseDate || unavailable}
                </dd>
                <dt className="card:col-start-1 card:row-start-3 font-medium text-gray-100">
                  {intl.formatMessage(
                    title && (isComic(title) || isMagazine(title))
                      ? messages.issueCount
                      : title && isBook(title)
                        ? messages.pages
                        : messages.runtime
                  )}
                  :
                </dt>
                <dd className="card:col-start-3 card:row-start-3 m-0 truncate">
                  {title ? getRuntime(title, unavailable, intl) : unavailable}
                </dd>
                <div className="media-detail-rows media-detail-column-divider card:col-span-1 card:col-start-5 card:row-span-3 card:row-start-1 col-span-2 grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] content-start gap-x-3">
                  {secondaryDetails.map((detail) => (
                    <div className="contents" key={detail.label}>
                      <dt className="font-medium text-gray-100">
                        {detail.label}:
                      </dt>
                      <dd className="m-0 truncate">
                        {detail.values.map((value, index) => (
                          <span key={`${detail.label}-${value.name}-${index}`}>
                            {index > 0 && ', '}
                            {value.href ? (
                              <Link
                                href={value.href}
                                className="text-indigo-300 hover:text-indigo-200 hover:underline focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                              >
                                {value.name}
                              </Link>
                            ) : (
                              value.name
                            )}
                          </span>
                        ))}
                      </dd>
                    </div>
                  ))}
                </div>
                <dt className="card:col-start-1 card:row-start-4 font-medium text-gray-100">
                  {intl.formatMessage(messages.genres)}:
                </dt>
                <dd className="card:col-span-3 card:col-start-3 card:row-start-4 m-0 line-clamp-2 min-w-0 break-words">
                  {genres.length > 0
                    ? genres.map((genre, index) => (
                        <span key={`${genre.href}-${genre.name}`}>
                          {index > 0 && ', '}
                          <Link
                            href={genre.href}
                            className="text-indigo-300 hover:text-indigo-200 hover:underline focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                          >
                            {genre.name}
                          </Link>
                        </span>
                      ))
                    : unavailable}
                </dd>
              </dl>
            </div>

            <dl className="media-detail-rows refreshed-detail-text media-detail-column-divider grid h-full min-w-0 grid-cols-[max-content_minmax(0,1fr)] content-start gap-x-3 text-xs">
              <dt className="font-medium text-gray-100">
                {intl.formatMessage(messages.blocklistedBy)}:
              </dt>
              <dd className="m-0 truncate">
                {item.user?.displayName ?? unavailable}
              </dd>
              <dt className="font-medium text-gray-100">
                {intl.formatMessage(messages.blocklistedOn)}:
              </dt>
              <dd className="m-0 truncate">
                {item.createdAt ? (
                  <FormattedDate
                    value={new Date(item.createdAt)}
                    dateStyle="medium"
                  />
                ) : (
                  unavailable
                )}
              </dd>
              <dt aria-hidden="true" />
              <dd className="m-0 truncate">
                {item.createdAt ? (
                  <FormattedDate
                    value={new Date(item.createdAt)}
                    timeStyle="short"
                  />
                ) : (
                  unavailable
                )}
              </dd>
              <dt className="font-medium text-gray-100">
                {intl.formatMessage(messages.source)}:
              </dt>
              <dd className="m-0 truncate">
                {item.blocklistedTags ? (
                  <BlocklistedTagsBadge data={item} compact />
                ) : (
                  <Tooltip
                    content={intl.formatMessage(messages.manualSourceTooltip)}
                  >
                    <span className="inline-flex max-w-full" tabIndex={0}>
                      <Badge
                        badgeType="dark"
                        className={compactBlocklistSourceBadgeClass}
                      >
                        <TagIcon
                          className="h-2.5 w-2.5 shrink-0"
                          aria-hidden="true"
                        />
                        <span className="truncate">
                          {intl.formatMessage(messages.manualSource)}
                        </span>
                      </Badge>
                    </span>
                  </Tooltip>
                )}
              </dd>
              {hasPermission(Permission.MANAGE_BLOCKLIST) && (
                <dd className="col-span-2 m-0 flex min-w-0 justify-end">
                  <Tooltip content={intl.formatMessage(messages.removeTooltip)}>
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => void removeFromBlocklist()}
                      className="compact-control inline-flex items-center rounded-md border border-red-600/80 bg-red-800/25 px-2 text-[11px] leading-none font-semibold whitespace-nowrap text-red-200 transition hover:border-red-500 hover:text-white focus:ring-2 focus:ring-red-500 focus:outline-none disabled:opacity-40"
                    >
                      <ArchiveBoxXMarkIcon
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                      {intl.formatMessage(globalMessages.removefromBlocklist)}
                    </button>
                  </Tooltip>
                </dd>
              )}
            </dl>
          </div>
        </div>
      </div>
    </article>
  );
};

export default Blocklist;
