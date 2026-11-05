import type { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { proxy } from './proxy';
vi.mock('next/server', () => ({
  NextResponse: {
    next: () => new Response(null, { headers: { 'x-middleware-next': '1' } }),
    redirect: (url: URL) =>
      new Response(null, {
        status: 307,
        headers: { location: url.toString() },
      }),
  },
}));
vi.mock('./utils/internalApi', () => ({
  getInternalApiBaseUrl: () => 'http://api.test',
}));
afterEach(() => vi.unstubAllGlobals());
describe('initialized setup guide access', () => {
  it.each([
    ['/setup?guide=1', 2, null],
    ['/setup?guide=1', 32, 'http://app.test/'],
    ['/setup?guide=1', undefined, 'http://app.test/'],
    ['/setup', 2, 'http://app.test/'],
    ['/setup?guide=0', 2, 'http://app.test/'],
  ])('routes %s for permissions %s', async (path, permissions, destination) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ initialized: true }))
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ permissions })))
    );
    const req = {
      nextUrl: new URL(path, 'http://app.test'),
      url: new URL(path, 'http://app.test').toString(),
      headers: new Headers({ cookie: 'connect.sid=fixture' }),
    } as unknown as NextRequest;
    const response = await proxy(req);
    expect(response.headers.get('location')).toBe(destination);
    if (!destination)
      expect(response.headers.get('x-middleware-next')).toBe('1');
  });
});
