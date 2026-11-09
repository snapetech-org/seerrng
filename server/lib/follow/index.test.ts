import { getRepository } from '@server/datasource';
import Follow from '@server/entity/Follow';
import FollowEvent from '@server/entity/FollowEvent';
import { User } from '@server/entity/User';
import { setupTestDb } from '@server/test/db';
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { FOLLOW_ADAPTERS } from './adapters';
import { evaluateFollow } from './index';

setupTestDb();
afterEach(() => mock.restoreAll());
describe('follow event persistence', () => {
  it('does not advance the cursor after a transient event write failure', async () => {
    const user = await getRepository(User).findOneByOrFail({
      email: 'friend@seerr.dev',
    });
    const follow = await getRepository(Follow).save(
      new Follow({
        user,
        kind: 'tmdb-person',
        subjectKey: 'tmdb:person:99',
        subjectLabel: 'Fixture Person',
      })
    );
    mock.method(FOLLOW_ADAPTERS, 'tmdb-person', async () => ({
      events: [
        {
          dedupeKey: 'fixture',
          title: 'Fixture Film',
          reasonKey: 'newVideoTitle' as const,
        },
      ],
      cursor: { known: ['movie:1'] },
    }));
    mock.method(getRepository(FollowEvent), 'save', async () => {
      throw new Error('temporary event write failure');
    });
    await assert.rejects(
      evaluateFollow(follow),
      /temporary event write failure/
    );
    const stored = await getRepository(Follow).findOneByOrFail({
      id: follow.id,
    });
    assert.equal(stored.lastCheckedAt, null);
    assert.equal(stored.cursor, null);
  });
  it('consumes an existing duplicate without creating another event', async () => {
    const user = await getRepository(User).findOneByOrFail({
      email: 'friend@seerr.dev',
    });
    const follow = await getRepository(Follow).save(
      new Follow({
        user,
        kind: 'tmdb-person',
        subjectKey: 'tmdb:person:99',
        subjectLabel: 'Fixture Person',
      })
    );
    await getRepository(FollowEvent).save(
      new FollowEvent({
        user,
        follow,
        dedupeKey: 'fixture',
        title: 'Fixture Film',
        reasonKey: 'newVideoTitle',
      })
    );
    mock.method(FOLLOW_ADAPTERS, 'tmdb-person', async () => ({
      events: [
        {
          dedupeKey: 'fixture',
          title: 'Fixture Film',
          reasonKey: 'newVideoTitle' as const,
        },
      ],
      cursor: { known: ['movie:1'] },
    }));
    assert.equal(await evaluateFollow(follow), 0);
    assert.equal(await getRepository(FollowEvent).count(), 1);
    const stored = await getRepository(Follow).findOneByOrFail({
      id: follow.id,
    });
    assert(stored.lastCheckedAt);
    assert.deepEqual(stored.cursor, { known: ['movie:1'] });
  });
});

describe('follow admission', () => {
  it('serializes the shared quota and still permits idempotent updates at capacity', async () => {
    const { upsertFollow } = await import('./index');
    const { Permission } = await import('@server/lib/permissions');
    await getRepository(User).update(2, { permissions: Permission.REQUEST });
    const user = await getRepository(User).findOneByOrFail({ id: 2 });
    const repo = getRepository(Follow);
    await repo.save(
      Array.from(
        { length: 199 },
        (_, i) =>
          new Follow({
            user,
            kind: 'artist-release-type',
            subjectKey: `fixture:${i}`,
            subjectLabel: 'Fixture',
          })
      )
    );
    const input = {
      userId: 2,
      kind: 'artist-release-type' as const,
      subjectLabel: 'Final artist',
    };
    const results = await Promise.allSettled([
      upsertFollow({ ...input, subjectKey: 'last-a' }),
      upsertFollow({ ...input, subjectKey: 'last-b' }),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(await repo.count({ where: { user: { id: 2 } } }), 200);
    const existing = results.find((r) => r.status === 'fulfilled');
    assert.ok(existing && existing.status === 'fulfilled');
    await upsertFollow({
      ...input,
      subjectKey: existing.value.subjectKey,
      subjectLabel: 'Updated',
    });
    assert.equal(await repo.count({ where: { user: { id: 2 } } }), 200);
  });
});
