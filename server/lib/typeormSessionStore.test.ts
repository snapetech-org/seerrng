import { Session } from '@server/entity/Session';
import express from 'express';
import type { SessionData } from 'express-session';
import sessionMiddleware from 'express-session';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { TypeormSessionStore } from './typeormSessionStore';

const setSession = (
  store: TypeormSessionStore,
  sid: string,
  session: SessionData
) =>
  new Promise<void>((resolve, reject) => {
    store.set(sid, session, (error?: unknown) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

const getSession = (store: TypeormSessionStore, sid: string) =>
  new Promise<SessionData | null>((resolve, reject) => {
    store.get(sid, (error, session) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(session ?? null);
    });
  });

const destroySession = (store: TypeormSessionStore, sid: string | string[]) =>
  new Promise<void>((resolve, reject) => {
    store.destroy(sid, (error?: unknown) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

test('TypeormSessionStore persists, renews, expires, and destroys sessions', async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'seerr-typeorm-session-store-')
  );
  const source = new DataSource({
    type: 'better-sqlite3',
    database: path.join(directory, 'sessions.sqlite3'),
    entities: [Session],
    synchronize: true,
  });

  try {
    await source.initialize();
    const store = new TypeormSessionStore(source.getRepository(Session), {
      cleanupLimit: 2,
      ttl: 60,
    });
    const session = {
      cookie: { maxAge: 60_000 },
      userId: 42,
    } as SessionData;

    await setSession(store, 'session-a', session);
    assert.deepStrictEqual(await getSession(store, 'session-a'), session);

    await setSession(store, 'session-a', {
      ...session,
      userId: 43,
    });
    assert.equal(
      await source.getRepository(Session).count({ where: { id: 'session-a' } }),
      1
    );
    assert.equal((await getSession(store, 'session-a'))?.userId, 43);

    await source.getRepository(Session).insert({
      id: 'expired-session',
      expiredAt: Date.now() - 1,
      json: '{}',
    });
    await setSession(store, 'session-b', session);
    assert.equal(
      await source.getRepository(Session).count({
        where: { id: 'expired-session' },
        withDeleted: true,
      }),
      0
    );

    await destroySession(store, ['session-a', 'session-b']);
    assert.equal(await getSession(store, 'session-a'), null);
    assert.equal(await getSession(store, 'session-b'), null);
  } finally {
    if (source.isInitialized) await source.destroy();
    await fs.rm(directory, { force: true, recursive: true });
  }
});

const touchSession = (
  store: TypeormSessionStore,
  sid: string,
  session: SessionData
) =>
  new Promise<void>((resolve, reject) => {
    store.touch(sid, session, (error?: unknown) =>
      error ? reject(error) : resolve()
    );
  });

test('retained sessions expire at the boundary and cannot be renewed by touch', async (t) => {
  const source = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [Session],
    synchronize: true,
  });
  const now = 2_000_000_000_000;
  t.mock.method(Date, 'now', () => now);
  try {
    await source.initialize();
    const repository = source.getRepository(Session);
    const store = new TypeormSessionStore(repository);
    const session = { cookie: { maxAge: 60_000 }, userId: 42 } as SessionData;
    for (const [id, expiredAt] of [
      ['past', now - 1],
      ['boundary', now],
      ['future', now + 1],
    ] as const) {
      await repository.insert({ id, expiredAt, json: JSON.stringify(session) });
    }
    assert.equal(await getSession(store, 'past'), null);
    assert.equal(await getSession(store, 'boundary'), null);
    assert.equal((await getSession(store, 'future'))?.userId, 42);
    for (const id of ['past', 'boundary']) {
      const before = (await repository.findOneByOrFail({ id })).expiredAt;
      await touchSession(store, id, session);
      assert.equal(
        (await repository.findOneByOrFail({ id })).expiredAt,
        before
      );
      assert.equal(await getSession(store, id), null);
    }
    await touchSession(store, 'future', session);
    assert.equal(
      (await repository.findOneByOrFail({ id: 'future' })).expiredAt,
      now + 60_000
    );
    await destroySession(store, 'future');
    await touchSession(store, 'future', session);
    assert.equal(await getSession(store, 'future'), null);
    assert.equal(await getSession(store, 'missing'), null);
  } finally {
    t.mock.restoreAll();
    if (source.isInitialized) await source.destroy();
  }
});

test('native signed session replay is rejected after expiry and after reopening storage', async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'seerr-session-replay-')
  );
  const source = new DataSource({
    type: 'better-sqlite3',
    database: path.join(directory, 'sessions.sqlite3'),
    entities: [Session],
    synchronize: true,
  });
  const sessionSecret = randomBytes(32).toString('hex');
  let server: ReturnType<ReturnType<typeof express>['listen']> | undefined;
  try {
    await source.initialize();
    const start = async () => {
      const app = express();
      app.use(
        sessionMiddleware({
          secret: sessionSecret,
          resave: false,
          saveUninitialized: false,
          store: new TypeormSessionStore(source.getRepository(Session)),
          cookie: { maxAge: 60_000 },
        })
      );
      app.post('/login', (request, response) => {
        request.session.userId = 42;
        request.session.save((error) => response.sendStatus(error ? 500 : 200));
      });
      app.get('/me', (request, response) =>
        response.sendStatus(request.session.userId === 42 ? 200 : 401)
      );
      server = app.listen(0, '127.0.0.1');
      await once(server, 'listening');
      return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    };
    const stop = async () => {
      if (!server) return;
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server!.close((error) => (error ? reject(error) : resolve()))
      );
      server = undefined;
    };
    let base = await start();
    assert.equal((await request(base).get('/me')).status, 401);
    // A dedicated HTTP client keeps the replay test independent of the global
    // fetch connection pool when the fixture server is closed and reopened.
    const login = await request(base).post('/login');
    assert.equal(login.status, 200);
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    assert.equal(
      (await request(base).get('/me').set('Cookie', cookie)).status,
      200
    );
    const repository = source.getRepository(Session);
    const record = (await repository.find())[0];
    const expiredAt = Date.now() - 60_000;
    const data = JSON.parse(record.json);
    data.cookie.expires = new Date(expiredAt).toISOString();
    await repository.update(
      { id: record.id },
      { expiredAt, json: JSON.stringify(data) }
    );
    assert.equal(
      (await request(base).get('/me').set('Cookie', cookie)).status,
      401
    );
    assert.equal(
      (await repository.findOneByOrFail({ id: record.id })).expiredAt,
      expiredAt
    );
    await stop();
    await source.destroy();
    await source.initialize();
    base = await start();
    assert.equal(
      (await request(base).get('/me').set('Cookie', cookie)).status,
      401
    );
    assert.equal(
      (await source.getRepository(Session).findOneByOrFail({ id: record.id }))
        .expiredAt,
      expiredAt
    );
    await stop();
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    if (source.isInitialized) await source.destroy();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
