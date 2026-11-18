import { useEffect, useReducer } from 'react';
import {
  isLiveDownloadToken,
  liveDownloadStore,
  toInfoHash,
} from './liveDownloadStore';

export function downloadSubscriptionId(
  item: { liveDownloadToken?: string; downloadId?: string },
  allowRawHashes: boolean
) {
  if (isLiveDownloadToken(item.liveDownloadToken))
    return item.liveDownloadToken;
  return allowRawHashes ? toInfoHash(item.downloadId) : undefined;
}

// The server accepts up to 100 identifiers for a single live subscription.
const subscriptionLimit = 100;

export function useLiveDownloadProgress(tokens: (string | undefined)[]) {
  const key = [...new Set(tokens.filter((token): token is string => !!token))]
    .slice(0, subscriptionLimit)
    .sort()
    .join(',');
  const [, changed] = useReducer((version: number) => version + 1, 0);
  useEffect(() => {
    if (!key) return;
    const unsubscribe = key
      .split(',')
      .map((id) => liveDownloadStore.subscribe(id, changed));
    return () => unsubscribe.forEach((stop) => stop());
  }, [key]);

  return new Map(
    key
      ? key.split(',').flatMap((id) => {
          const update = liveDownloadStore.get(id);
          return update ? [[id, update] as const] : [];
        })
      : []
  );
}
