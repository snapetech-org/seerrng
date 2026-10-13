import assert from 'node:assert/strict';
import test from 'node:test';
import { DataSource } from 'typeorm';
import { DropPushSubscriptionAuthUnique1781700000000 } from './1781700000000-DropPushSubscriptionAuthUnique';
import { DropPushSubscriptionAuthUnique1786619443939 } from './1786619443939-DropPushSubscriptionAuthUnique';

const userIdIndex = 'IDX_03f7958328e311761b0de675fb';
const sharedAuth = 'shared-auth';

const migrations = [
  {
    name: 'SeerrNG push subscription migration',
    create: () => new DropPushSubscriptionAuthUnique1781700000000(),
  },
  {
    name: 'Seerr push subscription migration',
    create: () => new DropPushSubscriptionAuthUnique1786619443939(),
  },
];

for (const { name, create } of migrations) {
  test(`${name} handles an absent userId index in both directions`, async () => {
    const dataSource = await new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
    }).initialize();
    const queryRunner = dataSource.createQueryRunner();

    try {
      await queryRunner.query(
        `CREATE TABLE "user" ("id" integer PRIMARY KEY NOT NULL)`
      );
      await queryRunner.query(`INSERT INTO "user" ("id") VALUES (1), (2)`);
      await queryRunner.query(
        `CREATE TABLE "user_push_subscription" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "endpoint" varchar NOT NULL, "p256dh" varchar NOT NULL, "auth" varchar NOT NULL, "userId" integer, "userAgent" varchar, "createdAt" datetime DEFAULT (CURRENT_TIMESTAMP), CONSTRAINT "UQ_f90ab5a4ed54905a4bb51a7148b" UNIQUE ("auth"), CONSTRAINT "FK_03f7958328e311761b0de675fbe" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
      );
      await queryRunner.query(
        `INSERT INTO "user_push_subscription" ("endpoint", "p256dh", "auth", "userId") VALUES ('https://push.example/one', 'key-one', '${sharedAuth}', 1)`
      );

      await create().up(queryRunner);

      const indexesAfterUp = (await queryRunner.query(
        `PRAGMA index_list("user_push_subscription")`
      )) as { name: string }[];
      assert.ok(indexesAfterUp.some(({ name }) => name === userIdIndex));
      await queryRunner.query(
        `INSERT INTO "user_push_subscription" ("endpoint", "p256dh", "auth", "userId") VALUES ('https://push.example/two', 'key-two', '${sharedAuth}', 2)`
      );
      assert.equal(
        (
          (await queryRunner.query(
            `SELECT COUNT(*) AS "count" FROM "user_push_subscription" WHERE "auth" = '${sharedAuth}'`
          )) as { count: number }[]
        )[0].count,
        2
      );

      await queryRunner.query(
        `DELETE FROM "user_push_subscription" WHERE "userId" = 2`
      );
      await queryRunner.query(`DROP INDEX "${userIdIndex}"`);
      await create().down(queryRunner);

      const indexesAfterDown = (await queryRunner.query(
        `PRAGMA index_list("user_push_subscription")`
      )) as { name: string }[];
      assert.ok(indexesAfterDown.some(({ name }) => name === userIdIndex));
      await assert.rejects(
        queryRunner.query(
          `INSERT INTO "user_push_subscription" ("endpoint", "p256dh", "auth", "userId") VALUES ('https://push.example/three', 'key-three', '${sharedAuth}', 2)`
        )
      );
      assert.equal(
        (
          (await queryRunner.query(
            `SELECT COUNT(*) AS "count" FROM "user_push_subscription"`
          )) as { count: number }[]
        )[0].count,
        1
      );
    } finally {
      await queryRunner.release();
      await dataSource.destroy();
    }
  });
}
