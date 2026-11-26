import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';

import AurralAPI from '@server/api/aurral';
import CoverArtArchive from '@server/api/coverartarchive';
import DeezerAPI from '@server/api/deezer';
import ListenBrainzAPI from '@server/api/listenbrainz';
import MusicBrainz from '@server/api/musicbrainz';
import LidarrAPI from '@server/api/servarr/lidarr';
import TheAudioDb from '@server/api/theaudiodb';
import { IssueStatus, IssueType } from '@server/constants/issue';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Issue from '@server/entity/Issue';
import IssueComment from '@server/entity/IssueComment';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import cacheManager from '@server/lib/cache';
import { MAX_MUSICBRAINZ_BATCH_IDS } from '@server/lib/externalIds';
import { resetOwnedSongIndexes } from '@server/lib/musicOwnedSongs';
import { resetMusicReadCache } from '@server/lib/musicReadCache';
import { clearRequestAllTracklistCache } from '@server/lib/musicRequestAllPlan';
import { getSettings } from '@server/lib/settings';
import { checkUser } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import request from 'supertest';
import authRoutes from './auth';
import musicRoutes, {
  MAX_ALBUM_TRACKS,
  collectAlbumTrackArtists,
  getAlbumDetails,
} from './music';

let app: Express;

describe('album track artist bounds', () => {
  it('validates, deduplicates, and caps provider track credits', () => {
    const artists = collectAlbumTrackArtists([
      {
        tracks: Array.from(
          { length: Math.ceil((MAX_MUSICBRAINZ_BATCH_IDS + 2) / 20) },
          (_, trackIndex) => ({
            artists: Array.from({ length: 20 }, (_, artistIndex) => {
              const index = trackIndex * 20 + artistIndex;
              if (index === 0) {
                return { artist_mbid: ' ABC ', artist_credit_name: 'First' };
              }
              if (index === 1) {
                return { artist_mbid: 'abc', artist_credit_name: 'Duplicate' };
              }
              if (index === 2) {
                return {
                  artist_mbid: 'bad',
                  artist_credit_name: 'x'.repeat(513),
                };
              }
              return {
                artist_mbid: `id-${index}`,
                artist_credit_name: `Artist ${index}`,
              };
            }),
          })
        ),
      },
    ]);

    assert.deepStrictEqual(artists[0], {
      artistId: 'abc',
      artistName: 'First',
    });
    assert.strictEqual(artists.length, MAX_MUSICBRAINZ_BATCH_IDS);
    assert.deepStrictEqual(collectAlbumTrackArtists({}), []);
  });

  it('stops scanning provider tracks at the global inspection limit', () => {
    const artists = collectAlbumTrackArtists([
      {
        tracks: [
          ...Array.from({ length: MAX_ALBUM_TRACKS }, () => ({ artists: [] })),
          {
            artists: [
              { artist_mbid: 'too-late', artist_credit_name: 'Too Late' },
            ],
          },
        ],
      },
    ]);

    assert.deepStrictEqual(artists, []);
  });
});

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: 'test-secret',
      cookie: { secure: 'auto' },
      resave: false,
      saveUninitialized: false,
    })
  );
  app.use(rateLimit({ windowMs: 60_000, limit: 10_000 }), checkUser);
  app.use('/auth', authRoutes);
  app.use('/music', musicRoutes);
  app.use(
    (
      err: { status?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _next: express.NextFunction
    ) => {
      res
        .status(err.status ?? 500)
        .json({ status: err.status ?? 500, message: err.message });
    }
  );
  return app;
}

before(() => {
  app = createApp();
});

afterEach(() => {
  mock.restoreAll();
});

setupTestDb();

async function login() {
  const settings = getSettings();
  const priorLocalLogin = settings.main.localLogin;
  settings.main.localLogin = true;

  try {
    const agent = request.agent(app);
    const res = await agent
      .post('/auth/local')
      .send({ email: 'admin@seerr.dev', password: 'test1234' });
    assert.strictEqual(res.status, 200);
    return agent;
  } finally {
    settings.main.localLogin = priorLocalLogin;
  }
}

const albumDetails = {
  release_group_metadata: {
    artist: {
      artists: [
        {
          artist_mbid: 'artist-id',
          type: 'Group',
        },
      ],
    },
  },
};

// Successful ListenBrainz detail fixtures still ask MusicBrainz for taxonomy.
// Model an explicitly unavailable supplemental record, not a swallowed socket error.
function mockAlbumEnrichment(
  mbId: string,
  options: { taxonomy?: boolean; artwork?: boolean } = {}
) {
  const assertions: (() => void)[] = [];
  if (options.taxonomy !== false) {
    const taxonomy = mock.method(
      MusicBrainz.prototype,
      'getReleaseGroupDetails',
      async () => {
        throw new Error(
          '[MusicBrainz] Fixture release group unavailable: status code 404'
        );
      }
    );
    assertions.push(() =>
      assert.deepStrictEqual(
        taxonomy.mock.calls.map((call) => call.arguments),
        [[{ releaseGroupId: mbId }]]
      )
    );
  }
  if (options.artwork !== false) {
    const artwork = mock.method(
      CoverArtArchive.prototype,
      'getCoverArt',
      async () => ({ images: [], release: `/release/${mbId}` })
    );
    assertions.push(() =>
      assert.deepStrictEqual(
        artwork.mock.calls.map((call) => call.arguments),
        [[mbId]]
      )
    );
  }
  // Assert before afterEach restores spies; Vitest clears their call history.
  return () => {
    for (const assertion of assertions) {
      assertion();
    }
  };
}

describe('getAlbumDetails MusicBrainz fallback', () => {
  it('lists the songs of the first MusicBrainz release when ListenBrainz has no album data', async () => {
    const listenbrainz = {
      getAlbum: async () => {
        throw new Error('Request failed with status code 404');
      },
    } as unknown as ListenBrainzAPI;
    const releaseIds: string[] = [];
    const musicbrainz = {
      getReleaseGroupDetails: async () => ({
        id: 'abcdefab-0000-4000-8000-000000000001',
        title: 'New Album',
        'primary-type': 'Album',
        'artist-credit': [
          {
            name: 'Artist',
            artist: {
              id: 'abcdefab-0000-4000-8000-0000000000aa',
              name: 'Artist',
            },
          },
        ],
        releases: [{ id: 'abcdefab-0000-4000-8000-0000000000cc' }],
      }),
      getReleaseMediums: async ({ releaseId }: { releaseId: string }) => {
        releaseIds.push(releaseId);
        return [
          {
            format: 'Digital Media',
            name: '',
            position: 1,
            tracks: [
              {
                artist_mbids: [],
                artists: [],
                length: 180000,
                name: 'First Song',
                position: 1,
                recording_mbid: 'abcdefab-0000-4000-8000-0000000000dd',
                total_listen_count: 0,
                total_user_count: 0,
              },
            ],
          },
        ];
      },
    } as unknown as MusicBrainz;

    const album = await getAlbumDetails(
      'abcdefab-0000-4000-8000-000000000001',
      listenbrainz,
      musicbrainz
    );

    assert.deepStrictEqual(releaseIds, [
      'abcdefab-0000-4000-8000-0000000000cc',
    ]);
    assert.strictEqual(album.mediums[0]?.tracks[0]?.name, 'First Song');
    assert.strictEqual(
      album.recordings_release_mbid,
      'abcdefab-0000-4000-8000-0000000000cc'
    );
  });

  it('asks MusicBrainz only when ListenBrainz fails when not asked alongside', async () => {
    let musicBrainzCalls = 0;
    const musicbrainz = {
      getReleaseGroupDetails: async () => {
        musicBrainzCalls += 1;
        return {
          id: 'abcdefab-0000-4000-8000-000000000001',
          title: 'MB Title',
          releases: [],
        };
      },
    } as unknown as MusicBrainz;
    const known = await getAlbumDetails(
      'abcdefab-0000-4000-8000-000000000001',
      { getAlbum: async () => albumDetails } as unknown as ListenBrainzAPI,
      musicbrainz,
      { askMusicBrainzAlongside: false }
    );
    assert.strictEqual(known, albumDetails);
    assert.strictEqual(musicBrainzCalls, 0);

    const unknown = await getAlbumDetails(
      'abcdefab-0000-4000-8000-000000000001',
      {
        getAlbum: async () => {
          throw new Error('Request failed with status code 404');
        },
      } as unknown as ListenBrainzAPI,
      musicbrainz,
      { askMusicBrainzAlongside: false }
    );
    assert.strictEqual(
      unknown.release_group_metadata.release_group.name,
      'MB Title'
    );
    assert.strictEqual(musicBrainzCalls, 1);
  });

  it('still answers without songs when the release lookup fails', async () => {
    const album = await getAlbumDetails(
      'abcdefab-0000-4000-8000-000000000001',
      {
        getAlbum: async () => {
          throw new Error('Request failed with status code 404');
        },
      } as unknown as ListenBrainzAPI,
      {
        getReleaseGroupDetails: async () => ({
          id: 'abcdefab-0000-4000-8000-000000000001',
          title: 'New Album',
          releases: [{ id: 'abcdefab-0000-4000-8000-0000000000cc' }],
        }),
        getReleaseMediums: async () => {
          throw new Error('MusicBrainz 503');
        },
      } as unknown as MusicBrainz
    );
    assert.strictEqual(
      album.release_group_metadata.release_group.name,
      'New Album'
    );
    assert.deepStrictEqual(album.mediums, []);
  });
});

describe('GET /music/:id artist lists', () => {
  // the album lookup asks MusicBrainz alongside ListenBrainz
  beforeEach(() => {
    mock.method(MusicBrainz.prototype, 'getReleaseGroupDetails', async () => {
      throw new Error('MusicBrainz unavailable in tests');
    });
  });

  it('rejects malformed album IDs before artist discography provider lookup', async () => {
    const getAlbum = mock.method(ListenBrainzAPI.prototype, 'getAlbum');

    const agent = await login();
    const res = await agent.get(`/music/${'x'.repeat(129)}/artist-discography`);

    assert.strictEqual(res.status, 404);
    assert.strictEqual(getAlbum.mock.callCount(), 0);
  });

  it('rejects malformed artist discography slider flags before provider lookup', async () => {
    const getAlbum = mock.method(ListenBrainzAPI.prototype, 'getAlbum');

    const agent = await login();
    const res = await agent.get(
      '/music/abcdefab-0000-4000-8000-000000000001/artist-discography?slider=yes'
    );

    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /Slider must be valid/);
    assert.strictEqual(getAlbum.mock.callCount(), 0);
  });

  it('rejects malformed album IDs before similar artist provider lookup', async () => {
    const getAlbum = mock.method(ListenBrainzAPI.prototype, 'getAlbum');

    const agent = await login();
    const res = await agent.get(`/music/${'x'.repeat(129)}/artist-similar`);

    assert.strictEqual(res.status, 404);
    assert.strictEqual(getAlbum.mock.callCount(), 0);
  });

  it('normalizes empty artist discography pagination', async () => {
    mock.method(
      ListenBrainzAPI.prototype,
      'getAlbum',
      async () => albumDetails
    );
    mock.method(ListenBrainzAPI.prototype, 'getArtist', async () => ({
      releaseGroups: [],
    }));

    const agent = await login();
    const res = await agent.get(
      '/music/abcdefab-0000-4000-8000-000000000001/artist-discography?page=999999'
    );

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.page, 500);
    assert.strictEqual(res.body.totalPages, 1);
    assert.strictEqual(res.body.totalResults, 0);
    assert.deepStrictEqual(res.body.results, []);
  });

  it('normalizes empty similar artist pagination', async () => {
    mock.method(
      ListenBrainzAPI.prototype,
      'getAlbum',
      async () => albumDetails
    );
    mock.method(ListenBrainzAPI.prototype, 'getArtist', async () => ({
      similarArtists: {
        artists: [],
      },
    }));

    const agent = await login();
    const res = await agent.get(
      '/music/abcdefab-0000-4000-8000-000000000001/artist-similar?page=999999'
    );

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.page, 500);
    assert.strictEqual(res.body.totalPages, 1);
    assert.strictEqual(res.body.totalResults, 0);
    assert.deepStrictEqual(res.body.results, []);
  });

  it('sorts similar artists without mutating the cached provider response', async () => {
    const artists = Object.freeze([
      {
        artist_mbid: 'lower-score',
        name: 'Lower Score',
        score: 1,
        type: 'Group',
      },
      {
        artist_mbid: 'higher-score',
        name: 'Higher Score',
        score: 10,
        type: 'Group',
      },
    ]);
    mock.method(
      ListenBrainzAPI.prototype,
      'getAlbum',
      async () => albumDetails
    );
    mock.method(ListenBrainzAPI.prototype, 'getArtist', async () => ({
      similarArtists: { artists },
    }));
    mock.method(TheAudioDb.prototype, 'batchGetArtistImages', async () => ({}));

    const agent = await login();
    const res = await agent.get(
      '/music/abcdefab-0000-4000-8000-000000000001/artist-similar'
    );

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(
      res.body.results.map((artist: { id: string }) => artist.id),
      ['higher-score', 'lower-score']
    );
    assert.deepStrictEqual(
      artists.map((artist) => artist.artist_mbid),
      ['lower-score', 'higher-score']
    );
  });
  it('finds the artist through MusicBrainz when ListenBrainz has no album data', async () => {
    mock.method(ListenBrainzAPI.prototype, 'getAlbum', async () => {
      throw new Error(
        '[ListenBrainz] Failed to fetch album details: Request failed with status code 404'
      );
    });
    mock.method(
      MusicBrainz.prototype,
      'getReleaseGroupDetails',
      async () =>
        ({
          id: 'abcdefab-0000-4000-8000-000000000001',
          title: 'MusicBrainz Album',
          'primary-type': 'Album',
          'artist-credit': [
            {
              name: 'MusicBrainz Artist',
              artist: {
                id: 'abcdefab-0000-4000-8000-0000000000aa',
                name: 'MusicBrainz Artist',
              },
            },
          ],
          releases: [],
        }) as unknown as Awaited<
          ReturnType<MusicBrainz['getReleaseGroupDetails']>
        >
    );
    const getArtist = mock.method(
      ListenBrainzAPI.prototype,
      'getArtist',
      async () => ({
        similarArtists: {
          artists: [
            {
              artist_mbid: 'abcdefab-0000-4000-8000-0000000000bb',
              name: 'Similar',
              score: 5,
              type: 'Group',
            },
          ],
        },
      })
    );
    mock.method(TheAudioDb.prototype, 'batchGetArtistImages', async () => ({}));

    const agent = await login();
    const res = await agent.get(
      '/music/abcdefab-0000-4000-8000-000000000001/artist-similar'
    );

    assert.strictEqual(res.status, 200);
    assert.strictEqual(
      getArtist.mock.calls[0]?.arguments[0],
      'abcdefab-0000-4000-8000-0000000000aa'
    );
    assert.deepStrictEqual(
      res.body.results.map((artist: { name: string }) => artist.name),
      ['Similar']
    );
  });

  it('answers an empty similar-artists row and a 404 discography for an artist ListenBrainz does not know', async () => {
    mock.method(
      ListenBrainzAPI.prototype,
      'getAlbum',
      async () => albumDetails
    );
    mock.method(ListenBrainzAPI.prototype, 'getArtist', async () => {
      throw new Error(
        '[ListenBrainz] Failed to fetch artist: Request failed with status code 404'
      );
    });

    const agent = await login();
    const similar = await agent.get(
      '/music/abcdefab-0000-4000-8000-000000000001/artist-similar'
    );
    assert.strictEqual(similar.status, 200);
    assert.deepStrictEqual(similar.body.results, []);

    const discography = await agent.get(
      '/music/abcdefab-0000-4000-8000-000000000001/artist-discography'
    );
    assert.strictEqual(discography.status, 404);
  });

  it('answers 404 for album sub-pages when neither provider knows the album', async () => {
    mock.method(ListenBrainzAPI.prototype, 'getAlbum', async () => {
      throw new Error('Request failed with status code 404');
    });
    mock.method(MusicBrainz.prototype, 'getReleaseGroupDetails', async () => {
      throw new Error('Request failed with status code 404');
    });

    const agent = await login();
    for (const path of ['artist', 'artist-discography', 'artist-similar']) {
      const res = await agent.get(
        `/music/abcdefab-0000-4000-8000-000000000001/${path}`
      );
      assert.strictEqual(res.status, 404, path);
    }
  });
});

