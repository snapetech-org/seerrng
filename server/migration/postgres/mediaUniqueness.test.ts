import assert from 'node:assert/strict';
import test from 'node:test';

import { DataSource, type QueryRunner } from 'typeorm';
import { EnforceScreenMediaUniqueness1782600000000 } from './1782600000000-EnforceScreenMediaUniqueness';
import { EnforceScreenBlocklistUniqueness1782700000000 } from './1782700000000-EnforceScreenBlocklistUniqueness';
import { EnforceCanonicalBookIdentifierUniqueness1782800000000 } from './1782800000000-EnforceCanonicalBookIdentifierUniqueness';
import { EnforceMusicMediaUniqueness1782900000000 } from './1782900000000-EnforceMusicMediaUniqueness';

const postgresUrl =
  process.env.SEERR_MIGRATION_TEST_POSTGRES_URL ??
  process.env.SEERR_TEST_POSTGRES_URL;
const postgresTest = postgresUrl ? test : test.skip;

const createMigrationTables = async (queryRunner: QueryRunner) => {
  await queryRunner.query(
    `CREATE TEMPORARY TABLE "media" (
      "id" integer PRIMARY KEY,
      "mediaType" varchar NOT NULL,
      "tmdbId" integer NOT NULL,
      "tvdbId" integer UNIQUE,
      "imdbId" varchar,
      "status" integer NOT NULL,
      "status4k" integer NOT NULL,
      "updatedAt" timestamp NOT NULL,
      "mediaAddedAt" timestamp,
      "serviceId" integer,
      "serviceId4k" integer,
      "externalServiceId" integer,
      "externalServiceId4k" integer,
      "externalServiceSlug" varchar,
      "externalServiceSlug4k" varchar,
      "audiobookServiceId" integer,
      "audiobookExternalServiceId" integer,
      "audiobookExternalServiceSlug" varchar,
      "ratingKey" varchar,
      "ratingKey4k" varchar,
      "jellyfinMediaId" varchar,
      "jellyfinMediaId4k" varchar,
      "mbId" varchar
    )`
  );
  for (const table of ['media_request', 'issue', 'watchlist']) {
    await queryRunner.query(
      `CREATE TEMPORARY TABLE "${table}" (
        "id" integer PRIMARY KEY,
        "mediaId" integer
      )`
    );
  }
  await queryRunner.query(
    `CREATE TEMPORARY TABLE "season" (
      "id" integer PRIMARY KEY,
      "seasonNumber" integer NOT NULL,
      "status" integer NOT NULL,
      "status4k" integer NOT NULL,
      "mediaId" integer NOT NULL,
      UNIQUE ("mediaId", "seasonNumber")
    )`
  );
  await queryRunner.query(
    `CREATE TEMPORARY TABLE "media_identifier" (
      "id" integer PRIMARY KEY,
      "mediaId" integer,
      "provider" varchar NOT NULL,
      "value" varchar NOT NULL,
      UNIQUE ("mediaId", "provider", "value")
    )`
  );
  await queryRunner.query(
    `CREATE TEMPORARY TABLE "blocklist" (
      "id" integer PRIMARY KEY,
      "mediaId" integer UNIQUE,
      "mediaType" varchar,
      "tmdbId" integer,
      "title" varchar,
      "userId" integer,
      "previousStatus" integer,
      "previousStatus4k" integer,
      "isMediaPlaceholder" boolean,
      "blocklistedTags" varchar,
      "createdAt" timestamp DEFAULT CURRENT_TIMESTAMP
    )`
  );
};

const withPostgresQueryRunner = async (
  callback: (queryRunner: QueryRunner) => Promise<void>
) => {
  const dataSource = await new DataSource({
    type: 'postgres',
    url: postgresUrl,
  }).initialize();
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await createMigrationTables(queryRunner);
    await callback(queryRunner);
  } finally {
    if (queryRunner.isTransactionActive) {
      await queryRunner.rollbackTransaction();
    }
    await queryRunner.release();
    await dataSource.destroy();
  }
};

