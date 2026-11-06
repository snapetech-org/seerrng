import { getRepository } from '@server/datasource';
import DownloadRecoveryState from '@server/entity/DownloadRecoveryState';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import assert from 'node:assert/strict';
import { it, mock } from 'node:test';
import downloadRecovery from './downloadRecovery';

setupTestDb();

for (const { pausedField, warning } of (
  ['status', 'trackedDownloadState'] as const
).flatMap((pausedField) =>
  ['seedless', 'failure'].map((warning) => ({ pausedField, warning }))
)) {
  it(`preserves a paused ${pausedField} with ${warning} warning and starts a fresh stall window on resume`, async () => {
    const repository = getRepository(DownloadRecoveryState);
    const deleteQueueItem = mock.fn(async () => undefined);
    const search = mock.fn(async () => undefined);
    const service = {
      serviceType: 'radarr' as const,
      label: 'Radarr',
      server: { ...getSettings().radarr[0], id: 77, name: 'Pause fixture' },
      api: {
        getQueue: async () => [],
        refreshMonitoredDownloads: async () => undefined,
        deleteQueueItem,
      },
      getExternalId: () => 12,
      search,
    };
    const item = {
      id: 3,
      size: 100,
      sizeleft: 100,
      title: 'Paused fixture',
      timeleft: '',
      estimatedCompletionTime: '',
      status: 'downloading',
      trackedDownloadState: 'downloading',
      trackedDownloadStatus: 'warning',
      downloadId: `pause-${pausedField}`,
      protocol: 'torrent',
      downloadClient: 'qBittorrent',
      indexer: 'Indexer',
      errorMessage:
        warning === 'seedless'
          ? 'The download is stalled with no connections'
          : 'Download failed with CRC error',
      [pausedField]: 'paused',
    };
    let state = await repository.save(
      repository.create({
        serviceType: 'radarr',
        serviceId: 77,
        externalServiceId: 12,
        queueId: item.id,
        downloadId: item.downloadId,
        lastSizeLeft: '100',
        lastProgressAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      })
    );

    await downloadRecovery['processQueueItem'](service, item);
    assert.equal(deleteQueueItem.mock.callCount(), 0);
    assert.equal(search.mock.callCount(), 0);
    state = await repository.findOneByOrFail({ id: state.id });
    assert.ok(Date.now() - state.lastProgressAt.getTime() < 10_000);

    const resumed = {
      ...item,
      status: 'downloading',
      trackedDownloadState: 'downloading',
      errorMessage: 'The download is stalled with no connections',
    };
    await downloadRecovery['processQueueItem'](service, resumed);
    assert.equal(deleteQueueItem.mock.callCount(), 0);
    assert.equal(search.mock.callCount(), 0);

    state.lastProgressAt = new Date(Date.now() - 3 * 60 * 60 * 1000);
    await repository.save(state);
    await downloadRecovery['processQueueItem'](service, resumed);
    assert.equal(deleteQueueItem.mock.callCount(), 1);
    assert.equal(search.mock.callCount(), 1);
  });
}
