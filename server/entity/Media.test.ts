import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

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
import SeasonRequest from '@server/entity/SeasonRequest';
import { User } from '@server/entity/User';
import { setupTestDb } from '@server/test/db';

setupTestDb();

describe('Media.getRelatedMedia', () => {
  it('normalizes MusicBrainz IDs before matching related media', async () => {
    const media = await getRepository(Media).save(
      new Media({
        tmdbId: 0,
        mbId: 'release-group-id',
        mediaType: MediaType.MUSIC,
        status: MediaStatus.AVAILABLE,
        status4k: MediaStatus.UNKNOWN,
      })
    );

    const relatedMedia = await Media.getRelatedMedia(undefined, [
      ' RELEASE-GROUP-ID ',
    ]);

    assert.equal(relatedMedia.length, 1);
    assert.equal(relatedMedia[0].id, media.id);
  });
});

describe('Media.getMedia', () => {
  it('hydrates independent request and issue relations without joined multiplication', async () => {
    const user = await getRepository(User).findOneByOrFail({
      email: 'admin@seerr.dev',
    });
    const media = await getRepository(Media).save(
      new Media({ tmdbId: 99123, mediaType: MediaType.MOVIE })
    );
    await getRepository(MediaRequest).save(
      new MediaRequest({
        type: MediaType.MOVIE,
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
        issueType: IssueType.VIDEO,
        status: IssueStatus.OPEN,
        media,
        comments: [new IssueComment({ user, message: 'Detail comment' })],
      })
    );

    const result = await Media.getMedia(99123, MediaType.MOVIE, user);

    assert.ok(result);
    assert.equal(result.requests.length, 1);
    assert.equal(result.issues.length, 1);
    assert.equal(result.issues[0].comments[0].message, 'Detail comment');
  });

  it('hydrates active TV requests with seasons but omits inactive history', async () => {
    const user = await getRepository(User).findOneByOrFail({
      email: 'admin@seerr.dev',
    });
    const media = await getRepository(Media).save(
      new Media({ tmdbId: 99124, mediaType: MediaType.TV })
    );
    await getRepository(MediaRequest).save([
      new MediaRequest({
        type: MediaType.TV,
        status: MediaRequestStatus.PENDING,
        media,
        requestedBy: user,
        modifiedBy: user,
        is4k: false,
        seasons: [
          new SeasonRequest({
            seasonNumber: 2,
            status: MediaRequestStatus.PENDING,
          }),
        ],
      }),
      new MediaRequest({
        type: MediaType.TV,
        status: MediaRequestStatus.FAILED,
        media,
        requestedBy: user,
        modifiedBy: user,
        is4k: false,
        seasons: [
          new SeasonRequest({
            seasonNumber: 3,
            status: MediaRequestStatus.FAILED,
          }),
        ],
      }),
    ]);

    const result = await Media.getMedia(99124, MediaType.TV, user);

    assert.ok(result);
    assert.equal(result.requests.length, 1);
    assert.equal(result.requests[0].status, MediaRequestStatus.PENDING);
    assert.deepStrictEqual(
      result.requests[0].seasons.map((season) => season.seasonNumber),
      [2]
    );
  });

  it('hydrates only the current viewer’s movie request coverage', async () => {
    const [viewer, otherUser] = await Promise.all([
      getRepository(User).findOneByOrFail({ email: 'admin@seerr.dev' }),
      getRepository(User).findOneByOrFail({ email: 'friend@seerr.dev' }),
    ]);
    const media = await getRepository(Media).save(
      new Media({ tmdbId: 99125, mediaType: MediaType.MOVIE })
    );
    await getRepository(MediaRequest).save([
      new MediaRequest({
        type: MediaType.MOVIE,
        status: MediaRequestStatus.COMPLETED,
        media,
        requestedBy: viewer,
        modifiedBy: viewer,
        is4k: false,
      }),
      new MediaRequest({
        type: MediaType.MOVIE,
        status: MediaRequestStatus.COMPLETED,
        media,
        requestedBy: otherUser,
        modifiedBy: otherUser,
        is4k: true,
      }),
    ]);

    const result = await Media.getMedia(99125, MediaType.MOVIE, viewer);

    assert.ok(result);
    assert.deepStrictEqual(result.viewerRequestCoverage, {
      standard: true,
      fourK: false,
    });
    assert.equal(
      'requesterId' in (result.viewerRequestCoverage as object),
      false
    );
  });
});
