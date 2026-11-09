import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAvailabilitySubscriptionScope1794400000001 implements MigrationInterface {
  name = 'AddAvailabilitySubscriptionScope1794400000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "media_availability_subscription" ADD COLUMN IF NOT EXISTS "is4k" boolean'
    );
    await queryRunner.query(
      'ALTER TABLE "media_availability_subscription" ADD COLUMN IF NOT EXISTS "seasonNumber" integer'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "media_availability_subscription" DROP COLUMN IF EXISTS "seasonNumber"'
    );
    await queryRunner.query(
      'ALTER TABLE "media_availability_subscription" DROP COLUMN IF EXISTS "is4k"'
    );
  }
}
