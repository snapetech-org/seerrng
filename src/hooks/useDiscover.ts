import useToasts from '@app/hooks/useToasts';
import globalMessages from '@app/i18n/globalMessages';
import {
  matchesAvailableQuality,
  type AvailableQualityFilter,
} from '@app/utils/availabilityQuality';
import { readDiscoverScrollEntry } from '@app/utils/discoverScrollRestoration';
import {
  hasMoreSearchPages,
  MAX_SEARCH_PAGES,
} from '@app/utils/searchPagination';
import {
  setPersistentResponse,
  usePersistentResponse,
} from '@app/utils/swrCache';
import { MediaRequestStatus, MediaStatus } from '@server/constants/media';
import { buildDiscoverQueryString } from '@server/utils/discoverQuery';
import axios from 'axios';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { useSWRConfig } from 'swr';
import useSWRInfinite from 'swr/infinite';
import useSettings from './useSettings';
import { Permission, useUser } from './useUser';

export { encodeURIExtraParams } from '@server/utils/discoverQuery';

export interface BaseSearchResult<T> {
  page: number;
  totalResults: number;
  totalPages: number;
  results: T[];
}

type DiscoverPage<T, S> = BaseSearchResult<T> & S & { skipped?: boolean };
const DISCOVER_RECOVERY_KEY_PREFIX = 'discover-recovery:';
type DiscoverPageKey = readonly [
  url: string,
  page: number,
  totalPages: number | null,
  totalResults: number | null,
  previousSkipped: boolean,
];

const encodeDiscoverPageKey = (key: DiscoverPageKey): string =>
  `${DISCOVER_RECOVERY_KEY_PREFIX}${JSON.stringify(key)}`;

const fetchDiscoverPage = async <T, S>(
  key: string,
  defaultFetcher: ((key: string) => unknown) | undefined
): Promise<DiscoverPage<T, S>> => {
  if (!key.startsWith(DISCOVER_RECOVERY_KEY_PREFIX)) {
    if (!defaultFetcher) {
      throw new Error('No default SWR fetcher is configured for Discover.');
    }

    return (await defaultFetcher(key)) as DiscoverPage<T, S>;
  }

  const [url, page, totalPages, totalResults, previousSkipped] = JSON.parse(
    key.slice(DISCOVER_RECOVERY_KEY_PREFIX.length)
  ) as DiscoverPageKey;
  const loadPage = async () =>
    axios.get<DiscoverPage<T, S>>(url).then((response) => response.data);

  try {
    return await loadPage();
  } catch (error) {
    if (totalPages === null || totalResults === null || previousSkipped) {
      throw error;
    }

    try {
      return await loadPage();
    } catch {
      return {
        page,
        totalPages,
        totalResults,
        results: [],
        skipped: true,
      } as DiscoverPage<T, S>;
    }
  }
};

interface BaseMedia {
  id: number | string;
  mediaType: string;
  mediaInfo?: {
    status: MediaStatus;
    status4k?: MediaStatus;
    serviceId?: number | null;
    externalServiceId?: number | null;
    audiobookServiceId?: number | null;
    audiobookExternalServiceId?: number | null;
    audiobookLibraryServiceId?: number | null;
    audiobookLibraryItemId?: string | null;
    requests?: {
      status: MediaRequestStatus;
      bookFormat?: 'ebook' | 'audiobook' | 'both' | null;
    }[];
  };
  availableQualities?: ('MP3' | 'FLAC')[];
}

interface DiscoverResult<T, S> {
  isLoadingInitialData: boolean;
  isLoadingMore: boolean;
  isValidating: boolean;
  isSearchingAvailableQuality: boolean;
  fetchMore: () => void;
  isEmpty: boolean;
  isReachingEnd: boolean;
  error: unknown;
  titles: T[];
  shuffleSeed: string;
  firstResultData?: BaseSearchResult<T> & S;
  mutate?: () => void;
}

const FILTERED_PAGE_SCAN_LIMIT = 10;
const FILTERED_PAGE_RESULT_TARGET = 20;

const getShuffleSeed = (): string => Math.random().toString(36).slice(2);

const hasLinkedBookFormat = (
  mediaInfo: NonNullable<BaseMedia['mediaInfo']>,
  format: 'ebook' | 'audiobook'
) => {
  if (format === 'audiobook') {
    return (
      (mediaInfo.audiobookServiceId !== null &&
        mediaInfo.audiobookServiceId !== undefined &&
        mediaInfo.audiobookExternalServiceId !== null &&
        mediaInfo.audiobookExternalServiceId !== undefined) ||
      (mediaInfo.audiobookLibraryServiceId !== null &&
        mediaInfo.audiobookLibraryServiceId !== undefined &&
        !!mediaInfo.audiobookLibraryItemId)
    );
  }

  return (
    mediaInfo.serviceId !== null &&
    mediaInfo.serviceId !== undefined &&
    mediaInfo.externalServiceId !== null &&
    mediaInfo.externalServiceId !== undefined
  );
};

