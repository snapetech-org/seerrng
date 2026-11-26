import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import ApplePodcastsAPI from '@server/api/applePodcasts';
import axios from 'axios';

describe('ApplePodcastsAPI', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('fetches top chart without genre, preserves chart order, and maps lookup fields', async () => {
    const requestedUrls: string[] = [];
    mock.method(
      axios,
      'get',
      async (url: string, config?: { timeout?: number }) => {
        requestedUrls.push(url);
        assert.strictEqual(config?.timeout, 10_000);

        if (
          url ===
          'https://rss.marketingtools.apple.com/api/v2/us/podcasts/top/10/podcasts.json'
        ) {
          return {
            data: {
              feed: {
                results: [
                  {
                    id: '101',
                    name: 'First Chart Show',
                    artistName: 'Chart Author',
                    artworkUrl100: 'https://cdn.example.test/chart-101.jpg',
                  },
                  {
                    id: '202',
                    name: 'Missing Feed Show',
                    artistName: 'Author 2',
                  },
                  {
                    id: '303',
                    name: 'Not In Lookup',
                    artistName: 'Author 3',
                  },
                  {
                    id: '404',
                    name: 'Second Valid Show',
                    artistName: 'Author 4',
                    artworkUrl100: 'https://cdn.example.test/chart-404.jpg',
                  },
                ],
              },
            },
          };
        }

        if (
          url ===
          'https://itunes.apple.com/lookup?id=101,202,303,404&entity=podcast'
        ) {
          return {
            data: {
              results: [
                // Out of chart order on purpose
                {
                  collectionId: 404,
                  collectionName: 'Second Valid Show',
                  artistName: 'Lookup Author 4',
                  feedUrl: 'http://feeds.example.test/404.xml',
                  artworkUrl600: 'http://insecure.example.test/600.jpg',
                  artworkUrl100: 'https://cdn.example.test/100.jpg',
                  genres: ['Podcasts', 'Comedy'],
                  trackCount: 12,
                  collectionExplicitness: 'cleaned',
                },
                {
                  collectionId: 202,
                  collectionName: 'Missing Feed Show',
                  feedUrl: 'ftp://invalid.example.test/feed.xml',
                  genres: ['Podcasts'],
                  trackCount: 5,
                  collectionExplicitness: 'notExplicit',
                },
                {
                  collectionId: 101,
                  collectionName: 'First Lookup Title',
                  artistName: 'Lookup Author 1',
                  feedUrl: 'https://feeds.example.test/101.xml',
                  artworkUrl600: 'https://cdn.example.test/600.jpg',
                  artworkUrl100: 'https://cdn.example.test/100.jpg',
                  genres: ['Technology', 'Podcasts', 'News'],
                  trackCount: 42,
                  collectionExplicitness: 'explicit',
                },
              ],
            },
          };
        }

        throw new Error(`Unexpected URL: ${url}`);
      }
    );

    const api = new ApplePodcastsAPI();
    const results = await api.getTopPodcasts({ limit: 10 });

    assert.strictEqual(requestedUrls.length, 2);
    assert.deepStrictEqual(results, [
      {
        itunesId: '101',
        title: 'First Lookup Title',
        author: 'Lookup Author 1',
        coverUrl: 'https://cdn.example.test/600.jpg',
        feedUrl: 'https://feeds.example.test/101.xml',
        genres: ['Technology', 'News'],
        episodeCount: 42,
        explicit: true,
      },
      {
        itunesId: '404',
        title: 'Second Valid Show',
        author: 'Lookup Author 4',
        coverUrl: 'https://cdn.example.test/100.jpg',
        feedUrl: 'http://feeds.example.test/404.xml',
        genres: ['Comedy'],
        episodeCount: 12,
        explicit: false,
      },
    ]);
  });

  it('parses genre charts with both array and single-object feed.entry', async () => {
    let mode: 'array' | 'single' = 'array';
    mock.method(axios, 'get', async (url: string) => {
      if (
        url ===
        'https://itunes.apple.com/us/rss/toppodcasts/limit=30/genre=1318/json'
      ) {
        if (mode === 'array') {
          return {
            data: {
              feed: {
                entry: [
                  {
                    id: { attributes: { 'im:id': '111' } },
                    'im:name': { label: 'Tech One' },
                  },
                  {
                    id: { attributes: { 'im:id': '222' } },
                    'im:name': { label: 'Tech Two' },
                  },
                ],
              },
            },
          };
        }
        return {
          data: {
            feed: {
              entry: {
                id: { attributes: { 'im:id': '999' } },
                'im:name': { label: 'Solo Tech' },
              },
            },
          },
        };
      }

      if (url === 'https://itunes.apple.com/lookup?id=111,222&entity=podcast') {
        return {
          data: {
            results: [
              {
                collectionId: 111,
                collectionName: 'Tech One',
                artistName: 'Host 1',
                feedUrl: 'https://feeds.example.test/111.xml',
                artworkUrl600: 'https://cdn.example.test/111.jpg',
                genres: ['Technology', 'Podcasts'],
                trackCount: 10,
                collectionExplicitness: 'notExplicit',
              },
              {
                collectionId: 222,
                collectionName: 'Tech Two',
                artistName: 'Host 2',
                feedUrl: 'https://feeds.example.test/222.xml',
                artworkUrl100: 'https://cdn.example.test/222.jpg',
                genres: ['Technology'],
                trackCount: 20,
                collectionExplicitness: 'explicit',
              },
            ],
          },
        };
      }

      if (url === 'https://itunes.apple.com/lookup?id=999&entity=podcast') {
        return {
          data: {
            results: [
              {
                collectionId: 999,
                collectionName: 'Solo Tech',
                artistName: null,
                feedUrl: 'https://feeds.example.test/999.xml',
                artworkUrl600: 'http://insecure.example.test/999.jpg',
                genres: ['Podcasts'],
                trackCount: -1,
                collectionExplicitness: 'notExplicit',
              },
            ],
          },
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const api = new ApplePodcastsAPI();
    const arrayResults = await api.getTopPodcasts({ genre: 1318 });
    assert.strictEqual(arrayResults.length, 2);
    assert.strictEqual(arrayResults[0].itunesId, '111');
    assert.strictEqual(arrayResults[1].itunesId, '222');

    mode = 'single';
    const singleResults = await api.getTopPodcasts({ genre: 1318 });
    assert.deepStrictEqual(singleResults, [
      {
        itunesId: '999',
        title: 'Solo Tech',
        author: null,
        coverUrl: null,
        feedUrl: 'https://feeds.example.test/999.xml',
        genres: [],
        episodeCount: null,
        explicit: false,
      },
    ]);
  });

  it('falls back to the iTunes overall chart when the marketing-tools feed fails', async () => {
    const urls: string[] = [];
    mock.method(axios, 'get', async (url: string) => {
      urls.push(url);
      if (url.includes('rss.marketingtools.apple.com')) {
        throw new Error('timeout of 10000ms exceeded');
      }
      if (url.includes('/toppodcasts/')) {
        return {
          data: {
            feed: {
              entry: {
                id: { attributes: { 'im:id': '777' } },
                'im:name': { label: 'Fallback Show' },
              },
            },
          },
        };
      }
      return {
        data: {
          results: [
            {
              collectionId: 777,
              collectionName: 'Fallback Show',
              artistName: 'Fallback Studio',
              feedUrl: 'https://feeds.example.com/fallback',
              genres: ['News', 'Podcasts'],
              trackCount: 9,
            },
          ],
        },
      };
    });

    const results = await new ApplePodcastsAPI().getTopPodcasts({ limit: 5 });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].title, 'Fallback Show');
    assert.deepStrictEqual(results[0].genres, ['News']);
    assert.ok(
      urls.some(
        (url) =>
          url === 'https://itunes.apple.com/us/rss/toppodcasts/limit=5/json'
      )
    );
  });

  it('handles malformed chart and lookup payloads defensively without calling lookup when chart is empty', async () => {
    let chartPayload: unknown = null;
    let lookupPayload: unknown = null;
    let lookupCalls = 0;

    mock.method(axios, 'get', async (url: string) => {
      if (url.includes('/lookup')) {
        lookupCalls += 1;
        return { data: lookupPayload };
      }
      return { data: chartPayload };
    });

    const api = new ApplePodcastsAPI();

    for (const badChart of [
      null,
      'not-an-object',
      {},
      { feed: null },
      { feed: { results: 'not-an-array' } },
      { feed: { results: [{ id: 'bad,id' }, { id: '' }, null, 42] } },
    ]) {
      chartPayload = badChart;
      const results = await api.getTopPodcasts();
      assert.deepStrictEqual(results, []);
      assert.strictEqual(lookupCalls, 0);
    }

    chartPayload = {
      feed: {
        results: [{ id: '123', name: 'Valid Chart Entry' }],
      },
    };
    for (const badLookup of [
      null,
      'invalid',
      {},
      { results: 'not-an-array' },
      { results: [null, { collectionId: 123 }] },
    ]) {
      lookupPayload = badLookup;
      const results = await api.getTopPodcasts();
      assert.deepStrictEqual(results, []);
    }

    await assert.rejects(
      api.getTopPodcasts({ genre: 999999 }),
      /Invalid Apple Podcasts genre ID/
    );
  });
});
