import { Notification } from '@server/lib/notifications';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import AppriseAgent, {
  APPRISE_BODY_BYTE_LIMIT,
  APPRISE_TITLE_BYTE_LIMIT,
  appriseEndpoint,
  appriseMessageType,
} from './apprise';

const createAgent = (
  url = 'https://apprise.example.test',
  overrides: Partial<{
    tag: string;
    authMethodUsernamePassword: boolean;
    username: string;
    password: string;
  }> = {}
) =>
  new AppriseAgent({
    enabled: true,
    embedPoster: false,
    types: Notification.TEST_NOTIFICATION,
    options: {
      url,
      configKey: 'seerr',
      locale: 'en',
      ...overrides,
    },
  });

describe('Apprise endpoint', () => {
  it('uses the stateful notify endpoint and strips trailing slashes', () => {
    assert.equal(
      appriseEndpoint('https://apprise.example.test/', 'seerr'),
      'https://apprise.example.test/notify/seerr'
    );
    assert.equal(
      appriseEndpoint('https://apprise.example.test///', 'family'),
      'https://apprise.example.test/notify/family'
    );
  });

  it('encodes the configuration key path segment', () => {
    assert.equal(
      appriseEndpoint('https://apprise.example.test', 'a/b'),
      'https://apprise.example.test/notify/a%2Fb'
    );
  });
});

describe('Apprise message type', () => {
  it('maps failures, successes, warnings and default events', () => {
    assert.equal(appriseMessageType(Notification.MEDIA_FAILED), 'failure');
    assert.equal(appriseMessageType(Notification.MEDIA_AVAILABLE), 'success');
    assert.equal(appriseMessageType(Notification.ISSUE_CREATED), 'warning');
    assert.equal(appriseMessageType(Notification.MEDIA_PENDING), 'info');
  });
});

describe('Apprise payload', () => {
  it('keeps title and body within Apprise byte limits', () => {
    const payload = createAgent().buildPayload(Notification.TEST_NOTIFICATION, {
      notifySystem: true,
      notifyAdmin: false,
      event: '😀'.repeat(500),
      subject: 'subject',
      message: 'a'.repeat(20_000),
      extra: [{ name: 'field', value: '😀'.repeat(5_000) }],
    });

    assert.ok(
      Buffer.byteLength(payload.title as string) <= APPRISE_TITLE_BYTE_LIMIT
    );
    assert.ok(
      Buffer.byteLength(payload.body as string) <= APPRISE_BODY_BYTE_LIMIT
    );
    assert.equal(payload.format, 'text');
  });

  it('sends plain text rather than Markdown or HTML', () => {
    const payload = createAgent().buildPayload(Notification.TEST_NOTIFICATION, {
      notifySystem: true,
      notifyAdmin: false,
      subject: 'subject',
      message: '<b>bold</b> [link](https://evil.invalid)',
    });

    assert.equal(payload.format, 'text');
    assert.equal(payload.body.includes('<b>bold</b>'), true);
  });

  it('includes a tag only when one is configured', () => {
    const untagged = createAgent().buildPayload(
      Notification.TEST_NOTIFICATION,
      {
        notifySystem: true,
        notifyAdmin: false,
        subject: 'subject',
      }
    );
    const tagged = createAgent(undefined, { tag: 'family' }).buildPayload(
      Notification.TEST_NOTIFICATION,
      { notifySystem: true, notifyAdmin: false, subject: 'subject' }
    );

    assert.equal('tag' in untagged, false);
    assert.equal(tagged.tag, 'family');
  });
});

describe('Apprise delivery', () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl = '';
  let lastRequest:
    { url?: string; authorization?: string; body: string } | undefined;
  const previousAllow = process.env.SEERR_ALLOW_PRIVATE_NOTIFICATION_URLS;

  before(async () => {
    process.env.SEERR_ALLOW_PRIVATE_NOTIFICATION_URLS = 'true';
    server = createServer((request: IncomingMessage, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        lastRequest = {
          url: request.url,
          authorization: request.headers.authorization,
          body: Buffer.concat(chunks).toString('utf8'),
        };
        response.writeHead(
          request.url?.startsWith('/notify/seerr') ? 200 : 404
        );
        response.end();
      });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => {
    server.close();
    if (previousAllow === undefined) {
      delete process.env.SEERR_ALLOW_PRIVATE_NOTIFICATION_URLS;
    } else {
      process.env.SEERR_ALLOW_PRIVATE_NOTIFICATION_URLS = previousAllow;
    }
  });

  it('posts a text payload to the configured key with basic auth', async () => {
    const agent = createAgent(baseUrl, {
      authMethodUsernamePassword: true,
      username: 'apprise',
      password: 'secret',
    });

    const sent = await agent.send(Notification.TEST_NOTIFICATION, {
      notifySystem: true,
      notifyAdmin: false,
      subject: 'Seerr test',
      message: 'Hello',
    });

    assert.equal(sent, true);
    assert.equal(lastRequest?.url, '/notify/seerr');
    assert.equal(
      lastRequest?.authorization,
      `Basic ${Buffer.from('apprise:secret').toString('base64')}`
    );
    const body = JSON.parse(lastRequest?.body ?? '{}');
    assert.equal(body.title, '\u2068Seerr test\u2069');
    assert.equal(body.format, 'text');
  });

  it('reports a failed delivery when Apprise rejects the key', async () => {
    const agent = new AppriseAgent({
      enabled: true,
      embedPoster: false,
      types: Notification.TEST_NOTIFICATION,
      options: { url: baseUrl, configKey: 'missing', locale: 'en' },
    });

    const sent = await agent.send(Notification.TEST_NOTIFICATION, {
      notifySystem: true,
      notifyAdmin: false,
      subject: 'Seerr test',
    });

    assert.equal(sent, false);
  });
});
