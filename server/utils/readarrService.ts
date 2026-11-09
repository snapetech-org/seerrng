import type { ReadarrSettings } from '@server/lib/settings';

export type BookServiceFormat = 'ebook' | 'audiobook';

export const isBinderyService = (
  service: Pick<ReadarrSettings, 'backend'>
): boolean => service.backend === 'bindery';

export const getReadarrServiceFormats = (
  service: Pick<ReadarrSettings, 'backend' | 'serviceType'>
): BookServiceFormat[] => {
  if (service.backend !== 'readarr' && service.serviceType === 'both') {
    return ['ebook', 'audiobook'];
  }

  return [service.serviceType === 'audiobook' ? 'audiobook' : 'ebook'];
};

export const readarrServiceSupportsFormat = (
  service: Pick<ReadarrSettings, 'backend' | 'serviceType'>,
  format: BookServiceFormat
): boolean => getReadarrServiceFormats(service).includes(format);