postgresTest(
  'PostgreSQL screen-media uniqueness migration executes and rewires duplicates',
  async () => {
    await withPostgresQueryRunner(async (queryRunner) => {
      await queryRunner.query(
        `INSERT INTO "media" (
          "id", "mediaType", "tmdbId", "tvdbId", "status", "status4k",
          "updatedAt", "ratingKey", "ratingKey4k"
        ) VALUES
          (1, 'movie', 100, 77, 5, 1, '2026-01-01', 'standard', NULL),
          (2, 'movie', 100, NULL, 1, 5, '2026-02-01', NULL, '4k')`
      );
      for (const table of ['media_request', 'issue', 'watchlist']) {
        await queryRunner.query(
          `INSERT INTO "${table}" ("id", "mediaId") VALUES (1, 1), (2, 2)`
        );
      }
      await queryRunner.query(
        `INSERT INTO "season" ("id", "seasonNumber", "status", "status4k", "mediaId")
         VALUES (1, 1, 5, 1, 1), (2, 1, 2, 5, 2)`
      );
      await queryRunner.query(
        `INSERT INTO "media_identifier" ("id", "mediaId", "provider", "value")
         VALUES (1, 1, 'tmdb', '100'), (2, 2, 'tmdb', '100')`
      );
      await queryRunner.query(
        `INSERT INTO "blocklist" ("id", "mediaId") VALUES (1, 1)`
      );

      const migration = new EnforceScreenMediaUniqueness1782600000000();
      await migration.up(queryRunner);

      assert.deepStrictEqual(
        await queryRunner.query(
          `SELECT "id", "tvdbId", "status", "status4k", "ratingKey", "ratingKey4k"
           FROM "media"`
        ),
        [
          {
            id: 2,
            tvdbId: 77,
            status: 5,
            status4k: 5,
            ratingKey: 'standard',
            ratingKey4k: '4k',
          },
        ]
      );
      for (const table of [
        'media_request',
        'issue',
        'watchlist',
        'season',
        'media_identifier',
        'blocklist',
      ]) {
        assert.deepStrictEqual(
          await queryRunner.query(
            `SELECT DISTINCT "mediaId" FROM "${table}" ORDER BY "mediaId"`
          ),
          [{ mediaId: 2 }]
        );
      }
      await migration.down(queryRunner);
    });
  }
);

postgresTest(
  'PostgreSQL screen-blocklist uniqueness migration executes and merges duplicates',
  async () => {
    await withPostgresQueryRunner(async (queryRunner) => {
      await queryRunner.query(
        `INSERT INTO "blocklist" (
          "id", "mediaId", "mediaType", "tmdbId", "title",
          "blocklistedTags", "createdAt"
        ) VALUES
          (1, 1, 'movie', 100, 'Manual', NULL, '2026-01-01'),
          (2, 2, 'movie', 100, 'Automatic', ',60,', '2026-02-01')`
      );

      const migration = new EnforceScreenBlocklistUniqueness1782700000000();
      await migration.up(queryRunner);

      assert.deepStrictEqual(
        await queryRunner.query(
          `SELECT "id", "mediaId", "title", "blocklistedTags"
           FROM "blocklist"`
        ),
        [{ id: 1, mediaId: 1, title: 'Manual', blocklistedTags: null }]
      );
      await queryRunner.query('SAVEPOINT blocklist_unique_check');
      await assert.rejects(
        queryRunner.query(
          `INSERT INTO "blocklist" (
            "id", "mediaId", "mediaType", "tmdbId", "title"
          ) VALUES (3, 3, 'movie', 100, 'Duplicate')`
        ),
        /unique/i
      );
      await queryRunner.query('ROLLBACK TO SAVEPOINT blocklist_unique_check');
      await migration.down(queryRunner);
    });
  }
);