const hasActiveBookRequest = (
  mediaInfo: NonNullable<BaseMedia['mediaInfo']>,
  format: 'ebook' | 'audiobook'
) => {
  return (mediaInfo.requests ?? []).some((request) => {
    if (
      request.status === MediaRequestStatus.DECLINED ||
      request.status === MediaRequestStatus.FAILED ||
      request.status === MediaRequestStatus.COMPLETED
    ) {
      return false;
    }

    const requestFormat = request.bookFormat ?? 'ebook';

    return requestFormat === 'both' || requestFormat === format;
  });
};

const isMissingBookFormat = (item: BaseMedia) => {
  if (
    item.mediaType !== 'book' ||
    !item.mediaInfo ||
    item.mediaInfo.status === MediaStatus.BLOCKLISTED
  ) {
    return false;
  }

  const hasEbook =
    hasLinkedBookFormat(item.mediaInfo, 'ebook') ||
    hasActiveBookRequest(item.mediaInfo, 'ebook');
  const hasAudiobook =
    hasLinkedBookFormat(item.mediaInfo, 'audiobook') ||
    hasActiveBookRequest(item.mediaInfo, 'audiobook');

  return !hasEbook || !hasAudiobook;
};

const getMediaResultKey = (item: BaseMedia): string =>
  `${item.mediaType}:${item.id}`;

const isDiscoverMediaResult = (item: unknown): item is BaseMedia => {
  if (!item || typeof item !== 'object') {
    return false;
  }

  const candidate = item as Partial<BaseMedia>;

  return (
    (typeof candidate.id === 'number' || typeof candidate.id === 'string') &&
    typeof candidate.mediaType === 'string'
  );
};

const useDiscover = <
  T extends BaseMedia,
  S = Record<string, never>,
  O = Record<string, unknown>,
