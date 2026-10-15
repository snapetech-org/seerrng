import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import Season from '@server/entity/Season';
import SeasonRequest from '@server/entity/SeasonRequest';
import { User } from '@server/entity/User';
import { attachViewerRequestCoverage } from '@server/lib/viewerRequestCoverage';
import { setupTestDb } from '@server/test/db';

setupTestDb();

const saveRequest = async (
  media: Media,
  requestedBy: User,
  status: MediaRequestStatus,
  is4k: boolean,
  seasons: SeasonRequest[] = []
) =>
  getRepository(MediaRequest).save(
    new MediaRequest({
      type: media.mediaType,
      status,
      media,
      requestedBy,
      modifiedBy: requestedBy,
      is4k,
      seasons,
    })
  );

describe('attachViewerRequestCoverage', () => {
  it('matches movie requests by viewer and quality, excluding other request states', async () => {
    const [viewer, otherUser] = await Promise.all([
      getRepository(User).findOneByOrFail({ email: 'admin@seerr.dev' }),
      getRepository(User).findOneByOrFail({ email: 'friend@seerr.dev' }),
    ]);
    const movie = await getRepository(Media).save(
      new Media({
        tmdbId: 99401,
        mediaType: MediaType.MOVIE,
        status: MediaStatus.AVAILABLE,
        status4k: MediaStatus.AVAILABLE,
      })
    );

    await Promise.all([
      saveRequest(movie, viewer, MediaRequestStatus.COMPLETED, false),
      saveRequest(movie, otherUser, MediaRequestStatus.COMPLETED, true),
      saveRequest(movie, viewer, MediaRequestStatus.PENDING, true),
      saveRequest(movie, viewer, MediaRequestStatus.DECLINED, true),
    ]);

    await attachViewerRequestCoverage([movie], viewer);

    assert.deepStrictEqual(movie.viewerRequestCoverage, {
      standard: true,
      fourK: false,
    });
    assert.equal(
      'requesterId' in (movie.viewerRequestCoverage as object),
      false
    );
  });

  it('counts full-season requests per quality but ignores episode-only requests', async () => {
    const [viewer, otherUser] = await Promise.all([
      getRepository(User).findOneByOrFail({ email: 'admin@seerr.dev' }),
      getRepository(User).findOneByOrFail({ email: 'friend@seerr.dev' }),
    ]);
    const series = await getRepository(Media).save(
      new Media({
        tmdbId: 99402,
        mediaType: MediaType.TV,
        status: MediaStatus.AVAILABLE,
        status4k: MediaStatus.AVAILABLE,
      })
    );
    await getRepository(Season).save([
      new Season({
        media: Promise.resolve(series),
        seasonNumber: 1,
        status: MediaStatus.AVAILABLE,
        status4k: MediaStatus.AVAILABLE,
      }),
      new Season({
        media: Promise.resolve(series),
        seasonNumber: 2,
        status: MediaStatus.AVAILABLE,
        status4k: MediaStatus.AVAILABLE,
      }),
    ]);

    await Promise.all([
      saveRequest(series, viewer, MediaRequestStatus.COMPLETED, false, [
        new SeasonRequest({
          seasonNumber: 1,
          status: MediaRequestStatus.COMPLETED,
        }),
      ]),
      saveRequest(series, viewer, MediaRequestStatus.COMPLETED, true, [
        new SeasonRequest({
          seasonNumber: 1,
          status: MediaRequestStatus.COMPLETED,
        }),
      ]),
      saveRequest(series, viewer, MediaRequestStatus.COMPLETED, false, [
        new SeasonRequest({
          seasonNumber: 2,
          status: MediaRequestStatus.COMPLETED,
          episodeNumbers: [1, 2],
        }),
      ]),
      saveRequest(series, otherUser, MediaRequestStatus.COMPLETED, true, [
        new SeasonRequest({
          seasonNumber: 2,
          status: MediaRequestStatus.COMPLETED,
        }),
      ]),
    ]);

    await attachViewerRequestCoverage([series], viewer);

    assert.deepStrictEqual(series.viewerRequestCoverage, {
      standard: false,
      fourK: false,
      seasons: [
        { seasonNumber: 1, standard: true, fourK: true },
        { seasonNumber: 2, standard: false, fourK: false },
      ],
    });
  });

  it('treats a completed whole-series request as coverage for both formats', async () => {
    const viewer = await getRepository(User).findOneByOrFail({
      email: 'admin@seerr.dev',
    });
    const series = await getRepository(Media).save(
      new Media({
        tmdbId: 99403,
        mediaType: MediaType.TV,
        status: MediaStatus.AVAILABLE,
        status4k: MediaStatus.AVAILABLE,
      })
    );
    await getRepository(Season).save(
      new Season({
        media: Promise.resolve(series),
        seasonNumber: 1,
        status: MediaStatus.AVAILABLE,
        status4k: MediaStatus.AVAILABLE,
      })
    );
    await saveRequest(series, viewer, MediaRequestStatus.COMPLETED, true);

    await attachViewerRequestCoverage([series], viewer);

    assert.deepStrictEqual(series.viewerRequestCoverage, {
      standard: false,
      fourK: true,
      seasons: [{ seasonNumber: 1, standard: false, fourK: true }],
    });
  });

  it('does not attach viewer-specific data to anonymous or non-video results', async () => {
    const book = new Media({ tmdbId: 99404, mediaType: MediaType.BOOK });
    const viewer = await getRepository(User).findOneByOrFail({
      email: 'admin@seerr.dev',
    });

    await attachViewerRequestCoverage([book], undefined);
    await attachViewerRequestCoverage([book], viewer);

    assert.equal(book.viewerRequestCoverage, undefined);
  });
});
