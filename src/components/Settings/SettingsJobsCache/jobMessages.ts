import defineMessages from '@app/utils/defineMessages';
import { MediaServerType } from '@server/constants/server';
import type { JobId } from '@server/lib/settings';
import type { MessageDescriptor } from 'react-intl';

const jobMessages = defineMessages('components.Settings.SettingsJobsCache', {
  'plex-recently-added-scan': 'Plex Recently Added Scan',
  'plex-full-scan': 'Plex Full Library Scan',
  'plex-watchlist-sync': 'Plex Watchlist Sync',
  'plex-refresh-token': 'Plex Refresh Token',
  'radarr-scan': 'Radarr Scan',
  'sonarr-scan': 'Sonarr Scan',
  'lidarr-scan': 'Lidarr Scan',
  'readarr-scan': 'Bookshelf Scan',
  'navidrome-scan': 'Navidrome Scan',
  'readarr-request-retry': 'Bookshelf Request Retry',
  'mylar-scan': 'Mylar Comics Scan',
  'kapowarr-scan': 'Kapowarr Comics Scan',
  'backissue-scan': 'BackIssue Comics Scan',
  'magazine-scan': 'LazyLibrarian Magazine Scan',
  'adult-scan': 'Whisparr Adult Scene Scan',
  'download-sync': 'Download Sync',
  'software-request-reconciliation': 'Software Request Reconciliation',
  'live-tv-sync': 'Live TV Sync',
  'soulseek-sync': 'Soulseek Sync',
  'download-recovery': 'Download Recovery',
  'download-sync-reset': 'Download Sync Reset',
  'jellyfin-recently-added-scan': 'Jellyfin Recently Added Scan',
  'jellyfin-full-scan': 'Jellyfin Full Library Scan',
  'movie-collection-queue': 'Movie Collection Queue',
  'jellyfin-watch-ahead': 'Requested Episode Queue',
  'image-cache-cleanup': 'Image Cache Cleanup',
  'release-calendar-history': 'Release Calendar History',
  'availability-sync': 'Media Availability Sync',
  'external-request-list-sync': 'External Request List Sync',
  'reader-delivery-kobo-sync': 'BookOrbit Kobo Collection Sync',
  'follow-sync': 'Followed Interests Sync',
  'process-blocklisted-tags': 'Process Blocklisted Tags',
} satisfies Record<JobId, string>);

export const getJobMessage = (
  jobId: JobId,
  mediaServerType: MediaServerType,
  unknownJob: MessageDescriptor
): MessageDescriptor => {
  const message = jobMessages[jobId];

  if (!message) {
    return unknownJob;
  }

  if (mediaServerType === MediaServerType.EMBY) {
    if (jobId === 'jellyfin-recently-added-scan') {
      return { ...message, defaultMessage: 'Emby Recently Added Scan' };
    }

    if (jobId === 'jellyfin-full-scan') {
      return { ...message, defaultMessage: 'Emby Full Library Scan' };
    }
  }

  return message;
};
