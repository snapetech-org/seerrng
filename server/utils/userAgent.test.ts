import { coverArtArchiveHttpClient } from '@server/api/coverartarchive/requestLimiter';
import ExternalAPI from '@server/api/externalapi';
import SteamAPI from '@server/api/software/steam';
import createCustomProxyAgent, {
  resetCustomProxyAgent,
} from '@server/utils/customProxyAgent';
import { getUserAgent } from '@server/utils/userAgent';
import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

const captureRequest = (instance: AxiosInstance) => {
  const captured: { config?: InternalAxiosRequestConfig } = {};

  instance.defaults.adapter = (config) => {
    captured.config = config;
    return Promise.resolve({
      data: {},
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      request: {},
    } as AxiosResponse);
  };

  return captured;
};

class TestExternalAPI extends ExternalAPI {
  public constructor() {
    super('https://api.themoviedb.org/3', {}, {});
  }

  public async sentUserAgent(
    config?: AxiosRequestConfig
  ): Promise<string | null | undefined> {
    const captured = captureRequest(this.axios);
    await this.axios.get('/movie/123', config);
    return captured.config?.headers.get('User-Agent') as string | null;
  }
}

describe('outbound user agent', () => {
  it('identifies the application by name and version', () => {
    assert.match(getUserAgent(), /^Seerr\/.+$/);
  });

  it('is sent by clients built on ExternalAPI', async () => {
    assert.equal(await new TestExternalAPI().sentUserAgent(), getUserAgent());
  });

  it('is sent on default axios calls', async () => {
    const previousAdapter = axios.defaults.adapter;
    const captured = captureRequest(axios);

    try {
      await axios.get('https://example.test/');
    } finally {
      axios.defaults.adapter = previousAdapter;
    }

    assert.equal(captured.config?.headers.get('User-Agent'), getUserAgent());
  });

  it('does not override a user agent set on the request', async () => {
    const sent = await new TestExternalAPI().sentUserAgent({
      headers: { 'user-agent': 'Custom/1.0' },
    });

    assert.equal(sent, 'Custom/1.0');
  });
});

describe('dedicated provider HTTP clients', () => {
  it('applies both the configured proxy and versioned user agent to CAA and Steam', async () => {
    const head = mock.method(axios, 'head', async () => ({ status: 200 }));
    const previousAdapter = coverArtArchiveHttpClient.defaults.adapter;
    try {
      await createCustomProxyAgent({
        enabled: true,
        hostname: 'proxy.example.com',
        port: 8080,
        useSsl: false,
        user: '',
        password: '',
        bypassFilter: '',
        bypassLocalAddresses: true,
      });
      const steam = new SteamAPI('fixture-key');
      const client = (steam as unknown as { client: AxiosInstance }).client;
      for (const instance of [coverArtArchiveHttpClient, client]) {
        const captured = captureRequest(instance);
        await instance.get('https://provider.example.com/fixture');
        assert.equal(
          captured.config?.headers.get('User-Agent'),
          getUserAgent()
        );
        assert.equal(captured.config?.proxy, false);
        assert.equal(
          captured.config?.httpsAgent?.constructor.name,
          'HttpsProxyAgent'
        );
      }
    } finally {
      head.mock.restore();
      coverArtArchiveHttpClient.defaults.adapter = previousAdapter;
      resetCustomProxyAgent();
    }
  });
});
