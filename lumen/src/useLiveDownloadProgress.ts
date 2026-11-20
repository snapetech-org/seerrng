import { useEffect, useReducer } from 'react';
import { MediaStatus, type DownloadItem, type MediaInfo } from './api';
import {
  isLiveDownloadToken,
  liveDownloadStore,
  toInfoHash,
  type LiveDownload,
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

export function applyLiveDownloadProgress(
  download: DownloadItem,
  live: ReadonlyMap<string, LiveDownload> | undefined,
  allowRawHashes: boolean
): DownloadItem {
  const id = live?.size
    ? downloadSubscriptionId(download, allowRawHashes)
    : undefined;
  const update = id ? live?.get(id) : undefined;
  return update &&
    Number.isFinite(update.size) &&
    update.size > 0 &&
    Number.isFinite(update.sizeLeft) &&
    update.sizeLeft >= 0 &&
    update.sizeLeft <= update.size
    ? { ...download, size: update.size, sizeLeft: update.sizeLeft }
    : download;
}

export function useLiveMediaProgress(
  media: MediaInfo | undefined,
  allowRawHashes: boolean
): MediaInfo | undefined {
  const standard =
    media?.status === MediaStatus.PROCESSING ? media.downloadStatus : undefined;
  const fourK =
    media?.status4k === MediaStatus.PROCESSING
      ? media.downloadStatus4k
      : undefined;
  const live = useLiveDownloadProgress(
    [...(standard ?? []), ...(fourK ?? [])].map((download) =>
      downloadSubscriptionId(download, allowRawHashes)
    )
  );
  if (!media || !live.size) return media;
  return {
    ...media,
    downloadStatus:
      standard?.map((item) =>
        applyLiveDownloadProgress(item, live, allowRawHashes)
      ) ?? media.downloadStatus,
    downloadStatus4k:
      fourK?.map((item) =>
        applyLiveDownloadProgress(item, live, allowRawHashes)
      ) ?? media.downloadStatus4k,
  };
}
