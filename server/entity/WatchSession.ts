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
import { User } from './User';

export type WatchSessionStatus = 'draft' | 'active';
export type WatchSessionRanking =
  'popularity.desc' | 'vote_average.desc' | 'primary_release_date.desc';

export interface WatchSessionFilters {
  genreIds: number[];
  ranking: WatchSessionRanking;
  releaseYearFrom?: number;
  releaseYearTo?: number;
  minimumRating?: number;
}

@Entity('watch_session')
@Index('IDX_watch_session_owner_status_expiry', [
  'ownerId',
  'status',
  'expiresAt',
])
export class WatchSession {
  public constructor(init?: Partial<WatchSession>) {
    Object.assign(this, init);
  }

  @PrimaryGeneratedColumn()
  public id: number;

  @Column({ type: 'integer' })
  public ownerId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerId' })
  public owner: User;

  @Column({ type: 'varchar', length: 80 })
  public title: string;

  @Column({ type: 'varchar', length: 12, default: 'draft' })
  public status: WatchSessionStatus;

  @Column({ type: 'integer', default: 1 })
  public memberCount: number;

  @Column({ type: 'simple-json' })
  public filters: WatchSessionFilters;

  /** Next TMDB Discover page to claim; page 6 ends the bounded deck. */
  @Column({ type: 'integer', default: 1 })
  public nextDiscoverPage: number;

  @Column({ type: 'boolean', default: false })
  public watchlistCandidatesLoaded: boolean;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @DbAwareColumn({ type: 'datetime' })
  public expiresAt: Date;

  @DbAwareColumn({ type: 'datetime', nullable: true })
  public startedAt?: Date | null;

  @UpdateDateColumn({
    type: resolveDbType('datetime'),
    default: () => 'CURRENT_TIMESTAMP',
  })
  public updatedAt: Date;
}

export default WatchSession;
