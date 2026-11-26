import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';

import AurralAPI from '@server/api/aurral';
import ListenBrainzAPI from '@server/api/listenbrainz';
import MusicBrainz from '@server/api/musicbrainz';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import TrackRequest from '@server/entity/TrackRequest';
import { User } from '@server/entity/User';
import { resetOwnedSongIndexes } from '@server/lib/musicOwnedSongs';
import {
  clearReleaseGroupEditionCache,
  clearRequestAllTracklistCache,
} from '@server/lib/musicRequestAllPlan';
import requestDispatchManager from '@server/lib/requestDispatch';
import { getSettings } from '@server/lib/settings';
import { checkUser } from '@server/middleware/auth';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import request from 'supertest';
import authRoutes from './auth';
import musicRoutes, { albumPageRedundancy } from './music';
import requestRoutes from './request';

const ARTIST = '11111111-1111-4111-8111-111111111111';
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const BAD_ALBUM = id(1);
const BAD_EDITION = id(2);
const BEN_ALBUM = id(3);
const BAD_SINGLE = id(4);
const BEN_SINGLE = id(5);
const B_SIDE_SINGLE = id(6);
const OWNED_ALBUM = id(7);
const PROMO_SINGLE = id(8);
const BILLIE_SINGLE = id(9);

const TRACKS: Record<string, string[]> = {
  [BAD_ALBUM]: ['Bad', 'The Way You Make Me Feel'],
  [BAD_EDITION]: ['Bad', 'The Way You Make Me Feel'],
  [BEN_ALBUM]: ['Ben', 'My Girl'],
  [BAD_SINGLE]: ['Bad (Single Version)'],
  [BEN_SINGLE]: ['Ben'],
  [B_SIDE_SINGLE]: ['Ben', 'You Can Cry on My Shoulder'],
  [OWNED_ALBUM]: ['Thriller', 'Billie Jean'],
  [PROMO_SINGLE]: ['Bad (Promo Edit)'],
  [BILLIE_SINGLE]: ['Billie Jean'],
};

let app: Express;

