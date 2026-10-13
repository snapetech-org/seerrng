import { MediaRequestStatus } from '@server/constants/media';
import type { SeasonEpisodeSelection } from '@server/interfaces/api/seasonInterfaces';
import { DbAwareColumn, resolveDbType } from '@server/utils/DbColumnHelper';
import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { MediaRequest } from './MediaRequest';

@Entity()
@Unique('UNIQUE_REQUEST_SEASON', ['request', 'seasonNumber'])
class SeasonRequest {
  @PrimaryGeneratedColumn()
  public id: number;

  @Column()
  public seasonNumber: number;

  @Column({ type: 'int', default: MediaRequestStatus.PENDING })
  public status: MediaRequestStatus;

  /** Null means the request covers the entire season. */
  @Column({ type: 'simple-json', nullable: true })
  public episodeNumbers?: SeasonEpisodeSelection['episodeNumbers'];

  @ManyToOne(() => MediaRequest, (request) => request.seasons, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @Index()
  public request: MediaRequest;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @UpdateDateColumn({
    type: resolveDbType('datetime'),
    default: () => 'CURRENT_TIMESTAMP',
  })
  public updatedAt: Date;

  constructor(init?: Partial<SeasonRequest>) {
    Object.assign(this, init);
  }
}

/** A declined selection is retained as history, but no longer blocks a retry. */
export const isActiveSeasonRequest = (season: {
  status?: MediaRequestStatus;
}): boolean => season.status !== MediaRequestStatus.DECLINED;

export default SeasonRequest;