>(
  endpoint: string,
  options?: O,
  {
    enabled = true,
    hideAvailable = true,
    hideBlocklisted = true,
    randomizeOrder = false,
    availableQuality,
    showErrorToast = true,
    shouldRetryOnError = true,
    hideErrorWithResults = true,
    recoverSinglePageFailure = false,
    revalidateOnMount,
    dedupingInterval = 30000,
  }: {
    enabled?: boolean;
    hideAvailable?: boolean;
    hideBlocklisted?: boolean;
    randomizeOrder?: boolean;
    availableQuality?: AvailableQualityFilter;
    showErrorToast?: boolean;
    shouldRetryOnError?: boolean;
    hideErrorWithResults?: boolean;
    recoverSinglePageFailure?: boolean;
    revalidateOnMount?: boolean;
    dedupingInterval?: number;
  } = {}
): DiscoverResult<T, S> => {
  const settings = useSettings();
  const { fetcher: defaultFetcher } = useSWRConfig();
  const { user, hasPermission } = useUser();
  const canManageBlocklist = hasPermission(Permission.MANAGE_BLOCKLIST);
  const { addToast } = useToasts();
  const intl = useIntl();
  const router = useRouter();
  const [shuffleSeed, setShuffleSeed] = useState(
    () =>
      readDiscoverScrollEntry(router.asPath)?.shuffleSeed ?? getShuffleSeed()
  );
  const fallbackCacheKey = useMemo(
    () =>
      `discover-view:${user?.id ?? 'anonymous'}:${endpoint}:${buildDiscoverQueryString(
        (options ?? {}) as Record<string, unknown>
      )}:${randomizeOrder ? 'random' : 'stable'}`,
    [endpoint, options, randomizeOrder, user?.id]
  );
  const persistentFallbackData =
    usePersistentResponse<(BaseSearchResult<T> & S)[]>(fallbackCacheKey);
  // A randomized view gets a new seed on fresh visits. Restoring results produced
  // with the previous seed would paint one lineup and then replace it as soon as
  // the current request completes.
  const fallbackData = randomizeOrder ? undefined : persistentFallbackData;
  const fetchPage = useCallback(
    (key: string) => fetchDiscoverPage<T, S>(key, defaultFetcher),
    [defaultFetcher]
  );
  const {
    data,
    error,
    size,
    setSize,
    isValidating,
    mutate: revalidate,
  } = useSWRInfinite<DiscoverPage<T, S>>(
    (pageIndex: number, previousPageData) => {
      if (!enabled || pageIndex >= MAX_SEARCH_PAGES) {
        return null;
      }

      if (previousPageData && pageIndex + 1 > previousPageData.totalPages) {
        return null;
      }

      const params: Record<string, unknown> = {
        page: pageIndex + 1,
        ...options,
      };

      if (randomizeOrder) {
        params.shuffleSeed = shuffleSeed;
      }

      const url = `${endpoint}?${buildDiscoverQueryString(params)}`;

      if (recoverSinglePageFailure) {
        return encodeDiscoverPageKey([
          url,
          pageIndex + 1,
          previousPageData?.totalPages ?? null,
          previousPageData?.totalResults ?? null,
          previousPageData?.skipped === true,
        ]);
      }

      return url;
    },
    fetchPage,
    {
      initialSize: 1,
      // Loading the next page should only append that page. Availability and
      // request state are refreshed explicitly when a cached view is restored.
      revalidateFirstPage: false,
      revalidateOnMount,
      dedupingInterval,
      revalidateOnFocus: false,
      fallbackData,
      shouldRetryOnError: recoverSinglePageFailure ? false : shouldRetryOnError,
    }
  );

  const isLoadingInitialData = enabled && !data && !error;

  useEffect(() => {
    if (fallbackData) {
      void revalidate();
    }
  }, [fallbackData, revalidate]);

  const isLoadingMore =
    isLoadingInitialData ||
    (size > 0 &&
      !!data &&
      typeof data[size - 1] === 'undefined' &&
      isValidating);

  const fetchMore = useCallback(() => {
    setSize((currentSize) => currentSize + 1);
  }, [setSize]);

  const mutate = useCallback(() => {
    if (randomizeOrder) {
      setSize(1);
      setShuffleSeed(getShuffleSeed());
      return;
    }

    void revalidate();
  }, [randomizeOrder, revalidate, setSize]);

  const titles = useMemo(() => {
    const resultKeys = new Set<string>();
    let filteredTitles: T[] = [];

    for (const page of data ?? []) {
      if (!page || !Array.isArray(page.results)) {
        continue;
      }

      for (const result of page.results) {
        if (!isDiscoverMediaResult(result)) {
          continue;
        }

        const resultKey = getMediaResultKey(result);

        if (!resultKeys.has(resultKey)) {
          resultKeys.add(resultKey);
          filteredTitles.push(result);
        }
      }
    }

    if (availableQuality) {
      filteredTitles = filteredTitles.filter((item) =>
        matchesAvailableQuality(item, availableQuality)
      );
    }

    if (settings.currentSettings.hideAvailable && hideAvailable) {
      filteredTitles = filteredTitles.filter(
        (i) =>
          !i.mediaInfo ||
          !(
            i.mediaInfo.status === MediaStatus.AVAILABLE ||
            i.mediaInfo.status === MediaStatus.PARTIALLY_AVAILABLE
          ) ||
          isMissingBookFormat(i)
      );
    }

    if (
      hideBlocklisted &&
      (!canManageBlocklist || settings.currentSettings.hideBlocklisted)
    ) {
      filteredTitles = filteredTitles.filter(
        (i) => !i.mediaInfo || i.mediaInfo.status !== MediaStatus.BLOCKLISTED
      );
    }

    return filteredTitles;
  }, [
    data,
    availableQuality,
    hideAvailable,
    hideBlocklisted,
    canManageBlocklist,
    settings.currentSettings.hideAvailable,
    settings.currentSettings.hideBlocklisted,
  ]);

  const lastResultPage = data?.[data.length - 1];
  const hasMoreUnfilteredResults = hasMoreSearchPages(
    lastResultPage?.totalPages,
    size
  );
  const needsMoreFilteredResults =
    titles.length === 0 ||
    Boolean(availableQuality && titles.length < FILTERED_PAGE_RESULT_TARGET);
  const shouldScanNextFilteredPage =
    !isLoadingInitialData &&
    !isLoadingMore &&
    !isValidating &&
    needsMoreFilteredResults &&
    hasMoreUnfilteredResults &&
    size < FILTERED_PAGE_SCAN_LIMIT;
  const isEmpty =
    !isLoadingInitialData &&
    titles.length === 0 &&
    !shouldScanNextFilteredPage &&
    !hasMoreUnfilteredResults;
  const isSearchingAvailableQuality = Boolean(
    availableQuality &&
    (isLoadingInitialData ||
      isLoadingMore ||
      isValidating ||
      shouldScanNextFilteredPage)
  );
  const isReachingEnd = !!data && !hasMoreUnfilteredResults;

  useEffect(() => {
    if (shouldScanNextFilteredPage) {
      setSize((currentSize) => currentSize + 1);
    }
  }, [setSize, shouldScanNextFilteredPage]);

  useEffect(() => {
    if (
      !randomizeOrder &&
      data?.length &&
      titles.length &&
      !data.some((page) => page?.skipped)
    ) {
      setPersistentResponse(fallbackCacheKey, data);
    }
  }, [data, fallbackCacheKey, randomizeOrder, titles.length]);

  useEffect(() => {
    if (showErrorToast && error && titles.length && !hideErrorWithResults) {
      addToast(intl.formatMessage(globalMessages.error), {
        appearance: 'error',
        autoDismiss: true,
      });
    }
  }, [
    data,
    error,
    addToast,
    hideErrorWithResults,
    intl,
    showErrorToast,
    titles.length,
  ]);

  const preserveCatalogError = Boolean(
    recoverSinglePageFailure && (size === 1 || data?.[data.length - 1]?.skipped)
  );

  return {
    isLoadingInitialData,
    isLoadingMore,
    isValidating,
    isSearchingAvailableQuality,
    fetchMore,
    isEmpty,
    isReachingEnd,
    error:
      error && titles.length && hideErrorWithResults && !preserveCatalogError
        ? null
        : error,
    titles,
    shuffleSeed,
    firstResultData: data?.[0],
    mutate,
  };
};

export default useDiscover;
