import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import type AudiobookshelfPodcastsAPI from '@server/api/audiobookshelfPodcasts';
import {
  absUserIdFor,
  clearAbsUserCache,
  followShow,
  showVisibleTo,
  sweepPodcastFollowers,
  unfollowShow,
} from '@server/lib/podcastFollowers';
import { getSettings } from '@server/lib/settings';

type Show = { tags: string[] };

const fakeAbs = (
  shows: Record<string, Show>,
  options: {
    deleteStatus?: number;
    onSetTags?: (itemId: string, tags: string[]) => void;
  } = {}
) => {
  const calls = { deleted: [] as string[], tagged: [] as string[] };
  const api = {
    cacheKey: () => 'abs-test',
    getUsers: async () => [
      { id: 'root-id', username: 'owner', email: null, type: 'root' },
      {
        id: 'gayle-id',
        username: 'Gcunnin',
        email: 'Gayle.Cunningham@example.com',
        type: 'user',
      },
    ],
    getItemTags: async (itemId: string) =>
      shows[itemId] ? [...shows[itemId].tags] : null,
    setItemTags: async (itemId: string, tags: string[]) => {
      calls.tagged.push(itemId);
      shows[itemId].tags = [...tags];
      options.onSetTags?.(itemId, tags);
    },
    deletePodcastItem: async (itemId: string) => {
      if (options.deleteStatus) {
        throw Object.assign(new Error('refused'), {
          response: { status: options.deleteStatus },
        });
      }
      calls.deleted.push(itemId);
      delete shows[itemId];
    },
    getLibraries: async () => [
      { id: 'pods', name: 'Podcasts', mediaType: 'podcast', folders: [] },
    ],
    getPodcastLibraryItems: async () => ({
      results: Object.entries(shows).map(([id, show]) => ({
        id,
        tags: [...show.tags],
      })),
      total: Object.keys(shows).length,
      limit: 100,
      page: 0,
    }),
  };
  return { api: api as unknown as AudiobookshelfPodcastsAPI, calls };
};

describe('podcast followers', () => {
  beforeEach(() => {
    clearAbsUserCache();
    getSettings().podcastFollowers = { links: {}, pendingDeletes: [] };
  });
  afterEach(() => {
    getSettings().podcastFollowers = { links: {}, pendingDeletes: [] };
  });

  it('links people by the email Wizarr put on their account, and the owner to root', async () => {
    const { api } = fakeAbs({});
    assert.equal(
      await absUserIdFor(api, { id: 2, email: 'gayle.cunningham@EXAMPLE.com' }),
      'gayle-id'
    );
    assert.equal(await absUserIdFor(api, { id: 1, email: 'x@y.z' }), 'root-id');
    assert.equal(await absUserIdFor(api, { id: 7, email: 'nobody@y.z' }), null);
    getSettings().podcastFollowers = {
      links: { '7': 'chosen-id' },
      pendingDeletes: [],
    };
    assert.equal(await absUserIdFor(api, { id: 7, email: null }), 'chosen-id');
  });

  it('shows a linked person their shows and the unclaimed ones', () => {
    assert.equal(showVisibleTo([], 'me'), true);
    assert.equal(showVisibleTo(['follower:me', 'follower:you'], 'me'), true);
    assert.equal(showVisibleTo(['follower:you'], 'me'), false);
    assert.equal(showVisibleTo(['follower:you'], null), true);
  });

  it('follows by adding a tag and keeps the other tags', async () => {
    const shows = { a: { tags: ['news', 'follower:you'] } };
    const { api } = fakeAbs(shows);
    await followShow(api, 'a', 'me');
    await followShow(api, 'a', 'me');
    assert.deepEqual(shows.a.tags, ['news', 'follower:you', 'follower:me']);
  });

  it('unfollowing a shared show only takes the tag away', async () => {
    const shows = { a: { tags: ['follower:me', 'follower:you'] } };
    const { api, calls } = fakeAbs(shows);
    assert.equal(await unfollowShow(api, 'a', 'me', false), 'unfollowed');
    assert.deepEqual(shows.a.tags, ['follower:you']);
    assert.deepEqual(calls.deleted, []);
  });

  it('the last follower must agree before the show is removed', async () => {
    const shows: Record<string, Show> = { a: { tags: ['follower:me'] } };
    const { api, calls } = fakeAbs(shows);
    assert.equal(await unfollowShow(api, 'a', 'me', false), 'wouldRemove');
    assert.deepEqual(calls.tagged, []);
    assert.equal(await unfollowShow(api, 'a', 'me', true), 'removed');
    assert.deepEqual(calls.deleted, ['a']);
  });

  it('keeps the show when someone followed it in the meantime', async () => {
    const shows: Record<string, Show> = { a: { tags: ['follower:me'] } };
    const { api, calls } = fakeAbs(shows, {
      onSetTags: (itemId) => {
        shows[itemId].tags = ['follower:you'];
      },
    });
    assert.equal(await unfollowShow(api, 'a', 'me', true), 'unfollowed');
    assert.deepEqual(calls.deleted, []);
  });

  it('leaves the show when Audiobookshelf refuses to remove it', async () => {
    const shows: Record<string, Show> = { a: { tags: ['follower:me'] } };
    const { api } = fakeAbs(shows, { deleteStatus: 403 });
    assert.equal(await unfollowShow(api, 'a', 'me', true), 'kept');
    assert.deepEqual(getSettings().podcastFollowers.pendingDeletes, []);
  });

  it('the hourly sweep finishes removals and gives unclaimed shows to the owner', async () => {
    const shows: Record<string, Show> = {
      gone: { tags: [] },
      fresh: { tags: ['news'] },
      claimed: { tags: ['follower:you'] },
    };
    getSettings().podcastFollowers = {
      links: {},
      pendingDeletes: ['gone', 'already-gone'],
    };
    const { api, calls } = fakeAbs(shows);
    assert.deepEqual(await sweepPodcastFollowers(api), {
      tagged: 1,
      removed: 1,
    });
    assert.deepEqual(calls.deleted, ['gone']);
    assert.deepEqual(shows.fresh.tags, ['news', 'follower:root-id']);
    assert.deepEqual(shows.claimed.tags, ['follower:you']);
    assert.deepEqual(getSettings().podcastFollowers.pendingDeletes, []);
  });
});
