import { createIntl } from '@formatjs/intl';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getLocalizedNotificationPayload,
  getNotificationEvent,
  type NotificationEventKind,
  type NotificationPayload,
} from './agent';

const base: NotificationPayload = {
  subject: 'User title: فيلم <custom>',
  message: 'A user or provider description <keep>',
  event: 'Custom event',
  notifyAdmin: false,
  notifySystem: true,
};

// Supplying recipient messages here checks delivery-time resolution independently
// of the shipped catalog, which is checked separately by the catalog audit.
describe('notification content descriptors', () => {
  it('resolves fixed content for each recipient without mutating stored or dynamic text', () => {
    const intl = createIntl({
      locale: 'fr',
      messages: {
        'notifications.event.available':
          '{mediaType, select, book {Livre disponible} other {{quality}Média disponible}}',
        'notifications.content.publisher': 'Éditeur',
        'notifications.content.comicRequestDetails': 'Détails dans SeerrNG.',
      },
    });
    const payload: NotificationPayload = {
      ...base,
      eventMessage: { kind: 'available', mediaType: 'book', is4k: false },
      bodyMessage: 'comicRequestDetails',
      extra: [
        { name: 'Publisher', label: 'publisher', value: 'Publisher <raw>' },
      ],
    };
    const before = structuredClone(payload);
    const translated = getLocalizedNotificationPayload(payload, intl);
    assert.equal(translated.event, 'Livre disponible');
    assert.equal(translated.subject, base.subject);
    assert.equal(translated.message, 'Détails dans SeerrNG.');
    assert.deepEqual(translated.extra, [
      { name: 'Éditeur', label: 'publisher', value: 'Publisher <raw>' },
    ]);
    assert.deepEqual(payload, before);
  });

  it('preserves custom and legacy text and translates only explicit subject/issue descriptors', () => {
    const intl = createIntl({
      locale: 'ar',
      messages: {
        'notifications.content.bookRequest': 'طلب كتاب',
        'notifications.content.comment':
          '{issueType, select, video {تعليق على مشكلة فيديو} other {تعليق على مشكلة}}',
      },
    });
    assert.deepEqual(getLocalizedNotificationPayload(base, intl), {
      ...base,
      extra: [],
    });
    const translated = getLocalizedNotificationPayload(
      {
        ...base,
        subjectMessage: 'bookRequest',
        issueEventMessage: { kind: 'comment', issueType: 'video' },
      },
      intl
    );
    assert.equal(translated.subject, 'طلب كتاب');
    assert.equal(translated.event, 'تعليق على مشكلة فيديو');
    assert.equal(translated.message, base.message);
  });

  it('formats every canonical media-event branch including quality and fallback', () => {
    const intl = createIntl({ locale: 'en', messages: {} });
    const kinds: NotificationEventKind[] = [
      'available',
      'approved',
      'declined',
      'pending',
      'autoRequested',
      'autoApproved',
      'failed',
    ];
    const mediaTypes = [
      'movie',
      'tv',
      'music',
      'book',
      'comic',
      'magazine',
      'adult',
      'sports',
    ] as const;
    for (const kind of kinds) {
      for (const mediaType of mediaTypes) {
        for (const is4k of [false, true]) {
          const text = getNotificationEvent(
            { eventMessage: { kind, mediaType, is4k } },
            intl
          );
          assert.ok(text && !/[{}]/.test(text));
          assert.equal(text.includes('4K '), is4k);
        }
      }
    }
  });
});
