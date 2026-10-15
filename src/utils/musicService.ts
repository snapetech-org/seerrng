import type { ServiceCommonServer } from '@server/interfaces/api/serviceInterfaces';
import { getMusicQualityFromLabels } from '@server/lib/musicQuality';

export const getMusicServiceQuality = (
  service: Pick<ServiceCommonServer, 'musicQuality' | 'name'> | undefined
) => service?.musicQuality ?? getMusicQualityFromLabels(service?.name);

export const isMusicServiceForQuality = (
  service: Pick<ServiceCommonServer, 'musicQuality' | 'name'>,
  quality: 'mp3' | 'flac'
): boolean => getMusicServiceQuality(service) === quality;
