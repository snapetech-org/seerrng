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

export type FollowKind =
  | 'narrator'
  | 'author'
  | 'series-language'
  | 'edition'
  | 'expansion'
  | 'artist-release-type'
  | 'patch-project'
  | 'franchise'
  | 'saved-discovery'
  | 'tmdb-person'
  | 'tmdb-studio'
  | 'tmdb-network'
  | 'tmdb-genre';

export const FOLLOW_KINDS: FollowKind[] = [
  'narrator',
  'author',
  'series-language',
  'edition',
  'expansion',
  'artist-release-type',
  'patch-project',
  'franchise',
  'saved-discovery',
  'tmdb-person',
  'tmdb-studio',
  'tmdb-network',
  'tmdb-genre',
];

export interface FollowConditions {
  /** Language code for series-language / edition follows. */
  language?: string;
  /** Production type for narrator / edition follows. */
  production?: 'solo' | 'full-cast' | 'any';
  /** Release types to include for artist follows (album, soundtrack...). */
  includeTypes?: string[];
  /** Release types to exclude for artist follows (single, reissue...). */
  excludeTypes?: string[];
  /** Free-form provider reference (series id, game id, project id). */
  ref?: Record<string, string | number | boolean>;
}

/**
 * A user's standing interest in future work: a creator, a translated series,
 * a game's expansions, a patch project. Evaluated by lib/follow.
 */
@Entity()
@Index('UQ_follow_user_kind_subject', ['user', 'kind', 'subjectKey'], {
  unique: true,
})
@Index('IDX_follow_kind', ['kind'])
export class Follow {
  @PrimaryGeneratedColumn()
  public id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  public user: User;

  @Column({ type: 'varchar', length: 32 })
  public kind: FollowKind;

  /** Stable machine key, e.g. `ranobedb:6319:en`. */
  @Column({ type: 'varchar', length: 255 })
  public subjectKey: string;

  @Column({ type: 'varchar', length: 255 })
  public subjectLabel: string;

  @Column({ type: 'simple-json', nullable: true })
  public conditions?: FollowConditions | null;

  @Column({ type: 'boolean', default: true })
  public notify: boolean;

  /** Off by default. Auto-requests run through the normal request path. */
  @Column({ type: 'boolean', default: false })
  public autoRequest: boolean;

  /** Opaque adapter cursor so the same item is never reported twice. */
  @Column({ type: 'simple-json', nullable: true })
  public cursor?: Record<string, unknown> | null;

  @DbAwareColumn({ type: 'datetime', nullable: true })
  public lastCheckedAt?: Date | null;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  constructor(init?: Partial<Follow>) {
    Object.assign(this, init);
  }
}

export default Follow;
