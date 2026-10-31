import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWatchSessions1793484786000 implements MigrationInterface {
  name = 'CreateWatchSessions1793484786000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "watch_session" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "ownerId" integer NOT NULL,
        "title" varchar(80) NOT NULL,
        "status" varchar(12) NOT NULL DEFAULT 'draft',
        "memberCount" integer NOT NULL DEFAULT 1,
        "filters" text NOT NULL,
        "nextDiscoverPage" integer NOT NULL DEFAULT 1,
        "watchlistCandidatesLoaded" boolean NOT NULL DEFAULT 0,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "expiresAt" datetime NOT NULL,
        "startedAt" datetime,
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_watch_session_owner"
          FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_watch_session_owner_status_expiry" ON "watch_session" ("ownerId", "status", "expiresAt")'
    );

    await queryRunner.query(`
      CREATE TABLE "watch_session_member" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "sessionId" integer NOT NULL,
        "userId" integer NOT NULL,
        "role" varchar(8) NOT NULL DEFAULT 'member',
        "includeWatchlistContributions" boolean NOT NULL DEFAULT 0,
        "joinedAt" datetime NOT NULL DEFAULT (datetime('now')),
        "leftAt" datetime,
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_watch_session_member_session_user" UNIQUE ("sessionId", "userId"),
        CONSTRAINT "FK_watch_session_member_session"
          FOREIGN KEY ("sessionId") REFERENCES "watch_session"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_watch_session_member_user"
          FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_watch_session_member_user_left" ON "watch_session_member" ("userId", "leftAt")'
    );

    await queryRunner.query(`
      CREATE TABLE "watch_session_invite" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "sessionId" integer NOT NULL,
        "createdByUserId" integer NOT NULL,
        "tokenHash" varchar(64) NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "expiresAt" datetime NOT NULL,
        "claimedAt" datetime,
        "claimedByUserId" integer,
        "revokedAt" datetime,
        CONSTRAINT "FK_watch_session_invite_session"
          FOREIGN KEY ("sessionId") REFERENCES "watch_session"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_watch_session_invite_creator"
          FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_watch_session_invite_claimant"
          FOREIGN KEY ("claimedByUserId") REFERENCES "user"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_watch_session_invite_token_hash" ON "watch_session_invite" ("tokenHash")'
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_watch_session_invite_session_expiry" ON "watch_session_invite" ("sessionId", "expiresAt")'
    );

    await queryRunner.query(`
      CREATE TABLE "watch_session_candidate" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "sessionId" integer NOT NULL,
        "tmdbId" integer NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_watch_session_candidate_session_tmdb" UNIQUE ("sessionId", "tmdbId"),
        CONSTRAINT "FK_watch_session_candidate_session"
          FOREIGN KEY ("sessionId") REFERENCES "watch_session"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "watch_session_ballot" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "sessionId" integer NOT NULL,
        "candidateId" integer NOT NULL,
        "userId" integer NOT NULL,
        "decision" varchar(8) NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_watch_session_ballot_session_candidate_user"
          UNIQUE ("sessionId", "candidateId", "userId"),
        CONSTRAINT "FK_watch_session_ballot_session"
          FOREIGN KEY ("sessionId") REFERENCES "watch_session"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_watch_session_ballot_candidate"
          FOREIGN KEY ("candidateId") REFERENCES "watch_session_candidate"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_watch_session_ballot_user"
          FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_watch_session_ballot_candidate" ON "watch_session_ballot" ("candidateId", "decision")'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "watch_session_ballot"');
    await queryRunner.query('DROP TABLE "watch_session_candidate"');
    await queryRunner.query('DROP TABLE "watch_session_invite"');
    await queryRunner.query('DROP TABLE "watch_session_member"');
    await queryRunner.query('DROP TABLE "watch_session"');
  }
}
