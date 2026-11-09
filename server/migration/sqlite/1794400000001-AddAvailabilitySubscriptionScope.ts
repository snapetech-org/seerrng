import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAvailabilitySubscriptionScope1794400000001 implements MigrationInterface {
  name = 'AddAvailabilitySubscriptionScope1794400000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (
      !(await queryRunner.hasColumn('media_availability_subscription', 'is4k'))
    ) {
      await queryRunner.query(
        'ALTER TABLE "media_availability_subscription" ADD COLUMN "is4k" boolean'
      );
    }
    if (
      !(await queryRunner.hasColumn(
        'media_availability_subscription',
        'seasonNumber'
      ))
    ) {
      await queryRunner.query(
        'ALTER TABLE "media_availability_subscription" ADD COLUMN "seasonNumber" integer'
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (
      await queryRunner.hasColumn(
        'media_availability_subscription',
        'seasonNumber'
      )
    ) {
      await queryRunner.query(
        'ALTER TABLE "media_availability_subscription" DROP COLUMN "seasonNumber"'
      );
    }
    if (
      await queryRunner.hasColumn('media_availability_subscription', 'is4k')
    ) {
      await queryRunner.query(
        'ALTER TABLE "media_availability_subscription" DROP COLUMN "is4k"'
      );
    }
  }
}
