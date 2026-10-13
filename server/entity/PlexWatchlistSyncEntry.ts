import type { MediaType } from '@server/constants/media';
import { User } from '@server/entity/User';
import { DbAwareColumn, resolveDbType } from '@server/utils/DbColumnHelper';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type PlexWatchlistMediaType = MediaType.MOVIE | MediaType.TV;

@Entity('plex_watchlist_sync_entry')
@Index(
  'IDX_plex_watchlist_sync_entry_user_source_media',
  ['requestedBy', 'sourcePlexId', 'mediaType', 'tmdbId'],
  { unique: true }
)
export class PlexWatchlistSyncEntry {
  public constructor(init?: Partial<PlexWatchlistSyncEntry>) {
    Object.assign(this, init);
  }

  @PrimaryGeneratedColumn()
  public id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'userId' })
  public requestedBy: User;

  /** Plex account ID keeps entries separate when a Seerr user changes accounts. */
  @Column({ type: 'integer' })
  public sourcePlexId: number;

  @Column({ type: 'integer' })
  public tmdbId: number;

  @Column({ type: 'varchar', length: 16 })
  public mediaType: PlexWatchlistMediaType;

  /** Provider timestamp that changes when the user removes and re-adds an item. */
  @DbAwareColumn({ type: 'datetime' })
  public watchlistedAt: Date;

  /** TV seasons already handled for this watchlist entry. */
  @Column({ type: 'simple-json', nullable: true })
  public processedSeasonNumbers?: number[];

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @UpdateDateColumn({
    type: resolveDbType('datetime'),
    default: () => 'CURRENT_TIMESTAMP',
  })
  public updatedAt: Date;
}
