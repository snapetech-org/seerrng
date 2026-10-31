import { beforeEach, expect, test, vi } from 'vitest';
import ReadarrAPI, {
  type ReadarrBook,
  type ReadarrBookOptions,
} from './readarr';
import SonarrAPI, { type AddSeriesOptions, type SonarrSeries } from './sonarr';
const transport = vi.hoisted(() => ({ request: vi.fn() }));
const options: AddSeriesOptions = {
  tvdbid: 33,
  title: 'A Series',
  profileId: 1,
  seasons: [],
  seasonFolder: true,
  rootFolderPath: '/shows',
  seriesType: 'standard',
  searchNow: false,
};
const rawSeries = {
  id: 42,
  tvdbId: 33,
  title: 'A Series',
  seasons: [],
  tags: [7],
  monitored: true,
  monitorNewItems: 'none',
  language: { id: 1, name: 'English' },
  seasonType: 'standard',
  qualityProfileId: 9,
  path: '/shows/series',
  customProviderField: 'preserved',
};
beforeEach(() => transport.request.mockReset());
for (const version of ['v3', 'v5'] as const) {
  const build = (existing = true, monitorNewItems = 'none') => {
    const api = new SonarrAPI({
      url: 'http://fixture:8989/api/v3',
      apiKey: 'test',
    });
    Object.defineProperty(api, 'request', { value: transport.request });
    const raw = { ...rawSeries, id: existing ? 42 : 0, monitorNewItems };
    Object.defineProperty(api, 'getApiVersion', { value: async () => version });
    vi.spyOn(api, 'getSeriesByTvdbId').mockResolvedValue(
      raw as unknown as SonarrSeries
    );
    vi.spyOn(api, 'getSeriesById').mockImplementation(
      async () =>
        ({ ...raw, monitorNewItems: 'all' }) as unknown as SonarrSeries
    );
    transport.request.mockImplementation(
      async (method: string, _path: string, payload?: object) => ({
        data: method === 'GET' ? raw : { ...raw, ...payload, id: 42 },
      })
    );
    return api;
  };
  test(`${version}: explicit future-season opt-in updates an existing series`, async () => {
    const api = build();
    await api.addSeries({
      ...options,
      enableFutureSeasons: true,
      monitorNewItems: 'all',
    });
    const put = transport.request.mock.calls.find(
      ([method, path]) =>
        method === 'PUT' &&
        path === (version === 'v5' ? '/series/42' : '/series')
    );
    expect(put?.[2]).toMatchObject({
      monitorNewItems: 'all',
      path: '/shows/series',
      qualityProfileId: 9,
    });
    if (version === 'v5')
      expect(put?.[2]).toMatchObject({ customProviderField: 'preserved' });
  });
  test(`${version}: opting out preserves existing service monitoring`, async () => {
    const api = build(true, 'all');
    await api.addSeries({
      ...options,
      enableFutureSeasons: false,
      monitorNewItems: 'none',
    });
    expect(
      transport.request.mock.calls.some(
        ([method, , payload]) =>
          method === 'PUT' && payload?.monitorNewItems === 'none'
      )
    ).toBe(false);
  });
  test(`${version}: a new series stores the requested monitoring policy`, async () => {
    for (const monitoring of ['all', 'none'] as const) {
      transport.request.mockClear();
      const api = build(false);
      await api.addSeries({ ...options, monitorNewItems: monitoring });
      expect(
        transport.request.mock.calls.find(
          ([method, path]) => method === 'POST' && path === '/series'
        )?.[2]
      ).toMatchObject({ monitorNewItems: monitoring });
    }
  });
}

test('alongside requests fail instead of silently replacing a recording', async () => {
  const api = Object.create(ReadarrAPI.prototype) as ReadarrAPI;
  const chaptarr = vi.fn().mockReturnValue(false);
  Object.defineProperty(api, 'isChaptarr', { value: chaptarr });
  vi.spyOn(api, 'ensureCapabilities').mockResolvedValue();
  const support = vi
    .spyOn(api, 'supportsWantedEditionVariants')
    .mockReturnValue(false);
  const catalog = vi.spyOn(api, 'getEditionCatalog').mockResolvedValue([]);
  const wanted = vi
    .spyOn(api, 'addWantedEdition')
    .mockResolvedValue({ id: 21 } as ReadarrBook);
  const add = (
    api as unknown as {
      addEditionAlongside: (
        book: ReadarrBook,
        options: ReadarrBookOptions
      ) => Promise<unknown>;
    }
  ).addEditionAlongside.bind(api);
  const book = { id: 21 } as ReadarrBook;
  const request = {
    editionPolicy: 'alongside',
    editions: [{ monitored: true, foreignEditionId: 'ed2' }],
  } as ReadarrBookOptions;
  await expect(add(book, request)).rejects.toThrow();
  chaptarr.mockReturnValue(true);
  await expect(add(book, request)).rejects.toThrow();
  support.mockReturnValue(true);
  await expect(add(book, request)).rejects.toThrow();
  expect(wanted).not.toHaveBeenCalled();
  catalog.mockResolvedValue([
    { editionId: 2, foreignEditionId: 'ed2', monitored: false },
  ] as never[]);
  await add(book, request);
  expect(wanted).toHaveBeenCalledWith(21, 2, {
    asNewVariant: true,
    search: false,
  });
});
