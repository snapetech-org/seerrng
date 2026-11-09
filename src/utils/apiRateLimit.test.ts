import axios, { AxiosError, AxiosHeaders, type AxiosAdapter } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiRateLimitController,
  parseRetryAfter,
  retryApiRead,
} from './apiRateLimit';

afterEach(() => vi.useRealTimers());

describe('API rate limit cooldown', () => {
  it('honors seconds, HTTP dates, clock skew and long waits', () => {
    const now = Date.parse('2026-11-09T12:00:00Z');
    expect(parseRetryAfter('120', now)).toBe(120_000);
    expect(parseRetryAfter('1.5', now)).toBe(1500);
    expect(
      parseRetryAfter('Mon, 09 Nov 2026 12:02:00 GMT', now)
    ).toBe(120_000);
    expect(
      parseRetryAfter(
        'Mon, 09 Nov 2026 13:02:00 GMT',
        now,
        'Mon, 09 Nov 2026 13:00:00 GMT'
      )
    ).toBe(120_000);
    expect(parseRetryAfter('99999999', now)).toBe(99_999_999_000);
    for (const value of [undefined, 'invalid', '-1', 'Infinity'])
      expect(parseRetryAfter(value, now)).toBe(60_000);
    expect(parseRetryAfter('0', now)).toBe(1000);
    expect(
      parseRetryAfter('Mon, 09 Nov 2026 11:59:00 GMT', now)
    ).toBe(1000);
  });

  it('blocks polling, retry clicks and writes without replaying mutations', async () => {
    vi.useFakeTimers();
    const controller = new ApiRateLimitController();
    let calls = 0;
    const adapter: AxiosAdapter = async (config) => {
      calls++;
      if (calls === 1)
        throw new AxiosError('Too many requests', undefined, config, undefined, {
          config,
          status: 429,
          statusText: 'Too Many Requests',
          data: 'limited',
          headers: new AxiosHeaders({ 'retry-after': '120' }),
        });
      return {
        config,
        status: 200,
        statusText: 'OK',
        data: {},
        headers: new AxiosHeaders(),
      };
    };
    const client = axios.create({ adapter });
    const uninstall = controller.install(client, 'https://seerr.example');
    const until = Date.now() + 120_000;
    await expect(client.get('/api/v1/settings/plex')).rejects.toMatchObject({
      retryAt: until,
    });
    await vi.advanceTimersByTimeAsync(30_000);
    for (let i = 0; i < 10; i++) {
      await expect(client.get('/api/v1/settings/plex')).rejects.toMatchObject({
        retryAt: until,
      });
      await expect(
        client.post('/api/v1/settings/plex/library', {})
      ).rejects.toMatchObject({ retryAt: until });
    }
    expect(calls).toBe(1);
    expect(controller.getSnapshot()).toBe(until);
    await client.get('https://other.example/api/v1/status');
    await client.get('/logo.png');
    expect(calls).toBe(3);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(calls).toBe(3);
    await client.get('/api/v1/settings/plex');
    expect(calls).toBe(4);
    uninstall();
  });

  it('never shortens an existing cooldown', () => {
    vi.useFakeTimers();
    const controller = new ApiRateLimitController();
    controller.record({
      response: { status: 429, headers: { 'Retry-After': '120' } },
    });
    const until = controller.getSnapshot();
    controller.record({
      response: { status: 429, headers: { 'retry-after': '1' } },
    });
    expect(controller.getSnapshot()).toBe(until);
  });

  it('bounds retries and waits before revalidating a read', async () => {
    vi.useFakeTimers();
    const revalidate = vi.fn();
    const config = {
      errorRetryCount: 3,
      errorRetryInterval: 5000,
    } as Parameters<typeof retryApiRead>[2];
    retryApiRead(
      { response: { status: 429, headers: { 'retry-after': '120' } } },
      'plex',
      config,
      revalidate,
      { retryCount: 1, dedupe: true }
    );
    await vi.advanceTimersByTimeAsync(119_999);
    expect(revalidate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(revalidate).toHaveBeenCalledOnce();
    for (const status of [400, 401, 403, 404])
      retryApiRead({ response: { status } }, 'plex', config, revalidate, {
        retryCount: 1,
        dedupe: true,
      });
    retryApiRead({ response: { status: 429 } }, 'plex', config, revalidate, {
      retryCount: 4,
      dedupe: true,
    });
    await vi.advanceTimersByTimeAsync(600_000);
    expect(revalidate).toHaveBeenCalledOnce();
  });
});
