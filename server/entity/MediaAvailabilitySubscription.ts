import Media from '@server/entity/Media';
import { User } from '@server/entity/User';
import { DbAwareColumn } from '@server/utils/DbColumnHelper';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity()
@Index('UQ_media_availability_subscription_user_media', ['user', 'media'], {
  unique: true,
})
@Index('IDX_media_availability_subscription_media', ['media'])
export class MediaAvailabilitySubscription {
  @PrimaryGeneratedColumn()
  public id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  public user: User;

  @ManyToOne(() => Media, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mediaId' })
  public media: Media;

  /** Null keeps the legacy title-wide subscription across both qualities. */
  @Column({ type: 'boolean', nullable: true })
  public is4k?: boolean | null;

  /** Null follows the whole title. A season scope is valid only for TV. */
  @Column({ type: 'integer', nullable: true })
  public seasonNumber?: number | null;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  constructor(init?: Partial<MediaAvailabilitySubscription>) {
    Object.assign(this, init);
  }
}

export default MediaAvailabilitySubscription;