describe('GET /music/:id', () => {
  it('rejects malformed album detail IDs before provider lookup', async () => {
    const getAlbum = mock.method(ListenBrainzAPI.prototype, 'getAlbum');

    const agent = await login();
    const res = await agent.get(`/music/${'x'.repeat(129)}`);

    assert.strictEqual(res.status, 404);
    assert.strictEqual(getAlbum.mock.callCount(), 0);
  });

  it('rejects path-control album IDs before provider lookup', async () => {
    const getAlbum = mock.method(ListenBrainzAPI.prototype, 'getAlbum');

    const agent = await login();
    const res = await agent.get('/music/album%3Fredirect%3D%2Faccount');

    assert.strictEqual(res.status, 404);
    assert.strictEqual(getAlbum.mock.callCount(), 0);
  });

  it('rejects malformed album artist IDs before provider lookup', async () => {
    const getAlbum = mock.method(ListenBrainzAPI.prototype, 'getAlbum');

    const agent = await login();
    const res = await agent.get(`/music/${'x'.repeat(129)}/artist`);

    assert.strictEqual(res.status, 404);
    assert.strictEqual(getAlbum.mock.callCount(), 0);
  });

  it('returns album details when optional ListenBrainz stats and tags are absent', async () => {
    const assertEnrichment = mockAlbumEnrichment(
      'abcdefab-0000-4000-8000-000000000001'
    );
    mock.method(ListenBrainzAPI.prototype, 'getAlbum', async () => ({
      release_group_mbid: 'abcdefab-0000-4000-8000-000000000001',
      type: 'Album',
      release_group_metadata: {
        release_group: {
          name: 'Sparse Album',
          date: '2024-01-01',
        },
        artist: {
          name: 'Sparse Artist',
          artists: [],
        },
      },
      mediums: [
        {
          tracks: [
            {
              name: 'Sparse Track',
              position: 1,
              length: 180000,
              recording_mbid: 'recording-id',
            },
          ],
        },
      ],
    }));

    const agent = await login();
    const res = await agent.get('/music/abcdefab-0000-4000-8000-000000000001');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.id, 'abcdefab-0000-4000-8000-000000000001');
    assert.strictEqual(res.body.title, 'Sparse Album');
    assert.deepStrictEqual(res.body.tags.artist, []);
    assert.deepStrictEqual(res.body.stats.listeners, []);
    assert.deepStrictEqual(res.body.tracks[0].artists, []);
    assertEnrichment();
  });

  it('includes release labels when MusicBrainz exposes them', async () => {
    const assertEnrichment = mockAlbumEnrichment(
      'abcdefab-0000-4000-8000-000000000001',
      {
        artwork: false,
      }
    );
    const releaseId = '00000000-0000-0000-0000-000000000001';
    mock.method(ListenBrainzAPI.prototype, 'getAlbum', async () => ({
      caa_release_mbid: releaseId,
      recordings_release_mbid: '',
      release_group_mbid: 'abcdefab-0000-4000-8000-000000000001',
      type: 'Album',
      release_group_metadata: {
        release_group: {
          name: 'Labelled Album',
          date: '2024-01-01',
          caa_id: 0,
          caa_release_mbid: '',
          rels: [],
          type: 'Album',
        },
        release: {
          caa_id: 0,
          caa_release_mbid: releaseId,
          date: '2024-01-01',
          name: 'Labelled Album',
          rels: [],
          type: 'Album',
        },
        artist: {
          name: 'Labelled Artist',
          artist_credit_id: 0,
          artists: [],
        },
        tag: { artist: [], release_group: [] },
      },
      listening_stats: {
        artist_mbids: [],
        artist_name: 'Labelled Artist',
        caa_id: 0,
        caa_release_mbid: releaseId,
        from_ts: 0,
        last_updated: 0,
        listeners: [],
        release_group_mbid: 'abcdefab-0000-4000-8000-000000000001',
        release_group_name: 'Labelled Album',
        stats_range: '',
        to_ts: 0,
        total_listen_count: 0,
        total_user_count: 0,
      },
      mediums: [],
    }));
    mock.method(MusicBrainz.prototype, 'getReleaseLabels', async () => [
      'Example Records',
      'Example Records Publishing',
    ]);
    mock.method(CoverArtArchive.prototype, 'getCoverArt', async () => ({
      images: [],
    }));

    const agent = await login();
    const res = await agent.get('/music/abcdefab-0000-4000-8000-000000000001');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(
      res.body.recordLabel,
      'Example Records, Example Records Publishing'
    );
    assertEnrichment();
  });

  it('falls back to MusicBrainz when ListenBrainz has no album detail page', async (t) => {
    const settings = getSettings();
    const originalLidarr = settings.lidarr;
    settings.lidarr = [];
    t.after(() => {
      settings.lidarr = originalLidarr;
    });
    const assertEnrichment = mockAlbumEnrichment(
      'abcdefab-0000-4000-8000-000000000001',
      {
        taxonomy: false,
      }
    );
    const images = mock.method(
      TheAudioDb.prototype,
      'getArtistImages',
      async () => ({ artistThumb: null, artistBackground: null })
    );
    mock.method(ListenBrainzAPI.prototype, 'getAlbum', async () => {
      throw new Error('[ListenBrainz] Failed to fetch album details: 404');
    });
    mock.method(MusicBrainz.prototype, 'getReleaseGroupDetails', async () => ({
      id: 'abcdefab-0000-4000-8000-000000000001',
      score: 100,
      media_type: 'album',
      title: 'MusicBrainz Album',
      'primary-type': 'Album',
      'first-release-date': '2024-02-03',
      'artist-credit': [
        {
          name: 'MusicBrainz Artist',
          artist: {
            id: 'artist-id',
            name: 'MusicBrainz Artist',
            'sort-name': 'Artist, MusicBrainz',
          },
        },
      ],
      posterPath: undefined,
      'type-id': '',
      'primary-type-id': '',
      count: 1,
      releases: [],
      releasedate: '2024-02-03',
      tags: [{ count: 5, name: 'jazz' }],
    }));

    const agent = await login();
    const res = await agent.get('/music/abcdefab-0000-4000-8000-000000000001');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.id, 'abcdefab-0000-4000-8000-000000000001');
    assert.strictEqual(res.body.title, 'MusicBrainz Album');
    assert.strictEqual(res.body.artist.name, 'MusicBrainz Artist');
    assert.deepStrictEqual(res.body.tags.releaseGroup, [
      { count: 5, genreMbid: '', tag: 'jazz' },
    ]);
    assert.deepStrictEqual(
      images.mock.calls.map((call) => call.arguments),
      [['artist-id']]
    );
    assertEnrichment();
  });

  it('returns the normalized MusicBrainz release-group rating and vote count', async () => {
    const audioRating = mock.method(
      TheAudioDb.prototype,
      'getAlbumRating',
      async () => {
        throw new Error('Fixture TheAudioDb rating unavailable');
      }
    );
    mock.method(
      MusicBrainz.prototype,
      'getReleaseGroupDetails',
      async () =>
        ({
          id: 'abcdefab-0000-4000-8000-000000000001',
          score: 100,
          media_type: 'album',
          title: 'Rated Album',
          'primary-type': 'Album',
          'first-release-date': '2024-02-03',
          'artist-credit': [],
          posterPath: undefined,
          'type-id': '',
          'primary-type-id': '',
          count: 0,
          releases: [],
          releasedate: '2024-02-03',
          rating: { value: 4.25, 'votes-count': 32 },
        }) as Awaited<ReturnType<MusicBrainz['getReleaseGroupDetails']>>
    );

    const agent = await login();
    const res = await agent.get(
      '/music/abcdefab-0000-4000-8000-000000000001/rating'
    );

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(
      audioRating.mock.calls.map((call) => call.arguments),
      [['abcdefab-0000-4000-8000-000000000001']]
    );
    assert.deepStrictEqual(res.body, {
      rating: {
        score: 8.5,
        votes: 32,
        url: 'https://musicbrainz.org/release-group/abcdefab-0000-4000-8000-000000000001',
        source: 'musicbrainz',
      },
      ratings: [
        {
          score: 8.5,
          votes: 32,
          url: 'https://musicbrainz.org/release-group/abcdefab-0000-4000-8000-000000000001',
          source: 'musicbrainz',
        },
      ],
      failedSources: ['theaudiodb'],
    });
  });

  it('returns 404 when neither music detail provider has the album', async () => {
    mock.method(ListenBrainzAPI.prototype, 'getAlbum', async () => {
      throw new Error('[ListenBrainz] Failed to fetch album details: 404');
    });
    mock.method(MusicBrainz.prototype, 'getReleaseGroupDetails', async () => {
      throw new Error(
        '[MusicBrainz] Failed to fetch release group details: Request failed with status code 404'
      );
    });

    const agent = await login();
    const res = await agent.get('/music/abcdefab-0000-4000-8000-000000000002');

    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.message, 'Album not found');
  });

  it('filters saved media request users from music detail responses', async () => {
    const assertEnrichment = mockAlbumEnrichment(
      'abcdefab-0000-4000-8000-000000000001'
    );
    mock.method(ListenBrainzAPI.prototype, 'getAlbum', async () => ({
      release_group_mbid: 'abcdefab-0000-4000-8000-000000000001',
      type: 'Album',
      release_group_metadata: {
        release_group: {
          name: 'Saved Album',
          date: '2024-01-01',
        },
        artist: {
          name: 'Saved Artist',
          artists: [],
        },
        tag: {
          artist: [],
          release_group: [],
        },
      },
      listening_stats: {
        total_listen_count: 0,
        total_user_count: 0,
        listeners: [],
      },
      mediums: [],
    }));

    await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mbId: 'abcdefab-0000-4000-8000-000000000001',
        mediaType: MediaType.MUSIC,
      })
    );

    const agent = await login();
    const res = await agent.get('/music/abcdefab-0000-4000-8000-000000000001');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(
      res.body.mediaInfo.mbId,
      'abcdefab-0000-4000-8000-000000000001'
    );
    assertEnrichment();
  });

  it('returns every available Lidarr quality without exposing completed requests', async (t) => {
    const assertEnrichment = mockAlbumEnrichment(
      'abcdefab-0000-4000-8000-000000000003'
    );
    const albums = mock.method(LidarrAPI.prototype, 'getAlbums', async () => [
      {
        id: 10,
        mbId: 'abcdefab-0000-4000-8000-000000000003',
        foreignAlbumId: 'abcdefab-0000-4000-8000-000000000003',
        title: 'Quality Album',
        monitored: true,
        artistId: 1,
        titleSlug: 'quality-album',
        profileId: 1,
        duration: 180000,
        albumType: 'Album',
        statistics: {
          trackFileCount: 0,
          trackCount: 1,
          totalTrackCount: 1,
          sizeOnDisk: 0,
          percentOfTracks: 0,
        },
      },
    ]);
    const tracks = mock.method(LidarrAPI.prototype, 'getTracks', async () => [
      {
        id: 1,
        albumId: 10,
        title: 'Quality Track',
        trackNumber: '1',
        absoluteTrackNumber: 1,
        mediumNumber: 1,
        hasFile: false,
        trackFileId: 0,
        foreignRecordingId: 'quality-recording-id',
      },
    ]);
    mock.method(ListenBrainzAPI.prototype, 'getAlbum', async () => ({
      release_group_mbid: 'abcdefab-0000-4000-8000-000000000003',
      type: 'Album',
      release_group_metadata: {
        release_group: { name: 'Quality Album', date: '2024-01-01' },
        artist: { name: 'Quality Artist', artists: [] },
        tag: { artist: [], release_group: [] },
      },
      listening_stats: {
        total_listen_count: 0,
        total_user_count: 0,
        listeners: [],
      },
      mediums: [],
    }));

    const settings = getSettings();
    settings.lidarr = [
      {
        id: 1,
        name: 'Lidarr MP3',
        hostname: 'lidarr-mp3.local',
        port: 8686,
        apiKey: 'mp3-key',
        useSsl: false,
        activeProfileId: 1,
        activeProfileName: 'MP3',
        activeMetadataProfileId: 1,
        activeMetadataProfileName: 'Standard',
        activeDirectory: '/music-mp3',
        tags: [],
        is4k: false,
        isDefault: true,
        syncEnabled: true,
        preventSearch: false,
        tagRequests: false,
        overrideRule: [],
      },
      {
        id: 2,
        name: 'Lidarr FLAC',
        hostname: 'lidarr-flac.local',
        port: 8686,
        apiKey: 'flac-key',
        useSsl: false,
        activeProfileId: 2,
        activeProfileName: 'FLAC',
        activeMetadataProfileId: 1,
        activeMetadataProfileName: 'Standard',
        activeDirectory: '/music-flac',
        tags: [],
        is4k: false,
        isDefault: false,
        syncEnabled: true,
        preventSearch: false,
        tagRequests: false,
        overrideRule: [],
      },
    ];
    t.after(() => {
      settings.lidarr = [];
    });

    const user = await getRepository(User).findOneByOrFail({
      email: 'admin@seerr.dev',
    });
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mbId: 'abcdefab-0000-4000-8000-000000000003',
        mediaType: MediaType.MUSIC,
        status: MediaStatus.AVAILABLE,
        serviceId: 1,
        externalServiceId: 10,
      })
    );
    await getRepository(MediaRequest).save(
      new MediaRequest({
        type: MediaType.MUSIC,
        status: MediaRequestStatus.COMPLETED,
        media,
        requestedBy: user,
        is4k: false,
        serverId: 2,
        serviceTargets: [
          {
            serviceType: 'lidarr',
            format: 'music',
            serverId: 2,
            externalServiceId: 20,
            status: MediaStatus.AVAILABLE,
          },
        ],
      })
    );

    const agent = await login();
    const res = await agent.get('/music/abcdefab-0000-4000-8000-000000000003');

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(
      albums.mock.calls.map((call) => call.arguments),
      [[300], [300]]
    );
    assert.deepStrictEqual(
      tracks.mock.calls.map((call) => call.arguments),
      [
        [{ albumId: 10 }, 300],
        [{ albumId: 10 }, 300],
      ]
    );
    assert.deepStrictEqual(res.body.trackAvailability, { mp3: [], flac: [] });
    assert.deepStrictEqual(res.body.availableServices, [
      { serverId: 1, quality: 'MP3' },
      { serverId: 2, quality: 'FLAC' },
    ]);
    assert.strictEqual(res.body.mediaInfo.requests.length, 0);
    assertEnrichment();
  });

  it('hydrates independent request and issue trees without dropping detail state', async () => {
    const assertEnrichment = mockAlbumEnrichment(
      'abcdefab-0000-4000-8000-000000000001'
    );
    mock.method(ListenBrainzAPI.prototype, 'getAlbum', async () => ({
      release_group_mbid: 'abcdefab-0000-4000-8000-000000000001',
      type: 'Album',
      release_group_metadata: {
        release_group: { name: 'Saved Album', date: '2024-01-01' },
        artist: { name: 'Saved Artist', artists: [] },
        tag: { artist: [], release_group: [] },
      },
      listening_stats: {
        total_listen_count: 0,
        total_user_count: 0,
        listeners: [],
      },
      mediums: [],
    }));

    const user = await getRepository(User).findOneByOrFail({
      email: 'admin@seerr.dev',
    });
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mbId: 'abcdefab-0000-4000-8000-000000000001',
        mediaType: MediaType.MUSIC,
      })
    );
    await getRepository(MediaRequest).save(
      new MediaRequest({
        type: MediaType.MUSIC,
        status: MediaRequestStatus.PENDING,
        media,
        requestedBy: user,
        modifiedBy: user,
        is4k: false,
      })
    );
    await getRepository(Issue).save(
      new Issue({
        createdBy: user,
        issueType: IssueType.AUDIO,
        status: IssueStatus.OPEN,
        media,
        comments: [
          new IssueComment({ user, message: 'Independent issue comment' }),
        ],
      })
    );

    const agent = await login();
    const res = await agent.get('/music/abcdefab-0000-4000-8000-000000000001');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.mediaInfo.requests.length, 1);
    assert.strictEqual(res.body.mediaInfo.issues.length, 1);
    assert.strictEqual(
      res.body.mediaInfo.issues[0].comments[0].message,
      'Independent issue comment'
    );
    assertEnrichment();
  });
});

