import { DbAwareColumn } from '@server/utils/DbColumnHelper';
import { Entity, PrimaryColumn } from 'typeorm';

@Entity('plex_analysis_state')
export class PlexAnalysisState {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  public serverKey: string;

  @PrimaryColumn({ type: 'varchar', length: 32 })
  public seasonKey: string;

  @DbAwareColumn({ type: 'datetime' })
  public attemptedAt: Date;

  @DbAwareColumn({ type: 'datetime', nullable: true })
  public queuedAt: Date | null;

  constructor(init?: Partial<PlexAnalysisState>) {
    Object.assign(this, init);
  }
}
