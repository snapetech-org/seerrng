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

export type ClientApiScope = 'discover' | 'request';
@Entity()
export class ClientApiKey {
  @PrimaryGeneratedColumn() id: number;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
  @Column({ type: 'varchar', length: 80 }) name: string;
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64, select: false })
  tokenHash: string;
  @Column({ type: 'simple-json' }) scopes: ClientApiScope[];
  @Column({ type: 'varchar', length: 20 }) credentialVersion: string;
  @DbAwareColumn({ type: 'datetime' }) expiresAt: Date;
  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
