import { MediaServerType } from '@server/constants/server';
import { describe, expect, it } from 'vitest';
import { getJobMessage } from './jobMessages';

const unknownJob = {
  id: 'components.Settings.SettingsJobsCache.unknownJob',
  defaultMessage: 'Unknown Job',
};

describe('Jobs & Cache job labels', () => {
  it.each([
    ['external-request-list-sync', 'External Request List Sync'],
    ['navidrome-scan', 'Navidrome Scan'],
    ['plex-playback-analysis', 'Plex Playback Analysis'],
    ['jellyfin-watch-ahead', 'Requested Episode Queue'],
  ] as const)('labels %s with its user-facing name', (jobId, label) => {
    expect(
      getJobMessage(jobId, MediaServerType.JELLYFIN, unknownJob).defaultMessage
    ).toBe(label);
  });

  it('keeps the Jellyfin scan jobs labeled for Emby', () => {
    expect(
      getJobMessage('jellyfin-full-scan', MediaServerType.EMBY, unknownJob)
        .defaultMessage
    ).toBe('Emby Full Library Scan');
  });
});
