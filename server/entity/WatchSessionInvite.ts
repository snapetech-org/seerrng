import { DbAwareColumn } from '@server/utils/DbColumnHelper';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './User';
import { WatchSession } from './WatchSession';

@Entity('watch_session_invite')
@Index('UQ_watch_session_invite_token_hash', ['tokenHash'], { unique: true })
@Index('IDX_watch_session_invite_session_expiry', ['sessionId', 'expiresAt'])
export class WatchSessionInvite {
  public constructor(init?: Partial<WatchSessionInvite>) {
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
  public createdByUserId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'createdByUserId' })
  public createdBy: User;

  /** SHA-256 digest only; the bearer token is returned once at creation. */
  @Column({ type: 'varchar', length: 64 })
  public tokenHash: string;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @DbAwareColumn({ type: 'datetime' })
  public expiresAt: Date;

  @DbAwareColumn({ type: 'datetime', nullable: true })
  public claimedAt?: Date | null;

  @Column({ type: 'integer', nullable: true })
  public claimedByUserId?: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'claimedByUserId' })
  public claimedBy?: User | null;

  @DbAwareColumn({ type: 'datetime', nullable: true })
  public revokedAt?: Date | null;
}

export default WatchSessionInvite;
