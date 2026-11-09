import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRequestIdempotency1794400000000 implements MigrationInterface {
  name = 'AddRequestIdempotency1794400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('media_request', 'idempotencyKey'))) {
      await queryRunner.query(
        'ALTER TABLE "media_request" ADD COLUMN "idempotencyKey" varchar(64)'
      );
    }
    if (
      !(await queryRunner.hasColumn('media_request', 'idempotencyFingerprint'))
    ) {
      await queryRunner.query(
        'ALTER TABLE "media_request" ADD COLUMN "idempotencyFingerprint" varchar(64)'
      );
    }
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_media_request_idempotency_key" ON "media_request" ("idempotencyKey")'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "UQ_media_request_idempotency_key"'
    );
    if (
      await queryRunner.hasColumn('media_request', 'idempotencyFingerprint')
    ) {
      await queryRunner.query(
        'ALTER TABLE "media_request" DROP COLUMN "idempotencyFingerprint"'
      );
    }
    if (await queryRunner.hasColumn('media_request', 'idempotencyKey')) {
      await queryRunner.query(
        'ALTER TABLE "media_request" DROP COLUMN "idempotencyKey"'
      );
    }
  }
}
