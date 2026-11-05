import type { MetadataProviderType } from '@server/lib/settings';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import Season from './Season';

export type EpisodeAvailabilitySourceType =
  'sonarr' | 'plex' | 'jellyfin' | 'emby';

/** A row represents one episode with a file reported by one configured source. */
@Entity('episode_availability')
@Index('IDX_EPISODE_AVAILABILITY_SEASON_SOURCE', [
  'season',
  'sourceType',
  'sourceId',
])
@Index('IDX_EPISODE_AVAILABILITY_SOURCE_SERIES', [
  'sourceType',
  'sourceId',
  'metadataProvider',
  'externalSeriesId',
])
@Unique('UNIQUE_EPISODE_AVAILABILITY', [
  'season',
  'episodeNumber',
  'sourceType',
  'sourceId',
  'metadataProvider',
  'externalSeriesId',
  'is4k',
])
class EpisodeAvailability {
  @PrimaryGeneratedColumn()
  public id: number;

  @Column({ type: 'int' })
  public episodeNumber: number;

  @Column({ type: 'varchar', length: 16 })
  public sourceType: EpisodeAvailabilitySourceType;

  @Column({ type: 'varchar', length: 80 })
  public sourceId: string;

  @Column({ type: 'varchar', length: 16 })
  public metadataProvider: MetadataProviderType;

  @Column({ type: 'int' })
  public externalSeriesId: number;

  @Column({ type: 'boolean', default: false })
  public is4k: boolean;

  @ManyToOne(() => Season, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'seasonId' })
  public season: Season;

  constructor(init?: Partial<EpisodeAvailability>) {
    Object.assign(this, init);
  }
}

export default EpisodeAvailability;
