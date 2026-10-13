import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import MediaIdentifier from './MediaIdentifier';

@Entity()
@Unique('UNIQUE_MEDIA_IDENTIFIER_SEASON_MAPPING', [
  'mediaIdentifier',
  'sonarrServerId',
  'is4k',
  'seasonNumber',
])
@Unique('UNIQUE_MEDIA_IDENTIFIER_EXTERNAL_SEASON_MAPPING', [
  'mediaIdentifier',
  'sonarrServerId',
  'is4k',
  'externalSeasonNumber',
])
class MediaIdentifierSeasonMapping {
  @PrimaryGeneratedColumn()
  public id: number;

  @ManyToOne(() => MediaIdentifier, (identifier) => identifier.seasonMappings, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({
    name: 'mediaIdentifierId',
    foreignKeyConstraintName: 'FK_media_identifier_season_mapping_identifier',
  })
  @Index('IDX_media_identifier_season_mapping_identifier')
  public mediaIdentifier: MediaIdentifier;

  @Column({ type: 'integer' })
  public sonarrServerId: number;

  @Column({ type: 'boolean', default: false })
  public is4k: boolean;

  @Column({ type: 'integer' })
  public seasonNumber: number;

  @Column({ type: 'integer' })
  public externalSeasonNumber: number;

  constructor(init?: Partial<MediaIdentifierSeasonMapping>) {
    Object.assign(this, init);
  }
}

export default MediaIdentifierSeasonMapping;
