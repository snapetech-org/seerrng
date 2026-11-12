import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import BackIssueAPI from '@server/api/comics/backissue';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import MediaIdentifier, {
  MediaIdentifierProvider,
} from '@server/entity/MediaIdentifier';
import * as kavitaReader from '@server/lib/kavitaReader';
import { getSettings } from '@server/lib/settings';
import { setupTestDb } from '@server/test/db';
import { backissueScanner } from './index';

setupTestDb();

const settings = getSettings();
const previousBackIssueSettings = settings.backissue;
const scannerInternals = backissueScanner as unknown as {
  updateRate: number;
};
const previousUpdateRate = scannerInternals.updateRate;

afterEach(() => {
  settings.backissue = previousBackIssueSettings;
  scannerInternals.updateRate = previousUpdateRate;
  mock.restoreAll();
});

describe('BackIssue collection scanner', () => {
  it('imports an owned BackIssue series into the ComicVine availability index', async () => {
    settings.backissue = [
      {
        id: 7,
        name: 'Home BackIssue',
        hostname: 'backissue.test',
        port: 8787,
        apiKey: 'backissue-test-key',
        useSsl: false,
        baseUrl: '',
        isDefault: true,
        externalUrl: '',
        tags: [],
        syncEnabled: true,
        preventSearch: false,
      },
    ];
    scannerInternals.updateRate = 0;
    const getCollection = mock.method(
      BackIssueAPI.prototype,
      'getCollection',
      async () => [
        {
          id: 412,
          title: 'Indexed Comic',
          cv_id: 9001,
          total: 12,
          owned: 12,
          missing: 0,
          active: 0,
          type: 'comic',
        },
      ]
    );

    await backissueScanner.run();

    const media = await getRepository(Media).findOneByOrFail({
      mediaType: MediaType.COMIC,
    });
    const identifier = await getRepository(MediaIdentifier).findOneByOrFail({
      provider: MediaIdentifierProvider.COMICVINE,
      value: '9001',
    });
    assert.strictEqual(getCollection.mock.callCount(), 1);
    assert.strictEqual(media.status, MediaStatus.AVAILABLE);
    assert.strictEqual(media.comicServiceType, 'backissue');
    assert.strictEqual(media.serviceId, 7);
    assert.strictEqual(media.externalServiceId, 412);
    const linkedIdentifier = await getRepository(MediaIdentifier).findOneOrFail(
      {
        where: { id: identifier.id },
        relations: { media: true },
      }
    );
    assert.strictEqual(linkedIdentifier?.media.id, media.id);
    assert.strictEqual(backissueScanner.status().running, false);
  });

  it('records each owned series and its folder for Kavita, once', async () => {
    settings.backissue = [
      {
        id: 7,
        name: 'Home BackIssue',
        hostname: 'backissue.test',
        port: 8787,
        apiKey: 'backissue-test-key',
        useSsl: false,
        baseUrl: '',
        isDefault: true,
        externalUrl: '',
        tags: [],
        syncEnabled: true,
        preventSearch: false,
      },
    ];
    const previousKavita = settings.kavita;
    settings.kavita = {
      hostname: 'kavita.test',
      port: 5000,
      useSsl: false,
      apiKey: 'kavita-key',
    };
    kavitaReader.resetKavitaReader();
    scannerInternals.updateRate = 0;
    const refresh = mock.method(
      kavitaReader,
      'refreshKavitaIndex',
      async () => undefined
    );
    const recorded: unknown[] = [];
    const record = mock.method(
      kavitaReader,
      'recordComicSeries',
      (serviceId: number, id: number, ref: unknown) => {
        recorded.push([serviceId, id, ref]);
      }
    );
    mock.method(BackIssueAPI.prototype, 'getCollection', async () => [
      {
        id: 412,
        title: 'Frieren',
        cv_id: 9001,
        total: 13,
        owned: 13,
        missing: 0,
        active: 0,
        type: 'manga',
      },
      {
        id: 413,
        title: 'Watchmen',
        cv_id: 9002,
        total: 12,
        owned: 12,
        missing: 0,
        active: 0,
        type: 'comic',
        location: '/comics/DC Comics/Watchmen (1986)',
      },
      {
        id: 414,
        title: 'Not Yet',
        cv_id: 9003,
        total: 5,
        owned: 0,
        missing: 5,
        active: 0,
        type: 'manga',
      },
    ]);
    const getSeries = mock.method(
      BackIssueAPI.prototype,
      'getSeries',
      async (id: number) => ({
        id,
        title: 'Frieren',
        files: [{ path: '/manga/Frieren/Frieren v01.cbz' }],
        location: '/manga/Frieren',
      })
    );

    try {
      await backissueScanner.run();
    } finally {
      settings.kavita = previousKavita;
    }

    // only the owned series without a folder in its row is looked up
    assert.strictEqual(getSeries.mock.callCount(), 1);
    assert.strictEqual(record.mock.callCount(), 3);
    // series in one batch are processed side by side
    recorded.sort(
      (a, b) => (a as [number, number])[1] - (b as [number, number])[1]
    );
    assert.deepStrictEqual(recorded[0], [
      7,
      412,
      {
        title: 'Frieren',
        kind: 'manga',
        folder: '/manga/Frieren',
        comicVineId: 9001,
        owned: 13,
      },
    ]);
    assert.deepStrictEqual(
      (recorded[1] as [number, number, { folder?: string }])[2].folder,
      '/comics/DC Comics/Watchmen (1986)'
    );
    assert.strictEqual(refresh.mock.callCount(), 1);
  });

  it('does not query a BackIssue server when collection sync is disabled', async () => {
    settings.backissue = [
      {
        id: 7,
        name: 'Home BackIssue',
        hostname: 'backissue.test',
        port: 8787,
        apiKey: 'backissue-test-key',
        useSsl: false,
        baseUrl: '',
        isDefault: true,
        externalUrl: '',
        tags: [],
        syncEnabled: false,
        preventSearch: false,
      },
    ];
    const getCollection = mock.method(BackIssueAPI.prototype, 'getCollection');

    await backissueScanner.run();

    assert.strictEqual(getCollection.mock.callCount(), 0);
    assert.strictEqual(backissueScanner.status().running, false);
  });

  it('tracks a manga series from downloading through partial to complete', async () => {
    settings.backissue = [
      {
        id: 7,
        name: 'Home BackIssue',
        hostname: 'backissue.test',
        port: 8787,
        apiKey: 'backissue-test-key',
        useSsl: false,
        baseUrl: '',
        isDefault: true,
        externalUrl: '',
        tags: [],
        syncEnabled: true,
        preventSearch: false,
      },
    ];
    scannerInternals.updateRate = 0;
    let counts = { owned: 0, total: 16, active: 1 };
    mock.method(BackIssueAPI.prototype, 'getCollection', async () => [
      {
        id: 31,
        title: '[Oshi No Ko]',
        cv_id: 147500,
        missing: counts.total - counts.owned,
        type: 'manga',
        ...counts,
      },
    ]);
    const status = async () =>
      (
        await getRepository(Media).findOneByOrFail({
          mediaType: MediaType.COMIC,
        })
      ).status;

    await backissueScanner.run();
    assert.strictEqual(await status(), MediaStatus.PROCESSING);

    counts = { owned: 9, total: 16, active: 1 };
    await backissueScanner.run();
    assert.strictEqual(await status(), MediaStatus.PARTIALLY_AVAILABLE);
    const partial = await getRepository(Media).findOneByOrFail({
      mediaType: MediaType.COMIC,
    });
    assert.deepStrictEqual(partial.comicProgress, { owned: 9, total: 16 });

    // every volume owned, but a download is still running
    counts = { owned: 16, total: 16, active: 1 };
    await backissueScanner.run();
    assert.strictEqual(await status(), MediaStatus.PARTIALLY_AVAILABLE);

    counts = { owned: 16, total: 16, active: 0 };
    await backissueScanner.run();
    assert.strictEqual(await status(), MediaStatus.AVAILABLE);

    // a newly published volume makes it partial again
    counts = { owned: 16, total: 17, active: 0 };
    await backissueScanner.run();
    assert.strictEqual(await status(), MediaStatus.PARTIALLY_AVAILABLE);
  });

  it('does not list a series nobody requested that has nothing yet', async () => {
    settings.backissue = [
      {
        id: 7,
        name: 'Home BackIssue',
        hostname: 'backissue.test',
        port: 8787,
        apiKey: 'backissue-test-key',
        useSsl: false,
        baseUrl: '',
        isDefault: true,
        externalUrl: '',
        tags: [],
        syncEnabled: true,
        preventSearch: false,
      },
    ];
    scannerInternals.updateRate = 0;
    mock.method(BackIssueAPI.prototype, 'getCollection', async () => [
      {
        id: 32,
        title: 'Followed only',
        cv_id: 4242,
        total: 5,
        owned: 0,
        missing: 5,
        active: 0,
        type: 'comic',
      },
    ]);

    await backissueScanner.run();

    assert.strictEqual(
      await getRepository(Media).countBy({ mediaType: MediaType.COMIC }),
      0
    );
    assert.strictEqual(backissueScanner.status().running, false);
  });
});
