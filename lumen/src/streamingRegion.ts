import type { WatchProviderRegion } from './api';
import { useApi } from './hooks';

function countryCode(value?: string | null) {
  const code = value?.toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) ? code : undefined;
}

function useRegionPreferences(userId: number | undefined, enabled: boolean) {
  const path = enabled && userId ? `/user/${userId}/settings/main` : null;
  const { data, error } = useApi<{
    streamingRegion?: string | null;
    discoverRegion?: string | null;
  }>(path, { currentPathOnly: true });
  return { data: path ? data : null, pending: !!path && !data && !error };
}

export function useStreamingRegion(
  userId: number | undefined,
  serverRegion: string | undefined,
  enabled: boolean,
  urlRegion?: string | null
) {
  const explicitRegion = countryCode(urlRegion);
  const { data, pending } = useRegionPreferences(
    userId,
    enabled && !explicitRegion
  );
  return {
    pending,
    region:
      explicitRegion ??
      countryCode(data?.streamingRegion) ??
      countryCode(serverRegion) ??
      'US',
  };
}

export function useTitleRegions(
  providers: WatchProviderRegion[] | undefined,
  hasRatings: boolean,
  userId?: number,
  server?: { streamingRegion?: string; discoverRegion?: string } | null
) {
  const { data, pending } = useRegionPreferences(
    userId,
    !!providers?.length || hasRatings
  );
  const streamingRegion =
    countryCode(data?.streamingRegion) ??
    countryCode(server?.streamingRegion) ??
    'US';
  const discover = data?.discoverRegion || server?.discoverRegion;
  return {
    ratingRegion:
      pending || discover?.toLowerCase() === 'all'
        ? undefined
        : (countryCode(discover) ?? 'US'),
    streamingProviders: pending
      ? undefined
      : providers
          ?.find((entry) => entry.iso_3166_1 === streamingRegion)
          ?.flatrate?.map(({ name }) => name)
          .join(', '),
  };
}
