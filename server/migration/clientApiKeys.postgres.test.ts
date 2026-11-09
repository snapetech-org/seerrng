import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { DataSource, getMetadataArgsStorage } from 'typeorm';

const postgresUrl = process.env.SEERR_TEST_POSTGRES_URL;
const postgresTest = postgresUrl ? test : test.skip;

postgresTest(
  'PostgreSQL client tokens migrate, authenticate, expire and revoke',
  async (t) => {
    const originalDbType = process.env.DB_TYPE;
    process.env.DB_TYPE = 'postgres';
    const schema = `client_tokens_test_${randomBytes(8).toString('hex')}`;
    let source: DataSource | undefined;
    try {
      // Match production PostgreSQL metadata before importing the entities.
      const entityDirectory = join(process.cwd(), 'server/entity');
      for (const file of await readdir(entityDirectory)) {
        if (file.endsWith('.ts') && !file.endsWith('.test.ts')) {
          await import(join(entityDirectory, file));
        }
      }
      const entities = [
        ...new Set(
          getMetadataArgsStorage()
            .tables.map(({ target }) => target)
            .filter(
              (target): target is new (...args: never[]) => unknown =>
                typeof target === 'function'
            )
        ),
      ];
      source = await new DataSource({
        type: 'postgres',
        url: postgresUrl,
        schema,
        entities,
        synchronize: false,
        extra: { options: '-c timezone=Pacific/Auckland' },
      }).initialize();
      await source.query(`CREATE SCHEMA "${schema}"`);
      await source.synchronize();
      const runner = source.createQueryRunner();
      await runner.connect();
      try {
        // Migration SQL uses the configured search path in production.
        await runner.query(`SET search_path TO "${schema}"`);
        await runner.query('DROP TABLE client_api_key');
        const { CreateClientApiKeys1794222000000 } =
          await import('./postgres/1794222000000-CreateClientApiKeys');
        const migration = new CreateClientApiKeys1794222000000();
        await migration.up(runner);
        const { default: applicationSource } =
          await import('@server/datasource');
        t.mock.method(
          applicationSource,
          'getRepository',
          source.getRepository.bind(source)
        );
        const { User } = await import('@server/entity/User');
        const { ClientApiKey } = await import('@server/entity/ClientApiKey');
        const { authenticateClientApiKey, hashClientApiKey } =
          await import('@server/lib/clientApiKeys');
        const users = source.getRepository(User);
        const keys = source.getRepository(ClientApiKey);
        const user = await users.save(
          users.create({
            email: 'postgres-token@example.test',
            avatar: '',
            permissions: 8,
          })
        );
        const token = `sngc_${randomBytes(32).toString('base64url')}`;
        const expiresAt = new Date(Date.now() + 86400000);
        const key = await keys.save(
          keys.create({
            user,
            name: 'PostgreSQL fixture',
            scopes: ['discover'],
            tokenHash: hashClientApiKey(token),
            credentialVersion: '0',
            expiresAt,
          })
        );
        assert.equal(
          (await keys.findOneByOrFail({ id: key.id })).expiresAt.toISOString(),
          expiresAt.toISOString()
        );
        assert.equal(
          (await authenticateClientApiKey(token, 'GET', '/auth/me'))?.id,
          user.id
        );
        assert.equal(
          await authenticateClientApiKey(token, 'GET', '/settings/main'),
          null
        );
        assert.equal(
          await authenticateClientApiKey(token, 'POST', '/request'),
          null
        );
        assert.equal(
          (await keys.findOneByOrFail({ id: key.id })).tokenHash,
          undefined
        );
        await assert.rejects(
          keys.save(
            keys.create({
              user,
              name: 'Duplicate',
              scopes: ['discover'],
              tokenHash: hashClientApiKey(token),
              credentialVersion: '0',
              expiresAt,
            })
          ),
          /unique constraint/i
        );
        await keys.update(key.id, { expiresAt: new Date(Date.now() - 1000) });
        assert.equal(
          await authenticateClientApiKey(token, 'GET', '/auth/me'),
          null
        );
        await keys.update(key.id, { expiresAt });
        await users.update(user.id, { passwordChangedAt: new Date() });
        assert.equal(
          await authenticateClientApiKey(token, 'GET', '/auth/me'),
          null
        );
        await users.update(user.id, { passwordChangedAt: null });
        await keys.delete(key.id);
        assert.equal(
          await authenticateClientApiKey(token, 'GET', '/auth/me'),
          null
        );
        await keys.save(
          keys.create({
            user,
            name: 'Cascade',
            scopes: ['discover'],
            tokenHash: hashClientApiKey(token),
            credentialVersion: '0',
            expiresAt,
          })
        );
        await users.delete(user.id);
        assert.equal(await keys.count(), 0);
        await migration.down(runner);
        assert.equal(await runner.hasTable(`${schema}.client_api_key`), false);
        await migration.up(runner);
        assert.equal(await keys.count(), 0);
      } finally {
        await runner.release();
      }
    } finally {
      t.mock.restoreAll();
      if (source?.isInitialized) {
        // Only the random schema created by this test is ever dropped.
        await source.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await source.destroy();
      }
      if (originalDbType === undefined) delete process.env.DB_TYPE;
      else process.env.DB_TYPE = originalDbType;
    }
  }
);
