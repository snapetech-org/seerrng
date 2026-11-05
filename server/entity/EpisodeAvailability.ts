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

/** A row represents one episode with a file on a specific Sonarr instance. */
@Entity('episode_availability')
@Index('IDX_EPISODE_AVAILABILITY_SEASON_SERVICE', ['season', 'serviceId'])
@Index('IDX_EPISODE_AVAILABILITY_SERVICE_SERIES', [
  'serviceId',
  'externalSeriesId',
])
@Unique('UNIQUE_EPISODE_AVAILABILITY', [
  'season',
  'episodeNumber',
  'serviceId',
  'externalSeriesId',
  'is4k',
])
class EpisodeAvailability {
  @PrimaryGeneratedColumn()
  public id: number;

  @Column({ type: 'int' })
  public episodeNumber: number;

  @Column({ type: 'int' })
  public serviceId: number;

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
