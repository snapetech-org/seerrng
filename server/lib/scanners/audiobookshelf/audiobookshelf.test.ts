import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import AudiobookshelfAPI, {
  type AudiobookshelfLibraryItemsResponse,
} from '@server/api/audiobookshelf';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MediaIdentifier, {
  MediaIdentifierProvider,
} from '@server/entity/MediaIdentifier';
import { setupTestDb } from '@server/test/db';

import { audiobookshelfScanner } from '.';

const originalExternalConfig = process.env.SEERR_EXTERNAL_CONFIG;
let libraryPage: AudiobookshelfLibraryItemsResponse = {
  results: [],
  total: 0,
  limit: 100,
  page: 0,
};

setupTestDb();

function configureAudiobookshelf(): void {
  process.env.SEERR_EXTERNAL_CONFIG = JSON.stringify({
    clientId: 'test-client',
    vapidPublic: 'test-public',
    vapidPrivate: 'test-private',
    main: {},
    plex: {},
    jellyfin: {},
    oidc: {},
    tautulli: {},
    radarr: [],
    sonarr: [],
    lidarr: [],
    readarr: [],
    audiobookshelf: {
      id: 7,
      name: 'Audiobookshelf',
      hostname: 'localhost',
      port: 13378,
      apiKey: 'test-token',
      useSsl: false,
      libraryId: 'books',
      libraryName: 'Books',
      syncEnabled: true,
    },
    notifications: { agents: {} },
    network: {},
  });
}

async function seedBook(options: {
  isbn?: string;
  itemId?: string;
  status?: MediaStatus;
  ebookServiceId?: number | null;
}) {
  const media = await getRepository(Media).save(
    new Media({
      tmdbId: 0,
      mediaType: MediaType.BOOK,
      status: options.status ?? MediaStatus.PROCESSING,
      status4k: MediaStatus.UNKNOWN,
      externalServiceId: options.ebookServiceId ?? null,
      audiobookLibraryServiceId: options.itemId ? 7 : null,
      audiobookLibraryItemId: options.itemId ?? null,
      identifiers: [
        ...(options.isbn
          ? [
              new MediaIdentifier({
                provider: MediaIdentifierProvider.ISBN,
                value: options.isbn,
                canonical: true,
              }),
            ]
          : []),
        ...(options.itemId
          ? [
              new MediaIdentifier({
                provider: MediaIdentifierProvider.AUDIOBOOKSHELF,
                value: options.itemId,
              }),
            ]
          : []),
      ],
    })
  );

  return media;
}

describe('Audiobookshelf Scanner', () => {
  beforeEach(() => {
    mock.restoreAll();
    configureAudiobookshelf();
    libraryPage = { results: [], total: 0, limit: 100, page: 0 };
    mock.method(AudiobookshelfAPI.prototype, 'getLibraryItems', async () =>
      structuredClone(libraryPage)
    );
  });

  afterEach(() => {
    if (originalExternalConfig === undefined) {
      delete process.env.SEERR_EXTERNAL_CONFIG;
    } else {
      process.env.SEERR_EXTERNAL_CONFIG = originalExternalConfig;
    }
  });

  it('links an ISBN-matched book as available without changing ebook service data', async () => {
    const media = await seedBook({ isbn: '9780306406157' });
    libraryPage = {
      results: [
        {
          id: 'abs-item-1',
          mediaType: 'book',
          media: { metadata: { isbn: '9780306406157', title: 'Test Book' } },
          addedAt: 1_728_000_000,
        },
      ],
      total: 1,
      limit: 100,
      page: 0,
    };

    await audiobookshelfScanner.run();

    const updated = await getRepository(Media).findOneOrFail({
      where: { id: media.id },
      relations: { identifiers: true },
    });
    assert.equal(updated.status, MediaStatus.AVAILABLE);
    assert.equal(updated.audiobookLibraryServiceId, 7);
    assert.equal(updated.audiobookLibraryItemId, 'abs-item-1');
    assert.equal(updated.externalServiceId, null);
    assert.ok(
      updated.identifiers?.some(
        (identifier) =>
          identifier.provider === MediaIdentifierProvider.AUDIOBOOKSHELF &&
          identifier.value === 'abs-item-1'
      )
    );
  });

  it('processes consecutive Audiobookshelf items without overlapping SQLite transactions', async () => {
    const first = await seedBook({ isbn: '9780306406157' });
    const second = await seedBook({ isbn: '9780140328721' });
    libraryPage = {
      results: [
        {
          id: 'abs-item-1',
          mediaType: 'book',
          media: { metadata: { isbn: '9780306406157', title: 'First Book' } },
        },
        {
          id: 'abs-item-2',
          mediaType: 'book',
          media: { metadata: { isbn: '9780140328721', title: 'Second Book' } },
        },
      ],
      total: 2,
      limit: 100,
      page: 0,
    };

    await audiobookshelfScanner.run();

    const updated = await getRepository(Media).find({
      where: [{ id: first.id }, { id: second.id }],
    });
    assert.equal(updated.length, 2);
    assert.ok(updated.every((media) => media.status === MediaStatus.AVAILABLE));
    assert.deepEqual(
      updated.map((media) => media.audiobookLibraryItemId).sort(),
      ['abs-item-1', 'abs-item-2']
    );
  });

  it('preserves existing links when Audiobookshelf returns an incomplete scan', async () => {
    const media = await seedBook({
      itemId: 'abs-item-missing',
      status: MediaStatus.AVAILABLE,
    });
    libraryPage = { results: [], total: 2, limit: 100, page: 0 };

    await audiobookshelfScanner.run();

    const updated = await getRepository(Media).findOneOrFail({
      where: { id: media.id },
    });
    assert.equal(updated.audiobookLibraryServiceId, 7);
    assert.equal(updated.audiobookLibraryItemId, 'abs-item-missing');
    assert.equal(updated.status, MediaStatus.AVAILABLE);
  });

  it('clears removed audiobook links while preserving another available service', async () => {
    const standaloneBook = await seedBook({
      itemId: 'abs-item-removed',
      status: MediaStatus.AVAILABLE,
    });
    const multiServiceBook = await seedBook({
      itemId: 'abs-item-removed-too',
      status: MediaStatus.AVAILABLE,
      ebookServiceId: 3,
    });

    await audiobookshelfScanner.run();

    const updatedStandalone = await getRepository(Media).findOneOrFail({
      where: { id: standaloneBook.id },
      relations: { identifiers: true },
    });
    const updatedMultiService = await getRepository(Media).findOneOrFail({
      where: { id: multiServiceBook.id },
      relations: { identifiers: true },
    });
    assert.equal(updatedStandalone.audiobookLibraryServiceId, null);
    assert.equal(updatedStandalone.audiobookLibraryItemId, null);
    assert.equal(updatedStandalone.status, MediaStatus.UNKNOWN);
    assert.equal(
      updatedStandalone.identifiers?.some(
        (identifier) =>
          identifier.provider === MediaIdentifierProvider.AUDIOBOOKSHELF
      ),
      false
    );
    assert.equal(updatedMultiService.status, MediaStatus.AVAILABLE);
    assert.equal(updatedMultiService.externalServiceId, 3);
  });
});
