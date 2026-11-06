import { DbAwareColumn } from '@server/utils/DbColumnHelper';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WatchSession } from './WatchSession';

@Entity('watch_session_candidate')
@Index('UQ_watch_session_candidate_session_tmdb', ['sessionId', 'tmdbId'], {
  unique: true,
})
export class WatchSessionCandidate {
  public constructor(init?: Partial<WatchSessionCandidate>) {
    Object.assign(this, init);
  }

  @PrimaryGeneratedColumn()
  public id: number;

  @Column({ type: 'integer' })
  public sessionId: number;

  @ManyToOne(() => WatchSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  public session: WatchSession;

  @Column({ type: 'integer' })
  public tmdbId: number;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;
}

export default WatchSessionCandidate;
