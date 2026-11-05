import {
  INTERNAL_API_PORT_ENV,
  getInternalApiBaseUrl,
} from '@app/utils/internalApi';
import assert from 'node:assert/strict';
import { X509Certificate } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { Agent, fetch as directFetch } from 'undici';
import { startLoopbackHttpServer } from './httpServer';
import {
  buildHttpsRedirectLocation,
  createHttpsUpgradeHandler,
  getTlsConfigurationStatus,
  initializeTls,
  parseTlsBoolean,
  parseTlsHosts,
  parseTlsMode,
} from './tls';

describe('TLS configuration parsing', () => {
  it('keeps TLS disabled unless explicitly enabled', () => {
    assert.equal(parseTlsMode(), 'disabled');
    assert.equal(parseTlsMode('SELF-SIGNED'), 'self-signed');
    assert.equal(parseTlsMode('provided'), 'provided');
    assert.deepEqual(parseTlsHosts('localhost, 127.0.0.1, ::1'), [
      'localhost',
      '127.0.0.1',
      '::1',
    ]);
    assert.equal(parseTlsBoolean('FLAG', undefined), false);
    assert.equal(parseTlsBoolean('FLAG', '1'), true);
    assert.throws(() => parseTlsMode('automatic'), /SEERR_TLS_MODE/);
    assert.throws(() => parseTlsBoolean('FLAG', 'yes'), /true.*false/);

    assert.equal(
      getTlsConfigurationStatus(undefined, { NODE_ENV: 'test' })
        .httpAuthAllowed,
      true
    );
  });

  it('rejects redirect hosts that are not explicitly in the TLS SAN list', () => {
    assert.equal(
      buildHttpsRedirectLocation(
        { headers: { host: 'server.example:5055' }, url: '/login?next=1' },
        5056,
        ['server.example']
      ),
      'https://server.example:5056/login?next=1'
    );
    assert.equal(
      buildHttpsRedirectLocation(
        { headers: { host: 'attacker.example:5055' }, url: '/' },
        5056,
        ['server.example']
      ),
      undefined
    );
    assert.equal(
      buildHttpsRedirectLocation(
        { headers: { host: '[::1]:5055' }, url: '/api/v1/status/ready' },
        5056,
        ['::1']
      ),
      'https://[::1]:5056/api/v1/status/ready'
    );
    assert.equal(
      buildHttpsRedirectLocation(
        {
          headers: { host: 'server.example:5055' },
          url: '//attacker.example/',
        },
        5056,
        ['server.example']
      ),
      undefined
    );
  });

  it('reports environment overrides and supports a non-redirecting HTTP listener', () => {
    const configured = getTlsConfigurationStatus(
      {
        mode: 'self-signed',
        httpsPort: 5056,
        hosts: 'localhost',
        redirectHttpToHttps: false,
        allowHttpAuth: false,
      },
      {
        NODE_ENV: 'test',
        SEERR_TLS_MODE: 'self-signed',
        SEERR_HTTP_REDIRECT_TO_HTTPS: 'false',
      }
    );
    assert.equal(configured.mode, 'self-signed');
    assert.equal(configured.redirectsHttpToHttps, false);
    assert.deepEqual(configured.environmentOverrides, [
      'SEERR_TLS_MODE',
      'SEERR_HTTP_REDIRECT_TO_HTTPS',
    ]);

    const legacyEnvironmentMode = getTlsConfigurationStatus(
      { mode: 'self-signed', redirectHttpToHttps: false },
      { NODE_ENV: 'test', SEERR_TLS_MODE: 'self-signed' }
    );
    assert.equal(legacyEnvironmentMode.redirectsHttpToHttps, true);

    const response = {
      headers: {} as Record<string, string>,
      statusCode: 0,
      body: '',
      writeHead(status: number, headers: Record<string, string>) {
        this.statusCode = status;
        this.headers = headers;
      },
      end(body?: string) {
        this.body = body ?? '';
      },
    };
    createHttpsUpgradeHandler(5056, ['server.example'])(
      {
        headers: { host: 'server.example:5055' },
        url: '/login',
      } as never,
      response as never
    );
    assert.equal(response.statusCode, 426);
    assert.equal(
      response.headers.Location,
      'https://server.example:5056/login'
    );
    assert.match(response.body, /HTTPS is enabled/);
  });

  it('routes SSR API calls through loopback while public HTTP only upgrades', async () => {
    const dispatcher = new Agent();
    const originalInternalApiPort = process.env[INTERNAL_API_PORT_ENV];
    const internalApi = await startLoopbackHttpServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{"id":1}');
    });
    const publicHttp = http.createServer(
      createHttpsUpgradeHandler(5056, ['127.0.0.1'])
    );

    try {
      await new Promise<void>((resolve, reject) => {
        publicHttp.once('error', reject);
        publicHttp.listen(0, '127.0.0.1', resolve);
      });
      const publicAddress = publicHttp.address();
      assert.ok(publicAddress && typeof publicAddress !== 'string');

      process.env[INTERNAL_API_PORT_ENV] = String(internalApi.port);
      const internalResponse = await directFetch(
        `${getInternalApiBaseUrl()}/api/v1/movie/1`,
        { dispatcher }
      );
      assert.equal(internalResponse.status, 200);
      assert.deepEqual(await internalResponse.json(), { id: 1 });

      const publicResponse = await directFetch(
        `http://127.0.0.1:${publicAddress.port}/api/v1/movie/1`,
        { dispatcher }
      );
      assert.equal(publicResponse.status, 426);
      assert.equal(
        publicResponse.headers.get('location'),
        'https://127.0.0.1:5056/api/v1/movie/1'
      );
    } finally {
      await dispatcher.close();
      if (originalInternalApiPort === undefined) {
        delete process.env[INTERNAL_API_PORT_ENV];
      } else {
        process.env[INTERNAL_API_PORT_ENV] = originalInternalApiPort;
      }
      await Promise.all(
        [internalApi.server, publicHttp].map(
          (server) =>
            new Promise<void>((resolve, reject) => {
              if (!server.listening) {
                resolve();
                return;
              }
              server.close((error) => (error ? reject(error) : resolve()));
            })
        )
      );
    }
  });
});