postgresTest(
  'PostgreSQL canonical-book identifier migration executes and removes collisions',
  async () => {
    await withPostgresQueryRunner(async (queryRunner) => {
      await queryRunner.query(
        `INSERT INTO "media" (
          "id", "mediaType", "tmdbId", "status", "status4k", "updatedAt"
        ) VALUES
          (1, 'book', 0, 1, 1, '2026-01-01'),
          (2, 'book', 0, 5, 1, '2026-02-01'),
          (3, 'movie', 300, 1, 1, '2026-03-01')`
      );
      await queryRunner.query(
        `INSERT INTO "media_request" ("id", "mediaId") VALUES (1, 1)`
      );
      await queryRunner.query(
        `INSERT INTO "media_identifier" (
          "id", "mediaId", "provider", "value"
        ) VALUES
          (1, 1, 'isbn', '9780000000001'),
          (2, 2, 'isbn', '9780000000001'),
          (3, 3, 'isbn', '9780000000002')`
      );

      const migration =
        new EnforceCanonicalBookIdentifierUniqueness1782800000000();
      await migration.up(queryRunner);

      assert.deepStrictEqual(
        await queryRunner.query(
          `SELECT "id", "mediaId", "provider", "value"
           FROM "media_identifier" ORDER BY "id"`
        ),
        [
          {
            id: 1,
            mediaId: 1,
            provider: 'isbn',
            value: '9780000000001',
          },
        ]
      );
      await queryRunner.query('SAVEPOINT book_identifier_unique_check');
      await assert.rejects(
        queryRunner.query(
          `INSERT INTO "media_identifier" (
            "id", "mediaId", "provider", "value"
          ) VALUES (4, 2, 'isbn', '9780000000001')`
        ),
        /unique/i
      );
      await queryRunner.query(
        'ROLLBACK TO SAVEPOINT book_identifier_unique_check'
      );
      await migration.down(queryRunner);
    });
  }
);

postgresTest(
  'PostgreSQL music-media uniqueness migration executes and normalizes duplicates',
  async () => {
    await withPostgresQueryRunner(async (queryRunner) => {
      await queryRunner.query(
        `INSERT INTO "media" (
          "id", "mediaType", "mbId", "tmdbId", "tvdbId", "status",
          "status4k", "updatedAt", "serviceId", "externalServiceSlug"
        ) VALUES
          (1, 'music', ' RELEASE-GROUP ', 0, 77, 5, 1, '2026-01-01', 4, NULL),
          (2, 'music', 'release-group', 0, NULL, 1, 1, '2026-02-01', NULL, 'slug')`
      );
      for (const table of ['media_request', 'issue', 'watchlist']) {
        await queryRunner.query(
          `INSERT INTO "${table}" ("id", "mediaId") VALUES (1, 1), (2, 2)`
        );
      }
      await queryRunner.query(
        `INSERT INTO "media_identifier" ("id", "mediaId", "provider", "value")
         VALUES
           (1, 1, 'musicbrainz', 'release-group'),
           (2, 2, 'musicbrainz', 'release-group')`
      );
      await queryRunner.query(
        `INSERT INTO "blocklist" ("id", "mediaId") VALUES (1, 1)`
      );

      const migration = new EnforceMusicMediaUniqueness1782900000000();
      await migration.up(queryRunner);

      assert.deepStrictEqual(
        await queryRunner.query(
          `SELECT "id", "mbId", "tvdbId", "status", "serviceId",
                  "externalServiceSlug" FROM "media"`
        ),
        [
          {
            id: 2,
            mbId: 'release-group',
            tvdbId: 77,
            status: 5,
            serviceId: 4,
            externalServiceSlug: 'slug',
          },
        ]
      );
      for (const table of [
        'media_request',
        'issue',
        'watchlist',
        'media_identifier',
        'blocklist',
      ]) {
        assert.deepStrictEqual(
          await queryRunner.query(
            `SELECT DISTINCT "mediaId" FROM "${table}" ORDER BY "mediaId"`
          ),
          [{ mediaId: 2 }]
        );
      }
      await migration.down(queryRunner);
    });
  }
);
