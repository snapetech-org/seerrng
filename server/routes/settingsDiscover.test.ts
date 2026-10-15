import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';

import {
  DiscoverSliderType,
  MAX_DISCOVER_KEYWORD_IDS,
  MAX_DISCOVER_NETWORKS,
  MAX_DISCOVER_SLIDER_DATA_LENGTH,
  MAX_DISCOVER_SLIDERS,
  MAX_TMDB_PUBLIC_LIST_ID_LENGTH,
} from '@server/constants/discover';
import { getRepository } from '@server/datasource';
import DiscoverSlider from '@server/entity/DiscoverSlider';
import { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';
import { setupTestDb } from '@server/test/db';
import type { Express } from 'express';
import express from 'express';
import request from 'supertest';
import discoverSettingRoutes from './settings/discover';

let app: Express;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = new User({ id: 1, permissions: Permission.ADMIN });
    next();
  });
  app.use('/settings/discover', discoverSettingRoutes);
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

const customSliderPayload = {
  data: 'jazz',
  title: 'Jazz',
  type: DiscoverSliderType.MUSICBRAINZ_MUSIC_GENRE,
};

describe('Discover settings route validation', () => {
  it('rejects malformed slider arrays before lookup', async () => {
    const countBefore = await getRepository(DiscoverSlider).count();
    const res = await request(app)
      .post('/settings/discover')
      .send([customSliderPayload, null]);

    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /Slider must be an object/);
    assert.strictEqual(
      await getRepository(DiscoverSlider).count(),
      countBefore
    );
  });

  it('rejects duplicate slider IDs without applying either update', async () => {
    const repository = getRepository(DiscoverSlider);
    const slider = await repository.save(
      new DiscoverSlider({
        data: 'fiction',
        enabled: false,
        isBuiltIn: false,
        order: 4,
        title: 'Fiction',
        type: DiscoverSliderType.OPENLIBRARY_BOOK_SUBJECT,
      })
    );

    const res = await request(app)
      .post('/settings/discover')
      .send([
        { ...customSliderPayload, id: slider.id, enabled: true },
        { ...customSliderPayload, id: slider.id, title: 'Duplicate' },
      ]);

    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /ids must be unique/);
    const unchanged = await repository.findOneByOrFail({ id: slider.id });
    assert.strictEqual(unchanged.title, 'Fiction');
    assert.strictEqual(unchanged.enabled, false);
    assert.strictEqual(unchanged.order, 4);
  });

  it('rejects stale slider IDs instead of recreating deleted rows', async () => {
    const repository = getRepository(DiscoverSlider);
    const countBefore = await repository.count();

    const res = await request(app)
      .post('/settings/discover')
      .send([{ ...customSliderPayload, id: 999_999 }]);

    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /does not exist/);
    assert.strictEqual(await repository.count(), countBefore);
  });

  it('rejects bulk slider creation when the collection is full', async () => {
    const repository = getRepository(DiscoverSlider);
    const existingCount = await repository.count();
    await repository.save(
      Array.from(
        { length: MAX_DISCOVER_SLIDERS - existingCount },
        (_, index) =>
          new DiscoverSlider({
            data: `subject-${index}`,
            enabled: false,
            isBuiltIn: false,
            order: -1,
            title: `Subject ${index}`,
            type: DiscoverSliderType.OPENLIBRARY_BOOK_SUBJECT,
          })
      )
    );

    const res = await request(app)
      .post('/settings/discover')
      .send([customSliderPayload]);

    assert.strictEqual(res.status, 409);
    assert.match(res.body.message, /Maximum number of sliders/);
    assert.strictEqual(await repository.count(), MAX_DISCOVER_SLIDERS);
  });

  it('shares the final collection slot between bulk and direct creation', async () => {
    const repository = getRepository(DiscoverSlider);
    const existingCount = await repository.count();
    await repository.save(
      Array.from(
        { length: MAX_DISCOVER_SLIDERS - existingCount - 1 },
        (_, index) =>
          new DiscoverSlider({
            data: `subject-${index}`,
            enabled: false,
            isBuiltIn: false,
            order: -1,
            title: `Subject ${index}`,
            type: DiscoverSliderType.OPENLIBRARY_BOOK_SUBJECT,
          })
      )
    );

    const responses = await Promise.all([
      request(app).post('/settings/discover').send([customSliderPayload]),
      request(app)
        .post('/settings/discover/add')
        .send({
          ...customSliderPayload,
          data: 'blues',
          title: 'Blues',
        }),
    ]);

    assert.deepStrictEqual(
      responses.map(({ status }) => status).sort(),
      [200, 409]
    );
    assert.strictEqual(await repository.count(), MAX_DISCOVER_SLIDERS);
  });

  it('rejects malformed create slider bodies', async () => {
    const res = await request(app).post('/settings/discover/add').send([]);

    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /Slider must be an object/);
  });

  it('validates and normalizes custom keyword slider IDs', async () => {
    const repository = getRepository(DiscoverSlider);
    const countBefore = await repository.count();
    const invalid = await request(app)
      .post('/settings/discover/add')
      .send({
        ...customSliderPayload,
        data: '1,0x10',
        type: DiscoverSliderType.TMDB_MOVIE_KEYWORD,
      });
    const excessive = await request(app)
      .post('/settings/discover/add')
      .send({
        ...customSliderPayload,
        data: Array.from({ length: MAX_DISCOVER_KEYWORD_IDS + 1 }, (_, index) =>
          String(index + 1)
        ).join(','),
        type: DiscoverSliderType.TMDB_TV_KEYWORD,
      });

    assert.strictEqual(invalid.status, 400);
    assert.match(invalid.body.message, /positive decimal ids/);
    assert.strictEqual(excessive.status, 400);
    assert.match(excessive.body.message, /limited to 20 ids/);
    assert.strictEqual(await repository.count(), countBefore);

    const normalized = await request(app)
      .post('/settings/discover/add')
      .send({
        ...customSliderPayload,
        data: ' 2,1,2 ',
        type: DiscoverSliderType.TMDB_MOVIE_KEYWORD,
      });
    assert.strictEqual(normalized.status, 200);
    assert.strictEqual(normalized.body.data, '2,1');
  });

  it('rejects malformed provider IDs in custom sliders', async () => {
    const countBefore = await getRepository(DiscoverSlider).count();
    const responses = await Promise.all(
      [
        DiscoverSliderType.TMDB_MOVIE_GENRE,
        DiscoverSliderType.TMDB_TV_GENRE,
        DiscoverSliderType.TMDB_STUDIO,
        DiscoverSliderType.TMDB_NETWORK,
      ].map((type) =>
        request(app)
          .post('/settings/discover/add')
          .send({ ...customSliderPayload, data: '0x10', type })
      )
    );

    for (const response of responses) {
      assert.strictEqual(response.status, 400);
      assert.match(response.body.message, /positive decimal id/);
    }
    assert.strictEqual(
      await getRepository(DiscoverSlider).count(),
      countBefore
    );
  });

  it('validates and preserves decimal TMDB public list IDs', async () => {
    const countBefore = await getRepository(DiscoverSlider).count();
    const invalidIds = ['0', 'abc', '1234567890123', '1e3', '1/2'];
    const invalid = await Promise.all(
      invalidIds.map((data) =>
        request(app)
          .post('/settings/discover/add')
          .send({
            ...customSliderPayload,
            data,
            type: DiscoverSliderType.TMDB_LIST,
          })
      )
    );

    for (const response of invalid) {
      assert.strictEqual(response.status, 400);
      assert.match(response.body.message, /positive decimal ID/);
    }
    assert.strictEqual(
      await getRepository(DiscoverSlider).count(),
      countBefore
    );

    const id = '9'.repeat(MAX_TMDB_PUBLIC_LIST_ID_LENGTH);
    const accepted = await request(app)
      .post('/settings/discover/add')
      .send({
        ...customSliderPayload,
        data: ` ${id} `,
        type: DiscoverSliderType.TMDB_LIST,
      });

    assert.strictEqual(accepted.status, 200);
    assert.strictEqual(accepted.body.data, id);
    await getRepository(DiscoverSlider).delete(accepted.body.id);
  });

  it('validates and normalizes structured custom slider data', async () => {
    const invalidStreaming = await request(app)
      .post('/settings/discover/add')
      .send({
        ...customSliderPayload,
        data: 'US,',
        type: DiscoverSliderType.TMDB_MOVIE_STREAMING_SERVICES,
      });
    const invalidSearch = await request(app)
      .post('/settings/discover/add')
      .send({
        ...customSliderPayload,
        data: 'x'.repeat(257),
        type: DiscoverSliderType.TMDB_SEARCH,
      });
    const invalidChart = await request(app)
      .post('/settings/discover/add')
      .send({
        ...customSliderPayload,
        data: 'popular.forever',
        type: DiscoverSliderType.LISTENBRAINZ_MUSIC_CHART,
      });

    assert.strictEqual(invalidStreaming.status, 400);
    assert.match(invalidStreaming.body.message, /provider id is invalid/);
    assert.strictEqual(invalidSearch.status, 400);
    assert.match(invalidSearch.body.message, /256 characters or fewer/);
    assert.strictEqual(invalidChart.status, 400);
    assert.match(invalidChart.body.message, /chart is invalid/);

    const normalized = await request(app)
      .post('/settings/discover/add')
      .send({
        ...customSliderPayload,
        data: ' ca,8|2|8 ',
        type: DiscoverSliderType.TMDB_TV_STREAMING_SERVICES,
      });
    assert.strictEqual(normalized.status, 200);
    assert.strictEqual(normalized.body.data, 'CA,8|2');
  });

  it('keeps the existing limit for other slider data', async () => {
    const response = await request(app)
      .post('/settings/discover/add')
      .send({
        ...customSliderPayload,
        data: 'x'.repeat(MAX_DISCOVER_SLIDER_DATA_LENGTH + 1),
        type: DiscoverSliderType.OPENLIBRARY_BOOK_SUBJECT,
      });

    assert.equal(response.status, 400);
    assert.match(response.body.message, /500 characters or fewer/);
  });

  it('rejects a new slider when the collection is full', async () => {
    const repository = getRepository(DiscoverSlider);
    const existingCount = await repository.count();
    await repository.save(
      Array.from(
        { length: MAX_DISCOVER_SLIDERS - existingCount },
        (_, index) =>
          new DiscoverSlider({
            data: `subject-${index}`,
            enabled: false,
            isBuiltIn: false,
            order: -1,
            title: `Subject ${index}`,
            type: DiscoverSliderType.OPENLIBRARY_BOOK_SUBJECT,
          })
      )
    );

    const res = await request(app)
      .post('/settings/discover/add')
      .send(customSliderPayload);

    assert.strictEqual(res.status, 409);
    assert.match(res.body.message, /Maximum number of sliders/);
    assert.strictEqual(await repository.count(), MAX_DISCOVER_SLIDERS);
  });

  it('admits only one concurrent add for the final collection slot', async () => {
    const repository = getRepository(DiscoverSlider);
    const existingCount = await repository.count();
    await repository.save(
      Array.from(
        { length: MAX_DISCOVER_SLIDERS - existingCount - 1 },
        (_, index) =>
          new DiscoverSlider({
            data: `subject-${index}`,
            enabled: false,
            isBuiltIn: false,
            order: -1,
            title: `Subject ${index}`,
            type: DiscoverSliderType.OPENLIBRARY_BOOK_SUBJECT,
          })
      )
    );

    const responses = await Promise.all([
      request(app).post('/settings/discover/add').send(customSliderPayload),
      request(app)
        .post('/settings/discover/add')
        .send({
          ...customSliderPayload,
          data: 'blues',
          title: 'Blues',
        }),
    ]);

    assert.deepStrictEqual(
      responses.map(({ status }) => status).sort(),
      [200, 409]
    );
    assert.strictEqual(await repository.count(), MAX_DISCOVER_SLIDERS);
  });

  it('rejects malformed update slider bodies', async () => {
    const slider = await getRepository(DiscoverSlider).save(
      new DiscoverSlider({
        data: 'fiction',
        enabled: false,
        isBuiltIn: false,
        order: -1,
        title: 'Fiction',
        type: DiscoverSliderType.OPENLIBRARY_BOOK_SUBJECT,
      })
    );
    const res = await request(app)
      .put(`/settings/discover/${slider.id}`)
      .send([]);

    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /Slider must be an object/);
  });

  it('rejects malformed slider update IDs before validation and lookup', async () => {
    const res = await request(app)
      .put('/settings/discover/not-a-number')
      .send(customSliderPayload);

    assert.strictEqual(res.status, 404);
  });

  it('rejects malformed slider delete IDs before lookup', async () => {
    const res = await request(app).delete('/settings/discover/not-a-number');

    assert.strictEqual(res.status, 404);
  });

  it('updates a custom slider using a parsed positive route ID', async () => {
    const slider = await getRepository(DiscoverSlider).save(
      new DiscoverSlider({
        data: 'fiction',
        enabled: false,
        isBuiltIn: false,
        order: -1,
        title: 'Fiction',
        type: DiscoverSliderType.OPENLIBRARY_BOOK_SUBJECT,
      })
    );

    const res = await request(app)
      .put(`/settings/discover/${slider.id}`)
      .send(customSliderPayload);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data, 'jazz');
    assert.strictEqual(res.body.title, 'Jazz');
  });

  it('only resets discovery sliders through a state-changing request', async () => {
    const repository = getRepository(DiscoverSlider);
    const customSlider = await repository.save(
      new DiscoverSlider({
        data: 'fiction',
        enabled: true,
        isBuiltIn: false,
        order: -1,
        title: 'Fiction',
        type: DiscoverSliderType.OPENLIBRARY_BOOK_SUBJECT,
      })
    );

    const safeMethodResponse = await request(app).get(
      '/settings/discover/reset'
    );
    assert.strictEqual(safeMethodResponse.status, 404);
    assert.ok(await repository.findOneBy({ id: customSlider.id }));

    const resetResponse = await request(app).post('/settings/discover/reset');
    assert.strictEqual(resetResponse.status, 204);
    assert.strictEqual(
      await repository.findOneBy({ id: customSlider.id }),
      null
    );
  });

  it('rolls back slider clearing when built-in bootstrap fails', async () => {
    const repository = getRepository(DiscoverSlider);
    await repository.save(
      new DiscoverSlider({
        data: 'history',
        enabled: true,
        isBuiltIn: false,
        order: 99,
        title: 'History',
        type: DiscoverSliderType.OPENLIBRARY_BOOK_SUBJECT,
      })
    );
    const before = await repository.find({ order: { id: 'ASC' } });
    mock.method(DiscoverSlider, 'bootstrapSliders', async () => {
      throw new Error('bootstrap failed');
    });

    const res = await request(app).post('/settings/discover/reset');

    assert.strictEqual(res.status, 500);
    const after = await repository.find({ order: { id: 'ASC' } });
    assert.deepStrictEqual(
      after.map(({ id, title, type, isBuiltIn }) => ({
        id,
        title,
        type,
        isBuiltIn,
      })),
      before.map(({ id, title, type, isBuiltIn }) => ({
        id,
        title,
        type,
        isBuiltIn,
      }))
    );
  });
});

