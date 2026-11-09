import type { MigrationInterface, QueryRunner } from 'typeorm';
export class CreateClientApiKeys1794222000000 implements MigrationInterface {
  name = 'CreateClientApiKeys1794222000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "client_api_key" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL,
      "name" varchar(80) NOT NULL, "tokenHash" varchar(64) NOT NULL UNIQUE,
      "scopes" text NOT NULL, "credentialVersion" varchar(20) NOT NULL,
      "expiresAt" datetime NOT NULL, "createdAt" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
    )`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "client_api_key"');
  }
}
