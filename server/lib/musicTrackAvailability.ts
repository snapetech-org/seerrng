import AurralAPI from '@server/api/aurral';
import LidarrAPI from '@server/api/servarr/lidarr';
import {
  isValidMusicBrainzResourceId,
  normalizeMusicBrainzId,
} from '@server/lib/externalIds';
import { getMusicQualityFromLabels } from '@server/lib/musicQuality';
import { runWithServarrServiceSnapshot } from '@server/lib/serviceAdmission';
import type { AurralSettings, LidarrSettings } from '@server/lib/settings';

export type MusicTrackQuality = 'mp3' | 'flac';

export interface MusicTrackAvailability {
  mp3?: string[];
  flac?: string[];
  /** Recording MBIDs owned on another release (same artist and title). */
  elsewhere?: string[];
}

const getQuality = (service: {
  activeProfileName?: string;
  name: string;
}): MusicTrackQuality | undefined =>
  getMusicQualityFromLabels(service.activeProfileName, service.name);

export type MusicTrackAvailabilityLoader = (
  mbId: string,
  service: LidarrSettings
) => Promise<string[]>;

const loadAvailableRecordings: MusicTrackAvailabilityLoader = async (
  mbId: string,
  service: LidarrSettings
): Promise<string[]> =>
  runWithServarrServiceSnapshot('lidarr', service, async (currentService) => {
    const api = new LidarrAPI({
      apiKey: currentService.apiKey,
      url: LidarrAPI.buildUrl(currentService, '/api/v1'),
    });
    const albums = await api.getAlbums(300);
    const album = albums.find(
      (candidate) =>
        normalizeMusicBrainzId(candidate.foreignAlbumId || candidate.mbId) ===
        mbId
    );
    if (!album) return [];

    const tracks = await api.getTracks({ albumId: album.id }, 300);
    return [
      ...new Set(
        tracks
          .filter((track) => track.hasFile)
          .map((track) => normalizeMusicBrainzId(track.foreignRecordingId))
          .filter(isValidMusicBrainzResourceId)
      ),
    ];
  });

const loadAvailableAurralRecordings = async (
  mbId: string,
  service: AurralSettings
): Promise<string[]> =>
  runWithServarrServiceSnapshot('aurral', service, async (currentService) => {
    const api = new AurralAPI({
      apiKey: currentService.apiKey,
      url: AurralAPI.buildUrl(currentService),
    });
    const lookup = await api.lookupAlbums([mbId]);
    const entry =
      lookup[mbId] ??
      lookup[mbId.toLowerCase()] ??
      Object.values(lookup).find((item) => item != null);
    if (!entry?.inLibrary || !Array.isArray(entry.ownedTrackMbids)) {
      return [];
    }
    return [
      ...new Set(
        entry.ownedTrackMbids
          .map(normalizeMusicBrainzId)
          .filter(isValidMusicBrainzResourceId)
      ),
    ];
  });

export const getMusicTrackAvailability = async (
  albumMbId: string,
  services: LidarrSettings[],
  aurralServicesOrLoader:
    AurralSettings[] | MusicTrackAvailabilityLoader = loadAvailableRecordings,
  loadRecordings: MusicTrackAvailabilityLoader = loadAvailableRecordings
): Promise<MusicTrackAvailability> => {
  const aurralServices = Array.isArray(aurralServicesOrLoader)
    ? aurralServicesOrLoader
    : [];
  const lidarrLoader =
    typeof aurralServicesOrLoader === 'function'
      ? aurralServicesOrLoader
      : loadRecordings;

  const mbId = normalizeMusicBrainzId(albumMbId);
  const lidarrCandidates = services.flatMap((service) => {
    const quality = getQuality(service);
    return quality ? [{ quality, service, kind: 'lidarr' as const }] : [];
  });
  const aurralCandidates = aurralServices.flatMap((service) => {
    const quality = getQuality(service) ?? ('flac' as const);
    return [{ quality, service, kind: 'aurral' as const }];
  });
  const results = await Promise.allSettled([
    ...lidarrCandidates.map(async ({ quality, service }) => ({
      quality,
      recordingIds: await lidarrLoader(mbId, service),
    })),
    ...aurralCandidates.map(async ({ quality, service }) => ({
      quality,
      recordingIds: await loadAvailableAurralRecordings(mbId, service),
    })),
  ]);
  const availability: MusicTrackAvailability = {};

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const existing = availability[result.value.quality] ?? [];
    const recordingIds = result.value.recordingIds
      .map(normalizeMusicBrainzId)
      .filter(isValidMusicBrainzResourceId);
    availability[result.value.quality] = [
      ...new Set([...existing, ...recordingIds]),
    ];
  }

  return availability;
};
