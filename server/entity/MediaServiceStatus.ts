import { MediaStatus } from '@server/constants/media';
import { resolveDbType } from '@server/utils/DbColumnHelper';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import Media from './Media';

export type VideoRequestServiceType = 'radarr' | 'sonarr';
export type VideoRequestFormat = 'standard' | '4k';

@Entity('media_service_status')
@Index(
  'UQ_media_service_status_destination',
  ['mediaId', 'serviceType', 'serverId', 'format'],
  { unique: true }
)
class MediaServiceStatus {
  @PrimaryGeneratedColumn()
  public id: number;

  @Column({ type: 'integer' })
  public mediaId: number;

  @ManyToOne(() => Media, (media) => media.serviceStatuses, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'mediaId' })
  public media: Media;

  @Column({ type: 'varchar', length: 8 })
  public serviceType: VideoRequestServiceType;

  @Column({ type: 'integer' })
  public serverId: number;

  @Column({ type: 'varchar', length: 8 })
  public format: VideoRequestFormat;

  @Column({ type: 'integer', default: MediaStatus.UNKNOWN })
  public status: MediaStatus;

  @Column({ type: 'integer', nullable: true })
  public externalServiceId?: number | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  public externalServiceSlug?: string | null;

  @Column({
    type: 'text',
    nullable: true,
    transformer: {
      from: (value: string | null): Record<number, MediaStatus> | null => {
        if (!value) return null;
        try {
          const parsed: unknown = JSON.parse(value);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return null;
          }
          return parsed as Record<number, MediaStatus>;
        } catch {
          return null;
        }
      },
      to: (
        value: Record<number, MediaStatus> | null | undefined
      ): string | null =>
        value && Object.keys(value).length > 0 ? JSON.stringify(value) : null,
    },
  })
  public seasonStatuses?: Record<number, MediaStatus> | null;

  @UpdateDateColumn({
    type: resolveDbType('datetime'),
    default: () => 'CURRENT_TIMESTAMP',
  })
  public updatedAt: Date;

  constructor(init?: Partial<MediaServiceStatus>) {
    Object.assign(this, init);
  }
}

export default MediaServiceStatus;
