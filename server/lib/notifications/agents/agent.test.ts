import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';

import { MediaType } from '@server/constants/media';
import type Media from '@server/entity/Media';
import { MediaIdentifierProvider } from '@server/entity/MediaIdentifier';
import { getIntl, initI18n } from '@server/i18n';
import { Notification } from '@server/lib/notifications';
import { requiresDirectSafeHttpConnection } from '@server/utils/security';
import axios from 'axios';
import {
  CONFIGURABLE_NOTIFICATION_HTTP_OPTIONS,
  NOTIFICATION_DELIVERY_CONCURRENCY,
  NOTIFICATION_HTTP_OPTIONS,
  getMediaTypeLabel,
  getNotificationMediaUrl,
  truncateNotificationText,
  truncateNotificationUtf8,
} from './agent';
import WebhookAgent, {
  MAX_WEBHOOK_URL_LENGTH,
  decodeStoredWebhookPayloadTemplate,
  parseWebhookPayloadTemplate,
} from './webhook';

before(() => {
  initI18n();
});

afterEach(() => {
  mock.restoreAll();
  delete process.env.SEERR_ALLOW_PRIVATE_NOTIFICATION_URLS;
});

describe('NOTIFICATION_HTTP_OPTIONS', () => {
  it('bounds outbound notification HTTP requests', () => {
    assert.equal(NOTIFICATION_HTTP_OPTIONS.timeout, 10_000);
    assert.equal(NOTIFICATION_HTTP_OPTIONS.maxBodyLength, 128 * 1024);
    assert.equal(NOTIFICATION_HTTP_OPTIONS.maxContentLength, 128 * 1024);
    assert.equal(NOTIFICATION_DELIVERY_CONCURRENCY, 10);
    assert.equal('proxy' in NOTIFICATION_HTTP_OPTIONS, false);
    assert.equal(
      requiresDirectSafeHttpConnection(
        CONFIGURABLE_NOTIFICATION_HTTP_OPTIONS.lookup
      ),
      true
    );
    assert.equal(CONFIGURABLE_NOTIFICATION_HTTP_OPTIONS.proxy, false);
  });
});

describe('truncateNotificationText', () => {
  it('bounds text without splitting Unicode surrogate pairs', () => {
    assert.equal(truncateNotificationText('abcdef', 5), 'abcd…');
    assert.equal(truncateNotificationText('abc😀def', 6), 'abc😀…');
    assert.equal(truncateNotificationText('abc', 0), '');
  });
});

describe('truncateNotificationUtf8', () => {
  it('bounds encoded bytes without splitting code points', () => {
    assert.equal(truncateNotificationUtf8('ab😀cd', 7), 'ab…');
    assert.equal(
      Buffer.byteLength(truncateNotificationUtf8('😀'.repeat(5), 9)),
      7
    );
    assert.equal(truncateNotificationUtf8('abc', 2), '');
  });
});

describe('getNotificationMediaUrl', () => {
  it('canonicalizes music and book media URLs', () => {
    assert.equal(
      getNotificationMediaUrl({
        media: {
          mediaType: 'music',
          mbId: ' 550E8400-E29B-41D4-A716-446655440000 ',
        } as Media,
      }),
      '/music/550e8400-e29b-41d4-a716-446655440000'
    );

    assert.equal(
      getNotificationMediaUrl({
        media: {
          mediaType: 'book',
          identifiers: [
            {
              provider: MediaIdentifierProvider.OPENLIBRARY,
              value: '/works/ol123w',
            },
          ],
        } as Media,
      }),
      '/book/OL123W'
    );

    assert.equal(
      getNotificationMediaUrl({
        media: {
          mediaType: 'comic',
          identifiers: [
            {
              provider: MediaIdentifierProvider.COMICVINE,
              value: '12345',
            },
          ],
        } as Media,
      }),
      '/comic/12345'
    );

    assert.equal(
      getNotificationMediaUrl({
        media: {
          mediaType: 'comic',
          identifiers: [],
        } as unknown as Media,
      }),
      undefined
    );
  });
});