describe('built-in local TLS material', () => {
  it('generates persistent CA and server material and refreshes changed SANs', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'seerrng-tls-'));
    try {
      const environment = {
        ...process.env,
        SEERR_TLS_MODE: 'self-signed',
        SEERR_TLS_HOSTS: 'localhost,127.0.0.1',
      };
      const first = await initializeTls({
        httpPort: 5055,
        httpsPort: 5056,
        tlsDirectory: directory,
        environment,
      });
      assert.equal(first.runtime.mode, 'self-signed');
      assert.equal(first.runtime.caDownloadAvailable, true);
      assert.deepEqual(first.hosts, ['localhost', '127.0.0.1']);
      assert.ok(first.runtime.fingerprint);

      for (const file of ['ca.crt', 'ca.key', 'server.crt', 'server.key']) {
        const stat = await fs.stat(path.join(directory, file));
        assert.equal(stat.isFile(), true);
        assert.equal(stat.mode & 0o077, 0);
      }

      const caCertificate = new X509Certificate(
        await fs.readFile(path.join(directory, 'ca.crt'), 'utf8')
      );
      const serverCertificate = new X509Certificate(
        await fs.readFile(path.join(directory, 'server.crt'), 'utf8')
      );
      assert.equal(serverCertificate.checkIssued(caCertificate), true);

      const second = await initializeTls({
        httpPort: 5055,
        httpsPort: 5056,
        tlsDirectory: directory,
        environment,
      });
      assert.equal(second.runtime.fingerprint, first.runtime.fingerprint);

      const changed = await initializeTls({
        httpPort: 5055,
        httpsPort: 5056,
        tlsDirectory: directory,
        environment: {
          ...process.env,
          ...environment,
          SEERR_TLS_HOSTS: 'localhost,127.0.0.1,seerr.local',
        },
      });
      assert.notEqual(changed.runtime.fingerprint, first.runtime.fingerprint);
      assert.deepEqual(changed.hosts, [
        'localhost',
        '127.0.0.1',
        'seerr.local',
      ]);

      const provided = await initializeTls({
        httpPort: 5055,
        httpsPort: 5056,
        environment: {
          ...process.env,
          SEERR_TLS_MODE: 'provided',
          SEERR_TLS_CERT_FILE: path.join(directory, 'server.crt'),
          SEERR_TLS_KEY_FILE: path.join(directory, 'server.key'),
        },
      });
      assert.equal(provided.runtime.mode, 'provided');
      assert.equal(provided.runtime.fingerprint, changed.runtime.fingerprint);
      assert.deepEqual(provided.hosts, [
        'localhost',
        '127.0.0.1',
        'seerr.local',
      ]);
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it('fails closed when the explicit HTTP fallback conflicts with TLS', async () => {
    await assert.rejects(
      initializeTls({
        httpPort: 5055,
        httpsPort: 5056,
        environment: {
          ...process.env,
          SEERR_TLS_MODE: 'self-signed',
          SEERR_ALLOW_HTTP_AUTH: 'true',
        },
      }),
      /cannot be enabled together/i
    );
  });

  it('uses persisted transport settings when no environment override is present', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'seerrng-tls-'));
    try {
      const configuration = await initializeTls({
        httpPort: 5055,
        tlsDirectory: directory,
        settings: {
          mode: 'self-signed',
          httpsPort: 5057,
          hosts: 'seerr.local',
          redirectHttpToHttps: false,
          allowHttpAuth: false,
        },
        environment: { NODE_ENV: 'test' },
      });
      assert.equal(configuration.httpsPort, 5057);
      assert.equal(configuration.redirectsHttpToHttps, false);
      assert.deepEqual(configuration.hosts, ['seerr.local']);
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
