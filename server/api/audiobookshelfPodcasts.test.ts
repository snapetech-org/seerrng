import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { describe, it } from 'node:test';

import AudiobookshelfPodcastsAPI, {
  AudiobookshelfAuthError,
  AudiobookshelfRequestError,
  decodeHtmlEntities,
  normalizeFeedUrl,
  parseDurationSeconds,
  safePodcastTitle,
  stripHtml,
} from '@server/api/audiobookshelfPodcasts';
import { loadPublicPodcastFeed } from '@server/lib/podcastFeed';
import {
  createProxyUrls,
  originalFeedUrl,
  originalMediaUrl,
} from '@server/lib/podcastProxy';
import type { AudiobookshelfSettings } from '@server/lib/settings';

const makeSettings = (
  port: number,
  overrides: Partial<AudiobookshelfSettings> = {}
): AudiobookshelfSettings => ({
  id: 1,
  name: 'Test Audiobookshelf',
  hostname: '127.0.0.1',
  port,
  apiKey: 'abs-podcast-token',
  useSsl: false,
  baseUrl: '/abs',
  libraryId: 'books',
  libraryName: 'Books',
  syncEnabled: true,
  ...overrides,
});

const PROXY_ORIGIN = 'http://seerr.lan:5055';
const testProxy = () => createProxyUrls(PROXY_ORIGIN, 'test-secret');

describe('podcast utility helpers', () => {
  it('strips HTML tags, decodes common entities safely, collapses whitespace, and bounds length', () => {
    assert.equal(
      stripHtml(
        '<p>Hello &amp; <strong>welcome</strong>&nbsp;to &quot;Pod&#39;s&quot; &lt;Show&gt;!</p>'
      ),
      'Hello & welcome to "Pod\'s" <Show>!'
    );
    // double-escaped markup is removed, not shown as literal tags
    assert.equal(stripHtml('&amp;lt;b&amp;gt;safe&amp;lt;/b&amp;gt;'), 'safe');
    assert.equal(
      stripHtml('&lt;p&gt;Hi&lt;/p&gt;&lt;br/&gt;there'),
      'Hi there'
    );
    assert.equal(stripHtml('   line1\n\tline2   '), 'line1 line2');
    // cut text ends with an ellipsis that counts toward the limit
    assert.equal(stripHtml('abcdef', 4), 'abc…');
    assert.equal(stripHtml('ab  cd', 3), 'ab…');
    assert.equal(stripHtml('abcd', 4), 'abcd');
  });

  it('decodes numeric and named entities that feeds use', () => {
    assert.equal(
      stripHtml(
        'It&#8217;s back &#x2014; &rsquo;quoted&lsquo; &ldquo;x&rdquo;'
      ),
      'It’s back — ’quoted‘ “x”'
    );
    assert.equal(
      stripHtml('Wait&hellip; 5 &lt; 6 &mdash; caf&eacute; &Eacute;t&eacute;'),
      'Wait… 5 < 6 — café Été'
    );
    // double-escaped entity
    assert.equal(stripHtml('It&amp;#8217;s'), 'It’s');
    // unknown names and invalid code points stay as written
    assert.equal(
      stripHtml('&bogus; &#0; &#xD800; &#99999999;'),
      '&bogus; &#0; &#xD800; &#99999999;'
    );
    assert.equal(decodeHtmlEntities('&AMP;&amp;'), '&&');
  });

  it('parses itunes:duration values', () => {
    assert.equal(parseDurationSeconds(3723), 3723);
    assert.equal(parseDurationSeconds('3723'), 3723);
    assert.equal(parseDurationSeconds('62:03'), 3723);
    assert.equal(parseDurationSeconds('01:02:03'), 3723);
    assert.equal(parseDurationSeconds('1:02:03.5'), 3723);
    assert.equal(parseDurationSeconds('1:99'), null);
    assert.equal(parseDurationSeconds('soon'), null);
    assert.equal(parseDurationSeconds(''), null);
    assert.equal(parseDurationSeconds(null), null);
  });

  it('sanitizes podcast titles for filesystem folders', () => {
    assert.equal(
      safePodcastTitle('  My\\ /Pod: *cast? "Show" <1>|  \u0007 '),
      'My Pod cast Show 1'
    );
    assert.equal(safePodcastTitle('///:::***"<>|'), 'Podcast');
    assert.equal(safePodcastTitle('..'), 'Podcast');
    assert.equal(safePodcastTitle('   '), 'Podcast');
    assert.equal(safePodcastTitle('a'.repeat(150)).length, 120);
  });

  it('normalizes feed URLs by lowercasing and ignoring protocol and trailing slashes', () => {
    assert.equal(
      normalizeFeedUrl('  HTTPS://Example.COM/Feeds/Show.xml/// '),
      'example.com/feeds/show.xml'
    );
    assert.equal(
      normalizeFeedUrl('http://example.com/feeds/show.xml'),
      'example.com/feeds/show.xml'
    );
  });
});

