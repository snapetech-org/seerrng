import ComicVineAPI from '@server/api/comicvine';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MediaIdentifier, {
  MediaIdentifierProvider,
} from '@server/entity/MediaIdentifier';
import { clearMangaSearchCaches } from '@server/lib/mangaSearch';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import {
  getPersistedMangaAnilistId,
  isMangaComicVineVolume,
} from './mangaVolume';

setupTestDb();

const saveComicVineIdentity = async (
  comicVineId: number,
  anilistId?: number
): Promise<void> => {
  const media = await getRepository(Media).save(
    new Media({
      tmdbId: 0,
      mediaType: MediaType.COMIC,
      status: MediaStatus.PENDING,
      status4k: MediaStatus.UNKNOWN,
    })
  );
  const identifiers = getRepository(MediaIdentifier);
  await identifiers.save(
    new MediaIdentifier({
      media,
      provider: MediaIdentifierProvider.COMICVINE,
      value: String(comicVineId),
      canonical: true,
    })
  );
  if (anilistId !== undefined) {
    await identifiers.save(
      new MediaIdentifier({
        media,
        provider: MediaIdentifierProvider.ANILIST,
        value: String(anilistId),
        canonical: false,
      })
    );
  }
};

describe('BackIssue manga classification', () => {
  afterEach(() => {
    clearMangaSearchCaches();
    mock.restoreAll();
  });

  it('uses the persisted AniList identity after the in-memory hint is gone', async () => {
    await saveComicVineIdentity(990001, 105778);
    const settings = getSettings();
    const previousApiKey = settings.main.comicVineApiKey;
    settings.main.comicVineApiKey = '';
    const lookup = mock.method(
      ComicVineAPI.prototype,
      'getVolume',
      async () => {
        throw new Error('Persisted manga identity should avoid this lookup.');
      }
    );

    try {
      assert.equal(await getPersistedMangaAnilistId(990001), 105778);
      assert.equal(await isMangaComicVineVolume(990001), true);
      assert.equal(lookup.mock.callCount(), 0);
    } finally {
      settings.main.comicVineApiKey = previousApiKey;
    }
  });

  it('propagates ComicVine lookup failures instead of filing the title as a comic', async () => {
    const settings = getSettings();
    const previousApiKey = settings.main.comicVineApiKey;
    settings.main.comicVineApiKey = 'test-key';
    mock.method(ComicVineAPI.prototype, 'getVolume', async () => {
      throw Object.assign(
        new Error('Request failed with status code 503'),
        { isAxiosError: true, response: { status: 503 } }
      );
    });

    try {
      await assert.rejects(
        isMangaComicVineVolume(990002),
        /status code 503/
      );
    } finally {
      settings.main.comicVineApiKey = previousApiKey;
    }
  });
});
