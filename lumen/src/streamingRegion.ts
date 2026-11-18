import type { WatchProviderRegion } from './api';
import { useApi } from './hooks';

function countryCode(value?: string | null) {
  const code = value?.toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) ? code : undefined;
}

export function useStreamingRegion(
  userId: number | undefined,
  serverRegion: string | undefined,
  enabled: boolean,
  urlRegion?: string | null
) {
  const explicitRegion = countryCode(urlRegion);
  const path =
    enabled && userId && !explicitRegion
      ? `/user/${userId}/settings/main`
      : null;
  const { data, error } = useApi<{ streamingRegion?: string | null }>(path, {
    currentPathOnly: true,
  });
  return {
    pending: !!path && !data && !error,
    region:
      explicitRegion ??
      countryCode(path ? data?.streamingRegion : undefined) ??
      countryCode(serverRegion) ??
      'US',
  };
}

export function useStreamingProviderNames(
  providers: WatchProviderRegion[] | undefined,
  userId?: number,
  serverRegion?: string
) {
  const { region, pending } = useStreamingRegion(
    userId,
    serverRegion,
    !!providers?.length
  );
  if (pending) return '';
  return providers
    ?.find((entry) => entry.iso_3166_1 === region)
    ?.flatrate?.map(({ name }) => name)
    .join(', ');
}