describe('built-in Networks slider configuration', () => {
  const networkList = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      id: index + 1,
      name: `Network ${index + 1}`,
      logoPath: `/network-${index + 1}.png`,
    }));

  const getBuiltInNetworksSlider = async () => {
    const repository = getRepository(DiscoverSlider);
    await DiscoverSlider.bootstrapSliders(repository);
    return repository.findOneByOrFail({
      isBuiltIn: true,
      type: DiscoverSliderType.NETWORKS,
    });
  };

  it('stores ordered metadata for up to 50 networks on the built-in row', async () => {
    const slider = await getBuiltInNetworksSlider();
    const networks = networkList(MAX_DISCOVER_NETWORKS);

    const response = await request(app)
      .put(`/settings/discover/${slider.id}`)
      .send({
        ...customSliderPayload,
        data: JSON.stringify(networks),
        type: DiscoverSliderType.NETWORKS,
      });

    assert.equal(response.status, 200);
    assert.deepStrictEqual(JSON.parse(response.body.data), networks);
    const stored = await getRepository(DiscoverSlider).findOneByOrFail({
      id: slider.id,
    });
    assert.deepStrictEqual(JSON.parse(stored.data!), networks);
    assert.equal(stored.title, null);
    assert.equal(stored.type, DiscoverSliderType.NETWORKS);
    assert.equal(stored.isBuiltIn, true);
  });

  it('keeps defaults and an explicitly empty network list distinct', async () => {
    const slider = await getBuiltInNetworksSlider();

    const emptyList = await request(app)
      .put(`/settings/discover/${slider.id}`)
      .send({
        ...customSliderPayload,
        data: '[]',
        type: DiscoverSliderType.NETWORKS,
      });
    assert.equal(emptyList.status, 200);
    assert.equal(emptyList.body.data, '[]');

    const defaults = await request(app)
      .put(`/settings/discover/${slider.id}`)
      .send({
        ...customSliderPayload,
        data: '',
        type: DiscoverSliderType.NETWORKS,
      });
    assert.equal(defaults.status, 200);
    assert.equal(defaults.body.data, '');
  });

  it('rejects malformed or unsafe lists without replacing saved data', async () => {
    const slider = await getBuiltInNetworksSlider();
    const repository = getRepository(DiscoverSlider);
    const existingData = JSON.stringify(networkList(2));
    await repository.update(slider.id, { data: existingData });

    const invalidLists = [
      JSON.stringify([networkList(1)[0], networkList(1)[0]]),
      JSON.stringify([
        { ...networkList(1)[0], logoPath: 'https://example.com/logo.png' },
      ]),
      JSON.stringify(networkList(MAX_DISCOVER_NETWORKS + 1)),
      '{invalid-json',
    ];

    for (const data of invalidLists) {
      const response = await request(app)
        .put(`/settings/discover/${slider.id}`)
        .send({
          ...customSliderPayload,
          data,
          type: DiscoverSliderType.NETWORKS,
        });

      assert.equal(response.status, 400);
      assert.equal(
        (await repository.findOneByOrFail({ id: slider.id })).data,
        existingData
      );
    }
  });

  it('rejects a mismatched type when updating the built-in Networks row', async () => {
    const slider = await getBuiltInNetworksSlider();
    const originalData = slider.data;
    const response = await request(app)
      .put(`/settings/discover/${slider.id}`)
      .send({
        ...customSliderPayload,
        data: '123',
        type: DiscoverSliderType.TMDB_NETWORK,
      });

    assert.equal(response.status, 400);
    assert.match(response.body.message, /Networks slider type/);
    assert.equal(
      (await getRepository(DiscoverSlider).findOneByOrFail({ id: slider.id }))
        .data,
      originalData
    );
  });

  it('does not partially save a slider batch with invalid network data', async () => {
    const repository = getRepository(DiscoverSlider);
    const ordinarySlider = await repository.save(
      new DiscoverSlider({
        data: 'old-subject',
        enabled: false,
        isBuiltIn: false,
        order: 20,
        title: 'Old Subject',
        type: DiscoverSliderType.OPENLIBRARY_BOOK_SUBJECT,
      })
    );
    const networksSlider = await repository.save(
      new DiscoverSlider({
        data: '[]',
        enabled: false,
        isBuiltIn: false,
        order: 21,
        title: 'Selected Networks',
        type: DiscoverSliderType.NETWORKS,
      })
    );

    const response = await request(app)
      .post('/settings/discover')
      .send([
        {
          id: ordinarySlider.id,
          data: 'new-subject',
          enabled: true,
          title: 'New Subject',
          type: DiscoverSliderType.OPENLIBRARY_BOOK_SUBJECT,
        },
        {
          id: networksSlider.id,
          data: '{invalid-json',
          enabled: true,
          title: 'Selected Networks',
          type: DiscoverSliderType.NETWORKS,
        },
      ]);

    assert.equal(response.status, 400);
    assert.equal(
      (await repository.findOneByOrFail({ id: ordinarySlider.id })).title,
      'Old Subject'
    );
    assert.equal(
      (await repository.findOneByOrFail({ id: ordinarySlider.id })).data,
      'old-subject'
    );
    assert.equal(
      (await repository.findOneByOrFail({ id: networksSlider.id })).data,
      '[]'
    );
  });
});