describe('Aurral music endpoints', () => {
  const configureAurral = (t: { after: (fn: () => void) => void }) => {
    const settings = getSettings();
    const originalAurral = settings.aurral;
    settings.aurral = [
      {
        id: 1,
        name: 'Aurral',
        hostname: 'aurral.local',
        port: 3001,
        useSsl: false,
        apiKey: 'aurral-key',
        isDefault: true,
        syncEnabled: true,
      },
    ];
    // nothing in these tests may reach a real Aurral; tests that care re-mock
    mock.method(AurralAPI.prototype, 'getArtistDetails', async () => null);
    mock.method(AurralAPI.prototype, 'getArtistImageUrl', async () => null);
    mock.method(
      AurralAPI.prototype,
      'getLibraryArtistReleaseGroups',
      async () => ({ owned: new Set<string>(), partial: new Set<string>() })
    );
    // nor Deezer's track ranks or genre lists
    mock.method(DeezerAPI.prototype, 'searchTracks', async () => []);
    mock.method(DeezerAPI.prototype, 'getArtistsForGenreTag', async () => []);
    // nor ListenBrainz for the track lists that decide which singles an
    // album covers (tests that care re-mock)
    clearRequestAllTracklistCache();
    mock.method(ListenBrainzAPI.prototype, 'getAlbum', async () => {
      throw new Error('No track lists in these tests.');
    });
    // nor the library's song pages (the owned-song index)
    resetOwnedSongIndexes();
    resetMusicReadCache();
    mock.method(AurralAPI.prototype, 'getLibraryAlbumPage', async () => ({
      kind: 'albums' as const,
      page: 1,
      pageSize: 60,
      total: 0,
      hasMore: false,
      items: [],
    }));
    mock.method(AurralAPI.prototype, 'getLibraryTrackPage', async () => ({
      page: 1,
      total: 0,
      hasMore: false,
      items: [],
    }));
    t.after(() => {
      settings.aurral = originalAurral;
    });
  };

  it('redirects /artist-image only to allowlisted https URLs with private Cache-Control', async (t) => {
    configureAurral(t);
    let upstreamUrl: string | null =
      'https://cdn-images.dzcdn.net/images/artist/abc/500x500.jpg';
    mock.method(
      AurralAPI.prototype,
      'getArtistImageUrl',
      async () => upstreamUrl
    );

    const agent = await login();
    const mbid = '11111111-1111-4111-8111-111111111111';

    const ok = await agent.get(`/music/artist-image/${mbid}`);
    assert.strictEqual(ok.status, 302);
    assert.strictEqual(
      ok.headers.location,
      'https://cdn-images.dzcdn.net/images/artist/abc/500x500.jpg'
    );
    assert.strictEqual(ok.headers['cache-control'], 'private, max-age=86400');

    for (const unsafe of [
      'https://evilcoverartarchive.org/photo.jpg',
      'https://127.0.0.1/photo.jpg',
      'https://localhost/photo.jpg',
      'http://dzcdn.net/photo.jpg',
      'https://attacker.example/photo.jpg',
    ]) {
      upstreamUrl = unsafe;
      const rejected = await agent.get(`/music/artist-image/${mbid}`);
      assert.strictEqual(rejected.status, 404, unsafe);
    }
  });

  it('redirects /album-art to safe album art, passes artist and title, and answers 404/400/502', async (t) => {
    configureAurral(t);
    const mbid = '11111111-1111-4111-8111-111111111111';
    let answer: string | null | Error =
      'https://cdn-images.dzcdn.net/images/cover/abc/1000x1000.jpg';
    const art = mock.method(AurralAPI.prototype, 'getAlbumArtUrl', async () => {
      if (answer instanceof Error) throw answer;
      return answer;
    });
    const agent = await login();

    const ok = await agent
      .get(`/music/album-art/${mbid}`)
      .query({ artist: 'YFN Lucci', title: 'everything i said i am.' });
    assert.strictEqual(ok.status, 302);
    assert.strictEqual(
      ok.headers.location,
      'https://cdn-images.dzcdn.net/images/cover/abc/1000x1000.jpg'
    );
    assert.strictEqual(ok.headers['cache-control'], 'private, max-age=86400');
    assert.deepStrictEqual(art.mock.calls[0].arguments, [
      mbid,
      'YFN Lucci',
      'everything i said i am.',
    ]);

    answer = null;
    assert.strictEqual(
      (await agent.get(`/music/album-art/${mbid}`)).status,
      404
    );
    answer = 'https://attacker.example/x.jpg';
    assert.strictEqual(
      (await agent.get(`/music/album-art/${mbid}`)).status,
      404
    );
    answer = new Error('down');
    assert.strictEqual(
      (await agent.get(`/music/album-art/${mbid}`)).status,
      502
    );
    assert.strictEqual(
      (await agent.get('/music/album-art/not-a-uuid')).status,
      400
    );
  });

  it('passes ?name= to getArtistImageUrl and rejects names longer than 200 chars', async (t) => {
    configureAurral(t);
    const mbid = '11111111-1111-4111-8111-111111111111';
    const imageMock = mock.method(
      AurralAPI.prototype,
      'getArtistImageUrl',
      async (_id: string, name?: string) =>
        name === 'Taylor Swift'
          ? 'https://cdn-images.dzcdn.net/images/artist/ts.jpg'
          : null
    );

    const agent = await login();
    const ok = await agent.get(
      `/music/artist-image/${mbid}?name=${encodeURIComponent('Taylor Swift')}`
    );
    assert.strictEqual(ok.status, 302);
    assert.strictEqual(
      ok.headers.location,
      'https://cdn-images.dzcdn.net/images/artist/ts.jpg'
    );
    assert.deepStrictEqual(imageMock.mock.calls[0].arguments, [
      mbid,
      'Taylor Swift',
    ]);

    const tooLong = await agent.get(
      `/music/artist-image/${mbid}?name=${'a'.repeat(201)}`
    );
    assert.strictEqual(tooLong.status, 400);
  });

  it('passes incomplete: true through on GET /music/artist/:mbid', async (t) => {
    configureAurral(t);
    const artistMbid = '11111111-1111-4111-8111-111111111111';
    mock.method(AurralAPI.prototype, 'getArtistDetails', async () => ({
      mbid: artistMbid,
      name: 'Unknown Artist',
      type: null,
      country: null,
      beginYear: null,
      endYear: null,
      genres: [],
      bio: null,
      releaseGroups: [],
      incomplete: true,
    }));
    mock.method(
      AurralAPI.prototype,
      'getLibraryArtistReleaseGroups',
      async () => ({ owned: new Set<string>(), partial: new Set<string>() })
    );

    const agent = await login();
    const res = await agent.get(`/music/artist/${artistMbid}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.incomplete, true);
  });

  it('separates fully owned, partial, and unowned release groups on GET /music/artist/:mbid', async (t) => {
    configureAurral(t);
    const artistMbid = '11111111-1111-4111-8111-111111111111';
    const fullLibraryId = '22222222-2222-4222-8222-222222222222';
    const partialLibraryId = '33333333-3333-4333-8333-333333333333';
    const fullMediaId = '44444444-4444-4444-8444-444444444444';
    const partialMediaId = '55555555-5555-4555-8555-555555555555';
    const unownedId = '66666666-6666-4666-8666-666666666666';

    mock.method(AurralAPI.prototype, 'getArtistDetails', async () => ({
      mbid: artistMbid,
      name: 'Test Artist',
      type: 'Group',
      country: 'US',
      beginYear: 2020,
      endYear: null,
      genres: [],
      bio: null,
      releaseGroups: [
        {
          id: fullLibraryId,
          title: 'Full Library Album',
          year: 2024,
          primaryType: 'Album' as const,
          secondaryTypes: [],
          coverUrl: null,
        },
        {
          id: partialLibraryId,
          title: 'Partial Library Album',
          year: 2023,
          primaryType: 'Album' as const,
          secondaryTypes: [],
          coverUrl: null,
        },
        {
          id: fullMediaId,
          title: 'Full Media Album',
          year: 2022,
          primaryType: 'Album' as const,
          secondaryTypes: [],
          coverUrl: null,
        },
        {
          id: partialMediaId,
          title: 'Partial Media Album',
          year: 2021,
          primaryType: 'Album' as const,
          secondaryTypes: [],
          coverUrl: null,
        },
        {
          id: unownedId,
          title: 'Unowned Album',
          year: 2020,
          primaryType: 'Album' as const,
          secondaryTypes: [],
          coverUrl: null,
        },
      ],
    }));
    mock.method(
      AurralAPI.prototype,
      'getLibraryArtistReleaseGroups',
      async () => ({
        owned: new Set([fullLibraryId]),
        partial: new Set([partialLibraryId]),
      })
    );

    await getRepository(Media).save([
      new Media({
        tmdbId: 0,
        mbId: fullMediaId,
        mediaType: MediaType.MUSIC,
        status: MediaStatus.AVAILABLE,
      }),
      new Media({
        tmdbId: 0,
        mbId: partialMediaId,
        mediaType: MediaType.MUSIC,
        status: MediaStatus.PARTIALLY_AVAILABLE,
      }),
    ]);

    const agent = await login();
    const res = await agent.get(`/music/artist/${artistMbid}`);

    assert.strictEqual(res.status, 200);
    const byId = new Map(
      (
        res.body.releaseGroups as {
          id: string;
          inLibrary: boolean;
          partial: boolean;
        }[]
      ).map((group) => [group.id, group])
    );
    assert.strictEqual(byId.get(fullLibraryId)?.inLibrary, true);
    assert.strictEqual(byId.get(fullLibraryId)?.partial, false);
    assert.strictEqual(byId.get(partialLibraryId)?.inLibrary, false);
    assert.strictEqual(byId.get(partialLibraryId)?.partial, true);
    assert.strictEqual(byId.get(fullMediaId)?.inLibrary, true);
    assert.strictEqual(byId.get(fullMediaId)?.partial, false);
    assert.strictEqual(byId.get(partialMediaId)?.inLibrary, false);
    assert.strictEqual(byId.get(partialMediaId)?.partial, true);
    assert.strictEqual(byId.get(unownedId)?.inLibrary, false);
    assert.strictEqual(byId.get(unownedId)?.partial, false);
  });

  it('keeps trackCount and availableTrackCount on GET /music/library album items', async (t) => {
    configureAurral(t);
    mock.method(AurralAPI.prototype, 'getLibraryPage', async () => ({
      kind: 'albums' as const,
      page: 1,
      pageSize: 30,
      total: 1,
      hasMore: false,
      items: [
        {
          id: 10,
          title: 'Partial Album',
          artistName: 'Artist',
          mbid: null,
          releaseGroupMbid: null,
          releaseDate: '2024-01-01',
          addedAt: '2026-01-01T00:00:00.000Z',
          trackCount: 12,
          availableTrackCount: 5,
          coverUrl: '/api/v1/music/library-art/albums/10',
        },
      ],
    }));

    const agent = await login();
    const res = await agent.get('/music/library?kind=albums');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.items[0].trackCount, 12);
    assert.strictEqual(res.body.items[0].availableTrackCount, 5);
  });

  it('drops getActiveDownloads and downloadingCount from GET /music/library-overview', async (t) => {
    configureAurral(t);
    const activeDownloadsMock = mock.method(
      AurralAPI.prototype,
      'getActiveDownloads',
      async () => ({ albums: ['a'], artists: [], tracks: [] })
    );
    mock.method(AurralAPI.prototype, 'getLibraryPage', async () => ({
      kind: 'albums' as const,
      page: 1,
      pageSize: 12,
      total: 42,
      hasMore: true,
      items: [],
    }));

    const agent = await login();
    const res = await agent.get('/music/library-overview');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(activeDownloadsMock.mock.callCount(), 0);
    assert.deepStrictEqual(res.body, {
      totalAlbums: 42,
      recentlyAdded: [],
    });
    assert.strictEqual('downloadingCount' in res.body, false);
  });

  it('returns the 20 most recent failed items alongside failedTotal on GET /music/activity', async (t) => {
    configureAurral(t);
    const failedItems = Array.from({ length: 25 }, (_, index) => ({
      id: `failed-${index + 1}`,
      status: 'failed',
      statusLabel: 'Failed',
      trackName: `Failed Track ${index + 1}`,
      artistName: 'Artist',
      albumName: 'Album',
      source: 'aurral',
      requestedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
      completedAt: new Date(Date.UTC(2026, 0, 1, 1, index)).toISOString(),
      cause: { kind: 'search', name: 'No match' },
    }));
    mock.method(AurralAPI.prototype, 'getActivity', async () => failedItems);

    const agent = await login();
    const res = await agent.get('/music/activity');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.failedTotal, 25);
    assert.strictEqual(res.body.failed.length, 20);
    assert.strictEqual(res.body.failed[0].id, 'failed-25');
    assert.strictEqual(res.body.failed[19].id, 'failed-6');
    assert.deepStrictEqual(res.body.failed[0], {
      id: 'failed-25',
      title: 'Failed Track 25',
      artistName: 'Artist',
      albumName: 'Album',
      status: 'failed',
      statusLabel: 'Failed',
      source: 'aurral',
      requestedAt: failedItems[24].requestedAt,
      cause: { kind: 'search', name: 'No match' },
    });
  });

  it('leaves a failed song out of GET /music/activity once a later grab got it', async (t) => {
    configureAurral(t);
    const at = new Date(Date.UTC(2026, 0, 1)).toISOString();
    mock.method(AurralAPI.prototype, 'getActivity', async () => [
      {
        id: 'old-fail',
        status: 'failed',
        trackName: 'Xscape',
        artistName: 'Michael Jackson',
        requestedAt: at,
        completedAt: at,
      },
      {
        id: 'later-done',
        status: 'completed',
        trackName: 'Xscape',
        artistName: 'Michael Jackson',
        requestedAt: at,
        completedAt: at,
      },
      {
        id: 'real-fail',
        status: 'failed',
        trackName: 'Let Me Go',
        artistName: 'Michael Jackson',
        requestedAt: at,
        completedAt: at,
      },
    ]);

    const agent = await login();
    const res = await agent.get('/music/activity');

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(
      res.body.failed.map((item: { id: string }) => item.id),
      ['real-fail']
    );
    assert.strictEqual(res.body.failedTotal, 1);
  });

  describe('GET /music/search and GET /music/artist/:mbid/similar', () => {
    afterEach(() => {
      cacheManager.getCache('aurral').flush();
      cacheManager.getCache('deezer').flush();
      cacheManager.getCache('musicbrainz').flush();
    });

    it('returns degraded: true without caching when Aurral status is not ok, and preserves library results', async (t) => {
      configureAurral(t);
      let status: 'unavailable' | 'ok' = 'unavailable';
      const aurralGet = mock.method(
        AurralAPI.prototype as unknown as {
          get: (
            endpoint: string,
            options?: unknown,
            ttl?: number
          ) => Promise<unknown>;
        },
        'get',
        async (endpoint: string) => {
          if (endpoint === '/api/search/unified') {
            return {
              status,
              artists: [],
              albums: [],
              tracks: [
                {
                  title: 'Track One',
                  artistName: 'Artist One',
                },
              ],
              top: null,
            };
          }
          if (endpoint === '/api/search/library') {
            return {
              artists: [{ id: 1, name: 'Artist One', mbid: null }],
              albums: [],
              tracks: [
                {
                  title: 'Owned Song',
                  artistName: 'Artist One',
                  albumMbid: '11111111-1111-4111-8111-111111111111',
                  artistMbid: '22222222-2222-4222-8222-222222222222',
                },
              ],
            };
          }
          if (endpoint === '/api/search') {
            return { albums: [] };
          }
          return {};
        }
      );
      mock.method(DeezerAPI.prototype, 'searchArtists', async () => []);

      const agent = await login();
      const first = await agent.get('/music/search?q=artist+one');
      assert.strictEqual(first.status, 200);
      assert.strictEqual(first.body.degraded, true);
      assert.strictEqual(first.body.library.artists[0].inLibrary, true);
      assert.strictEqual(first.body.library.tracks[0].inLibrary, true);
      assert.strictEqual(
        first.body.library.tracks[0].albumMbid,
        '11111111-1111-4111-8111-111111111111'
      );

      // Degraded unified search must not be cached, so the second call hits Aurral again.
      status = 'ok';
      const second = await agent.get('/music/search?q=artist+one');
      assert.strictEqual(second.status, 200);
      assert.strictEqual(second.body.degraded, false);
      const unifiedCalls = aurralGet.mock.calls.filter(
        (c) => c.arguments[0] === '/api/search/unified'
      );
      assert.strictEqual(unifiedCalls.length, 2);

      // Now that status was 'ok', a third call uses the cached unified response.
      const third = await agent.get('/music/search?q=artist+one');
      assert.strictEqual(third.status, 200);
      assert.strictEqual(third.body.degraded, false);
      const unifiedCallsAfterOk = aurralGet.mock.calls.filter(
        (c) => c.arguments[0] === '/api/search/unified'
      );
      assert.strictEqual(unifiedCallsAfterOk.length, 2);
    });

    it('leads the Artists row with the artist of a clearly found album and drops loose matches', async () => {
      const { focusArtistsOnTop } = await import('@server/routes/music');
      const artist = (name: string, mbid: string | null = null) => ({
        mbid,
        name,
        image: null,
        inLibrary: false,
      });
      const focused = focusArtistsOnTop(
        [artist('Everything Is Everything'), artist('Everything Everything')],
        { artistName: 'YFN Lucci', artistMbid: 'yfn-id' },
        'YFN Lucci everything i said i am. / everything she said she is.'
      );
      assert.deepStrictEqual(
        focused.map((entry) => [entry.name, entry.mbid]),
        [['YFN Lucci', 'yfn-id']]
      );

      // an artist named in the query stays; the album's artist moves first
      const kept = focusArtistsOnTop(
        [artist('Drake'), artist('Future', 'future-id')],
        { artistName: 'Future', artistMbid: 'future-id' },
        'future drake what a time to be alive'
      );
      assert.deepStrictEqual(
        kept.map((entry) => entry.name),
        ['Future', 'Drake']
      );

      // compilations keep the list as it was
      const various = [artist('Someone')];
      assert.strictEqual(
        focusArtistsOnTop(
          various,
          { artistName: 'Various Artists', artistMbid: null },
          'now 99'
        ),
        various
      );
    });

    it('leaves sleep and noise filler out of the new releases', async () => {
      const { isFillerAlbum } = await import('@server/routes/music');
      for (const title of [
        'Brown Noise: Loops for Relaxation, Deep Sleep, Meditation, And Babies',
        'Rain Sounds For Sleep',
        'White Noise 10 Hours',
        'Sleep Music for Babies',
      ]) {
        assert.strictEqual(
          isFillerAlbum({ title, artistName: 'Someone' }),
          true,
          title
        );
      }
      for (const title of [
        'OTIS',
        'Sounds of Silence',
        'Brown Sugar',
        'Sleep Token Live',
        'everything i said i am.',
      ]) {
        assert.strictEqual(
          isFillerAlbum({ title, artistName: 'Someone' }),
          false,
          title
        );
      }
    });

    it('gives chart albums their MusicBrainz id so they can be requested and opened', async () => {
      const { resolveChartAlbumIds } = await import('@server/routes/music');
      const chart = (title: string, artistName: string) => ({
        mbid: null,
        title,
        artistName,
        artistMbid: null,
        primaryType: 'Album',
        releaseDate: '2026-11-20',
        coverUrl: 'https://cdn-images.dzcdn.net/images/cover/x/500x500.jpg',
        inLibrary: false,
      });
      const lookups: string[] = [];
      const aurral = {
        searchAlbums: async (query: string) => {
          lookups.push(query);
          if (query.startsWith('Lil Baby')) {
            return [
              { ...chart('Something Else', 'Lil Baby'), mbid: 'wrong-id' },
              {
                ...chart('FRESH', 'Lil Baby'),
                mbid: '55555555-5555-4555-8555-555555555555',
                artistMbid: '66666666-6666-4666-8666-666666666666',
              },
            ];
          }
          if (query.startsWith('Broken')) throw new Error('down');
          return [];
        },
      } as unknown as AurralAPI;

      const resolved = await resolveChartAlbumIds(aurral, [
        chart('FRESH (Bonus Track)', 'Lil Baby'),
        chart('Nothing Matches', 'Nobody'),
        chart('Anything', 'Broken'),
        { ...chart('Already Known', 'Someone'), mbid: 'known-id' },
      ]);
      assert.strictEqual(
        resolved[0].mbid,
        '55555555-5555-4555-8555-555555555555'
      );
      assert.strictEqual(
        resolved[0].artistMbid,
        '66666666-6666-4666-8666-666666666666'
      );
      assert.strictEqual(resolved[1].mbid, null);
      assert.strictEqual(resolved[2].mbid, null);
      assert.strictEqual(resolved[3].mbid, 'known-id');
      assert.strictEqual(lookups.length, 3); // an album with an id is not looked up
    });

    it('marks songs whose album is requested so they show as requested, not Get', async (t) => {
      configureAurral(t);
      mock.method(AurralAPI.prototype, 'getArtistDetails', async () => null);
      mock.method(AurralAPI.prototype, 'getArtistImageUrl', async () => null);
      mock.method(DeezerAPI.prototype, 'searchArtists', async () => []);
      mock.method(AurralAPI.prototype, 'searchAlbums', async () => []);
      mock.method(MusicBrainz.prototype, 'searchArtist', async () => []);
      const requestedAlbum = '33333333-3333-4333-8333-333333333333';
      const otherAlbum = '44444444-4444-4444-8444-444444444444';
      const song = (title: string, albumMbid: string) => ({
        title,
        artistName: 'Father of Peace',
        artistMbid: null,
        albumTitle: 'Album',
        albumMbid,
        durationMs: 120000,
        coverUrl: null,
        previewDeezerId: null,
        inLibrary: false,
      });
      mock.method(AurralAPI.prototype, 'searchUnified', async () => ({
        artists: [],
        albums: [],
        tracks: [
          song('Persian', requestedAlbum),
          song('Elsewhere', otherAlbum),
        ],
        top: null,
        degraded: false,
      }));
      mock.method(AurralAPI.prototype, 'searchLibrary', async () => ({
        artists: [],
        albums: [],
        tracks: [],
      }));
      await getRepository(Media).save(
        new Media({
          tmdbId: 0,
          mbId: requestedAlbum,
          mediaType: MediaType.MUSIC,
          status: MediaStatus.PROCESSING,
        })
      );

      const agent = await login();
      const res = await agent
        .get('/music/search')
        .query({ q: 'father of peace' });
      assert.strictEqual(res.status, 200);
      const byTitle = new Map(
        (res.body.tracks as { title: string; albumRequested?: boolean }[]).map(
          (track) => [track.title, track]
        )
      );
      assert.strictEqual(byTitle.get('Persian')?.albumRequested, true);
      assert.strictEqual(byTitle.get('Elsewhere')?.albumRequested, undefined);
    });

    it('fills songs from Deezer and albums from MusicBrainz when Aurral search fails', async (t) => {
      configureAurral(t);
      mock.method(AurralAPI.prototype, 'getArtistDetails', async () => null);
      mock.method(AurralAPI.prototype, 'getArtistImageUrl', async () => null);
      const artistMbid = '33333333-3333-4333-8333-333333333333';
      const albumMbid = '44444444-4444-4444-8444-444444444444';
      mock.method(AurralAPI.prototype, 'searchUnified', async () => {
        throw new Error('timeout of 10000ms exceeded');
      });
      const aurralAlbums = mock.method(
        AurralAPI.prototype,
        'searchAlbums',
        async () => []
      );
      mock.method(AurralAPI.prototype, 'searchLibrary', async () => ({
        artists: [],
        albums: [],
        tracks: [],
      }));
      mock.method(DeezerAPI.prototype, 'searchArtists', async () => [
        {
          id: 9,
          name: 'Hozier',
          pictureXl: 'https://cdn-images.dzcdn.net/images/artist/h.jpg',
          nbFan: 900000,
        },
      ]);
      mock.method(MusicBrainz.prototype, 'searchArtist', async () => [
        {
          id: artistMbid,
          name: 'Hozier',
          score: 100,
          media_type: 'artist' as const,
          type: 'Person' as const,
          'sort-name': 'Hozier',
          'type-id': '',
        },
      ]);
      mock.method(DeezerAPI.prototype, 'searchTracks', async () => [
        { id: 77, title: 'Too Sweet', artistName: 'Hozier', rank: 900000 },
      ]);
      mock.method(
        MusicBrainz.prototype,
        'searchAlbum',
        async () =>
          [
            {
              id: albumMbid,
              title: 'Unreal Unearth',
              'primary-type': 'Album',
              'first-release-date': '2023-08-18',
              'artist-credit': [
                { name: 'Hozier', artist: { id: artistMbid, name: 'Hozier' } },
              ],
            },
          ] as unknown as Awaited<ReturnType<MusicBrainz['searchAlbum']>>
      );

      const agent = await login();
      const res = await agent.get('/music/search').query({ q: 'hozier' });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.degraded, true);
      // Aurral just failed: no second Aurral call waiting out its timeout
      assert.strictEqual(aurralAlbums.mock.callCount(), 0);
      const song = (res.body.tracks as Record<string, unknown>[]).find(
        (track) => track.title === 'Too Sweet'
      );
      assert.ok(song, 'Deezer song in the results');
      assert.strictEqual(song.previewDeezerId, '77');
      assert.strictEqual(song.artistMbid, artistMbid);
      const album = (res.body.albums as Record<string, unknown>[]).find(
        (entry) => entry.mbid === albumMbid
      );
      assert.ok(album, 'MusicBrainz album in the results');
      assert.strictEqual(album.artistName, 'Hozier');
    });

    it('runs Deezer artist and Aurral album fallbacks when degraded and keeps results with mbid first', async (t) => {
      configureAurral(t);
      mock.method(AurralAPI.prototype, 'getArtistDetails', async () => null);
      mock.method(AurralAPI.prototype, 'getArtistImageUrl', async () => null);
      const artistMbid = '11111111-1111-4111-8111-111111111111';
      const albumMbid = '22222222-2222-4222-8222-222222222222';
      mock.method(AurralAPI.prototype, 'searchUnified', async () => ({
        artists: [],
        albums: [],
        tracks: [],
        top: null,
        degraded: true,
      }));
      mock.method(AurralAPI.prototype, 'searchLibrary', async () => ({
        artists: [],
        albums: [],
        tracks: [],
      }));
      mock.method(DeezerAPI.prototype, 'searchArtists', async () => [
        {
          id: 1,
          name: 'Unknown Local Act',
          pictureXl: 'https://cdn-images.dzcdn.net/images/artist/u.jpg',
          nbFan: 50,
        },
        {
          id: 2,
          name: 'Phoebe Bridgers',
          pictureXl: 'https://cdn-images.dzcdn.net/images/artist/pb.jpg',
          nbFan: 211000,
        },
      ]);
      mock.method(MusicBrainz.prototype, 'searchArtist', async () => [
        {
          id: artistMbid,
          name: 'Phoebe Bridgers',
          score: 100,
          media_type: 'artist' as const,
          type: 'Person' as const,
          'sort-name': 'Bridgers, Phoebe',
          'type-id': '',
        },
      ]);
      mock.method(AurralAPI.prototype, 'searchAlbums', async () => [
        {
          mbid: null,
          title: 'Bootleg',
          artistName: 'Phoebe Bridgers',
          artistMbid: null,
          primaryType: 'Album',
          releaseDate: null,
          coverUrl: null,
          inLibrary: false,
        },
        {
          mbid: albumMbid,
          title: 'Punisher',
          artistName: 'Phoebe Bridgers',
          artistMbid: artistMbid,
          primaryType: 'Album',
          releaseDate: '2020-06-18',
          coverUrl: null,
          inLibrary: false,
        },
      ]);

      const agent = await login();
      const res = await agent.get('/music/search?q=phobe+bridgers');

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.degraded, true);
      assert.strictEqual(res.body.artists[0].name, 'Phoebe Bridgers');
      assert.strictEqual(res.body.artists[0].mbid, artistMbid);
      assert.strictEqual(res.body.artists[1].mbid, null);
      assert.strictEqual(res.body.albums[0].mbid, albumMbid);
      assert.strictEqual(res.body.albums[1].mbid, null);
    });

    it('queries structured "artist title" in parallel, parses query, re-ranks, and falls back to MusicBrainz recordings', async (t) => {
      configureAurral(t);
      const rgMbid = '33333333-3333-4333-8333-333333333333';
      const artistMbid = '44444444-4444-4444-8444-444444444444';
      const searchQueries: string[] = [];

      mock.method(AurralAPI.prototype, 'searchUnified', async (q: string) => {
        searchQueries.push(q);
        return {
          artists: [
            { mbid: artistMbid, name: 'Hozier', image: null, inLibrary: false },
          ],
          albums: [
            {
              mbid: rgMbid,
              title: 'Unreal Unearth',
              artistName: 'Hozier',
              artistMbid,
              primaryType: 'Album',
              releaseDate: '2023-08-18',
              coverUrl: null,
              inLibrary: false,
            },
          ],
          tracks: [
            {
              title: 'Too Sweet',
              artistName: 'Très Moyen',
              artistMbid: null,
              albumTitle: null,
              albumMbid: null,
              durationMs: 200000,
              coverUrl: null,
              previewDeezerId: null,
              inLibrary: false,
            },
          ],
          top: {
            type: 'track' as const,
            title: 'Too Sweet',
            artistName: 'Très Moyen',
            artistMbid: null,
            albumTitle: null,
            albumMbid: null,
            durationMs: 200000,
            coverUrl: null,
            previewDeezerId: null,
            inLibrary: false,
          },
          degraded: false,
        };
      });
      mock.method(AurralAPI.prototype, 'searchLibrary', async () => ({
        artists: [],
        albums: [],
        tracks: [],
      }));
      const recordingSearch = mock.method(
        MusicBrainz.prototype,
        'searchRecording',
        async () => [
          {
            id: 'rec-1',
            score: 100,
            media_type: 'recording' as const,
            title: 'Too Sweet',
            length: 251000,
            'artist-credit': [
              {
                name: 'Hozier',
                artist: {
                  id: artistMbid,
                  name: 'Hozier',
                  'sort-name': 'Hozier',
                },
              },
            ],
            'first-release-date': '2024-03-22',
            releases: [
              {
                id: 'rel-1',
                title: 'Unheard',
                status: 'Official',
                'first-release-date': '2024-03-22',
                'release-group': {
                  id: rgMbid,
                  title: 'Unheard',
                  'primary-type': 'EP',
                  'secondary-types': [],
                },
              },
            ],
          },
        ]
      );

      const agent = await login();
      const res = await agent.get('/music/search?q=Hozier+-+Too+Sweet');

      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(searchQueries.sort(), [
        'Hozier - Too Sweet',
        'Hozier Too Sweet',
      ]);
      assert.strictEqual(recordingSearch.mock.callCount(), 1);
      assert.deepStrictEqual(res.body.parsed, {
        artist: 'Hozier',
        title: 'Too Sweet',
        year: null,
        edition: null,
        type: null,
      });
      assert.strictEqual(res.body.tracks[0].artistName, 'Hozier');
      assert.strictEqual(res.body.tracks[0].albumMbid, rgMbid);
      assert.strictEqual(res.body.tracks[0].durationMs, 251000);
      assert.strictEqual(
        res.body.tracks[0].coverUrl,
        `https://coverartarchive.org/release-group/${rgMbid}/front`
      );
      assert.strictEqual(res.body.top.type, 'track');
      assert.strictEqual(res.body.top.artistName, 'Hozier');
    });

    it('strips filler and retries once on zero results for >4-word natural queries', async (t) => {
      configureAurral(t);
      const queriesSeen: string[] = [];
      mock.method(AurralAPI.prototype, 'searchUnified', async (q: string) => {
        queriesSeen.push(q);
        if (q === 'barbie that billie eilish') {
          return {
            artists: [],
            albums: [],
            tracks: [
              {
                title: 'What Was I Made For?',
                artistName: 'Billie Eilish',
                artistMbid: null,
                albumTitle: 'Barbie The Album',
                albumMbid: null,
                durationMs: 222000,
                coverUrl: null,
                previewDeezerId: null,
                inLibrary: false,
              },
            ],
            top: null,
            degraded: false,
          };
        }
        return {
          artists: [],
          albums: [],
          tracks: [],
          top: null,
          degraded: false,
        };
      });
      mock.method(AurralAPI.prototype, 'searchLibrary', async () => ({
        artists: [],
        albums: [],
        tracks: [],
      }));
      mock.method(DeezerAPI.prototype, 'searchArtists', async () => []);
      mock.method(AurralAPI.prototype, 'searchAlbums', async () => []);

      const agent = await login();
      const res = await agent.get(
        '/music/search?q=' +
          encodeURIComponent(
            'i want to hear that song from the barbie movie that billie eilish sang'
          )
      );

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.correctedQuery, 'barbie that billie eilish');
      assert.strictEqual(res.body.tracks[0].title, 'What Was I Made For?');
      assert.ok(queriesSeen.includes('barbie that billie eilish'));
    });

    it('resolves supported music links and runs a normal search for the resolved title', async (t) => {
      configureAurral(t);
      const albumMbid = '55555555-5555-4555-8555-555555555555';
      const resolveLink = mock.method(
        AurralAPI.prototype,
        'resolveLink',
        async () => ({
          type: 'track' as const,
          mbid: null,
          title: 'Kyoto',
          artistName: 'Phoebe Bridgers',
          albumMbid,
        })
      );
      const searchedQueries: string[] = [];
      mock.method(AurralAPI.prototype, 'searchUnified', async (q: string) => {
        searchedQueries.push(q);
        return {
          artists: [
            {
              mbid: '66666666-6666-4666-8666-666666666666',
              name: 'Phoebe Bridgers',
              image: null,
              inLibrary: false,
            },
          ],
          albums: [
            {
              mbid: albumMbid,
              title: 'Punisher',
              artistName: 'Phoebe Bridgers',
              artistMbid: null,
              primaryType: 'Album',
              releaseDate: '2020-06-18',
              coverUrl: null,
              inLibrary: false,
            },
          ],
          tracks: [
            {
              title: 'Kyoto',
              artistName: 'Phoebe Bridgers',
              artistMbid: null,
              albumTitle: 'Punisher',
              albumMbid,
              durationMs: 184000,
              coverUrl: null,
              previewDeezerId: null,
              inLibrary: false,
            },
          ],
          top: null,
          degraded: false,
        };
      });
      mock.method(AurralAPI.prototype, 'searchLibrary', async () => ({
        artists: [],
        albums: [],
        tracks: [],
      }));

      const agent = await login();
      const res = await agent.get(
        '/music/search?q=' +
          encodeURIComponent('https://open.spotify.com/track/abc123')
      );

      assert.strictEqual(res.status, 200);
      assert.strictEqual(resolveLink.mock.callCount(), 1);
      assert.deepStrictEqual(res.body.link, {
        type: 'track',
        mbid: null,
        title: 'Kyoto',
        artistName: 'Phoebe Bridgers',
        albumMbid,
      });
      assert.ok(searchedQueries.includes('Phoebe Bridgers Kyoto'));
      assert.strictEqual(res.body.tracks[0].title, 'Kyoto');
    });

    it('returns up to 12 sanitized similar artists on GET /music/artist/:mbid/similar and 400 on invalid MBID', async (t) => {
      configureAurral(t);
      const artistMbid = '11111111-1111-4111-8111-111111111111';
      mock.method(AurralAPI.prototype, 'getSimilarArtists', async () =>
        Array.from({ length: 12 }, (_, idx) => ({
          mbid: idx === 0 ? '22222222-2222-4222-8222-222222222222' : null,
          name: `Similar ${idx + 1}`,
          image: 'https://cdn-images.dzcdn.net/images/artist/ok.jpg',
        }))
      );

      const agent = await login();
      const bad = await agent.get('/music/artist/not-a-uuid/similar');
      assert.strictEqual(bad.status, 400);

      const ok = await agent.get(`/music/artist/${artistMbid}/similar`);
      assert.strictEqual(ok.status, 200);
      assert.strictEqual(ok.body.artists.length, 12);
      assert.strictEqual(
        ok.body.artists[0].mbid,
        '22222222-2222-4222-8222-222222222222'
      );
      assert.strictEqual(ok.body.artists[1].mbid, null);
    });

    it('filters unrelated library hits in GET /music/search using filterLibraryHits', async (t) => {
      configureAurral(t);
      mock.method(AurralAPI.prototype, 'searchUnified', async () => ({
        artists: [],
        albums: [],
        tracks: [],
        top: null,
        degraded: false,
      }));
      mock.method(DeezerAPI.prototype, 'searchArtists', async () => []);
      mock.method(AurralAPI.prototype, 'searchAlbums', async () => []);
      mock.method(AurralAPI.prototype, 'searchLibrary', async (q: string) => {
        if (q === 'AC/DC') {
          return {
            artists: [
              { mbid: null, name: 'AC/DC', image: null, inLibrary: true },
              {
                mbid: null,
                name: 'Sabrina Carpenter',
                image: null,
                inLibrary: true,
              },
            ],
            albums: [
              {
                mbid: null,
                title: 'Back in Black',
                artistName: 'AC/DC',
                artistMbid: null,
                primaryType: 'Album',
                releaseDate: null,
                coverUrl: '/api/v1/music/library-art/albums/10',
                inLibrary: true,
              },
            ],
            tracks: [
              {
                title: 'Bed Chem',
                artistName: 'Sabrina Carpenter',
                artistMbid: null,
                albumTitle: "Short n' Sweet",
                albumMbid: null,
                durationMs: 171000,
                coverUrl: null,
                previewDeezerId: null,
                inLibrary: true,
              },
            ],
          };
        }
        return {
          artists: [],
          albums: [
            {
              mbid: null,
              title: 'folklore',
              artistName: 'Taylor Swift',
              artistMbid: null,
              primaryType: 'Album',
              releaseDate: null,
              coverUrl: '/api/v1/music/library-art/albums/20',
              inLibrary: true,
            },
            {
              mbid: null,
              title: 'Bed Chem',
              artistName: 'Sabrina Carpenter',
              artistMbid: null,
              primaryType: 'Album',
              releaseDate: null,
              coverUrl: null,
              inLibrary: true,
            },
          ],
          tracks: [],
        };
      });

      const agent = await login();
      const acdc = await agent.get('/music/search?q=AC%2FDC');
      assert.strictEqual(acdc.status, 200);
      assert.deepStrictEqual(
        acdc.body.library.artists.map((a: { name: string }) => a.name),
        ['AC/DC']
      );
      assert.strictEqual(acdc.body.library.tracks.length, 0);

      const swift = await agent.get('/music/search?q=taylor+swift');
      assert.strictEqual(swift.status, 200);
      assert.deepStrictEqual(
        swift.body.library.albums.map((a: { title: string }) => a.title),
        ['folklore']
      );
    });

    it('builds albums from artist details and populates null top/artist image when top result is an artist with mbid', async (t) => {
      configureAurral(t);
      const artistMbid = '11111111-1111-4111-8111-111111111111';
      const rgOwned = '22222222-2222-4222-8222-222222222221';
      const rgPartial = '22222222-2222-4222-8222-222222222222';
      const rgEp = '22222222-2222-4222-8222-222222222223';
      const rgSingle = '22222222-2222-4222-8222-222222222224';
      const rgLive = '22222222-2222-4222-8222-222222222225';

      mock.method(AurralAPI.prototype, 'searchUnified', async () => ({
        artists: [
          {
            mbid: artistMbid,
            name: 'Taylor Swift',
            image: null,
            inLibrary: false,
          },
        ],
        albums: [
          {
            mbid: null,
            title: 'Title Match Fallback',
            artistName: 'Other',
            artistMbid: null,
            primaryType: 'Album',
            releaseDate: null,
            coverUrl: null,
            inLibrary: false,
          },
        ],
        tracks: [],
        top: null,
        degraded: false,
      }));
      mock.method(AurralAPI.prototype, 'searchLibrary', async () => ({
        artists: [],
        albums: [],
        tracks: [],
      }));
      mock.method(AurralAPI.prototype, 'getArtistDetails', async () => ({
        mbid: artistMbid,
        name: 'Taylor Swift',
        type: 'Person',
        country: 'US',
        beginYear: 2006,
        endYear: null,
        genres: ['pop'],
        bio: null,
        releaseGroups: [
          {
            id: rgSingle,
            title: 'Cruel Summer',
            year: 2023,
            primaryType: 'Single' as const,
            secondaryTypes: [],
            coverUrl: null,
          },
          {
            id: rgLive,
            title: 'Live in Paris',
            year: 2020,
            primaryType: 'Album' as const,
            secondaryTypes: ['Live'],
            coverUrl: null,
          },
          {
            id: rgEp,
            title: 'Beautiful Eyes',
            year: 2008,
            primaryType: 'EP' as const,
            secondaryTypes: [],
            coverUrl: null,
          },
          {
            id: rgPartial,
            title: 'The Tortured Poets Department',
            year: 2024,
            primaryType: 'Album' as const,
            secondaryTypes: [],
            coverUrl: 'https://cdn-images.dzcdn.net/images/cover/ttpd.jpg',
          },
          {
            id: rgOwned,
            title: 'Midnights',
            year: 2022,
            primaryType: 'Album' as const,
            secondaryTypes: [],
            coverUrl: null,
          },
        ],
      }));
      mock.method(
        AurralAPI.prototype,
        'getLibraryArtistReleaseGroups',
        async () => ({
          owned: new Set([rgOwned]),
          partial: new Set([rgPartial]),
        })
      );
      mock.method(
        AurralAPI.prototype,
        'getArtistImageUrl',
        async (_mbid: string, name?: string) => {
          assert.strictEqual(name, 'Taylor Swift');
          return 'https://cdn-images.dzcdn.net/images/artist/ts.jpg';
        }
      );

      const agent = await login();
      const res = await agent.get('/music/search?q=Taylor+Swift&limit=4');

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.topArtistAlbumsFromArtist, true);
      assert.strictEqual(res.body.top.type, 'artist');
      assert.strictEqual(
        res.body.top.image,
        'https://cdn-images.dzcdn.net/images/artist/ts.jpg'
      );
      assert.strictEqual(
        res.body.artists[0].image,
        'https://cdn-images.dzcdn.net/images/artist/ts.jpg'
      );
      assert.deepStrictEqual(
        res.body.albums.map((a: { mbid: string }) => a.mbid),
        [rgPartial, rgOwned, rgEp, rgSingle]
      );
      assert.strictEqual(res.body.albums[0].releaseDate, '2024');
      assert.strictEqual(
        res.body.albums[0].coverUrl,
        'https://cdn-images.dzcdn.net/images/cover/ttpd.jpg'
      );
      assert.strictEqual(res.body.albums[0].inLibrary, false);
      assert.strictEqual(res.body.albums[0].partial, true);
      assert.strictEqual(res.body.albums[1].inLibrary, true);
      assert.strictEqual(res.body.albums[1].partial, false);
      assert.strictEqual(
        res.body.albums[1].coverUrl,
        `https://coverartarchive.org/release-group/${rgOwned}/front-250`
      );
    });

    it('falls back to title-matched albums with topArtistAlbumsFromArtist: false when artist details fail or have no release groups', async (t) => {
      configureAurral(t);
      const artistMbid = '11111111-1111-4111-8111-111111111111';
      const fallbackAlbumMbid = '22222222-2222-4222-8222-222222222222';

      mock.method(AurralAPI.prototype, 'searchUnified', async () => ({
        artists: [
          {
            mbid: artistMbid,
            name: 'Taylor Swift',
            image: 'https://cdn-images.dzcdn.net/images/artist/ts.jpg',
            inLibrary: false,
          },
        ],
        albums: [
          {
            mbid: fallbackAlbumMbid,
            title: 'Fallback Album',
            artistName: 'Taylor Swift',
            artistMbid,
            primaryType: 'Album',
            releaseDate: '2020-07-24',
            coverUrl: null,
            inLibrary: false,
          },
        ],
        tracks: [],
        top: null,
        degraded: false,
      }));
      mock.method(AurralAPI.prototype, 'searchLibrary', async () => ({
        artists: [],
        albums: [],
        tracks: [],
      }));
      mock.method(AurralAPI.prototype, 'getArtistDetails', async () => {
        throw new Error('upstream down');
      });
      mock.method(
        AurralAPI.prototype,
        'getLibraryArtistReleaseGroups',
        async () => ({ owned: new Set<string>(), partial: new Set<string>() })
      );

      const agent = await login();
      const res = await agent.get('/music/search?q=Taylor+Swift');

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.topArtistAlbumsFromArtist, false);
      assert.strictEqual(res.body.albums.length, 1);
      assert.strictEqual(res.body.albums[0].mbid, fallbackAlbumMbid);
    });

    it('returns playlist link objects for Deezer, Spotify, and YouTube playlist URLs without calling Aurral resolveLink', async (t) => {
      configureAurral(t);
      const resolveLink = mock.method(AurralAPI.prototype, 'resolveLink');
      const searchUnified = mock.method(AurralAPI.prototype, 'searchUnified');

      const agent = await login();

      const deezerRes = await agent.get(
        '/music/search?q=' +
          encodeURIComponent('https://www.deezer.com/en/playlist/123456789')
      );
      assert.strictEqual(deezerRes.status, 200);
      assert.strictEqual(deezerRes.body.topArtistAlbumsFromArtist, false);
      assert.deepStrictEqual(deezerRes.body.link, {
        type: 'playlist',
        provider: 'deezer',
        id: '123456789',
        title: null,
        artistName: null,
        mbid: null,
        albumMbid: null,
      });

      const spotifyRes = await agent.get(
        '/music/search?q=' +
          encodeURIComponent(
            'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'
          )
      );
      assert.strictEqual(spotifyRes.status, 200);
      assert.deepStrictEqual(spotifyRes.body.link, {
        type: 'playlist',
        provider: 'spotify',
        id: null,
        title: null,
        artistName: null,
        mbid: null,
        albumMbid: null,
      });

      const ytRes = await agent.get(
        '/music/search?q=' +
          encodeURIComponent(
            'https://www.youtube.com/playlist?list=PL1234567890'
          )
      );
      assert.strictEqual(ytRes.status, 200);
      assert.deepStrictEqual(ytRes.body.link, {
        type: 'playlist',
        provider: 'youtube',
        id: null,
        title: null,
        artistName: null,
        mbid: null,
        albumMbid: null,
      });

      assert.strictEqual(resolveLink.mock.callCount(), 0);
      assert.strictEqual(searchUnified.mock.callCount(), 0);
    });
  });

  describe('search and artist page refinements', () => {
    afterEach(() => {
      cacheManager.getCache('aurral').flush();
      cacheManager.getCache('deezer').flush();
      cacheManager.getCache('musicbrainz').flush();
    });

    const PINK_BAND = 'ee231388-0000-4000-8000-000000000001';
    const PINK_SINGER = 'f4d5cc07-3bc9-4836-9b15-88a08359bc63';
    const GARETH_MEMBER = 'd9d1d088-da2c-46e1-be11-99a802dfb597';
    const GARETH_REAL = 'f028b93e-39f2-4958-824b-266c3ed7fe86';

    const song = (
      title: string,
      artistName: string,
      artistMbid: string | null = null
    ) => ({
      title,
      artistName,
      artistMbid,
      albumTitle: null,
      albumMbid: null,
      durationMs: 200000,
      coverUrl: null,
      previewDeezerId: null,
      inLibrary: false,
    });
    const listed = (mbid: string | null, name: string, inLibrary = false) => ({
      mbid,
      name,
      image: null,
      inLibrary,
    });
    const mbArtist = (id: string, name: string, score: number) => ({
      id,
      name,
      score,
      media_type: 'artist' as const,
      type: 'Person' as const,
      'sort-name': name,
      'type-id': '',
    });
    const pinkSongs = [
      song('So What', 'P!nk'),
      song('Try', 'P!nk'),
      song('Just Give Me a Reason', 'P!nk'),
      song('What About Us', 'P!nk'),
      song('Pink Pony Club', 'Chappell Roan'),
    ];
    const mockCatalog = ({
      artists,
      tracks,
      libraryArtists = [],
    }: {
      artists: ReturnType<typeof listed>[];
      tracks: ReturnType<typeof song>[];
      libraryArtists?: ReturnType<typeof listed>[];
    }) => {
      mock.method(AurralAPI.prototype, 'searchUnified', async () => ({
        artists,
        albums: [],
        tracks,
        top: null,
        degraded: false,
      }));
      mock.method(AurralAPI.prototype, 'searchLibrary', async () => ({
        artists: libraryArtists,
        albums: [],
        tracks: [],
      }));
      mock.method(AurralAPI.prototype, 'searchAlbums', async () => []);
      mock.method(DeezerAPI.prototype, 'searchArtists', async () => []);
    };

    it('"pink" leads with P!nk, the artist of the top songs, looked up by her exact name', async (t) => {
      configureAurral(t);
      mockCatalog({
        artists: [
          listed(PINK_BAND, 'PINK'),
          listed('ee231388-0000-4000-8000-000000000002', 'Pink Pink Splash'),
        ],
        tracks: pinkSongs,
      });
      const searchArtist = mock.method(
        MusicBrainz.prototype,
        'searchArtist',
        async () => [
          mbArtist(PINK_BAND, 'PINK', 100),
          mbArtist(PINK_SINGER, 'P!nk', 100),
        ]
      );

      const agent = await login();
      const res = await agent.get('/music/search?q=pink');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.top.type, 'artist');
      assert.strictEqual(res.body.top.mbid, PINK_SINGER);
      assert.strictEqual(res.body.top.name, 'P!nk');
      assert.strictEqual(res.body.artists[0].mbid, PINK_SINGER);
      assert.ok(
        res.body.artists.some(
          (artist: { mbid: string }) => artist.mbid === PINK_BAND
        )
      );
      assert.strictEqual(searchArtist.mock.callCount(), 1);
      assert.match(
        String(
          (searchArtist.mock.calls[0].arguments[0] as { query: string }).query
        ),
        /^artist:"P\\!nk"$/
      );
    });

    it('leaves the answer alone when the exact-name artist is listed and fills only missing song artist ids', async (t) => {
      configureAurral(t);
      mockCatalog({
        artists: [listed(GARETH_REAL, 'Gareth')],
        tracks: [
          song('Iris', 'Gareth', GARETH_MEMBER),
          song('Irish Whiskey', 'Gareth', GARETH_MEMBER),
          song('Northern Lights', 'Gareth'),
        ],
      });
      const searchArtist = mock.method(
        MusicBrainz.prototype,
        'searchArtist',
        async () => []
      );

      const agent = await login();
      const res = await agent.get('/music/search?q=gareth');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.top.type, 'artist');
      assert.strictEqual(res.body.top.mbid, GARETH_REAL);
      assert.strictEqual(res.body.artists[0].mbid, GARETH_REAL);
      assert.strictEqual(searchArtist.mock.callCount(), 0);
      const byTitle = new Map(
        (res.body.tracks as { title: string; artistMbid: string | null }[]).map(
          (track) => [track.title, track.artistMbid]
        )
      );
      assert.strictEqual(byTitle.get('Iris'), GARETH_MEMBER);
      assert.strictEqual(byTitle.get('Irish Whiskey'), GARETH_MEMBER);
      assert.strictEqual(byTitle.get('Northern Lights'), GARETH_REAL);
    });

    it('keeps the original answer when the extra artist lookup fails or hangs', async (t) => {
      configureAurral(t);
      mockCatalog({ artists: [listed(PINK_BAND, 'PINK')], tracks: pinkSongs });
      let hang = false;
      mock.method(MusicBrainz.prototype, 'searchArtist', async () => {
        if (hang) return new Promise<never>(() => undefined);
        throw new Error('MusicBrainz is down');
      });

      const agent = await login();
      const failed = await agent.get('/music/search?q=pink');
      assert.strictEqual(failed.status, 200);
      assert.strictEqual(failed.body.top.mbid, PINK_BAND);
      assert.strictEqual(failed.body.artists[0].mbid, PINK_BAND);

      hang = true;
      cacheManager.getCache('aurral').flush();
      const started = Date.now();
      const hung = await agent.get('/music/search?q=pink');
      const elapsed = Date.now() - started;
      assert.strictEqual(hung.status, 200);
      assert.strictEqual(hung.body.top.mbid, PINK_BAND);
      assert.ok(elapsed < 4000, `search took ${elapsed} ms`);
    });

    it('keeps a same-name library artist on top without an extra lookup', async (t) => {
      configureAurral(t);
      mockCatalog({
        artists: [listed(PINK_BAND, 'PINK')],
        tracks: pinkSongs,
        libraryArtists: [listed(PINK_BAND, 'PINK', true)],
      });
      const searchArtist = mock.method(
        MusicBrainz.prototype,
        'searchArtist',
        async () => [mbArtist(PINK_SINGER, 'P!nk', 100)]
      );

      const agent = await login();
      const res = await agent.get('/music/search?q=pink');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.top.mbid, PINK_BAND);
      assert.strictEqual(res.body.artists[0].mbid, PINK_BAND);
      assert.strictEqual(searchArtist.mock.callCount(), 0);
    });

    const garethDetails = (mbid: string, releaseCount: number) => ({
      mbid,
      name: 'Gareth',
      type: 'Person',
      country: null,
      beginYear: null,
      endYear: null,
      genres: [],
      bio: null,
      releaseGroups: Array.from({ length: releaseCount }, (_, index) => ({
        id: `aaaaaaaa-0000-4000-8000-00000000000${index + 1}`,
        title: `Album ${index + 1}`,
        year: 2020 - index,
        primaryType: 'Album' as const,
        secondaryTypes: [],
        coverUrl: null,
      })),
      ...(releaseCount === 0 ? { incomplete: true } : {}),
    });

    it('offers a same-name artist with releases when the artist page is empty', async (t) => {
      configureAurral(t);
      mock.method(
        AurralAPI.prototype,
        'getArtistDetails',
        async (mbid: string) =>
          mbid === GARETH_REAL
            ? garethDetails(GARETH_REAL, 2)
            : garethDetails(GARETH_MEMBER, 0)
      );
      mock.method(AurralAPI.prototype, 'searchUnified', async () => ({
        artists: [
          listed(GARETH_MEMBER, 'Gareth'),
          listed(GARETH_REAL, 'Gareth'),
        ],
        albums: [],
        tracks: [],
        top: null,
        degraded: false,
      }));

      const agent = await login();
      const res = await agent.get(`/music/artist/${GARETH_MEMBER}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.mbid, GARETH_MEMBER);
      assert.strictEqual(res.body.incomplete, true);
      assert.deepStrictEqual(res.body.releaseGroups, []);
      assert.deepStrictEqual(res.body.sameNameArtist, {
        mbid: GARETH_REAL,
        name: 'Gareth',
        releaseCount: 2,
      });
    });

    it('adds no same-name artist when none has releases or the lookup fails', async (t) => {
      configureAurral(t);
      mock.method(
        AurralAPI.prototype,
        'getArtistDetails',
        async (mbid: string) => garethDetails(mbid, 0)
      );
      let fail = false;
      mock.method(AurralAPI.prototype, 'searchUnified', async () => {
        if (fail) throw new Error('Aurral is down');
        return {
          artists: [
            listed(GARETH_MEMBER, 'Gareth'),
            listed('bbbbbbbb-0000-4000-8000-000000000001', 'Gareth Emery'),
            listed(GARETH_REAL, 'Gareth'),
          ],
          albums: [],
          tracks: [],
          top: null,
          degraded: false,
        };
      });

      const agent = await login();
      const empty = await agent.get(`/music/artist/${GARETH_MEMBER}`);
      assert.strictEqual(empty.status, 200);
      assert.strictEqual(empty.body.sameNameArtist, undefined);

      fail = true;
      const failed = await agent.get(`/music/artist/${GARETH_MEMBER}`);
      assert.strictEqual(failed.status, 200);
      assert.strictEqual(failed.body.sameNameArtist, undefined);
      assert.strictEqual(failed.body.name, 'Gareth');
      assert.strictEqual(failed.body.incomplete, true);
      assert.deepStrictEqual(failed.body.releaseGroups, []);
    });

    it('does not search for a same-name artist when the artist has releases', async (t) => {
      configureAurral(t);
      mock.method(AurralAPI.prototype, 'getArtistDetails', async () =>
        garethDetails(GARETH_REAL, 2)
      );
      const searchUnified = mock.method(
        AurralAPI.prototype,
        'searchUnified',
        async () => {
          throw new Error('must not be called');
        }
      );

      const agent = await login();
      const res = await agent.get(`/music/artist/${GARETH_REAL}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.releaseGroups.length, 2);
      assert.strictEqual(res.body.sameNameArtist, undefined);
      assert.strictEqual(searchUnified.mock.callCount(), 0);
    });

    it('uses the matching Deezer genre first and Aurral only when Deezer has nothing', async (t) => {
      configureAurral(t);
      const aurral = mock.method(
        AurralAPI.prototype,
        'getDiscoverByTag',
        async () => ({
          tag: 'pop',
          artists: [listed(PINK_SINGER, 'Bruce Springsteen')],
        })
      );
      let deezerAnswer: 'artists' | 'fail' | 'none' = 'artists';
      const deezer = mock.method(
        DeezerAPI.prototype,
        'getArtistsForGenreTag',
        async () => {
          if (deezerAnswer === 'fail') throw new Error('Quota limit exceeded');
          if (deezerAnswer === 'none') return [];
          return [
            {
              id: 1,
              name: 'Dua Lipa',
              pictureXl: 'https://cdn-images.dzcdn.net/images/artist/d.jpg',
              nbFan: 0,
            },
            { id: 2, name: 'Harry Styles', pictureXl: null, nbFan: 0 },
          ];
        }
      );

      const agent = await login();
      const res = await agent.get('/music/discover/genre?tag=pop&limit=1');
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.body, {
        tag: 'pop',
        artists: [
          {
            mbid: null,
            name: 'Dua Lipa',
            image: 'https://cdn-images.dzcdn.net/images/artist/d.jpg',
            inLibrary: false,
          },
        ],
      });
      assert.deepStrictEqual(deezer.mock.calls[0].arguments, ['pop']);
      assert.strictEqual(aurral.mock.callCount(), 0);

      const page2 = await agent.get(
        '/music/discover/genre?tag=pop&limit=1&offset=1'
      );
      assert.strictEqual(page2.body.artists[0].name, 'Harry Styles');
      assert.strictEqual(aurral.mock.callCount(), 0);

      // Deezer failing, or no Deezer genre for the tag (punk): Aurral answers
      deezerAnswer = 'fail';
      const failed = await agent.get('/music/discover/genre?tag=pop');
      assert.strictEqual(failed.status, 200);
      assert.strictEqual(failed.body.artists[0].name, 'Bruce Springsteen');
      deezerAnswer = 'none';
      const punk = await agent.get('/music/discover/genre?tag=punk');
      assert.strictEqual(punk.status, 200);
      assert.strictEqual(punk.body.artists[0].name, 'Bruce Springsteen');
      assert.strictEqual(aurral.mock.callCount(), 2);
    });

    it('resolves "pink" through Aurral first, never stamps PINK on P!nk songs, and stays within the lookup budget', async (t) => {
      configureAurral(t);
      const searchedQueries: string[] = [];
      let aurralKnowsSinger = true;
      mock.method(AurralAPI.prototype, 'searchUnified', async (q: string) => {
        searchedQueries.push(q);
        if (q === 'P!nk') {
          if (!aurralKnowsSinger) throw new Error('Aurral timed out');
          return {
            artists: [listed(PINK_BAND, 'PINK'), listed(PINK_SINGER, 'P!nk')],
            albums: [],
            tracks: [],
            top: null,
            degraded: false,
          };
        }
        return {
          artists: [
            listed(PINK_BAND, 'PINK'),
            listed('ee231388-0000-4000-8000-000000000002', 'Pink Pink Splash'),
            listed('ee231388-0000-4000-8000-000000000003', 'pink cig'),
            listed('ee231388-0000-4000-8000-000000000004', 'PINK PONG'),
          ],
          albums: [],
          tracks: pinkSongs.slice(0, 4),
          top: null,
          degraded: false,
        };
      });
      mock.method(AurralAPI.prototype, 'searchLibrary', async () => ({
        artists: [],
        albums: [],
        tracks: [],
      }));
      mock.method(AurralAPI.prototype, 'searchAlbums', async () => []);
      mock.method(DeezerAPI.prototype, 'searchArtists', async () => []);
      const searchArtist = mock.method(
        MusicBrainz.prototype,
        'searchArtist',
        // musicbrainz.org answering 503 "busy": never settles in time
        async () => new Promise<never>(() => undefined)
      );

      const agent = await login();
      const res = await agent.get('/music/search?q=pink');
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(searchedQueries, ['pink', 'P!nk']);
      assert.strictEqual(res.body.top.mbid, PINK_SINGER);
      assert.strictEqual(res.body.artists[0].mbid, PINK_SINGER);
      assert.strictEqual(searchArtist.mock.callCount(), 0);
      assert.ok(
        (res.body.tracks as { artistMbid: string | null }[]).every(
          (track) => track.artistMbid === PINK_SINGER
        )
      );

      // Aurral and MusicBrainz both fail: the old answer, but P!nk songs are
      // not linked to the obscure PINK
      aurralKnowsSinger = false;
      const started = Date.now();
      const failed = await agent.get('/music/search?q=pink');
      const elapsed = Date.now() - started;
      assert.strictEqual(failed.status, 200);
      assert.strictEqual(failed.body.top.mbid, PINK_BAND);
      assert.strictEqual(searchArtist.mock.callCount(), 1);
      assert.ok(
        (failed.body.tracks as { artistMbid: string | null }[]).every(
          (track) => track.artistMbid === null
        )
      );
      assert.ok(elapsed < 3500, `search took ${elapsed} ms`);
    });

    it('puts the most popular same-title song on top using Deezer ranks', async (t) => {
      configureAurral(t);
      const title = 'I Wanna Dance With Somebody';
      mock.method(AurralAPI.prototype, 'searchUnified', async () => ({
        artists: [],
        albums: [],
        tracks: [
          song(title, 'Bossa Players'),
          song('I Wanna Dance with Somebody (feat. The High)', 'Hard Lights'),
          song(title, 'Hi_Tack'),
          song('I Wanna Dance with Somebody (Who Loves Me)', 'Whitney Houston'),
          song(title, 'Calum Scott'),
          song(title, 'Bossart Ensemble'),
        ],
        top: null,
        degraded: false,
      }));
      mock.method(AurralAPI.prototype, 'searchLibrary', async () => ({
        artists: [],
        albums: [],
        tracks: [],
      }));
      mock.method(AurralAPI.prototype, 'searchAlbums', async () => []);
      mock.method(DeezerAPI.prototype, 'searchArtists', async () => []);
      mock.method(MusicBrainz.prototype, 'searchArtist', async () => []);
      const searchTracks = mock.method(
        DeezerAPI.prototype,
        'searchTracks',
        async () => [
          { id: 1, title, artistName: 'Bossa Players', rank: 210000 },
          {
            id: 2,
            title: 'I Wanna Dance with Somebody (Who Loves Me)',
            artistName: 'Whitney Houston',
            rank: 912000,
          },
          { id: 3, title, artistName: 'Calum Scott', rank: 540000 },
        ]
      );

      const agent = await login();
      const res = await agent
        .get('/music/search')
        .query({ q: 'i wanna dance with somebody' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.top.type, 'track');
      assert.strictEqual(res.body.top.artistName, 'Whitney Houston');
      assert.strictEqual(searchTracks.mock.callCount(), 1);
      assert.strictEqual('popularity' in res.body.top, false);
      assert.ok(
        (res.body.tracks as Record<string, unknown>[]).every(
          (track) => !('popularity' in track)
        )
      );
    });

    const libraryWithBoston = () =>
      mock.method(AurralAPI.prototype, 'getLibraryTrackPage', async () => ({
        page: 1,
        total: 1,
        hasMore: false,
        items: [{ title: 'Boston', artistName: 'STELLA LEFTY' }],
      }));

    it('marks a trending song owned on a compilation as in the library', async (t) => {
      configureAurral(t);
      libraryWithBoston();
      mock.method(AurralAPI.prototype, 'getTrending', async () => ({
        artists: [],
        albums: [],
        tracks: [
          song('Boston', 'STELLA LEFTY'),
          song('Boston', 'Augustana'),
          song('Slow Dancin', 'STELLA LEFTY'),
        ],
      }));

      const agent = await login();
      const res = await agent.get('/music/discover/trending');
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(
        (res.body.tracks as { inLibrary: boolean }[]).map(
          (track) => track.inLibrary
        ),
        [true, false, false]
      );
    });

    it('keeps trending as it is when the library cannot be read', async (t) => {
      configureAurral(t);
      mock.method(AurralAPI.prototype, 'getLibraryAlbumPage', async () => ({
        kind: 'albums' as const,
        page: 1,
        pageSize: 60,
        total: 0,
        hasMore: false,
        items: [],
      }));
      mock.method(AurralAPI.prototype, 'getLibraryTrackPage', async () => {
        throw new Error('Aurral library is down');
      });
      mock.method(AurralAPI.prototype, 'getTrending', async () => ({
        artists: [],
        albums: [],
        tracks: [song('Boston', 'STELLA LEFTY')],
      }));

      const agent = await login();
      const res = await agent.get('/music/discover/trending');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.tracks[0].inLibrary, false);
    });

    it('marks owned songs on a playlist page', async (t) => {
      configureAurral(t);
      libraryWithBoston();
      mock.method(AurralAPI.prototype, 'getDiscoverPlaylist', async () => ({
        id: '123',
        name: 'Weekly',
        description: null,
        curator: null,
        artworkUrl: null,
        provider: 'deezer',
        tracks: [
          {
            ...song('Boston (feat. Nobody)', 'Stella Lefty'),
            previewDeezerId: null,
          },
          { ...song('Elsewhere', 'Other'), previewDeezerId: null },
        ],
      }));

      const agent = await login();
      const res = await agent.get('/music/discover/playlists/deezer/123');
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(
        (res.body.tracks as { inLibrary: boolean }[]).map(
          (track) => track.inLibrary
        ),
        [true, false]
      );
    });

    it('lists album songs owned on another release as trackAvailability.elsewhere', async (t) => {
      configureAurral(t);
      libraryWithBoston();
      mock.method(AurralAPI.prototype, 'lookupAlbums', async () => ({}));
      const albumMbid = 'abcdefab-0000-4000-8000-0000000000b0';
      const bostonRecording = 'abcdefab-0000-4000-8000-0000000000b1';
      const slowRecording = 'abcdefab-0000-4000-8000-0000000000b2';
      const assertEnrichment = mockAlbumEnrichment(albumMbid);
      mock.method(ListenBrainzAPI.prototype, 'getAlbum', async () => ({
        release_group_mbid: albumMbid,
        type: 'Single',
        release_group_metadata: {
          release_group: { name: 'Boston', date: '2025-01-01' },
          artist: { name: 'STELLA LEFTY', artists: [] },
        },
        mediums: [
          {
            tracks: [
              {
                name: 'Boston',
                position: 1,
                length: 180000,
                recording_mbid: bostonRecording,
                artists: [{ artist_credit_name: 'STELLA LEFTY' }],
              },
              {
                name: 'Slow Dancin',
                position: 2,
                length: 180000,
                recording_mbid: slowRecording,
                artists: [{ artist_credit_name: 'STELLA LEFTY' }],
              },
            ],
          },
        ],
      }));

      const agent = await login();
      const res = await agent.get(`/music/${albumMbid}`);
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.body.trackAvailability.elsewhere, [
        bostonRecording,
      ]);
      assertEnrichment();
    });

    const ANDREW_BIRD = '081b133e-ce74-42ba-92c1-c18234acb532';
    const FINEST = '1f22d328-ce8e-47d8-9fa6-814b13b67152';
    const libraryWithPartialFinest = () =>
      mock.method(AurralAPI.prototype, 'getLibraryAlbumPage', async () => ({
        kind: 'albums' as const,
        page: 1,
        pageSize: 60,
        total: 1,
        hasMore: false,
        items: [
          {
            id: 5393,
            title: 'My Finest Work Yet',
            artistName: 'Andrew Bird',
            mbid: '21dccd82-9907-4f3a-b7f5-7ddaeb12bd39',
            releaseGroupMbid: FINEST,
            releaseDate: null,
            addedAt: null,
            trackCount: 10,
            availableTrackCount: 1,
            coverUrl: '/api/v1/music/library-art/albums/5393',
          },
        ],
      }));
    const finestAlbum = (inLibrary: boolean) => ({
      mbid: FINEST,
      title: 'My Finest Work Yet',
      artistName: 'Andrew Bird',
      artistMbid: ANDREW_BIRD,
      primaryType: 'Album',
      releaseDate: '2019',
      coverUrl: null,
      inLibrary,
    });

    it('shows an album the library has 1 of 10 songs of as partly owned on the artist page, with the library counts', async (t) => {
      configureAurral(t);
      libraryWithPartialFinest();
      mock.method(AurralAPI.prototype, 'getArtistDetails', async () => ({
        mbid: ANDREW_BIRD,
        name: 'Andrew Bird',
        type: 'Person',
        country: null,
        beginYear: null,
        endYear: null,
        genres: [],
        bio: null,
        releaseGroups: [
          {
            id: FINEST,
            title: 'My Finest Work Yet',
            year: 2019,
            primaryType: 'Album' as const,
            secondaryTypes: [],
            coverUrl: null,
          },
        ],
      }));

      const agent = await login();
      const res = await agent.get(`/music/artist/${ANDREW_BIRD}`);
      assert.strictEqual(res.status, 200);
      const [group] = res.body.releaseGroups;
      assert.strictEqual(group.inLibrary, false);
      assert.strictEqual(group.partial, true);
      assert.strictEqual(group.libraryTrackCount, 10);
      assert.strictEqual(group.libraryAvailableTrackCount, 1);
    });

    it('lists an album once in search, with the library state, not again under "In your library"', async (t) => {
      configureAurral(t);
      mock.method(DeezerAPI.prototype, 'searchArtists', async () => []);
      mock.method(AurralAPI.prototype, 'searchAlbums', async () => []);
      libraryWithPartialFinest();
      mock.method(AurralAPI.prototype, 'searchUnified', async () => ({
        artists: [],
        albums: [finestAlbum(false)],
        tracks: [],
        top: { type: 'album' as const, ...finestAlbum(false) },
        degraded: false,
      }));
      mock.method(AurralAPI.prototype, 'searchLibrary', async () => ({
        artists: [],
        albums: [finestAlbum(true)],
        tracks: [],
      }));

      const agent = await login();
      const res = await agent
        .get('/music/search')
        .query({ q: 'My Finest Work Yet' });
      assert.strictEqual(res.status, 200);
      const album = (
        res.body.albums as { mbid: string; partial?: boolean }[]
      ).find((entry) => entry.mbid === FINEST);
      assert.strictEqual(album?.partial, true);
      assert.strictEqual(res.body.top?.partial, true);
      assert.strictEqual(res.body.top?.inLibrary, false);
      assert.deepStrictEqual(res.body.library.albums, []);
    });

    it('shows each album once in search and leaves out singles an album there already has', async (t) => {
      configureAurral(t);
      mock.method(DeezerAPI.prototype, 'searchArtists', async () => []);
      mock.method(AurralAPI.prototype, 'searchAlbums', async () => []);
      const mjAlbum = (
        mbid: string,
        title: string,
        primaryType = 'Album',
        releaseDate = '1987'
      ) => ({
        mbid,
        title,
        artistName: 'Michael Jackson',
        artistMbid: null,
        primaryType,
        releaseDate,
        coverUrl: null,
        inLibrary: false,
      });
      const ids = {
        bad: 'abcdefab-0000-4000-8000-0000000000e1',
        edition: 'abcdefab-0000-4000-8000-0000000000e2',
        badSingle: 'abcdefab-0000-4000-8000-0000000000e3',
        thriller: 'abcdefab-0000-4000-8000-0000000000e4',
        jeanSingle: 'abcdefab-0000-4000-8000-0000000000e5',
        blood: 'abcdefab-0000-4000-8000-0000000000e6',
      };
      mock.method(AurralAPI.prototype, 'searchUnified', async () => ({
        artists: [],
        albums: [
          mjAlbum(ids.bad, 'Bad'),
          mjAlbum(ids.edition, 'Bad (Special Edition)', 'Album', '2001'),
          mjAlbum(ids.badSingle, 'Bad', 'Single'),
          mjAlbum(ids.thriller, 'Thriller', 'Album', '1982'),
          mjAlbum(ids.jeanSingle, 'Billie Jean', 'Single', '1983'),
          mjAlbum(ids.blood, 'Blood on the Dance Floor', 'Single', '1997'),
        ],
        tracks: [
          {
            title: 'Billie Jean',
            artistName: 'Michael Jackson',
            artistMbid: null,
            albumTitle: 'Thriller',
            albumMbid: ids.thriller,
            durationMs: 294000,
            coverUrl: null,
            previewDeezerId: null,
            inLibrary: false,
          },
        ],
        top: null,
        degraded: false,
      }));
      mock.method(AurralAPI.prototype, 'searchLibrary', async () => ({
        artists: [],
        albums: [],
        tracks: [],
      }));

      const agent = await login();
      const res = await agent
        .get('/music/search')
        .query({ q: 'michael jackson' });
      assert.strictEqual(res.status, 200);
      const shown = (res.body.albums as { mbid: string }[]).map(
        (album) => album.mbid
      );
      assert.ok(shown.includes(ids.bad));
      assert.ok(shown.includes(ids.thriller));
      assert.ok(shown.includes(ids.blood));
      assert.ok(!shown.includes(ids.edition), 'another edition of Bad');
      assert.ok(!shown.includes(ids.badSingle), 'the Bad single');
      assert.ok(!shown.includes(ids.jeanSingle), 'a single on Thriller');

      // searched for by its exact title, the single can still be found
      const exact = await agent
        .get('/music/search')
        .query({ q: 'Billie Jean' });
      assert.strictEqual(exact.status, 200);
      assert.ok(
        (exact.body.albums as { mbid: string }[]).some(
          (album) => album.mbid === ids.jeanSingle
        ) || exact.body.top?.mbid === ids.jeanSingle
      );
    });

    it('does not show songs of a partly available album with a finished request as requested', async (t) => {
      configureAurral(t);
      mock.method(DeezerAPI.prototype, 'searchArtists', async () => []);
      mock.method(AurralAPI.prototype, 'searchAlbums', async () => []);
      const albumMbid = 'abcdefab-0000-4000-8000-0000000000c0';
      mock.method(AurralAPI.prototype, 'searchUnified', async () => ({
        artists: [],
        albums: [],
        tracks: [
          {
            title: 'Missing Song',
            artistName: 'Father of Peace',
            artistMbid: null,
            albumTitle: 'The Year Of Madness',
            albumMbid,
            durationMs: 120000,
            coverUrl: null,
            previewDeezerId: null,
            inLibrary: false,
          },
        ],
        top: null,
        degraded: false,
      }));
      mock.method(AurralAPI.prototype, 'searchLibrary', async () => ({
        artists: [],
        albums: [],
        tracks: [],
      }));
      await getRepository(Media).save(
        new Media({
          tmdbId: 0,
          mbId: albumMbid,
          mediaType: MediaType.MUSIC,
          status: MediaStatus.PARTIALLY_AVAILABLE,
        })
      );

      const agent = await login();
      const res = await agent.get('/music/search').query({ q: 'missing song' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.tracks[0].albumRequested, undefined);
    });

    it('gives the album page the library count when the release ids do not match the edition', async (t) => {
      configureAurral(t);
      mock.method(AurralAPI.prototype, 'lookupAlbums', async () => ({}));
      const albumMbid = 'abcdefab-0000-4000-8000-0000000000d0';
      mock.method(AurralAPI.prototype, 'getLibraryAlbumPage', async () => ({
        kind: 'albums' as const,
        page: 1,
        pageSize: 60,
        total: 1,
        hasMore: false,
        items: [
          {
            id: 4991,
            title: 'The Year Of Madness & The Mystery Century',
            artistName: 'Father of Peace',
            mbid: null,
            releaseGroupMbid: albumMbid,
            releaseDate: null,
            addedAt: null,
            trackCount: 22,
            availableTrackCount: 21,
            coverUrl: '/api/v1/music/library-art/albums/4991',
          },
        ],
      }));
      const assertEnrichment = mockAlbumEnrichment(albumMbid);
      mock.method(ListenBrainzAPI.prototype, 'getAlbum', async () => ({
        release_group_mbid: albumMbid,
        type: 'Album',
        release_group_metadata: {
          release_group: {
            name: 'The Year Of Madness & The Mystery Century',
            date: '2025-01-01',
          },
          artist: { name: 'Father of Peace', artists: [] },
        },
        mediums: [
          {
            tracks: [
              {
                name: 'The Chaos',
                position: 1,
                length: 180000,
                recording_mbid: 'abcdefab-0000-4000-8000-0000000000d1',
                artists: [{ artist_credit_name: 'Father of Peace' }],
              },
            ],
          },
        ],
      }));

      const agent = await login();
      const res = await agent.get(`/music/${albumMbid}`);
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.body.libraryAlbum, {
        status: 'partial',
        trackCount: 22,
        availableTrackCount: 21,
      });
      assertEnrichment();
    });

    it('answers 404 for non-UUID album ids without calling providers', async () => {
      const getAlbum = mock.method(ListenBrainzAPI.prototype, 'getAlbum');
      const getReleaseGroup = mock.method(
        MusicBrainz.prototype,
        'getReleaseGroupDetails'
      );

      const agent = await login();
      for (const path of [
        '/music/playlists',
        '/music/recommended',
        '/music/playlists/artist',
        '/music/recommended/artist-discography',
        '/music/playlists/artist-similar',
        '/music/playlists/rating',
      ]) {
        const res = await agent.get(path);
        assert.strictEqual(res.status, 404, path);
      }
      const album = await agent.get('/music/playlists');
      assert.deepStrictEqual(album.body, { message: 'Album not found.' });
      assert.strictEqual(
        (await agent.get('/music/playlists/artwork')).status,
        400
      );
      assert.strictEqual(getAlbum.mock.callCount(), 0);
      assert.strictEqual(getReleaseGroup.mock.callCount(), 0);
    });
  });
});