const createApp = () => {
  const created = express();
  created.use(express.json());
  created.use(
    session({
      secret: 'test-secret',
      cookie: { secure: 'auto' },
      resave: false,
      saveUninitialized: false,
    })
  );
  created.use(rateLimit({ windowMs: 60_000, limit: 10_000 }), checkUser);
  created.use('/auth', authRoutes);
  created.use('/music', musicRoutes);
  created.use('/request', requestRoutes);
  created.use(
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
  return created;
};

const login = async (email = 'admin@seerr.dev') => {
  const settings = getSettings();
  const priorLocalLogin = settings.main.localLogin;
  settings.main.localLogin = true;
  try {
    const agent = request.agent(app);
    const res = await agent
      .post('/auth/local')
      .send({ email, password: 'test1234' });
    assert.strictEqual(res.status, 200);
    return agent;
  } finally {
    settings.main.localLogin = priorLocalLogin;
  }
};

const releaseGroup = (
  mbid: string,
  title: string,
  primaryType: 'Album' | 'Single',
  year: number
) => ({
  id: mbid,
  title,
  year,
  primaryType,
  secondaryTypes: [],
  coverUrl: null,
});

const PRIMARY_TYPES: Record<string, string> = {
  [BAD_SINGLE]: 'Single',
  [BEN_SINGLE]: 'Single',
  [B_SIDE_SINGLE]: 'Single',
  [PROMO_SINGLE]: 'Single',
  [BILLIE_SINGLE]: 'Single',
};

before(() => {
  app = createApp();
});

setupTestDb();

describe('POST /music/artist/:mbid/request-all', () => {
  let getAlbum: ReturnType<typeof mock.method>;
  let requestTrack: ReturnType<typeof mock.method>;

  beforeEach(() => {
    getSettings().aurral = [
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
    clearRequestAllTracklistCache();
    resetOwnedSongIndexes();
    mock.method(requestDispatchManager, 'enqueue', async () => undefined);
    mock.method(AurralAPI.prototype, 'getArtistDetails', async () => ({
      mbid: ARTIST,
      name: 'Michael Jackson',
      type: 'Person',
      country: 'US',
      beginYear: 1958,
      endYear: 2009,
      genres: [],
      bio: null,
      releaseGroups: [
        releaseGroup(BAD_ALBUM, 'Bad', 'Album', 1987),
        releaseGroup(BAD_EDITION, 'Bad', 'Album', 2012),
        releaseGroup(BEN_ALBUM, 'Ben', 'Album', 1972),
        releaseGroup(OWNED_ALBUM, 'Thriller', 'Album', 1982),
        releaseGroup(BAD_SINGLE, 'Bad', 'Single', 1987),
        releaseGroup(BEN_SINGLE, 'Ben', 'Single', 1972),
        releaseGroup(B_SIDE_SINGLE, 'Ben (Reissue)', 'Single', 1980),
        releaseGroup(PROMO_SINGLE, 'Bad Promo CD', 'Single', 1987),
        releaseGroup(BILLIE_SINGLE, 'Billie Jean', 'Single', 1983),
      ],
    }));
    mock.method(
      AurralAPI.prototype,
      'getLibraryArtistReleaseGroups',
      async () => ({
        owned: new Set<string>([OWNED_ALBUM]),
        partial: new Set<string>(),
      })
    );
    // the owned-album and owned-song indexes read nothing real
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
    requestTrack = mock.method(
      AurralAPI.prototype,
      'requestTrack',
      async () => ({ success: true, queued: true, jobId: 'job-b-side' })
    );
    getAlbum = mock.method(
      ListenBrainzAPI.prototype,
      'getAlbum',
      async (mbid: string) => ({
        release_group_metadata: {
          release_group: { name: 'Fixture' },
          artist: {
            name: 'Michael Jackson',
            artists: [{ artist_mbid: ARTIST, name: 'Michael Jackson' }],
          },
        },
        mediums: [
          {
            tracks: (TRACKS[mbid] ?? []).map((name) => ({
              name,
              length: 180000,
            })),
          },
        ],
      })
    );
    mock.method(
      MusicBrainz.prototype,
      'getReleaseGroupDetails',
      async ({ releaseGroupId }: { releaseGroupId: string }) => ({
        id: releaseGroupId,
        title: 'Fixture',
        'primary-type': PRIMARY_TYPES[releaseGroupId] ?? 'Album',
        'artist-credit': [{ name: 'Michael Jackson', artist: { id: ARTIST } }],
        releases: [],
      })
    );
    // the owned Thriller has a larger official edition with a bonus track
    clearReleaseGroupEditionCache();
    mock.method(
      MusicBrainz.prototype,
      'getReleaseGroupReleases',
      async ({ releaseGroupId }: { releaseGroupId: string }) =>
        releaseGroupId === OWNED_ALBUM
          ? [{ id: 'rel-thriller-25', title: 'Thriller 25', trackCount: 3 }]
          : []
    );
    mock.method(MusicBrainz.prototype, 'getReleaseTracks', async () => [
      { disc: 1, position: 1, title: 'Thriller', lengthMs: 357000 },
      { disc: 1, position: 2, title: 'Billie Jean', lengthMs: 294000 },
      { disc: 1, position: 3, title: 'For All Time', lengthMs: 241000 },
    ]);
  });

  afterEach(() => {
    getSettings().aurral = [];
    clearRequestAllTracklistCache();
    resetOwnedSongIndexes();
    mock.restoreAll();
  });

  it('returns the plan on a dry run and requests nothing', async () => {
    const agent = await login();
    const res = await agent
      .post(`/music/artist/${ARTIST}/request-all`)
      .send({ dryRun: true });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.dryRun, true);
    assert.deepStrictEqual(
      res.body.albums.map((item: { mbid: string }) => item.mbid),
      [BEN_ALBUM, BAD_ALBUM]
    );
    // the reissue's only new song is its B-side: just that song
    assert.deepStrictEqual(res.body.epsAndSingles, []);
    assert.deepStrictEqual(res.body.songs, [
      {
        title: 'You Can Cry on My Shoulder',
        artistName: 'Michael Jackson',
        fromReleaseMbid: B_SIDE_SINGLE,
        fromReleaseTitle: 'Ben (Reissue)',
        durationMs: 180000,
      },
      // a bonus track of a larger edition of the owned Thriller
      {
        title: 'For All Time',
        artistName: 'Michael Jackson',
        fromReleaseMbid: OWNED_ALBUM,
        fromReleaseTitle: 'Thriller 25',
        releaseMbid: 'rel-thriller-25',
        durationMs: 241000,
        reason: 'bonus track on Thriller 25',
      },
    ]);
    const reasons = Object.fromEntries(
      res.body.skipped.map((item: { mbid: string; reasonCode: string }) => [
        item.mbid,
        item.reasonCode,
      ])
    );
    assert.deepStrictEqual(reasons, {
      [OWNED_ALBUM]: 'owned',
      [BAD_EDITION]: 'sameAlbum',
      [BAD_SINGLE]: 'covered',
      [BEN_SINGLE]: 'covered',
      [B_SIDE_SINGLE]: 'newSongsOnly',
      [PROMO_SINGLE]: 'unofficial',
      [BILLIE_SINGLE]: 'covered',
    });
    assert.deepStrictEqual(res.body.counts, {
      albums: 2,
      epsAndSingles: 0,
      songs: 2,
      skipped: 7,
      covered: 5,
      unofficial: 1,
      bonusSongs: 1,
    });
    assert.strictEqual(res.body.results, undefined);
    assert.strictEqual(await getRepository(MediaRequest).count(), 0);
    assert.strictEqual(await getRepository(TrackRequest).count(), 0);
    assert.strictEqual(requestTrack.mock.callCount(), 0);
    assert.ok(getAlbum.mock.callCount() > 0);
  });

  it('requests the albums and the B-side as one song request', async () => {
    const agent = await login();
    const res = await agent
      .post(`/music/artist/${ARTIST}/request-all`)
      .send({});

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.dryRun, false);
    assert.deepStrictEqual(
      res.body.results.map(
        (item: { mbid: string; status: string }) =>
          `${item.mbid}:${item.status}`
      ),
      [`${BEN_ALBUM}:requested`, `${BAD_ALBUM}:requested`]
    );
    assert.deepStrictEqual(res.body.songResults, [
      {
        title: 'You Can Cry on My Shoulder',
        fromReleaseMbid: B_SIDE_SINGLE,
        fromReleaseTitle: 'Ben (Reissue)',
        status: 'requested',
      },
      {
        title: 'For All Time',
        fromReleaseMbid: OWNED_ALBUM,
        fromReleaseTitle: 'Thriller 25',
        status: 'requested',
      },
    ]);
    assert.strictEqual(res.body.counts.requested, 4);
    assert.strictEqual(res.body.counts.songsRequested, 2);
    assert.strictEqual(res.body.counts.failed, 0);

    const requests = await getRepository(MediaRequest).find({
      relations: { media: true },
    });
    assert.deepStrictEqual(
      requests.map((item) => item.media.mbId).sort(),
      [BAD_ALBUM, BEN_ALBUM].sort()
    );
    assert.ok(requests.every((item) => item.type === MediaType.MUSIC));
    // one job for the one song, filed under its single
    assert.strictEqual(requestTrack.mock.callCount(), 2);
    assert.deepStrictEqual(requestTrack.mock.calls[0].arguments[0], {
      artistName: 'Michael Jackson',
      trackName: 'You Can Cry on My Shoulder',
      albumName: 'Ben (Reissue)',
      artistMbid: ARTIST,
      albumMbid: B_SIDE_SINGLE,
      durationMs: 180000,
    });
    assert.strictEqual(await getRepository(TrackRequest).count(), 2);
    // the bonus track is filed under its edition
    assert.strictEqual(
      (
        requestTrack.mock.calls[1]?.arguments[0] as
          { releaseMbid?: string } | undefined
      )?.releaseMbid,
      'rel-thriller-25'
    );

    // asked again: everything is on its way, nothing is sent twice
    const again = await agent
      .post(`/music/artist/${ARTIST}/request-all`)
      .send({ dryRun: true });
    assert.strictEqual(again.status, 200);
    assert.deepStrictEqual(again.body.albums, []);
    assert.deepStrictEqual(again.body.epsAndSingles, []);
    assert.deepStrictEqual(again.body.songs, []);
    assert.strictEqual(await getRepository(MediaRequest).count(), 2);
  });

  it('skips a blocklisted album', async () => {
    await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mbId: BEN_ALBUM,
        mediaType: MediaType.MUSIC,
        status: MediaStatus.BLOCKLISTED,
      })
    );
    const agent = await login();
    const res = await agent
      .post(`/music/artist/${ARTIST}/request-all`)
      .send({ dryRun: true });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(
      res.body.albums.map((item: { mbid: string }) => item.mbid),
      [BAD_ALBUM]
    );
    assert.ok(
      res.body.skipped.some(
        (item: { mbid: string; reasonCode: string }) =>
          item.mbid === BEN_ALBUM && item.reasonCode === 'blocklisted'
      )
    );
  });

  it('refuses people who may not request music', async () => {
    const friend = await getRepository(User).findOneByOrFail({
      email: 'friend@seerr.dev',
    });
    friend.permissions = 0;
    await getRepository(User).save(friend);
    const agent = await login('friend@seerr.dev');
    const res = await agent
      .post(`/music/artist/${ARTIST}/request-all`)
      .send({});
    assert.strictEqual(res.status, 403);
    assert.strictEqual(await getRepository(MediaRequest).count(), 0);
  });

  it('refuses a signed-out caller', async () => {
    const res = await request(app)
      .post(`/music/artist/${ARTIST}/request-all`)
      .send({ dryRun: true });
    assert.strictEqual(res.status, 401);
  });

  it('rejects a bad artist id or body', async () => {
    const agent = await login();
    assert.strictEqual(
      (
        await agent
          .post('/music/artist/not-a-uuid/request-all')
          .send({ dryRun: true })
      ).status,
      400
    );
    assert.strictEqual(
      (
        await agent
          .post(`/music/artist/${ARTIST}/request-all`)
          .send({ dryRun: 'yes' })
      ).status,
      400
    );
    assert.strictEqual(
      (
        await agent
          .post(`/music/artist/${ARTIST}/request-all`)
          .send({ dryRun: true, extra: 1 })
      ).status,
      400
    );
    assert.strictEqual(await getRepository(MediaRequest).count(), 0);
  });

  describe('redundant releases', () => {
    it('marks other editions, covered singles and promos on the artist page', async () => {
      const agent = await login();
      const res = await agent.get(`/music/artist/${ARTIST}`);
      assert.strictEqual(res.status, 200);
      const byId = new Map<
        string,
        { redundant?: { code: string; reason: string; coveredBy?: object } }
      >(
        res.body.releaseGroups.map(
          (group: { id: string; redundant?: { code: string } }) => [
            group.id,
            group,
          ]
        )
      );
      assert.deepStrictEqual(byId.get(BAD_EDITION)?.redundant, {
        code: 'sameAlbum',
        reason: 'Another edition of Bad',
        coveredBy: { mbid: BAD_ALBUM, title: 'Bad' },
      });
      assert.deepStrictEqual(byId.get(BILLIE_SINGLE)?.redundant, {
        code: 'covered',
        reason: 'On Thriller',
        coveredBy: { mbid: OWNED_ALBUM, title: 'Thriller' },
      });
      assert.strictEqual(byId.get(BAD_SINGLE)?.redundant?.code, 'covered');
      assert.strictEqual(byId.get(PROMO_SINGLE)?.redundant?.code, 'unofficial');
      // the reissue adds a song: it stays
      assert.strictEqual(byId.get(B_SIDE_SINGLE)?.redundant, undefined);
      for (const mbid of [BAD_ALBUM, BEN_ALBUM, OWNED_ALBUM]) {
        assert.strictEqual(byId.get(mbid)?.redundant, undefined, mbid);
      }
    });

    it('answers 409 for a single whose songs are all on an owned album, unless forced', async () => {
      const agent = await login();
      const refused = await agent
        .post('/request')
        .send({ mediaType: 'music', mediaId: BILLIE_SINGLE });
      assert.strictEqual(refused.status, 409);
      assert.strictEqual(refused.body.code, 'MUSIC_RELEASE_REDUNDANT');
      assert.deepStrictEqual(refused.body.coveredBy, {
        mbid: OWNED_ALBUM,
        title: 'Thriller',
      });
      assert.match(
        refused.body.message,
        /already have these songs from Thriller/
      );
      assert.strictEqual(await getRepository(MediaRequest).count(), 0);

      const forced = await agent
        .post('/request')
        .send({ mediaType: 'music', mediaId: BILLIE_SINGLE, force: true });
      assert.strictEqual(forced.status, 201);
      assert.strictEqual(await getRepository(MediaRequest).count(), 1);
    });

    it('answers 409 for another edition of a requested album', async () => {
      const agent = await login();
      assert.strictEqual(
        (
          await agent
            .post('/request')
            .send({ mediaType: 'music', mediaId: BAD_ALBUM })
        ).status,
        201
      );
      const edition = await agent
        .post('/request')
        .send({ mediaType: 'music', mediaId: BAD_EDITION });
      assert.strictEqual(edition.status, 409);
      assert.deepStrictEqual(edition.body.coveredBy, {
        mbid: BAD_ALBUM,
        title: 'Bad',
      });
    });

    it('lets a single through when its album is not owned or requested', async () => {
      const agent = await login();
      const res = await agent
        .post('/request')
        .send({ mediaType: 'music', mediaId: BAD_SINGLE });
      assert.strictEqual(res.status, 201);
    });

    it('rejects force on anything but a music request', async () => {
      const agent = await login();
      const res = await agent
        .post('/request')
        .send({ mediaType: 'movie', mediaId: 550, force: true });
      assert.strictEqual(res.status, 400);
    });

    it('tells the album page of a covered single where its songs are', async () => {
      const admin = await getRepository(User).findOneByOrFail({
        email: 'admin@seerr.dev',
      });
      assert.deepStrictEqual(
        await albumPageRedundancy(BILLIE_SINGLE, 'Single', ARTIST, admin),
        {
          code: 'covered',
          reason: 'On Thriller',
          coveredBy: { mbid: OWNED_ALBUM, title: 'Thriller' },
        }
      );
      assert.strictEqual(
        await albumPageRedundancy(B_SIDE_SINGLE, 'Single', ARTIST, admin),
        null
      );
      // without Aurral there is nothing to say
      getSettings().aurral = [];
      assert.strictEqual(
        await albumPageRedundancy(BILLIE_SINGLE, 'Single', ARTIST, admin),
        null
      );
    });
  });
});