describe('AudiobookshelfPodcastsAPI', () => {
  it('fetches libraries, paginated podcast items, item details, and cover bytes with Bearer auth', async () => {
    const requests: {
      method?: string;
      path: string;
      authorization?: string;
    }[] = [];
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      requests.push({
        method: req.method,
        path: `${url.pathname}${url.search}`,
        authorization: req.headers.authorization,
      });

      if (url.pathname === '/abs/api/libraries') {
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            libraries: [
              { id: 'books', name: 'Books', mediaType: 'book', folders: [] },
              {
                id: 'pods',
                name: 'Podcasts',
                mediaType: 'podcast',
                folders: [{ id: 'fol-1', fullPath: '/podcasts' }],
              },
            ],
          })
        );
        return;
      }

      if (url.pathname === '/abs/api/libraries/pods/items') {
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            results: [
              {
                id: 'pod-1',
                addedAt: 1700000000000,
                updatedAt: 1700000001000,
                media: {
                  numEpisodes: 12,
                  autoDownloadEpisodes: true,
                  metadata: {
                    title: 'Tech Talk',
                    author: 'Host',
                    description: '<p>Great &amp; fun</p>',
                    genres: ['Technology'],
                    feedUrl: 'https://feeds.example.test/tech.xml',
                    itunesId: 999,
                    explicit: false,
                    language: 'en',
                  },
                },
              },
            ],
            total: 1,
            limit: 48,
            page: 0,
          })
        );
        return;
      }

      if (url.pathname === '/abs/api/items/pod-1') {
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            id: 'pod-1',
            libraryId: 'pods',
            mediaType: 'podcast',
            addedAt: 1700000000000,
            media: {
              autoDownloadEpisodes: true,
              metadata: {
                title: 'Tech Talk',
                author: 'Host',
                description: '<p>Desc</p>',
                genres: ['Technology'],
                feedUrl: 'https://feeds.example.test/tech.xml',
              },
              episodes: [
                {
                  id: 'ep-1',
                  title: 'Episode 1',
                  description: '<p>Ep 1</p>',
                  pubDate: 'Mon, 01 Jan 2024 00:00:00 GMT',
                  publishedAt: 1704067200000,
                  season: '1',
                  episode: '1',
                  enclosure: { url: 'https://cdn.example.test/ep1.mp3' },
                  audioFile: { duration: 1234.6 },
                  size: 1024,
                },
              ],
            },
          })
        );
        return;
      }

      if (url.pathname === '/abs/api/items/book-1') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ id: 'book-1', mediaType: 'book' }));
        return;
      }

      if (url.pathname === '/abs/api/items/pod-1/cover') {
        res.setHeader('Content-Type', 'image/webp');
        res.end(Buffer.from('webp-bytes'));
        return;
      }

      if (url.pathname === '/abs/api/items/bad-cover/cover') {
        res.setHeader('Content-Type', 'text/html');
        res.end('<html>not an image</html>');
        return;
      }

      res.statusCode = 404;
      res.end('{}');
    });

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const addr = server.address();
    assert.ok(addr && typeof addr !== 'string');

    try {
      const api = new AudiobookshelfPodcastsAPI(
        makeSettings(addr.port),
        testProxy
      );
      const libs = await api.getLibraries();
      assert.equal(libs.length, 2);
      assert.deepEqual(libs[1].folders, [
        { id: 'fol-1', fullPath: '/podcasts' },
      ]);

      const page = await api.getPodcastLibraryItems('pods', {
        page: 0,
        limit: 48,
        sort: 'addedAt',
        desc: 1,
      });
      assert.equal(page.total, 1);
      assert.equal(page.results[0]?.itunesId, '999');

      const details = await api.getPodcastItem('pod-1');
      assert.ok(details);
      assert.equal(details.episodes[0]?.durationSeconds, 1235);
      assert.equal(await api.getPodcastItem('book-1'), null);
      assert.equal(await api.getPodcastItem('missing'), null);

      const cover = await api.getPodcastCover('pod-1');
      assert.ok(cover);
      assert.equal(cover.contentType, 'image/webp');
      assert.equal(cover.buffer.toString(), 'webp-bytes');
      assert.equal(await api.getPodcastCover('bad-cover'), null);
      assert.equal(await api.getPodcastCover('missing'), null);

      assert.equal(
        requests[1]?.path,
        '/abs/api/libraries/pods/items?limit=48&page=0&sort=addedAt&desc=1&minified=1'
      );
      assert.ok(
        requests.every((r) => r.authorization === 'Bearer abs-podcast-token')
      );
    } finally {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    }
  });

  it('rejects incomplete Audiobookshelf user lists instead of mapping them as empty', async () => {
    let body: unknown = {};
    const server = createServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(body));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const addr = server.address();
    assert.ok(addr && typeof addr !== 'string');

    try {
      const api = new AudiobookshelfPodcastsAPI(makeSettings(addr.port));
      await assert.rejects(api.getUsers(), /invalid user list/);

      body = { users: [{ id: 'u1', email: 12, type: 'user' }] };
      await assert.rejects(api.getUsers(), /invalid user record/);

      body = {
        users: [
          {
            id: 'u1',
            username: 'listener',
            email: 'listener@example.test',
            type: 'user',
          },
        ],
      };
      assert.deepStrictEqual(await api.getUsers(), [
        {
          id: 'u1',
          username: 'listener',
          email: 'listener@example.test',
          type: 'user',
        },
      ]);
    } finally {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    }
  });

  it('supports search, feed preview, create, auto toggle, download episodes, and both download queue formats', async () => {
    const bodies: Record<string, unknown> = {};
    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const rawBody = Buffer.concat(chunks).toString('utf8');
      const parsedBody = rawBody ? JSON.parse(rawBody) : undefined;
      res.setHeader('Content-Type', 'application/json');

      if (url.pathname === '/abs/api/search/podcast') {
        res.end(
          JSON.stringify([
            {
              id: 123,
              artistName: 'Author',
              title: 'Show A',
              cover: 'https://cdn.example.test/cover.jpg',
              feedUrl: 'https://feeds.example.test/a.xml',
              genres: ['News'],
              trackCount: 40,
              explicit: false,
            },
            {
              id: 456,
              artistName: 'Author',
              title: 'Show B',
              cover: 'http://insecure.example.test/cover.jpg',
              feedUrl: 'https://feeds.example.test/b.xml',
              genres: [],
              trackCount: 5,
              explicit: true,
            },
          ])
        );
        return;
      }

      // SeerrNG reads feeds itself; Audiobookshelf must never be asked to
      if (url.pathname === '/abs/api/podcasts/feed' && req.method === 'POST') {
        bodies.absFeed = parsedBody;
        res.statusCode = 500;
        res.end('{}');
        return;
      }

      if (url.pathname === '/abs/api/podcasts' && req.method === 'POST') {
        bodies.create = parsedBody;
        res.end(
          JSON.stringify({
            id: 'new-pod-1',
            media: { metadata: { title: 'Feed Show' } },
          })
        );
        return;
      }

      if (
        url.pathname === '/abs/api/items/new-pod-1/media' &&
        req.method === 'PATCH'
      ) {
        bodies.auto = parsedBody;
        res.end('{}');
        return;
      }

      if (
        url.pathname === '/abs/api/podcasts/new-pod-1/download-episodes' &&
        req.method === 'POST'
      ) {
        bodies.download = parsedBody;
        res.end('{}');
        return;
      }

      if (url.pathname === '/abs/api/podcasts/new-pod-1/downloads') {
        res.end(
          JSON.stringify({
            currentDownload: { episodeDisplayTitle: 'Downloading Now' },
            queue: [
              { episodeDisplayTitle: 'Queued 1' },
              { episodeDisplayTitle: 'Queued 2' },
            ],
          })
        );
        return;
      }

      if (url.pathname === '/abs/api/podcasts/legacy-pod/downloads') {
        res.end(
          JSON.stringify({
            downloads: [
              { episodeDisplayTitle: 'Legacy Current' },
              { episodeDisplayTitle: 'Legacy Queued' },
            ],
          })
        );
        return;
      }

      if (url.pathname === '/abs/api/libraries') {
        res.statusCode = 403;
        res.end(JSON.stringify({ error: 'forbidden' }));
        return;
      }

      res.statusCode = 404;
      res.end('{}');
    });

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const addr = server.address();
    assert.ok(addr && typeof addr !== 'string');

    try {
      const api = new AudiobookshelfPodcastsAPI(
        makeSettings(addr.port),
        testProxy
      );

      const searchResults = await api.searchPodcasts('tech');
      assert.equal(searchResults.length, 2);
      assert.equal(
        searchResults[0]?.coverUrl,
        'https://cdn.example.test/cover.jpg'
      );
      assert.equal(searchResults[1]?.coverUrl, null);

      const feedXml = `<?xml version="1.0"?>
<rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" version="2.0">
  <channel>
    <title>Feed Show</title>
    <itunes:author>Feed Host</itunes:author>
    <description>&lt;p&gt;Feed desc&lt;/p&gt;</description>
    <itunes:image href="https://cdn.example.test/img.png"/>
    <language>en</language>
    <itunes:category text="Tech"/>
    <item>
      <title>Older</title>
      <description>&lt;p&gt;Old&lt;/p&gt;</description>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <guid>guid-old</guid>
      <itunes:duration>600</itunes:duration>
      <enclosure url="https://cdn.example.test/old.mp3" type="audio/mpeg" length="1000"/>
    </item>
    <item>
      <title>Newer</title>
      <description>&lt;p&gt;New&lt;/p&gt;</description>
      <pubDate>Tue, 02 Jan 2024 00:00:00 GMT</pubDate>
      <itunes:duration>15:00</itunes:duration>
      <enclosure url="https://cdn.example.test/new.mp3" type="audio/mpeg"/>
    </item>
  </channel>
</rss>`;
      const fetched: string[] = [];
      const feed = await api.getPodcastFeed(
        'https://feeds.example.test/a.xml',
        (url) =>
          loadPublicPodcastFeed(
            url,
            async (target) => {
              fetched.push(target);
              return feedXml;
            },
            async () => true
          )
      );
      assert.deepEqual(fetched, ['https://feeds.example.test/a.xml']);
      assert.equal(bodies.absFeed, undefined);
      assert.equal(feed.title, 'Feed Show');
      assert.equal(feed.author, 'Feed Host');
      assert.equal(feed.imageUrl, 'https://cdn.example.test/img.png');
      assert.deepEqual(feed.categories, ['Tech']);
      assert.equal(feed.episodes[0]?.title, 'Newer');
      assert.equal(feed.episodes[0]?.durationSeconds, 900);
      assert.equal(feed.episodes[1]?.durationSeconds, 600);
      assert.equal(feed.episodes[0]?.key, 'https://cdn.example.test/new.mp3');
      assert.equal(feed.episodes[1]?.key, 'guid-old');

      const created = await api.createPodcast({
        path: '/podcasts/Feed Show',
        folderId: 'fol-1',
        libraryId: 'pods',
        media: {
          metadata: {
            title: feed.title,
            author: feed.author ?? '',
            description: feed.description ?? '',
            feedUrl: feed.feedUrl,
            imageUrl: feed.imageUrl ?? '',
            itunesId: feed.itunesId,
            genres: feed.categories,
            language: feed.language ?? '',
            explicit: feed.explicit,
          },
          autoDownloadEpisodes: true,
          autoDownloadSchedule: '0 * * * *',
        },
      });
      assert.equal(created.id, 'new-pod-1');

      await api.updateAutoDownload('new-pod-1', false);
      assert.deepEqual(bodies.auto, { autoDownloadEpisodes: false });

      await api.downloadEpisodes('new-pod-1', [feed.episodes[0].raw]);
      assert.equal(Array.isArray(bodies.download), true);
      assert.equal((bodies.download as { title: string }[])[0]?.title, 'Newer');

      // Audiobookshelf only ever gets SeerrNG proxy addresses: the feed it
      // revisits, the cover it fetches and the audio it downloads
      const createdMetadata = (
        bodies.create as {
          media: { metadata: { feedUrl: string; imageUrl: string } };
        }
      ).media.metadata;
      const queuedUrl = (bodies.download as { enclosure: { url: string } }[])[0]
        ?.enclosure.url;
      for (const value of [
        createdMetadata.feedUrl,
        createdMetadata.imageUrl,
        queuedUrl,
      ]) {
        assert.equal(new URL(value).origin, PROXY_ORIGIN);
      }
      assert.equal(
        originalFeedUrl(createdMetadata.feedUrl),
        'https://feeds.example.test/a.xml'
      );
      assert.equal(
        originalMediaUrl(createdMetadata.imageUrl),
        'https://cdn.example.test/img.png'
      );
      assert.equal(
        originalMediaUrl(queuedUrl),
        'https://cdn.example.test/new.mp3'
      );

      assert.deepEqual(await api.getPodcastDownloads('new-pod-1'), {
        downloading: [{ title: 'Downloading Now' }],
        queued: 2,
      });
      assert.deepEqual(await api.getPodcastDownloads('legacy-pod'), {
        downloading: [{ title: 'Legacy Current' }],
        queued: 1,
      });

      await assert.rejects(
        api.getLibraries(),
        (err: unknown) => err instanceof AudiobookshelfAuthError
      );
    } finally {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    }
  });

  it('reads finished episodes from every user (or only its own) and deletes an episode with its file', async () => {
    let usersAllowed = true;
    const deletes: string[] = [];
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      res.setHeader('Content-Type', 'application/json');
      if (url.pathname === '/abs/api/users') {
        if (!usersAllowed) {
          res.statusCode = 403;
          res.end('{}');
          return;
        }
        // like Audiobookshelf 2.x: the list has no progress
        res.end(JSON.stringify({ users: [{ id: 'u1' }, { id: 'u2' }] }));
        return;
      }
      if (url.pathname === '/abs/api/users/u1') {
        res.end(
          JSON.stringify({
            id: 'u1',
            mediaProgress: [
              { libraryItemId: 'show-1', episodeId: 'e1', isFinished: true },
              { libraryItemId: 'show-1', episodeId: 'e2', isFinished: false },
            ],
          })
        );
        return;
      }
      if (url.pathname === '/abs/api/users/u2') {
        res.end(
          JSON.stringify({
            id: 'u2',
            mediaProgress: [
              { libraryItemId: 'show-1', episodeId: 'e3', isFinished: true },
              { libraryItemId: 'book-1', isFinished: true },
            ],
          })
        );
        return;
      }
      if (url.pathname === '/abs/api/me') {
        res.end(
          JSON.stringify({
            mediaProgress: [
              { libraryItemId: 'show-2', episodeId: 'x9', isFinished: true },
            ],
          })
        );
        return;
      }
      if (req.method === 'DELETE') {
        deletes.push(`${url.pathname}?${url.searchParams}`);
        res.end('{}');
        return;
      }
      res.statusCode = 404;
      res.end('{}');
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const addr = server.address();
    assert.ok(addr && typeof addr !== 'string');
    try {
      const api = new AudiobookshelfPodcastsAPI(
        makeSettings(addr.port),
        testProxy
      );
      const all = await api.getFinishedEpisodes();
      assert.deepEqual([...(all.get('show-1') ?? [])].sort(), ['e1', 'e3']);
      assert.equal(all.has('book-1'), false);

      usersAllowed = false;
      const own = await api.getFinishedEpisodes();
      assert.deepEqual([...(own.get('show-2') ?? [])], ['x9']);

      await api.deleteEpisode('show-1', 'e1');
      assert.deepEqual(deletes, ['/abs/api/podcasts/show-1/episode/e1?hard=1']);
    } finally {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    }
  });

  it('reads started episodes too, and marks progress incomplete when a user cannot be read', async () => {
    let u3Fails = true;
    let usersAllowed = true;
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      res.setHeader('Content-Type', 'application/json');
      if (url.pathname === '/abs/api/users') {
        if (!usersAllowed) {
          res.statusCode = 403;
          res.end('{}');
          return;
        }
        res.end(
          JSON.stringify({ users: [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }] })
        );
        return;
      }
      if (url.pathname === '/abs/api/users/u1') {
        res.end(
          JSON.stringify({
            id: 'u1',
            mediaProgress: [
              { libraryItemId: 'show-1', episodeId: 'e1', isFinished: true },
            ],
          })
        );
        return;
      }
      if (url.pathname === '/abs/api/users/u2') {
        res.end(
          JSON.stringify({
            id: 'u2',
            mediaProgress: [
              // 30 minutes into e1, which u1 finished
              {
                libraryItemId: 'show-1',
                episodeId: 'e1',
                isFinished: false,
                currentTime: 1800,
                progress: 0.4,
              },
              // opened but never played: not started
              {
                libraryItemId: 'show-1',
                episodeId: 'e2',
                isFinished: false,
                currentTime: 0,
                progress: 0,
              },
              {
                libraryItemId: 'show-1',
                episodeId: 'e3',
                isFinished: false,
                progress: 0.1,
              },
            ],
          })
        );
        return;
      }
      if (url.pathname === '/abs/api/users/u3') {
        if (u3Fails) {
          res.statusCode = 500;
          res.end('{}');
          return;
        }
        res.end(JSON.stringify({ id: 'u3', mediaProgress: [] }));
        return;
      }
      if (url.pathname === '/abs/api/me') {
        res.end(JSON.stringify({ mediaProgress: [] }));
        return;
      }
      res.statusCode = 404;
      res.end('{}');
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const addr = server.address();
    assert.ok(addr && typeof addr !== 'string');
    try {
      const api = new AudiobookshelfPodcastsAPI(
        makeSettings(addr.port),
        testProxy
      );
      // one unreadable user: the others still count, but it is incomplete
      const partial = await api.getEpisodeProgress();
      assert.equal(partial.complete, false);
      assert.deepEqual([...(partial.finished.get('show-1') ?? [])], ['e1']);
      assert.deepEqual([...(partial.started.get('show-1') ?? [])].sort(), [
        'e1',
        'e3',
      ]);

      u3Fails = false;
      const full = await api.getEpisodeProgress();
      assert.equal(full.complete, true);

      // a key that reads only itself cannot know the others
      usersAllowed = false;
      const own = await api.getEpisodeProgress();
      assert.equal(own.complete, false);
    } finally {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    }
  });

  it('maps other 4xx answers to a request error with a safe reason, and reads feed durations and reused guids', async () => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/abs/api/podcasts' && req.method === 'POST') {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'text/plain');
        res.end('Podcast already exists abs-podcast-token\u0007');
        return;
      }
      if (url.pathname === '/abs/api/libraries/lib-1/episode-downloads') {
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            currentDownload: {
              episodeDisplayTitle: 'Now',
              libraryItemId: 'show-1',
            },
            queue: [
              { episodeDisplayTitle: 'Next', libraryItemId: 'show-1' },
              { episodeDisplayTitle: 'Other', libraryItemId: 'show-2' },
            ],
          })
        );
        return;
      }
      res.statusCode = 404;
      res.end('{}');
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const addr = server.address();
    assert.ok(addr && typeof addr !== 'string');
    try {
      const api = new AudiobookshelfPodcastsAPI(
        makeSettings(addr.port),
        testProxy
      );
      await assert.rejects(
        api.createPodcast({
          path: '/podcasts/Show',
          folderId: 'f',
          libraryId: 'l',
          media: {
            metadata: {
              title: 'Show',
              author: '',
              description: '',
              feedUrl: 'https://f.example/rss',
              imageUrl: '',
              itunesId: null,
              genres: [],
              language: '',
              explicit: false,
            },
            autoDownloadEpisodes: true,
            autoDownloadSchedule: '0 * * * *',
          },
        }),
        (err: unknown) =>
          err instanceof AudiobookshelfRequestError &&
          err.status === 400 &&
          err.reason === 'Podcast already exists [REDACTED]'
      );

      const feed = await api.getPodcastFeed(
        'https://f.example/rss',
        async () => ({
          podcast: {
            metadata: { title: 'Show', feedUrl: 'https://f.example/rss' },
            episodes: [
              {
                guid: 'g1',
                title: 'Trailer',
                duration: '01:02:03',
                enclosure: { url: 'https://cdn.example/a.mp3' },
              },
              {
                guid: 'g1',
                title: 'Trailer (re-upload)',
                duration: '95',
                durationSeconds: 95,
                enclosure: { url: 'https://cdn.example/b.mp3' },
              },
              {
                guid: 'g1',
                title: 'Exact duplicate',
                enclosure: { url: 'https://cdn.example/a.mp3' },
              },
            ],
          },
        })
      );
      assert.deepEqual(
        feed.episodes.map((ep) => [ep.key, ep.durationSeconds]),
        [
          ['g1', 3723],
          ['g1 https://cdn.example/b.mp3', 95],
        ]
      );

      // the episode downloading now counts (the per-podcast route omits it)
      assert.deepEqual(await api.getPodcastDownloads('show-1', 'lib-1'), {
        downloading: [{ title: 'Now' }],
        queued: 1,
      });
    } finally {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    }
  });

  it('builds publicItemUrl only when externalUrl is configured', () => {
    const withoutExternal = new AudiobookshelfPodcastsAPI(makeSettings(13378));
    assert.equal(withoutExternal.publicItemUrl('pod-1'), null);
    assert.equal(withoutExternal.publicBaseUrl(), null);

    const withExternal = new AudiobookshelfPodcastsAPI(
      makeSettings(13378, {
        baseUrl: '/abs',
        externalUrl: 'https://listen.example.test/',
      })
    );
    assert.equal(
      withExternal.publicItemUrl('pod-1'),
      'https://listen.example.test/abs/item/pod-1'
    );
    assert.equal(withExternal.publicBaseUrl(), 'https://listen.example.test');
  });

  it('fetches recent episodes directly and falls back to up to 25 podcasts sorted by updatedAt desc on 404', async () => {
    let recentReturns404 = false;
    let activeItemRequests = 0;
    let maxActiveItemRequests = 0;
    const requestedPaths: string[] = [];

    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      requestedPaths.push(`${url.pathname}${url.search}`);
      res.setHeader('Content-Type', 'application/json');

      if (url.pathname === '/abs/api/libraries/pods/recent-episodes') {
        if (recentReturns404) {
          res.statusCode = 404;
          res.end('{}');
          return;
        }
        res.end(
          JSON.stringify({
            episodes: [
              {
                id: 'ep-old',
                title: 'Older Episode',
                description: '<p>Old &amp; dusty</p>',
                publishedAt: 1704067200000,
                pubDate: 'Mon, 01 Jan 2024 00:00:00 GMT',
                audioFile: { duration: 120.4 },
                libraryItemId: 'pod-1',
                podcast: {
                  metadata: { title: 'Show One', author: 'Alice' },
                },
              },
              {
                id: 'ep-new',
                title: 'Newer Episode',
                description: '<p>Fresh</p>',
                publishedAt: 0,
                pubDate: 'Tue, 02 Jan 2024 00:00:00 GMT',
                duration: 240.8,
                libraryItemId: 'pod-2',
                podcast: {
                  metadata: { title: 'Show Two', author: null },
                },
              },
            ],
          })
        );
        return;
      }

      if (url.pathname === '/abs/api/libraries/pods/items') {
        const items = Array.from({ length: 7 }, (_, i) => ({
          id: `pod-${i + 1}`,
          addedAt: 1700000000000 + i,
          updatedAt: 1700000000000 + i * 1000,
          media: {
            numEpisodes: 1,
            autoDownloadEpisodes: false,
            metadata: { title: `Show ${i + 1}`, author: `Author ${i + 1}` },
          },
        }));
        res.end(
          JSON.stringify({
            results: items,
            total: items.length,
            limit: 25,
            page: 0,
          })
        );
        return;
      }

      const itemMatch = /^\/abs\/api\/items\/(pod-\d+)$/.exec(url.pathname);
      if (itemMatch) {
        const podId = itemMatch[1];
        const num = Number(podId.replace('pod-', ''));
        activeItemRequests += 1;
        maxActiveItemRequests = Math.max(
          maxActiveItemRequests,
          activeItemRequests
        );
        await new Promise((resolve) => setTimeout(resolve, 15));
        activeItemRequests -= 1;

        res.end(
          JSON.stringify({
            id: podId,
            libraryId: 'pods',
            mediaType: 'podcast',
            media: {
              metadata: { title: `Show ${num}`, author: `Author ${num}` },
              episodes: [
                {
                  id: `ep-${num}`,
                  title: `Episode ${num}`,
                  description: `<p>Desc ${num}</p>`,
                  publishedAt: 1704000000000 + num * 10_000,
                  audioFile: { duration: 100 + num },
                },
              ],
            },
          })
        );
        return;
      }

      res.statusCode = 404;
      res.end('{}');
    });

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const addr = server.address();
    assert.ok(addr && typeof addr !== 'string');

    try {
      const api = new AudiobookshelfPodcastsAPI(
        makeSettings(addr.port),
        testProxy
      );

      const direct = await api.getRecentEpisodes('pods', 10);
      assert.equal(direct.length, 2);
      assert.equal(direct[0]?.id, 'ep-new');
      assert.equal(direct[0]?.durationSeconds, 241);
      assert.equal(direct[1]?.id, 'ep-old');
      assert.equal(direct[1]?.durationSeconds, 120);
      assert.equal(
        requestedPaths[0],
        '/abs/api/libraries/pods/recent-episodes?limit=10&page=0'
      );

      recentReturns404 = true;
      const fallback = await api.getRecentEpisodes('pods', 3);
      assert.equal(fallback.length, 3);
      assert.deepEqual(
        fallback.map((ep) => ep.id),
        ['ep-7', 'ep-6', 'ep-5']
      );
      assert.ok(maxActiveItemRequests <= 5);
      assert.ok(
        requestedPaths.includes(
          '/abs/api/libraries/pods/items?limit=25&page=0&sort=updatedAt&desc=1&minified=1'
        )
      );
    } finally {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    }
  });

  it('parses library-wide episode downloads for both queue and legacy formats', async () => {
    let mode: 'queue' | 'legacy' = 'queue';
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      res.setHeader('Content-Type', 'application/json');
      if (url.pathname === '/abs/api/libraries/pods/episode-downloads') {
        if (mode === 'queue') {
          res.end(
            JSON.stringify({
              currentDownload: {
                episodeDisplayTitle: 'Ep Active',
                libraryItemId: 'pod-1',
                podcastTitle: 'Show One',
              },
              queue: [
                {
                  episodeDisplayTitle: 'Ep Queued',
                  libraryItemId: 'pod-2',
                },
              ],
            })
          );
          return;
        }
        res.end(
          JSON.stringify({
            downloads: [
              {
                episodeDisplayTitle: 'Legacy Current',
                libraryItemId: 'pod-3',
              },
              {
                episodeDisplayTitle: 'Legacy Queued',
                libraryItemId: 'pod-4',
                podcastTitle: 'Show Four',
              },
            ],
          })
        );
        return;
      }
      res.statusCode = 404;
      res.end('{}');
    });

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const addr = server.address();
    assert.ok(addr && typeof addr !== 'string');

    try {
      const api = new AudiobookshelfPodcastsAPI(
        makeSettings(addr.port),
        testProxy
      );
      assert.deepEqual(await api.getLibraryEpisodeDownloads('pods'), {
        downloading: [
          { title: 'Ep Active', podcastId: 'pod-1', podcastTitle: 'Show One' },
        ],
        queued: [
          { title: 'Ep Queued', podcastId: 'pod-2', podcastTitle: null },
        ],
      });

      mode = 'legacy';
      assert.deepEqual(await api.getLibraryEpisodeDownloads('pods'), {
        downloading: [
          { title: 'Legacy Current', podcastId: 'pod-3', podcastTitle: null },
        ],
        queued: [
          {
            title: 'Legacy Queued',
            podcastId: 'pod-4',
            podcastTitle: 'Show Four',
          },
        ],
      });
    } finally {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    }
  });
});
