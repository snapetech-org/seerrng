import axios from 'axios';
import express from 'express';
import assert from 'node:assert/strict';
import nodeDns from 'node:dns';
import dns from 'node:dns/promises';
import { syncBuiltinESMExports } from 'node:module';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import request from 'supertest';

import { createProxyUrls, originalMediaUrl } from '@server/lib/podcastProxy';
import { getSettings } from '@server/lib/settings';
import podcastProxyRoutes from '@server/routes/podcastProxy';

const BASE = 'http://seerr.lan:5055';
const SECRET = 'route-test-secret';

const FEED = `<?xml version="1.0"?>
<rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" version="2.0">
  <channel>
    <title>Show</title>
    <itunes:new-feed-url>http://192.168.1.10/moved.xml</itunes:new-feed-url>
    <item>
      <title>One</title>
      <guid>g-1</guid>
      <enclosure url="https://cdn.example.test/one.mp3" type="audio/mpeg"/>
    </item>
  </channel>
</rss>`;

const app = express();
app.use('/api/v1/podcast/proxy', podcastProxyRoutes);

// what the socket's own DNS lookup answers for the podcast hosts (the
// address really used); the test server itself still resolves normally
const realLookup = nodeDns.lookup;
const answerSocketLookup = (address: string) => {
  mock.method(
    nodeDns,
    'lookup',
    (
      host: string,
      options: unknown,
      callback: (
        error: Error | null,
        addresses: { address: string; family: number }[]
      ) => void
    ) =>
      host.endsWith('.example.test')
        ? callback(null, [{ address, family: 4 }])
        : (realLookup as (...args: unknown[]) => void)(host, options, callback)
  );
  syncBuiltinESMExports();
};

// a stand-in for axios that connects only through the lookup it was given
const connectThroughLookup = (
  body: () => unknown,
  status = 200,
  headers: Record<string, string> = { 'content-type': 'audio/mpeg' }
) => {
  const hosts: string[] = [];
  const configs: Record<string, unknown>[] = [];
  mock.method(
    axios,
    'get',
    (url: string, config: Record<string, unknown>) =>
      new Promise((resolve, reject) => {
        hosts.push(new URL(url).hostname);
        configs.push(config);
        const lookup = config.lookup as (
          host: string,
          options: object,
          callback: (error: NodeJS.ErrnoException | null) => void
        ) => void;
        lookup(new URL(url).hostname, { all: true }, (error) =>
          error
            ? reject(error)
            : resolve({
                status,
                headers,
                data: body(),
              })
        );
      })
  );
  return Object.assign(hosts, { configs });
};

