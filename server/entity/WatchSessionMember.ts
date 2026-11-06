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

export type WatchSessionMemberRole = 'owner' | 'member';

@Entity('watch_session_member')
@Index('UQ_watch_session_member_session_user', ['sessionId', 'userId'], {
  unique: true,
})
@Index('IDX_watch_session_member_user_left', ['userId', 'leftAt'])
export class WatchSessionMember {
  public constructor(init?: Partial<WatchSessionMember>) {
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
  public userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  public user: User;

  @Column({ type: 'varchar', length: 8, default: 'member' })
  public role: WatchSessionMemberRole;

  /** Personal watchlist titles are included only after this explicit opt-in. */
  @Column({ type: 'boolean', default: false })
  public includeWatchlistContributions: boolean;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public joinedAt: Date;

  @DbAwareColumn({ type: 'datetime', nullable: true })
  public leftAt?: Date | null;

  @UpdateDateColumn({
    type: resolveDbType('datetime'),
    default: () => 'CURRENT_TIMESTAMP',
  })
  public updatedAt: Date;
}

export default WatchSessionMember;
