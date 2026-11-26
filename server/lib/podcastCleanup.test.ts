import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import AudiobookshelfPodcastsAPI, {
  type AbsEpisodeProgress,
} from '@server/api/audiobookshelfPodcasts';
import {
  finishedForShow,
  pickEpisodesToRemove,
  runPodcastCleanup,
} from '@server/lib/podcastCleanup';
import { getSettings } from '@server/lib/settings';

const ep = (id: string, day: number) => ({
  id,
  publishedAt: Date.UTC(2026, 10, day),
});

const progress = (
  finished: Record<string, string[]>,
  started: Record<string, string[]> = {},
  complete = true
): AbsEpisodeProgress => ({
  finished: new Map(
    Object.entries(finished).map(([id, eps]) => [id, new Set(eps)])
  ),
  started: new Map(
    Object.entries(started).map(([id, eps]) => [id, new Set(eps)])
  ),
  complete,
});

describe('pickEpisodesToRemove', () => {
  it('removes played episodes only once four newer episodes are in', () => {
    const episodes = [
      ep('e1', 1),
      ep('e2', 2),
      ep('e3', 3),
      ep('e4', 4),
      ep('e5', 5),
      ep('e6', 6),
    ];
    // newest first: e6 e5 e4 e3 | e2 e1 -> e2 and e1 have four newer episodes
    assert.deepStrictEqual(
      pickEpisodesToRemove(episodes, new Set(['e1', 'e2', 'e5'])),
      ['e2', 'e1']
    );
    // unplayed episodes stay, however old
    assert.deepStrictEqual(pickEpisodesToRemove(episodes, new Set(['e3'])), []);
    // fewer than five episodes: nothing qualifies
    assert.deepStrictEqual(
      pickEpisodesToRemove(episodes.slice(0, 4), new Set(['e1', 'e2'])),
      []
    );
  });

  it('keeps an episode someone else is still listening to', () => {
    const episodes = [1, 2, 3, 4, 5, 6].map((day) => ep(`e${day}`, day));
    // e1 and e2 were finished by one person; another is half way into e1
    assert.deepStrictEqual(
      pickEpisodesToRemove(episodes, new Set(['e1', 'e2']), 4, new Set(['e1'])),
      ['e2']
    );
  });

  it('never removes undated episodes and counts them as newest', () => {
    const episodes = [
      ...[1, 2, 3, 4, 5].map((day) => ep(`e${day}`, day)),
      { id: 'undated', publishedAt: null },
    ];
    // undated is treated as the newest: e5 e4 e3 | e2 e1 qualify by position
    assert.deepStrictEqual(
      pickEpisodesToRemove(episodes, new Set(['undated', 'e2', 'e1'])),
      ['e2', 'e1']
    );
  });
});

