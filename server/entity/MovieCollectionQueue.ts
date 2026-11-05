import { DbAwareColumn, resolveDbType } from '@server/utils/DbColumnHelper';
import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './User';
export type MovieCollectionQueueReason =
  | 'playback-unlinked'
  | 'request-policy'
  | 'provider-unavailable'
  | 'request-cancelled'
  | null;
@Entity('movie_collection_queue')
@Index(
  'IDX_movie_collection_queue_owner_collection_quality',
  ['user', 'collectionId', 'is4k'],
  { unique: true }
)
export class MovieCollectionQueue {
  @PrimaryGeneratedColumn() public id: number;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) public user: User;
  @Column({ type: 'int' }) public collectionId: number;
  @Column({ type: 'boolean', default: false }) public is4k: boolean;
  @Column({ type: 'int', default: 1 }) public bufferSize: number;
  @Column({ type: 'int', nullable: true }) public admittingMovieId:
    number | null;
  @Column({ type: 'simple-json' }) public movieIds: number[];
  @Column({ type: 'simple-json' }) public watchedIds: number[];
  @Column({ type: 'simple-json' }) public requestedIds: number[];
  @Column({ type: 'varchar', length: 16, default: 'active' }) public status:
    'active' | 'waiting' | 'completed' | 'stopped';
  @Column({ type: 'varchar', length: 32, nullable: true })
  public reason: MovieCollectionQueueReason;
  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;
  @UpdateDateColumn({
    type: resolveDbType('datetime'),
    default: () => 'CURRENT_TIMESTAMP',
  })
  public updatedAt: Date;
  constructor(init?: Partial<MovieCollectionQueue>) {
    Object.assign(this, init);
  }
}
