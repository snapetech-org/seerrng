import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserStreamingSubscriptionProviders1793478000000 implements MigrationInterface {
  name = 'AddUserStreamingSubscriptionProviders1793478000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (
      !(await queryRunner.hasColumn(
        'user_settings',
        'streamingSubscriptionProviderIds'
      ))
    ) {
      await queryRunner.query(
        'ALTER TABLE "user_settings" ADD COLUMN "streamingSubscriptionProviderIds" text'
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (
      await queryRunner.hasColumn(
        'user_settings',
        'streamingSubscriptionProviderIds'
      )
    ) {
      await queryRunner.query(
        'ALTER TABLE "user_settings" DROP COLUMN "streamingSubscriptionProviderIds"'
      );
    }
  }
}
