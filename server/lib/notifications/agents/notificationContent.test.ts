import { createIntl } from '@formatjs/intl';
import { IssueType } from '@server/constants/issue';
import { MediaType } from '@server/constants/media';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatNotificationTitle,
  getIssueTypeLabel,
  getIssueTypeName,
  getLocalizedNotificationPayload,
  getNotificationCommentFrom,
  getNotificationEvent,
  isolateBidiText,
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
  it('maps numeric issue types to canonical ICU selector keys', () => {
    const intl = createIntl<unknown>({
      locale: 'en',
      messages: {
        'notifications.common.issueTypeLabel':
          '{type, select, video {Video} audio {Audio} subtitles {Subtitle} other {Other}}',
        'notifications.common.issueTypeNameMessage':
          '{type, select, video {Video issue} audio {Audio issue} subtitles {Subtitle issue} other {Issue}}',
      },
    });
    const cases = [
      [IssueType.VIDEO, 'Video', 'Video issue'],
      [IssueType.AUDIO, 'Audio', 'Audio issue'],
      [IssueType.SUBTITLES, 'Subtitle', 'Subtitle issue'],
      [IssueType.OTHER, 'Other', 'Issue'],
    ] as const;

    for (const [issueType, label, name] of cases) {
      assert.equal(getIssueTypeLabel(intl, issueType), label);
      assert.equal(getIssueTypeName(intl, issueType), name);
    }
  });

  it('isolates an opaque title when composing localized notification text', () => {
    const subject = 'فيلم 2025 — Паразит';
    assert.equal(
      formatNotificationTitle('New request', subject),
      `New request - \u2068${subject}\u2069`
    );
    assert.equal(
      formatNotificationTitle(undefined, subject),
      `\u2068${subject}\u2069`
    );
    assert.equal(
      formatNotificationTitle('New issue', subject, ': '),
      `New issue: \u2068${subject}\u2069`
    );
  });

  it('isolates dynamic names inside localized comment labels', () => {
    const userName = 'alice אבג';
    const intl = createIntl<unknown>({
      locale: 'ar',
      messages: { 'notifications.common.commentFrom': 'تعليق من {userName}' },
    });

    assert.equal(
      getNotificationCommentFrom(userName, intl),
      `تعليق من \u2068${userName}\u2069`
    );
  });

  it('isolates names without changing plain-text content', () => {
    const userName = 'alice <admin> אבג';

    assert.equal(isolateBidiText(userName), `\u2068${userName}\u2069`);
    assert.equal(isolateBidiText(undefined), undefined);
  });

  it('resolves fixed content for each recipient without mutating stored or dynamic text', () => {
    const intl = createIntl<unknown>({
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
      eventMessage: {
        kind: 'available',
        mediaType: MediaType.BOOK,
        is4k: false,
      },
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
      { name: 'Éditeur', value: 'Publisher <raw>' },
    ]);
    assert.deepEqual(payload, before);
  });

  it('preserves custom and legacy text and translates only explicit subject/issue descriptors', () => {
    const intl = createIntl<unknown>({
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

  it('resolves sports fallback and details at delivery time while retaining provider titles', () => {
    const intl = createIntl<unknown>({
      locale: 'ar',
      messages: {
        'notifications.content.sportsLeagueRequest': 'طلب دوري رياضي',
        'notifications.content.sportsRequestDetails':
          'تفاصيل الطلب الرياضي متاحة في SeerrNG.',
      },
    });
    const fallback = {
      ...base,
      subject: 'Sports league request',
      subjectMessage: 'sportsLeagueRequest' as const,
      bodyMessage: 'sportsRequestDetails' as const,
    };
    const localized = getLocalizedNotificationPayload(fallback, intl);
    assert.equal(localized.subject, 'طلب دوري رياضي');
    assert.equal(localized.message, 'تفاصيل الطلب الرياضي متاحة في SeerrNG.');
    const named = getLocalizedNotificationPayload(
      { ...fallback, subject: 'Synthetic League', subjectMessage: undefined },
      intl
    );
    assert.equal(named.subject, 'Synthetic League');
    assert.equal(fallback.subject, 'Sports league request');
  });

  it('formats every canonical media-event branch including quality and fallback', () => {
    const intl = createIntl<unknown>({ locale: 'en', messages: {} });
    const kinds: NotificationEventKind[] = [
      'available',
      'approved',
      'declined',
      'pending',
      'autoRequested',
      'autoApproved',
      'failed',
    ];
    const mediaTypes = Object.values(MediaType);
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
