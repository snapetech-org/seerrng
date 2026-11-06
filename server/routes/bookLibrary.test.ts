import ReadarrAPI from '@server/api/servarr/readarr';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MediaIdentifier, {
  MediaIdentifierProvider,
} from '@server/entity/MediaIdentifier';
import { User } from '@server/entity/User';
import { getSettings, type ReadarrSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import { makeBookshelfBookId } from '@server/utils/bookshelfCatalog';
import express from 'express';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import request from 'supertest';
import bookRoutes from './book';

setupTestDb();
const app = express();
app.use(async (req, _res, next) => {
  req.user = await getRepository(User).findOneByOrFail({ id: 1 });
  next();
});
app.use('/book', bookRoutes);
let restoreSettings: () => void;
beforeEach(() => {
  const settings = getSettings();
  const readarr = settings.readarr;
  const categories = settings.main.enabledMediaCategories;
  restoreSettings = () => {
    settings.readarr = readarr;
    settings.main.enabledMediaCategories = categories;
  };
  settings.main.enabledMediaCategories = {
    ...categories,
    ebook: true,
    audiobook: true,
  };
  settings.readarr = (['ebook', 'audiobook'] as const).map(
    (serviceType, i) =>
      ({
        id: i ? 42 : 7,
        name: serviceType,
        hostname: 'book.test',
        port: 8787,
        apiKey: 'fixture-key',
        serviceType,
        isDefault: true,
        syncEnabled: true,
        useSsl: false,
        baseUrl: '',
      }) as ReadarrSettings
  );
  mock.method(ReadarrAPI.prototype, 'getBooks', async () => [
    {
      id: 12,
      foreignBookId: 'hc:12345',
      title: 'Owned outside the popular feed',
      monitored: false,
      editions: [
        {
          foreignEditionId: 'hc:12346',
          title: 'Owned outside the popular feed',
          isbn13: '9780306406157',
          monitored: false,
        },
      ],
    },
  ]);
});
afterEach(() => {
  restoreSettings();
  mock.restoreAll();
});

async function availableBook(audio = false) {
  return getRepository(Media).save(
    new Media({
      tmdbId: 0,
      mediaType: MediaType.BOOK,
      status: MediaStatus.AVAILABLE,
      status4k: MediaStatus.UNKNOWN,
      externalServiceId: audio ? null : 12,
      availableEbookServiceIds: audio ? [] : [7],
      audiobookLibraryServiceId: audio ? 9 : null,
      audiobookLibraryItemId: audio ? 'abs-owned' : null,
      identifiers: [
        new MediaIdentifier({
          provider: MediaIdentifierProvider.ISBN,
          value: '9780306406157',
          canonical: true,
        }),
      ],
    })
  );
}

describe('GET /book/library', () => {
  it('lists scanned unmonitored ebooks with arbitrary service IDs and no cover', async () => {
    await availableBook();
    const res = await request(app).get('/book/library?format=ebook');
    assert.equal(res.status, 200);
    assert.equal(res.body.totalResults, 1);
    assert.equal(res.body.results[0].id, makeBookshelfBookId(7, 'hc:12345'));
    assert.equal(res.body.results[0].title, 'Owned outside the popular feed');
    assert.equal(res.body.results[0].bookFormat, 'ebook');
  });
  it('includes Audiobookshelf availability and keeps ebook/audio formats separate', async () => {
    await availableBook(true);
    const audio = await request(app).get('/book/library?format=audiobook');
    assert.equal(audio.status, 200);
    assert.equal(audio.body.totalResults, 1);
    assert.equal(audio.body.results[0].id, makeBookshelfBookId(42, 'hc:12345'));
    const ebook = await request(app).get('/book/library?format=ebook');
    assert.equal(ebook.status, 200);
    assert.equal(ebook.body.totalResults, 0);
  });
  it('does not turn an unscanned catalogue entry into availability', async () => {
    const res = await request(app).get('/book/library?format=ebook');
    assert.equal(res.status, 200);
    assert.equal(res.body.totalResults, 0);
  });
  it('excludes manager-only records even when legacy aggregate availability says available', async () => {
    const media = await availableBook();
    media.availableEbookServiceIds = [];
    await getRepository(Media).save(media);
    const res = await request(app).get('/book/library?format=ebook');
    assert.equal(res.status, 200);
    assert.equal(res.body.totalResults, 0);
  });
  it('rejects invalid and disabled formats before reading providers', async () => {
    getSettings().main.enabledMediaCategories.ebook = false;
    const call = mock.method(ReadarrAPI.prototype, 'getBooks', async () => {
      throw new Error('Must not read');
    });
    assert.equal(
      (await request(app).get('/book/library?format=both')).status,
      400
    );
    assert.equal(
      (await request(app).get('/book/library?format=ebook')).status,
      403
    );
    assert.equal(call.mock.callCount(), 0);
  });
  it('returns a sanitized outage instead of an empty successful library', async () => {
    mock.method(ReadarrAPI.prototype, 'getBooks', async () => {
      throw new Error('upstream-secret-token');
    });
    const res = await request(app).get('/book/library?format=ebook');
    assert.equal(res.status, 503);
    assert.doesNotMatch(JSON.stringify(res.body), /upstream-secret-token/);
  });

  it('does not present a partial provider failure as a complete library', async () => {
    getSettings().readarr.push({
      ...getSettings().readarr[0],
      id: 93,
      hostname: 'other.test',
    });
    let calls = 0;
    mock.method(ReadarrAPI.prototype, 'getBooks', async () => {
      if (++calls === 2) throw new Error('private-provider-detail');
      return [];
    });
    const res = await request(app).get('/book/library?format=ebook');
    assert.equal(res.status, 503);
    assert.doesNotMatch(JSON.stringify(res.body), /private-provider-detail/);
  });

  it('paginates actual available inventory rather than the popular catalogue', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `hc:${200 + i}`);
    await getRepository(Media).save(
      ids.map(
        (id, i) =>
          new Media({
            tmdbId: 0,
            mediaType: MediaType.BOOK,
            status: MediaStatus.AVAILABLE,
            status4k: MediaStatus.UNKNOWN,
            externalServiceId: i + 1,
            availableEbookServiceIds: [7],
            identifiers: [
              new MediaIdentifier({
                provider: MediaIdentifierProvider.BOOKSHELF,
                value: makeBookshelfBookId(7, id),
                canonical: true,
              }),
            ],
          })
      )
    );
    mock.method(ReadarrAPI.prototype, 'getBooks', async () =>
      ids.map((id, i) => ({
        id: i + 1,
        foreignBookId: id,
        title: `Owned ${i}`,
        monitored: false,
      }))
    );
    const first = await request(app).get('/book/library?format=ebook&page=1');
    const second = await request(app).get('/book/library?format=ebook&page=2');
    assert.equal(first.status, 200);
    assert.equal(first.body.totalResults, 51);
    assert.equal(first.body.totalPages, 2);
    assert.equal(first.body.results.length, 50);
    assert.equal(second.status, 200);
    assert.equal(second.body.results.length, 1);
    assert.equal(second.body.results[0].id, makeBookshelfBookId(7, ids[50]));
  });
});
