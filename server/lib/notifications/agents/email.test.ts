import assert from 'node:assert/strict';
import { join } from 'node:path';
import { afterEach, before, describe, it, mock } from 'node:test';

import { MediaType } from '@server/constants/media';
import type Media from '@server/entity/Media';
import { User } from '@server/entity/User';
import { ALL_NOTIFICATIONS, UserSettings } from '@server/entity/UserSettings';
import { initI18n } from '@server/i18n';
import PreparedEmail from '@server/lib/email';
import { Notification } from '@server/lib/notifications';
import { getSettings, type NotificationAgentEmail } from '@server/lib/settings';
import EmailAgent from './email';

let previousApplicationUrl: string | undefined;

before(() => {
  initI18n();
});

afterEach(() => {
  mock.restoreAll();
  if (previousApplicationUrl !== undefined) {
    getSettings().main.applicationUrl = previousApplicationUrl;
    previousApplicationUrl = undefined;
  }
});

describe('Email availability subscription notifications', () => {
  it('renders a follower notice without exposing who requested the title', async () => {
    previousApplicationUrl = getSettings().main.applicationUrl;
    getSettings().main.applicationUrl = 'https://seerr.example';
    let sentMessage: Parameters<PreparedEmail['send']>[0] | undefined;
    mock.method(
      PreparedEmail.prototype,
      'send',
      async (message: Parameters<PreparedEmail['send']>[0]) => {
        sentMessage = message;
        return true;
      }
    );

    const emailSettings: NotificationAgentEmail = {
      enabled: true,
      embedPoster: false,
      types: Notification.MEDIA_AVAILABLE,
      options: {
        userEmailRequired: false,
        emailFrom: 'seerr@example.com',
        smtpHost: 'smtp.example.com',
        smtpPort: 587,
        secure: false,
        ignoreTls: false,
        requireTls: true,
        allowSelfSigned: false,
        senderName: 'SeerrNG',
        usePublicLogo: false,
      },
    };
    const agent = new EmailAgent(emailSettings);
    const follower = new User({
      id: 2,
      username: 'follower',
      email: 'follower@example.com',
      settings: new UserSettings({
        locale: 'ar',
        notificationTypes: { email: ALL_NOTIFICATIONS },
      }),
    });

    const sent = await agent.send(Notification.MEDIA_AVAILABLE, {
      event: 'Movie Now Available',
      subject: 'Arrival (2016)',
      notifySystem: false,
      notifyAdmin: false,
      notifyUser: follower,
      media: { mediaType: MediaType.MOVIE, tmdbId: 329865 } as Media,
      mediaUrl: '/movie/329865',
      availabilitySubscription: true,
    });

    assert.strictEqual(sent, true);
    assert.ok(sentMessage);
    assert.strictEqual(sentMessage.locals?.requestedBy, undefined);
    const email = new PreparedEmail(emailSettings);
    const html = await email.render(
      join(String(sentMessage.template), 'html'),
      sentMessage.locals
    );
    assert.match(html, /A title you follow is now available/);
    assert.match(html, /<html lang="ar" dir="rtl">/);
    assert.match(html, /Hi, \u2068follower\u2069!/);
    assert.doesNotMatch(html, /Requested By/);
    assert.match(html, /Arrival \(2016\)/);
  });
});