describe('runPodcastCleanup', () => {
  afterEach(() => mock.restoreAll());

  const configure = (
    t: { after: (fn: () => void) => void },
    itemIds: string[]
  ) => {
    const settings = getSettings();
    const originalAbs = settings.audiobookshelf;
    const originalCleanup = settings.podcastCleanup;
    t.after(() => {
      settings.audiobookshelf = originalAbs;
      settings.podcastCleanup = originalCleanup;
    });
    settings.audiobookshelf = {
      id: 1,
      name: 'ABS',
      hostname: 'abs.local',
      port: 13378,
      apiKey: 'k',
      useSsl: false,
      libraryId: 'books',
      libraryName: 'Books',
      syncEnabled: true,
    };
    settings.podcastCleanup = { itemIds };
    // settings are not written to disk in tests
    mock.method(settings, 'save', async () => undefined);
    return settings;
  };

  const showItems = () =>
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastItem',
      async (id: string) => ({
        id,
        title: id,
        episodes: [1, 2, 3, 4, 5].map((day) => ep(`${id[5]}${day}`, day)),
      })
    );

  const recordDeletes = () => {
    const deleted: string[] = [];
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'deleteEpisode',
      async (itemId: string, episodeId: string) => {
        deleted.push(`${itemId}/${episodeId}`);
      }
    );
    return deleted;
  };

  it('deletes played episodes of enabled shows and skips the rest', async (t) => {
    configure(t, ['show-a']);
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getEpisodeProgress',
      async () => progress({ 'show-a': ['a1'], 'show-b': ['b1'] })
    );
    showItems();
    const deleted = recordDeletes();

    const result = await runPodcastCleanup();
    assert.deepStrictEqual(deleted, ['show-a/a1']); // show-b is not switched on
    assert.strictEqual(result.removed, 1);
  });

  it('keeps an episode another user has in progress', async (t) => {
    configure(t, ['show-a']);
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getEpisodeProgress',
      async () => progress({ 'show-a': ['a1'] }, { 'show-a': ['a1'] })
    );
    showItems();
    const deleted = recordDeletes();

    assert.deepStrictEqual(await runPodcastCleanup(), { removed: 0 });
    assert.deepStrictEqual(deleted, []);
  });

  it('deletes nothing when any user progress could not be read', async (t) => {
    configure(t, ['show-a']);
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getEpisodeProgress',
      async () => progress({ 'show-a': ['a1'] }, {}, false)
    );
    const items = showItems();
    const deleted = recordDeletes();

    assert.deepStrictEqual(await runPodcastCleanup(), { removed: 0 });
    assert.deepStrictEqual(deleted, []);
    assert.strictEqual(items.mock.callCount(), 0);
  });

  it('runs one cleanup at a time', async (t) => {
    configure(t, ['show-a']);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reads = mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getEpisodeProgress',
      async () => {
        await gate;
        return progress({ 'show-a': ['a1'] });
      }
    );
    showItems();
    const deleted = recordDeletes();

    const first = runPodcastCleanup();
    const second = runPodcastCleanup();
    assert.strictEqual(first, second);
    release();
    assert.deepStrictEqual(await first, { removed: 1 });
    assert.strictEqual(reads.mock.callCount(), 1);
    assert.deepStrictEqual(deleted, ['show-a/a1']);
  });

  it('forgets shows that are gone from Audiobookshelf', async (t) => {
    const settings = configure(t, ['show-a', 'gone-1']);
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getEpisodeProgress',
      async () => progress({})
    );
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastItem',
      async (id: string) =>
        id === 'gone-1' ? null : { id, title: id, episodes: [] }
    );

    await runPodcastCleanup();
    assert.deepStrictEqual(settings.podcastCleanup.itemIds, ['show-a']);
  });

  it('does nothing when no show is switched on', async (t) => {
    const settings = getSettings();
    const original = settings.podcastCleanup;
    t.after(() => {
      settings.podcastCleanup = original;
    });
    settings.podcastCleanup = { itemIds: [] };
    const read = mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getEpisodeProgress',
      async () => progress({})
    );
    assert.deepStrictEqual(await runPodcastCleanup(), { removed: 0 });
    assert.strictEqual(read.mock.callCount(), 0);
  });

  it('waits for every follower of a show to finish an episode', async (t) => {
    configure(t, ['show-a']);
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getEpisodeProgress',
      async () => ({
        ...progress({ 'show-a': ['a1', 'a2'] }),
        finishedBy: new Map([
          [
            'show-a',
            new Map([
              ['a1', new Set(['nick'])],
              ['a2', new Set(['nick', 'guest'])],
            ]),
          ],
        ]),
        userIds: new Set(['nick', 'guest']),
      })
    );
    mock.method(
      AudiobookshelfPodcastsAPI.prototype,
      'getPodcastItem',
      async (id: string) => ({
        id,
        title: id,
        tags: ['follower:nick', 'follower:guest', 'follower:deleted-user'],
        episodes: [1, 2, 3, 4, 5, 6].map((day) => ep(`a${day}`, day)),
      })
    );
    const deleted = recordDeletes();

    // a1: only Nick finished it, so the guest keeps it; a2: both did
    assert.deepStrictEqual(await runPodcastCleanup(), { removed: 1 });
    assert.deepStrictEqual(deleted, ['show-a/a2']);
  });
});

describe('finishedForShow', () => {
  const p = (): AbsEpisodeProgress => ({
    ...progress({ show: ['e1', 'e2'] }),
    finishedBy: new Map([
      [
        'show',
        new Map([
          ['e1', new Set(['a'])],
          ['e2', new Set(['a', 'b'])],
        ]),
      ],
    ]),
    userIds: new Set(['a', 'b']),
  });

  it('uses anyone finishing it when nobody follows the show', () => {
    assert.deepStrictEqual(
      [...(finishedForShow(p(), 'show', []) ?? [])],
      ['e1', 'e2']
    );
  });

  it('needs every follower, ignoring followers who are no longer users', () => {
    assert.deepStrictEqual(
      [...(finishedForShow(p(), 'show', ['follower:a', 'follower:b']) ?? [])],
      ['e2']
    );
    assert.deepStrictEqual(
      [
        ...(finishedForShow(p(), 'show', ['follower:a', 'follower:gone']) ??
          []),
      ],
      ['e1', 'e2']
    );
  });

  it('removes nothing for a followed show when who finished is unknown', () => {
    const progressOnly = progress({ show: ['e1'] });
    assert.strictEqual(
      finishedForShow(progressOnly, 'show', ['follower:a']),
      undefined
    );
  });
});
