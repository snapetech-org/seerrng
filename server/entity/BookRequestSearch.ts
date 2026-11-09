import { DbAwareColumn } from '@server/utils/DbColumnHelper';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { MediaRequest } from './MediaRequest';

@Entity('book_request_search')
@Unique('UQ_book_request_search_request_format', ['requestId', 'format'])
@Index('IDX_book_request_search_command', ['serviceId', 'commandId'])
export class BookRequestSearch {
  @PrimaryGeneratedColumn()
  public id: number;

  @Column({ type: 'integer' })
  public requestId: number;

  @ManyToOne(() => MediaRequest, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'requestId',
    foreignKeyConstraintName: 'FK_book_request_search_request',
  })
  public request: MediaRequest;

  @Column({ type: 'integer' })
  public serviceId: number;

  @Column({ type: 'varchar', length: 16 })
  public format: 'ebook' | 'audiobook';

  @Column({ type: 'integer', nullable: true })
  public bookId?: number | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  public providerBookId?: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  public providerEditionId?: string | null;

  @Column({ type: 'integer', nullable: true })
  public pendingId?: number | null;

  @Column({ type: 'integer', nullable: true })
  public binderyRequestId?: number | null;

  @Column({ type: 'integer', nullable: true })
  public bookorbitRequestId?: number | null;

  @Column({ type: 'integer', nullable: true })
  public pendingAttemptCount?: number | null;

  @Column({ type: 'integer', nullable: true })
  public pendingMaxAttempts?: number | null;

  @DbAwareColumn({ type: 'datetime', nullable: true })
  public pendingNextAttemptAt?: Date | null;

  @Column({ type: 'integer', nullable: true })
  public authorId?: number | null;

  @Column({ type: 'integer', nullable: true })
  public commandId?: number | null;

  @Column({ type: 'boolean', default: false })
  public createdBook: boolean;

  @Column({ type: 'boolean', default: false })
  public createdAuthor: boolean;

  @Column({ type: 'boolean', default: false })
  public providerManagedSearch: boolean;

  @Column({ type: 'varchar', length: 32, default: 'searching' })
  public state:
    | 'searching'
    | 'pending'
    | 'needs_review'
    | 'monitoring'
    | 'settling'
    | 'grabbed'
    | 'importing'
    | 'available'
    | 'unavailable'
    | 'failed';

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public updatedAt: Date;

  constructor(init?: Partial<BookRequestSearch>) {
    Object.assign(this, init);
  }
}

export default BookRequestSearch;
