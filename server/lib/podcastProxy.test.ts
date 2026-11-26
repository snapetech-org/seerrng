import axios from 'axios';
import assert from 'node:assert/strict';
import nodeDns from 'node:dns';
import dns from 'node:dns/promises';
import { syncBuiltinESMExports } from 'node:module';
import { afterEach, describe, it, mock } from 'node:test';
import xml2js from 'xml2js';

import {
  loadPublicPodcastFeed,
  PodcastFeedError,
} from '@server/lib/podcastFeed';
import {
  createProxyUrls,
  decodeMediaTarget,
  openPublicMedia,
  originalFeedUrl,
  originalMediaUrl,
  proxiedEpisode,
  renderProxiedFeedXml,
  verifyProxyTarget,
} from '@server/lib/podcastProxy';

const BASE = 'http://seerr.lan:5055';
const SECRET = 'test-session-secret';
const urls = createProxyUrls(BASE, SECRET);

// Every address Audiobookshelf could fetch must be SeerrNG's own.
const assertOnlySeerrAddresses = (values: string[]) => {
  assert.ok(values.length > 0);
  for (const value of values) {
    assert.equal(new URL(value).origin, BASE, value);
    assert.ok(new URL(value).pathname.startsWith('/api/v1/podcast/proxy/'));
  }
};

