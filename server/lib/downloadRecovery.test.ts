import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deduplicateRecoveryQueue,
  isSeedlessStall,
  processRecoveryQueueByMedia,
} from './downloadRecovery';

describe('deduplicateRecoveryQueue', () => {
  it('keeps one recovery item per download ID', () => {
    const first = { id: 1, downloadId: 'download-1', status: 'queued' };
    const duplicate = {
      id: 2,
      downloadId: 'download-1',
      status: 'warning',
    };
    const second = { id: 3, downloadId: 'download-2', status: 'queued' };

    assert.deepEqual(deduplicateRecoveryQueue([first, duplicate, second]), [
      first,
      second,
    ]);
  });

  it('does not deduplicate items without a download ID', () => {
    const first = { id: 1, status: 'queued', downloadId: undefined };
    const second = { id: 2, status: 'queued', downloadId: undefined };

    assert.deepEqual(deduplicateRecoveryQueue([first, second]), [
      first,
      second,
    ]);
  });
});

describe('processRecoveryQueueByMedia', () => {
  it('serializes items for each media item and bounds concurrent media', async () => {
    const items = [
      { id: 1, mediaId: 10 },
      { id: 2, mediaId: 10 },
      { id: 3, mediaId: 20 },
      { id: 4, mediaId: 30 },
      { id: 5, mediaId: 40 },
    ];
    const activeByMedia = new Map<number, number>();
    const maxActiveByMedia = new Map<number, number>();
    let activeMediaCount = 0;
    let maxActiveMediaCount = 0;
    const processed: number[] = [];

    await processRecoveryQueueByMedia(
      items,
      (item) => item.mediaId,
      async (item) => {
        const active = (activeByMedia.get(item.mediaId) ?? 0) + 1;
        activeByMedia.set(item.mediaId, active);
        maxActiveByMedia.set(
          item.mediaId,
          Math.max(maxActiveByMedia.get(item.mediaId) ?? 0, active)
        );
        activeMediaCount += 1;
        maxActiveMediaCount = Math.max(maxActiveMediaCount, activeMediaCount);

        await new Promise<void>((resolve) => setImmediate(resolve));

        processed.push(item.id);
        activeByMedia.set(item.mediaId, activeByMedia.get(item.mediaId)! - 1);
        activeMediaCount -= 1;
      },
      2
    );

    assert.deepEqual(
      processed.filter((id) => id < 3),
      [1, 2]
    );
    assert.equal(maxActiveByMedia.get(10), 1);
    assert.ok(maxActiveMediaCount <= 2);
  });

  it('skips queue items without a valid external media ID', async () => {
    const items = [
      { id: 1, mediaId: undefined },
      { id: 2, mediaId: 0 },
      { id: 3, mediaId: Number.MAX_SAFE_INTEGER + 1 },
    ];
    const processed: number[] = [];

    await processRecoveryQueueByMedia(
      items,
      (item) => item.mediaId,
      async (item) => {
        processed.push(item.id);
      }
    );

    assert.deepEqual(processed, []);
  });
});

describe('isSeedlessStall', () => {
  const base = {
    id: 1,
    size: 10,
    title: 'Movie 2160p',
    sizeleft: 10,
    timeleft: '',
    estimatedCompletionTime: '',
    status: 'downloading',
    trackedDownloadStatus: 'ok',
    trackedDownloadState: 'downloading',
    downloadId: 'download-1',
    protocol: 'torrent',
    downloadClient: 'qBittorrent',
    indexer: 'Indexer',
  };

  it('flags a torrent the client reports as stalled with no connections', () => {
    assert.equal(
      isSeedlessStall({
        ...base,
        status: 'warning',
        trackedDownloadStatus: 'warning',
        errorMessage: 'The download is stalled with no connections',
      }),
      true
    );
  });

  it('flags a stalled status message', () => {
    assert.equal(
      isSeedlessStall({
        ...base,
        statusMessages: [{ title: 'Stalled', messages: ['No seeds'] }],
      }),
      true
    );
  });

  it('leaves a slow download that still has seeds alone', () => {
    assert.equal(isSeedlessStall(base), false);
  });
});
