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
import { WatchSession } from './WatchSession';
import { WatchSessionCandidate } from './WatchSessionCandidate';

export type WatchSessionBallotDecision = 'want' | 'pass';

@Entity('watch_session_ballot')
@Index(
  'UQ_watch_session_ballot_session_candidate_user',
  ['sessionId', 'candidateId', 'userId'],
  { unique: true }
)
@Index('IDX_watch_session_ballot_candidate', ['candidateId', 'decision'])
export class WatchSessionBallot {
  public constructor(init?: Partial<WatchSessionBallot>) {
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
  public candidateId: number;

  @ManyToOne(() => WatchSessionCandidate, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'candidateId' })
  public candidate: WatchSessionCandidate;

  @Column({ type: 'integer' })
  public userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  public user: User;

  @Column({ type: 'varchar', length: 8 })
  public decision: WatchSessionBallotDecision;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @UpdateDateColumn({
    type: resolveDbType('datetime'),
    default: () => 'CURRENT_TIMESTAMP',
  })
  public updatedAt: Date;
}

export default WatchSessionBallot;
