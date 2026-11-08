import { getServerSideProps } from '@app/pages/collection/[collectionId]';
import axios from 'axios';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@app/components/CollectionDetails', () => ({ default: () => null }));
afterEach(() => vi.restoreAllMocks());
it('leaves collection outages to the client recovery owner without leaking Axios context', async () => {
  vi.spyOn(axios, 'get').mockRejectedValue(
    new Error('isolated provider outage')
  );
  const result = await getServerSideProps({
    query: { collectionId: '10' },
    req: { headers: { cookie: 'synthetic fixture cookie' } },
  } as never);
  expect(result).toEqual({ props: {} });
});
it('preserves successful server-rendered collection data', async () => {
  const collection = { id: 10, name: 'A collection', parts: [] };
  vi.spyOn(axios, 'get').mockResolvedValue({ data: collection });
  expect(
    await getServerSideProps({
      query: { collectionId: '10' },
      req: { headers: {} },
    } as never)
  ).toEqual({ props: { collection } });
});