describe('getMediaTypeLabel', () => {
  it('labels each media type distinctly instead of collapsing to movie/series', () => {
    const intl = getIntl('en');
    assert.equal(getMediaTypeLabel(intl, MediaType.MOVIE), 'movie');
    assert.equal(getMediaTypeLabel(intl, MediaType.TV), 'series');
    assert.equal(getMediaTypeLabel(intl, MediaType.MUSIC), 'music');
    assert.equal(getMediaTypeLabel(intl, MediaType.BOOK), 'book');
    assert.equal(getMediaTypeLabel(intl, MediaType.COMIC), 'comic');
  });
});

describe('WebhookAgent', () => {
  const webhook = (template: unknown) =>
    new WebhookAgent({
      enabled: true,
      embedPoster: false,
      types: Notification.MEDIA_AVAILABLE,
      options: {
        webhookUrl: 'http://127.0.0.1/webhook',
        jsonPayload: Buffer.from(
          JSON.stringify(JSON.stringify(template))
        ).toString('base64'),
        customHeaders: [],
        supportVariables: false,
      },
    });
  const notification = (subject = 'Crème Déjà Vu & More') => ({
    notifySystem: true,
    notifyAdmin: false,
    subject,
    message: 'message',
  });

  it('renders allowlisted Unicode filters and keeps substituted placeholders literal', async () => {
    process.env.SEERR_ALLOW_PRIVATE_NOTIFICATION_URLS = 'true';
    const post = mock.method(axios, 'post', async () => ({ data: {} }));
    const sent = await webhook({
      plain: '{{subject}}',
      nested: [
        {
          slug: '{{subject | slugify}}',
          encoded: '{{subject | lowercase | urlencode}}',
        },
      ],
      unknown: '{{legacy_unknown}}',
    }).send(Notification.MEDIA_AVAILABLE, notification());
    assert.equal(sent, true);
    assert.deepEqual(post.mock.calls[0].arguments[1], {
      plain: 'Crème Déjà Vu & More',
      nested: [
        {
          slug: 'creme-deja-vu-more',
          encoded: encodeURIComponent('crème déjà vu & more'),
        },
      ],
      unknown: '{{legacy_unknown}}',
    });
    await webhook({ text: '{{subject}}' }).send(
      Notification.MEDIA_AVAILABLE,
      notification('{{message}}')
    );
    assert.deepEqual(post.mock.calls[1].arguments[1], { text: '{{message}}' });
  });

  it('bounds rendered webhook expansion across repeated placeholders before sending', async () => {
    process.env.SEERR_ALLOW_PRIVATE_NOTIFICATION_URLS = 'true';
    const post = mock.method(axios, 'post', async () => ({ data: {} }));
    const sent = await webhook({ text: '{{subject}}'.repeat(200) }).send(
      Notification.MEDIA_AVAILABLE,
      notification('x'.repeat(1024))
    );
    assert.equal(sent, false);
    assert.equal(post.mock.callCount(), 0);
  });

  it('bounds rendering work even when filters shrink repeated large values to empty strings', async () => {
    process.env.SEERR_ALLOW_PRIVATE_NOTIFICATION_URLS = 'true';
    const post = mock.method(axios, 'post', async () => ({ data: {} }));
    assert.equal(
      await webhook({ text: '{{subject | slugify}}'.repeat(80) }).send(
        Notification.MEDIA_AVAILABLE,
        notification(' '.repeat(20000))
      ),
      false
    );
    assert.equal(post.mock.callCount(), 0);
  });

  it('rejects invalid filters, excessive chains and escaped JSON expansion before sending', async () => {
    process.env.SEERR_ALLOW_PRIVATE_NOTIFICATION_URLS = 'true';
    const post = mock.method(axios, 'post', async () => ({ data: {} }));
    for (const template of [
      '{{subject | __proto__}}',
      '{{subject | toString}}',
      '{{subject | unknown}}',
      '{{subject | }}',
      '{{ | lowercase}}',
      '{{subject | lowercase',
      '{{subject' + ' | lowercase'.repeat(9) + '}}',
    ]) {
      assert.equal(
        await webhook({ text: template }).send(
          Notification.MEDIA_AVAILABLE,
          notification()
        ),
        false,
        template
      );
    }
    assert.equal(
      await webhook({ text: '{{subject | urlencode | urlencode}}' }).send(
        Notification.MEDIA_AVAILABLE,
        notification('&'.repeat(20000))
      ),
      false
    );
    assert.equal(
      await webhook({ text: '{{subject}}' }).send(
        Notification.MEDIA_AVAILABLE,
        notification('\u0000'.repeat(20000))
      ),
      false
    );
    assert.equal(post.mock.callCount(), 0);
  });

  it('accepts only bounded object or array payload templates', () => {
    assert.deepStrictEqual(parseWebhookPayloadTemplate('{"ok":true}'), {
      ok: true,
    });
    assert.deepStrictEqual(parseWebhookPayloadTemplate('[{"ok":true}]'), [
      { ok: true },
    ]);
    assert.throws(
      () => parseWebhookPayloadTemplate('null'),
      /root must be an object or array/
    );
    assert.throws(
      () => parseWebhookPayloadTemplate('"string"'),
      /root must be an object or array/
    );
  });

  it('validates decoded persisted payloads before rendering', () => {
    const raw = '{"subject":"{{subject}}"}';
    const encoded = Buffer.from(JSON.stringify(raw)).toString('base64');

    assert.deepStrictEqual(decodeStoredWebhookPayloadTemplate(encoded), {
      raw,
      template: { subject: '{{subject}}' },
    });
    assert.throws(
      () => decodeStoredWebhookPayloadTemplate('not-base64'),
      /Stored webhook payload is invalid/
    );
  });

  it('rejects oversized rendered webhook URLs before sending', async () => {
    process.env.SEERR_ALLOW_PRIVATE_NOTIFICATION_URLS = 'true';
    const postMock = mock.method(axios, 'post', async () => ({ data: {} }));

    const agent = new WebhookAgent({
      enabled: true,
      embedPoster: false,
      types: Notification.MEDIA_AVAILABLE,
      options: {
        webhookUrl: 'http://127.0.0.1/webhook?subject={{subject}}',
        jsonPayload: Buffer.from(JSON.stringify(JSON.stringify({}))).toString(
          'base64'
        ),
        customHeaders: [],
        supportVariables: true,
      },
    });

    const sent = await agent.send(Notification.MEDIA_AVAILABLE, {
      notifySystem: true,
      notifyAdmin: false,
      subject: 'x'.repeat(MAX_WEBHOOK_URL_LENGTH),
      message: 'message',
    });

    assert.equal(sent, false);
    assert.equal(postMock.mock.callCount(), 0);
  });

  it('rejects deeply nested payload templates before sending', async () => {
    process.env.SEERR_ALLOW_PRIVATE_NOTIFICATION_URLS = 'true';
    const postMock = mock.method(axios, 'post', async () => ({ data: {} }));
    let nested: Record<string, unknown> = { value: '{{subject}}' };
    for (let i = 0; i < 40; i += 1) {
      nested = { nested };
    }

    const agent = new WebhookAgent({
      enabled: true,
      embedPoster: false,
      types: Notification.TEST_NOTIFICATION,
      options: {
        webhookUrl: 'http://127.0.0.1/webhook',
        jsonPayload: Buffer.from(
          JSON.stringify(JSON.stringify(nested))
        ).toString('base64'),
        customHeaders: [],
        supportVariables: false,
      },
    });

    const sent = await agent.send(Notification.TEST_NOTIFICATION, {
      notifySystem: true,
      notifyAdmin: false,
      subject: 'subject',
      message: 'message',
    });

    assert.equal(sent, false);
    assert.equal(postMock.mock.callCount(), 0);
  });
});