const URL_PATTERN = /https?:\/\/[^\s"'<>]+/g;

const FEED = `<?xml version="1.0"?>
<rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:podcast="https://podcastindex.org/namespace/1.0" version="2.0">
  <channel>
    <title>Show &amp; Tell</title>
    <link>https://attacker.example.test/home</link>
    <atom:link rel="self" href="https://attacker.example.test/self.xml"/>
    <itunes:new-feed-url>https://attacker.example.test/moved.xml</itunes:new-feed-url>
    <itunes:image href="https://rebind.example.test/cover.jpg"/>
    <itunes:category text="Technology"/>
    <item>
      <title>One</title>
      <guid>g-1</guid>
      <link>https://attacker.example.test/one</link>
      <podcast:transcript url="https://attacker.example.test/t.vtt"/>
      <podcast:chapters url="https://attacker.example.test/c.json"/>
      <itunes:image href="https://attacker.example.test/ep.jpg"/>
      <enclosure url="https://rebind.example.test/one.m4a?token=a&amp;b=c" type="audio/mp4" length="1234"/>
    </item>
  </channel>
</rss>`;

afterEach(() => {
  mock.restoreAll();
  syncBuiltinESMExports();
});

describe('podcast proxy URLs', () => {
  it('signs each address and refuses a changed one', () => {
    const feed = new URL(urls.feed('https://feeds.example.test/a.xml'));
    const signature = feed.searchParams.get('s') ?? '';
    assert.equal(
      feed.searchParams.get('u'),
      'https://feeds.example.test/a.xml'
    );
    assert.ok(
      verifyProxyTarget(
        'feed',
        'https://feeds.example.test/a.xml',
        signature,
        SECRET
      )
    );
    assert.equal(
      verifyProxyTarget('feed', 'http://169.254.169.254/', signature, SECRET),
      false
    );
    // a feed signature does not open files, and another secret opens nothing
    assert.equal(
      verifyProxyTarget(
        'media',
        'https://feeds.example.test/a.xml',
        signature,
        SECRET
      ),
      false
    );
    assert.equal(
      verifyProxyTarget(
        'feed',
        'https://feeds.example.test/a.xml',
        signature,
        'other'
      ),
      false
    );
    assert.equal(
      verifyProxyTarget(
        'feed',
        'https://feeds.example.test/a.xml',
        signature,
        ''
      ),
      false
    );
  });

  it('keeps the remote address readable for matching shows', () => {
    const remote = 'https://feeds.example.test/a.xml?x=1&y=2';
    assert.equal(originalFeedUrl(urls.feed(remote)), remote);
    assert.equal(originalFeedUrl(remote), remote);
    const audio = 'https://cdn.example.test/ep%201.mp3?t=9';
    const media = urls.media(audio);
    assert.equal(originalMediaUrl(media), audio);
    // Audiobookshelf picks the file type from the end of the URL path
    assert.ok(new URL(media).pathname.endsWith('/file.mp3'));
    assert.equal(new URL(media).search, '');
    assert.equal(decodeMediaTarget('not base64!'), null);
    assert.equal(
      decodeMediaTarget(
        Buffer.from('file:///etc/passwd').toString('base64url')
      ),
      null
    );
  });

  it('hands Audiobookshelf episodes whose audio address is a proxy URL', () => {
    const episode = proxiedEpisode(
      {
        title: 'One',
        enclosure: {
          url: 'https://cdn.example.test/one.mp3',
          type: 'audio/mpeg',
        },
      },
      urls
    );
    assert.ok(episode);
    const enclosure = episode.enclosure as { url: string; type: string };
    assertOnlySeerrAddresses([enclosure.url]);
    assert.equal(enclosure.type, 'audio/mpeg');
    // an already-proxied episode is not wrapped twice
    const again = proxiedEpisode(episode, urls);
    assert.equal((again?.enclosure as { url: string }).url, enclosure.url);
    assert.equal(proxiedEpisode({ title: 'No audio' }, urls), null);
    assert.equal(
      proxiedEpisode({ enclosure: { url: 'ftp://cdn.example.test/a' } }, urls),
      null
    );
  });

  it('serves Audiobookshelf a feed whose only addresses are proxy URLs', async () => {
    const feed = await loadPublicPodcastFeed(
      'https://rebind.example.test/feed.xml',
      async () => FEED,
      async () => true
    );
    const xml = renderProxiedFeedXml(feed, urls);

    assertOnlySeerrAddresses(
      (xml.match(URL_PATTERN) ?? []).filter(
        // namespace declarations are names, never fetched
        (value) =>
          !value.startsWith('http://www.itunes.com/dtds/') &&
          !value.startsWith('http://www.w3.org/')
      )
    );
    assert.equal(xml.includes('attacker.example.test'), false);
    assert.equal(xml.includes('rebind.example.test'), false);

    // and Audiobookshelf can still read it as a podcast feed
    const parsed = await xml2js.parseStringPromise(xml);
    const channel = parsed.rss.channel[0];
    assert.equal(channel.title[0], 'Show & Tell');
    const enclosure = channel.item[0].enclosure[0].$;
    assert.equal(
      originalMediaUrl(enclosure.url),
      'https://rebind.example.test/one.m4a?token=a&b=c'
    );
    assert.ok(enclosure.url.endsWith('/file.m4a'));
    assert.equal(enclosure.length, '1234');
    assert.equal(
      originalMediaUrl(channel['itunes:image'][0].$.href),
      'https://rebind.example.test/cover.jpg'
    );
  });
});

describe('podcast files are read by SeerrNG on a pinned connection', () => {
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
            error
              ? reject(error)
              : resolve({ status: 200, headers: {}, data: 'audio' })
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

  it('refuses a file host that resolves public when checked and private when connecting', async () => {
    mock.method(dns, 'lookup', async () => [
      { address: '93.184.216.34', family: 4 },
    ]);
    answerSocketLookup('169.254.169.254');
    const configs = connectThroughLookup();

    await assert.rejects(
      openPublicMedia('https://rebind.example.test/one.mp3'),
      (error: unknown) =>
        error instanceof PodcastFeedError && error.kind === 'unsafe'
    );
    assert.equal(configs[0]?.proxy, false);
    assert.equal(configs[0]?.responseType, 'stream');
    // podtrac -> pdst.fm -> ... -> CDN chains take six or seven hops
    assert.ok(Number(configs[0]?.maxRedirects) >= 15);
  });

  it('streams the file when the connection really is public', async () => {
    mock.method(dns, 'lookup', async () => [
      { address: '93.184.216.34', family: 4 },
    ]);
    answerSocketLookup('93.184.216.34');
    connectThroughLookup();
    const media = await openPublicMedia('https://cdn.example.test/one.mp3');
    assert.equal(media.status, 200);
  });

  it('refuses private addresses before connecting', async () => {
    await assert.rejects(
      openPublicMedia('http://127.0.0.1:9/one.mp3'),
      (error: unknown) =>
        error instanceof PodcastFeedError && error.kind === 'unsafe'
    );
    await assert.rejects(
      openPublicMedia('file:///etc/passwd'),
      (error: unknown) =>
        error instanceof PodcastFeedError && error.kind === 'unsafe'
    );
  });
});
