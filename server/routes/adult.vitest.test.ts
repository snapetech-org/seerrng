import * as db from '@server/datasource';
import { User } from '@server/entity/User';
import * as runtimeConfig from '@server/lib/externalRuntimeConfig';
import { Permission } from '@server/lib/permissions';
import { getSettings, type WhisparrSettings } from '@server/lib/settings';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import adultRoutes from './adult';

vi.mock('@server/api/servarr/whisparr', () => {
  const makeScene = (serverId: number) => ({
    id: serverId,
    foreignId: `8a3c0000-0000-4000-8000-${serverId.toString().padStart(12, '0')}`,
    title: serverId === 3 ? 'Main library scene' : 'Archive library scene',
    year: 2025,
    overview: 'A scene for route coverage.',
    studio: 'Orchard House',
    images:
      serverId === 0 || serverId === 3
        ? [
            {
              coverType: 'screenshot',
              url: 'https://whisparr.example/screenshot.jpg',
            },
          ]
        : [],
    performerNames: ['Maya Star'],
    added: `2026-10-0${serverId - 2}T12:00:00.000Z`,
    monitored: true,
    hasFile: true,
    tags: [],
  });

  class MockWhisparrAPI {
    private readonly serverId: number;

    public constructor({ url }: { url: string }) {
      this.serverId = Number(new URL(url).port) - 9_000;
    }

    public static buildUrl(
      settings: {
        hostname: string;
        port: number;
        useSsl: boolean;
        baseUrl?: string;
      },
      path = ''
    ) {
      const protocol = settings.useSsl ? 'https' : 'http';
      const baseUrl = settings.baseUrl
        ? `/${settings.baseUrl.replace(/^\/+|\/+$/g, '')}`
        : '';
      return `${protocol}://${settings.hostname}:${settings.port}${baseUrl}${path}`;
    }

    public getScenes = async () => [makeScene(this.serverId)];

    public searchScenes = async () => [makeScene(this.serverId)];
  }

  return { default: MockWhisparrAPI };
});

const configuredServices: WhisparrSettings[] = [3, 4].map((id) => ({
  id,
  name: id === 3 ? 'Whisparr Main' : 'Whisparr Archive',
  hostname: '127.0.0.1',
  port: 9_000 + id,
  apiKey: `test-key-${id}`,
  useSsl: false,
  activeProfileId: 1,
  activeProfileName: 'Any',
  activeDirectory: '/adult',
  tags: [],
  is4k: false,
  isDefault: id === 3,
  syncEnabled: true,
  preventSearch: false,
  tagRequests: false,
  overrideRule: [],
}));

const app = () => {
  const application = express();
  application.use(express.json());
  application.use((req, _res, next) => {
    req.user = new User({ id: 1, permissions: Permission.ADMIN });
    next();
  });
  application.use('/adult', adultRoutes);
  application.use(
    (
      error: { status?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      // Express requires the fourth argument to register an error handler.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _next: express.NextFunction
    ) => res.status(error.status ?? 500).json({ message: error.message })
  );
  return application;
};

const originalServices = [...getSettings().whisparr];

describe('Adult discovery route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getSettings().whisparr = structuredClone(configuredServices);
    vi.spyOn(runtimeConfig, 'getExternalRuntimeConfig').mockReturnValue({
      whisparr: structuredClone(configuredServices),
      network: { apiRequestTimeout: 5_000 },
    } as ReturnType<typeof runtimeConfig.getExternalRuntimeConfig>);
    vi.spyOn(db, 'getRepository').mockReturnValue({
      find: vi.fn().mockResolvedValue([]),
    } as never);
  });

  afterEach(() => {
    getSettings().whisparr = [...originalServices];
    vi.restoreAllMocks();
  });

  it('limits results to a selected configured Whisparr server', async () => {
    const response = await request(app()).get('/adult/search?serverId=4');

    expect(response.status).toBe(200);
    expect(response.body.totalResults).toBe(1);
    expect(response.body.results).toMatchObject([
      {
        id: '8a3c0000-0000-4000-8000-000000000004',
        title: 'Archive library scene',
        serviceId: 4,
        serviceName: 'Whisparr Archive',
      },
    ]);
  });

  it('combines distinct scene results from all configured servers by default', async () => {
    const response = await request(app()).get('/adult/search');

    expect(response.status).toBe(200);
    expect(response.body.totalResults).toBe(2);
    expect(
      response.body.results.map(
        (scene: { serviceId: number }) => scene.serviceId
      )
    ).toEqual([4, 3]);
    expect(
      response.body.results.find(
        (scene: { serviceId: number }) => scene.serviceId === 3
      )?.posterPath
    ).toBe(
      '/api/v1/adult/8a3c0000-0000-4000-8000-000000000003/cover?serverId=3'
    );
  });

  it('uses screenshot images for cover lookup and preserves service ID zero', async () => {
    const services = [
      { ...configuredServices[0], id: 0, port: 9_000 },
      configuredServices[1],
    ];
    getSettings().whisparr = structuredClone(services);
    vi.spyOn(runtimeConfig, 'getExternalRuntimeConfig').mockReturnValue({
      whisparr: structuredClone(services),
      network: { apiRequestTimeout: 5_000 },
    } as ReturnType<typeof runtimeConfig.getExternalRuntimeConfig>);

    const response = await request(app()).get('/adult/search');

    expect(response.status).toBe(200);
    const defaultScene = response.body.results.find(
      (scene: { serviceId: number }) => scene.serviceId === 0
    );
    expect(defaultScene?.posterPath).toBe(
      '/api/v1/adult/8a3c0000-0000-4000-8000-000000000000/cover?serverId=0'
    );
    const namedServerScene = response.body.results.find(
      (scene: { serviceId: number }) => scene.serviceId === 4
    );
    expect(namedServerScene.posterPath).toBeUndefined();
  });

  it('rejects malformed and unknown Whisparr server scopes before searching', async () => {
    const malformed = await request(app()).get('/adult/search?serverId=4x');
    const unknown = await request(app()).get('/adult/search?serverId=9');

    expect(malformed.status).toBe(400);
    expect(unknown.status).toBe(404);
  });
});
