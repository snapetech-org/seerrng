import { getRepository } from '@server/datasource';
import DownloadRecoveryState from '@server/entity/DownloadRecoveryState';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import downloadRecovery from './downloadRecovery';

setupTestDb();

const baseItem = {
  id: 9,
  size: 100,
  sizeleft: 0,
  title: 'Project Hail Mary',
  timeleft: '',
  estimatedCompletionTime: '',
  status: 'completed',
  trackedDownloadState: 'importBlocked',
  trackedDownloadStatus: 'warning',
  protocol: 'torrent',
  downloadClient: 'Deluge',
  indexer: 'Indexer',
};

const run = async (
  serviceType: 'readarr' | 'radarr',
  downloadId: string,
  message: string,
  overrides: Record<string, unknown> = {}
) => {
  const repository = getRepository(DownloadRecoveryState);
  const deleteQueueItem = mock.fn(async () => undefined);
  const search = mock.fn(async () => undefined);
  const service = {
    serviceType,
    label: serviceType,
    server: { ...getSettings().radarr[0], id: 88, name: 'Identity fixture' },
    api: {
      getQueue: async () => [],
      refreshMonitoredDownloads: async () => undefined,
      deleteQueueItem,
    },
    getExternalId: () => 21,
    search,
  };
  const item = {
    ...baseItem,
    downloadId,
    statusMessages: [{ title: 'Project Hail Mary', messages: [message] }],
    ...overrides,
  };
  await repository.save(
    repository.create({
      serviceType,
      serviceId: 88,
      externalServiceId: 21,
      queueId: item.id,
      downloadId,
      lastSizeLeft: '0',
      lastProgressAt: new Date(),
    })
  );
  await downloadRecovery['processQueueItem'](service, item);
  return { deleteQueueItem, search };
};

describe('book import-blocked identity checks', () => {
  for (const message of [
    "Rejected: Completed download was grabbed for edition 'Project Hail Mary', but import matched edition 'Project Hail Mary (Unabridged)'. Chaptarr could not verify the expected edition.",
    'Rejected: Completed download was grabbed for Andy Weir - We Are Legion, but import matched Andy Weir - Heaven’s River.',
    'Rejected: Title/Author mismatch',
  ]) {
    it(`leaves a completed book download for manual import: ${message.slice(0, 50)}`, async () => {
      const { deleteQueueItem, search } = await run(
        'readarr',
        `id-${message.length}`,
        message
      );
      assert.equal(deleteQueueItem.mock.callCount(), 0);
      assert.equal(search.mock.callCount(), 0);
    });
  }

  it('still recovers a genuinely failed book download', async () => {
    const { deleteQueueItem, search } = await run(
      'readarr',
      'book-crc',
      'Rejected: archive has a CRC error',
      { trackedDownloadState: 'importFailed' }
    );
    assert.equal(deleteQueueItem.mock.callCount(), 1);
    assert.equal(search.mock.callCount(), 1);
  });

  it('keeps the existing behavior for other services', async () => {
    const { deleteQueueItem } = await run(
      'radarr',
      'movie-rejected',
      'Rejected: Title/Author mismatch'
    );
    assert.equal(deleteQueueItem.mock.callCount(), 1);
  });
});
