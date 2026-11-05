import {
  Table,
  TableIndex,
  type MigrationInterface,
  type QueryRunner,
} from 'typeorm';
export class AddMovieCollectionQueue1792810000000 implements MigrationInterface {
  name = 'AddMovieCollectionQueue1792810000000';
  async up(runner: QueryRunner): Promise<void> {
    if (await runner.hasTable('movie_collection_queue')) return;
    await runner.createTable(
      new Table({
        name: 'movie_collection_queue',
        columns: [
          {
            name: 'id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'userId', type: 'integer' },
          { name: 'collectionId', type: 'integer' },
          { name: 'is4k', type: 'boolean', default: false },
          { name: 'bufferSize', type: 'integer', default: 1 },
          { name: 'admittingMovieId', type: 'integer', isNullable: true },
          { name: 'movieIds', type: 'text' },
          { name: 'watchedIds', type: 'text' },
          { name: 'requestedIds', type: 'text' },
          {
            name: 'status',
            type: 'varchar',
            length: '16',
            default: "'active'",
          },
          { name: 'reason', type: 'varchar', length: '32', isNullable: true },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        foreignKeys: [
          {
            columnNames: ['userId'],
            referencedTableName: 'user',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      })
    );
    await runner.createIndex(
      'movie_collection_queue',
      new TableIndex({
        name: 'IDX_movie_collection_queue_owner_collection_quality',
        columnNames: ['userId', 'collectionId', 'is4k'],
        isUnique: true,
      })
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.dropTable('movie_collection_queue', true);
  }
}
