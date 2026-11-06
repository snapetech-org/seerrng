import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWatchSessions1793484786000 implements MigrationInterface {
  name = 'CreateWatchSessions1793484786000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "watch_session" (
        "id" SERIAL NOT NULL,
        "ownerId" integer NOT NULL,
        "title" character varying(80) NOT NULL,
        "status" character varying(12) NOT NULL DEFAULT 'draft',
        "memberCount" integer NOT NULL DEFAULT 1,
        "filters" text NOT NULL,
        "nextDiscoverPage" integer NOT NULL DEFAULT 1,
        "watchlistCandidatesLoaded" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "startedAt" TIMESTAMP WITH TIME ZONE,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_watch_session" PRIMARY KEY ("id"),
        CONSTRAINT "FK_watch_session_owner"
          FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_watch_session_owner_status_expiry" ON "watch_session" ("ownerId", "status", "expiresAt")'
    );

    await queryRunner.query(`
      CREATE TABLE "watch_session_member" (
        "id" SERIAL NOT NULL,
        "sessionId" integer NOT NULL,
        "userId" integer NOT NULL,
        "role" character varying(8) NOT NULL DEFAULT 'member',
        "includeWatchlistContributions" boolean NOT NULL DEFAULT false,
        "joinedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "leftAt" TIMESTAMP WITH TIME ZONE,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_watch_session_member" PRIMARY KEY ("id"),
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
        "id" SERIAL NOT NULL,
        "sessionId" integer NOT NULL,
        "createdByUserId" integer NOT NULL,
        "tokenHash" character varying(64) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "claimedAt" TIMESTAMP WITH TIME ZONE,
        "claimedByUserId" integer,
        "revokedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_watch_session_invite" PRIMARY KEY ("id"),
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
        "id" SERIAL NOT NULL,
        "sessionId" integer NOT NULL,
        "tmdbId" integer NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_watch_session_candidate" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_watch_session_candidate_session_tmdb" UNIQUE ("sessionId", "tmdbId"),
        CONSTRAINT "FK_watch_session_candidate_session"
          FOREIGN KEY ("sessionId") REFERENCES "watch_session"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "watch_session_ballot" (
        "id" SERIAL NOT NULL,
        "sessionId" integer NOT NULL,
        "candidateId" integer NOT NULL,
        "userId" integer NOT NULL,
        "decision" character varying(8) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_watch_session_ballot" PRIMARY KEY ("id"),
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
