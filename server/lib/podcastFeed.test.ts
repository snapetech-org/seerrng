import axios from 'axios';
import assert from 'node:assert/strict';
import nodeDns from 'node:dns';
import dns from 'node:dns/promises';
import { syncBuiltinESMExports } from 'node:module';
import { afterEach, describe, it, mock } from 'node:test';

import {
  dropPrivateFeedUrls,
  fetchPublicFeedText,
  loadPublicPodcastFeed,
  parsePodcastFeedXml,
  PodcastFeedError,
} from '@server/lib/podcastFeed';

const FEED = `<?xml version="1.0"?>
<rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" version="2.0">
  <channel>
    <title>Show</title>
    <itunes:new-feed-url>http://192.168.1.10/moved.xml</itunes:new-feed-url>
    <itunes:image href="http://10.0.0.5/cover.jpg"/>
    <item>
      <title>Public</title>
      <guid>g-public</guid>
      <enclosure url="https://cdn.example.test/public.mp3" type="audio/mpeg"/>
    </item>
    <item>
      <title>Private</title>
      <guid>g-private</guid>
      <enclosure url="http://169.254.169.254/latest/meta-data" type="audio/mpeg"/>
    </item>
    <item>
      <title>Rebinding host</title>
      <guid>g-rebind</guid>
      <enclosure url="https://rebind.example.test/a.mp3" type="audio/mpeg"/>
    </item>
  </channel>
</rss>`;

afterEach(() => {
  mock.restoreAll();
  syncBuiltinESMExports();
});

describe('podcast feeds are read by SeerrNG on a pinned connection', () => {
  // Two resolvers: the URL check, then the lookup the socket itself makes.
  // The request is handed to a stand-in for axios that connects only through
  // the lookup SeerrNG gave it, as Node's http agent does.
  const connectThroughLookup = () => {
    const configs: Record<string, unknown>[] = [];
    mock.method(
      axios,
      'get',
      (url: string, config: Record<string, unknown>) =>
        new Promise((resolve, reject) => {
          configs.push(config);
          const lookup = config.lookup as (
            host: string,
            options: object,
            callback: (error: NodeJS.ErrnoException | null) => void
          ) => void;
          lookup(new URL(url).hostname, { all: true }, (error) =>
            error ? reject(error) : resolve({ data: FEED })
          );
        })
    );
    return configs;
  };
  const answerSocketLookup = (address: string) => {
    mock.method(
      nodeDns,
      'lookup',
      (
        _host: string,
        _options: unknown,
        callback: (
          error: Error | null,
          addresses: { address: string; family: number }[]
        ) => void
      ) => callback(null, [{ address, family: 4 }])
    );
    syncBuiltinESMExports();
  };

  it('refuses a name that resolves public when checked and private when connecting', async () => {
    // the URL check sees a public address ...
    mock.method(dns, 'lookup', async () => [
      { address: '93.184.216.34', family: 4 },
    ]);
    // ... and the socket's own lookup is answered with loopback (rebinding)
    answerSocketLookup('127.0.0.1');
    const configs = connectThroughLookup();

    await assert.rejects(
      fetchPublicFeedText('http://rebind.example.test/feed.xml'),
      (error: unknown) =>
        error instanceof PodcastFeedError && error.kind === 'unsafe'
    );
    // never through a proxy, which would resolve the name on its own
    assert.equal(configs[0]?.proxy, false);
  });

  it('reads the feed when the connection really is public', async () => {
    mock.method(dns, 'lookup', async () => [
      { address: '93.184.216.34', family: 4 },
    ]);
    answerSocketLookup('93.184.216.34');
    connectThroughLookup();
    assert.equal(
      await fetchPublicFeedText('https://feeds.example.test/show.xml'),
      FEED
    );
  });

  it('refuses a private address before connecting at all', async () => {
    await assert.rejects(
      fetchPublicFeedText('http://127.0.0.1:9/feed.xml'),
      (error: unknown) =>
        error instanceof PodcastFeedError && error.kind === 'unsafe'
    );
    await assert.rejects(
      fetchPublicFeedText('file:///etc/passwd'),
      (error: unknown) =>
        error instanceof PodcastFeedError && error.kind === 'unsafe'
    );
  });

  it('keeps the checked feed address, whatever the feed says it moved to', async () => {
    const parsed = await parsePodcastFeedXml(
      FEED,
      'https://feeds.example.test/show.xml'
    );
    assert.equal(
      parsed.podcast.metadata.feedUrl,
      'https://feeds.example.test/show.xml'
    );
    assert.equal(parsed.podcast.episodes.length, 3);
  });

  it('drops a cover and episodes Audiobookshelf would fetch from private hosts', async () => {
    const checked: string[] = [];
    const feed = await loadPublicPodcastFeed(
      'https://feeds.example.test/show.xml',
      async () => FEED,
      async (url) => {
        checked.push(new URL(url).hostname);
        // what a resolver would say at subscribe time
        return url.startsWith('https://cdn.example.test/');
      }
    );
    assert.equal(feed.podcast.metadata.image, null);
    assert.deepEqual(
      feed.podcast.episodes.map((episode) => episode.guid),
      ['g-public']
    );
    // each host is looked up once
    assert.equal(
      checked.filter((host) => host === 'cdn.example.test').length,
      1
    );
  });

  it('turns anything that is not RSS into a clear error', async () => {
    await assert.rejects(
      parsePodcastFeedXml('<html><body>hi</body></html>', 'https://x.test/'),
      (error: unknown) =>
        error instanceof PodcastFeedError && error.kind === 'invalid'
    );
    await assert.rejects(
      parsePodcastFeedXml('not xml at all <', 'https://x.test/'),
      (error: unknown) =>
        error instanceof PodcastFeedError && error.kind === 'invalid'
    );
  });

  it('only passes on what dropPrivateFeedUrls was given', async () => {
    const result = await dropPrivateFeedUrls(
      { podcast: { metadata: { image: 'not a url' }, episodes: [{}] } },
      async () => true
    );
    assert.equal(result.podcast.metadata.image, null);
    assert.equal(result.podcast.episodes.length, 0);
  });
});
