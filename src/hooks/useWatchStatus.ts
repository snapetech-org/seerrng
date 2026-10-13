import type { WatchStatusResponse } from '@server/models/WatchStatus';
import axios from 'axios';
import useSWR from 'swr';

const useWatchStatus = (
  mediaType: 'movie' | 'tv',
  tmdbId?: number,
  enabled = true,
  details = false,
  cacheIdentity?: string
) => {
  const requestUrl =
    enabled && tmdbId
      ? `/api/v1/playback/watched/${mediaType}/${tmdbId}${details ? '?details=1' : ''}`
      : null;

  return useSWR<WatchStatusResponse>(
    requestUrl ? [requestUrl, cacheIdentity] : null,
    ([url]) => axios.get<WatchStatusResponse>(url).then((res) => res.data),
    {
      shouldRetryOnError: false,
      keepPreviousData: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateOnMount: cacheIdentity ? true : undefined,
      dedupingInterval: cacheIdentity ? 0 : 60_000,
    }
  );
};

export default useWatchStatus;
