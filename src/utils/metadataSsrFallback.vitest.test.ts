import { getServerSideProps as movie } from '@app/pages/movie/[movieId]';
import { getServerSideProps as tv } from '@app/pages/tv/[tvId]';
import type { GetServerSidePropsContext } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('axios', () => ({ default: { get: fixture.get } }));
vi.mock('@app/components/MovieDetails', () => ({ default: () => null }));
vi.mock('@app/components/TvDetails', () => ({ default: () => null }));

beforeEach(() => {
  fixture.get.mockReset();
});
for (const page of [
  { name: 'movie', key: 'movieId', load: movie },
  { name: 'tv', key: 'tvId', load: tv },
]) {
  describe(`${page.name} metadata server rendering`, () => {
    const context = (value: string | string[] = '42') =>
      ({
        query: { [page.key]: value },
        req: { headers: { cookie: 'task-session-fixture' } },
      }) as unknown as GetServerSidePropsContext;

    it('retains successful metadata and the bounded authenticated internal request', async () => {
      fixture.get.mockResolvedValue({ data: { id: 42 } });
      await expect(page.load(context())).resolves.toEqual({
        props: { [page.name]: { id: 42 } },
      });
      expect(fixture.get).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`/api/v1/${page.name}/42$`)),
        expect.objectContaining({
          timeout: 5000,
          headers: { cookie: 'task-session-fixture' },
        })
      );
    });

    it.each([undefined, 401, 403, 404, 429, 500, 503])(
      'leaves failure %s to the authenticated client owner without serializing request headers',
      async (status) => {
        fixture.get.mockRejectedValue(
          Object.assign(new Error('Isolated metadata failure'), {
            response: status === undefined ? undefined : { status },
            config: { headers: { cookie: 'task-session-fixture' } },
          })
        );
        await expect(page.load(context())).resolves.toEqual({ props: {} });
      }
    );

    it('still rejects non-scalar IDs before making an internal request', async () => {
      await expect(page.load(context(['42', '43']))).rejects.toThrow(
        'Internal API path parameter must be a scalar.'
      );
      expect(fixture.get).not.toHaveBeenCalled();
    });
  });
}