describe('podcast proxy routes (what Audiobookshelf calls)', () => {
  const settings = getSettings();
  const saved = {
    audiobookshelf: settings.audiobookshelf,
    applicationUrl: settings.main.applicationUrl,
  };
  const urls = createProxyUrls(BASE, SECRET);

  beforeEach(() => {
    // an own property shadows the Settings getter for this test only
    Object.defineProperty(settings, 'podcastProxySecret', {
      configurable: true,
      get: () => SECRET,
    });
    settings.audiobookshelf = {
      id: 1,
      name: 'Audiobookshelf',
      hostname: 'abs.lan',
      port: 13378,
      apiKey: 'k',
      useSsl: false,
      libraryId: 'pods',
      libraryName: 'Podcasts',
      syncEnabled: true,
      proxyUrl: BASE,
    };
  });

  afterEach(() => {
    mock.restoreAll();
    syncBuiltinESMExports();
    delete (settings as { podcastProxySecret?: string }).podcastProxySecret;
    settings.audiobookshelf = saved.audiobookshelf;
    settings.main.applicationUrl = saved.applicationUrl;
  });

  it('fetches nothing for an address SeerrNG did not sign', async () => {
    const hosts = connectThroughLookup(() => FEED);
    const forged = new URL(urls.feed('https://feeds.example.test/a.xml'));
    forged.searchParams.set('u', 'http://169.254.169.254/latest/meta-data');
    await request(app)
      .get(forged.pathname + forged.search)
      .expect(404);

    const media = new URL(urls.media('https://cdn.example.test/one.mp3'));
    const parts = media.pathname.split('/');
    parts[parts.length - 2] =
      Buffer.from('http://10.0.0.1/').toString('base64url');
    await request(app).get(parts.join('/')).expect(404);
    assert.equal(hosts.length, 0);
  });

  it('refuses a feed host that rebinds from public to private', async () => {
    mock.method(dns, 'lookup', async () => [
      { address: '93.184.216.34', family: 4 },
    ]);
    answerSocketLookup('127.0.0.1');
    connectThroughLookup(() => FEED);
    const feed = new URL(urls.feed('https://rebind.example.test/feed.xml'));
    await request(app)
      .get(feed.pathname + feed.search)
      .expect(400);
  });

  it('refuses an episode host that rebinds from public to private', async () => {
    mock.method(dns, 'lookup', async () => [
      { address: '93.184.216.34', family: 4 },
    ]);
    answerSocketLookup('169.254.169.254');
    connectThroughLookup(() => Readable.from(['audio']));
    const media = new URL(urls.media('https://rebind.example.test/one.mp3'));
    await request(app).get(media.pathname).expect(400);
  });

  it('serves a feed that points Audiobookshelf back at SeerrNG only', async () => {
    mock.method(dns, 'lookup', async () => [
      { address: '93.184.216.34', family: 4 },
    ]);
    answerSocketLookup('93.184.216.34');
    connectThroughLookup(() => FEED);
    const feed = new URL(urls.feed('https://feeds.example.test/show.xml'));
    const response = await request(app)
      .get(feed.pathname + feed.search)
      .expect(200);
    assert.match(response.headers['content-type'], /application\/rss\+xml/);
    const enclosure = /<enclosure url="([^"]+)"/.exec(response.text)?.[1];
    assert.ok(enclosure);
    const decoded = enclosure.replace(/&amp;/g, '&');
    assert.equal(new URL(decoded).origin, BASE);
    assert.equal(originalMediaUrl(decoded), 'https://cdn.example.test/one.mp3');
    assert.equal(response.text.includes('192.168.1.10'), false);
  });

  it('streams an episode from a public host', async () => {
    mock.method(dns, 'lookup', async () => [
      { address: '93.184.216.34', family: 4 },
    ]);
    answerSocketLookup('93.184.216.34');
    connectThroughLookup(() => Readable.from([Buffer.from('audio-bytes')]));
    const media = new URL(urls.media('https://cdn.example.test/one.mp3'));
    const response = await request(app)
      .get(media.pathname)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    assert.equal(response.headers['content-type'], 'audio/mpeg');
    assert.equal((response.body as Buffer).toString(), 'audio-bytes');
  });

  const publicHost = () => {
    mock.method(dns, 'lookup', async () => [
      { address: '93.184.216.34', family: 4 },
    ]);
    answerSocketLookup('93.184.216.34');
  };

  it('answers HEAD with the headers only and drops the upstream stream', async () => {
    publicHost();
    const upstream = Readable.from([Buffer.alloc(1024)]);
    connectThroughLookup(() => upstream, 200, {
      'content-type': 'audio/mpeg',
      'content-length': '987654321',
    });
    const media = new URL(urls.media('https://cdn.example.test/one.mp3'));
    const response = await request(app).head(media.pathname).expect(200);
    assert.equal(response.headers['content-length'], '987654321');
    assert.equal(upstream.destroyed, true);
  });

  it('passes on a removed episode as 404 and a bad range as 416', async () => {
    publicHost();
    connectThroughLookup(() => Readable.from([]), 410, {});
    const gone = new URL(urls.media('https://cdn.example.test/gone.mp3'));
    await request(app).get(gone.pathname).expect(404);

    mock.restoreAll();
    publicHost();
    connectThroughLookup(() => Readable.from([]), 416, {
      'content-range': 'bytes */1000',
    });
    const media = new URL(urls.media('https://cdn.example.test/one.mp3'));
    const response = await request(app)
      .get(media.pathname)
      .set('Range', 'bytes=5000-')
      .expect(416);
    assert.equal(response.headers['content-range'], 'bytes */1000');
  });

  it("passes on Audiobookshelf's own agent and only real ranges", async () => {
    publicHost();
    const seen = connectThroughLookup(() => Readable.from(['audio']));
    const media = new URL(urls.media('https://cdn.example.test/one.mp3'));
    await request(app)
      .get(media.pathname)
      .set(
        'User-Agent',
        'audiobookshelf (+https://audiobookshelf.org; like iTMS)'
      )
      .set('Range', 'bytes=-')
      .expect(200);
    await request(app)
      .get(media.pathname)
      .set('User-Agent', 'curl/8')
      .expect(200);
    const headers = seen.configs.map(
      (config) => config.headers as Record<string, string>
    );
    assert.equal(
      headers[0]?.['User-Agent'],
      'audiobookshelf (+https://audiobookshelf.org; like iTMS)'
    );
    assert.equal(headers[0]?.Range, undefined);
    assert.equal(headers[1]?.['User-Agent'], 'SeerrNG-Podcasts/1.0');
  });

  it('answers nothing until podcasts are set up', async () => {
    settings.audiobookshelf = null;
    const feed = new URL(urls.feed('https://feeds.example.test/show.xml'));
    await request(app)
      .get(feed.pathname + feed.search)
      .expect(404);
  });
});
