import type { MediaStatus } from '@server/constants/media';
import type MediaServiceStatus from '@server/entity/MediaServiceStatus';
import type {
  VideoRequestFormat,
  VideoRequestServiceType,
} from '@server/entity/MediaServiceStatus';
import type { Repository } from 'typeorm';

export interface MediaServiceStatusValues {
  mediaId: number;
  serviceType: VideoRequestServiceType;
  serverId: number;
  format: VideoRequestFormat;
  status: MediaStatus;
  externalServiceId?: number | null;
  externalServiceSlug?: string | null;
  seasonStatuses?: Record<number, MediaStatus> | null;
}

export const upsertMediaServiceStatus = async (
  repository: Repository<MediaServiceStatus>,
  values: MediaServiceStatusValues
): Promise<void> => {
  const updatedAt = new Date();
  await repository
    .createQueryBuilder()
    .insert()
    .values({
      ...values,
      updatedAt,
      externalServiceId: values.externalServiceId ?? null,
      externalServiceSlug: values.externalServiceSlug ?? null,
      seasonStatuses: values.seasonStatuses ?? null,
    })
    .orUpdate(
      [
        'status',
        'externalServiceId',
        'externalServiceSlug',
        'seasonStatuses',
        'updatedAt',
      ],
      ['mediaId', 'serviceType', 'serverId', 'format']
    )
    .updateEntity(false)
    .execute();
};
