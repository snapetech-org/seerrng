import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { join } from 'node:path';

import { getSettings } from '@server/lib/settings';
import PreparedEmail, { EMAIL_TRANSPORT_TIMEOUT_OPTIONS } from '.';

describe('EMAIL_TRANSPORT_TIMEOUT_OPTIONS', () => {
  it('bounds SMTP connection lifetimes', () => {
    assert.equal(EMAIL_TRANSPORT_TIMEOUT_OPTIONS.connectionTimeout, 10_000);
    assert.equal(EMAIL_TRANSPORT_TIMEOUT_OPTIONS.greetingTimeout, 10_000);
    assert.equal(EMAIL_TRANSPORT_TIMEOUT_OPTIONS.socketTimeout, 30_000);
  });
});

describe('password setup email rendering', () => {
  it('renders safely when the recipient name has not been initialized', async () => {
    const settings = getSettings();
    settings.main.applicationUrl = 'https://seerr.example';
    const email = new PreparedEmail(settings.notifications.agents.email);

    await assert.doesNotReject(
      email.render(
        join(__dirname, '../../templates/email/resetpassword/html'),
        {
          applicationTitle: 'SeerrNG',
          applicationUrl: settings.main.applicationUrl,
          locale: 'ar',
          direction: 'rtl',
          greeting: undefined,
          instructions:
            'Use the link below to choose a password for your SeerrNG account.',
          actionLabel: 'Set Password',
          expiresNotice: 'The above link will expire in 24 hours.',
          ignoreNotice:
            'If you did not initiate this request, you may safely disregard this message.',
          resetPasswordLink: 'https://seerr.example/resetpassword/example',
          recipientEmail: 'new-user@example.com',
          recipientName: undefined,
        }
      )
    );

    const html = await email.render(
      join(__dirname, '../../templates/email/resetpassword/html'),
      {
        applicationTitle: 'SeerrNG',
        applicationUrl: settings.main.applicationUrl,
        locale: 'ar',
        direction: 'rtl',
        greeting: 'Hi, \u2068ليلى אבג\u2069!',
        instructions: 'Choose a password.',
        actionLabel: 'Set Password',
        expiresNotice: 'The link expires in 24 hours.',
        ignoreNotice: 'You can ignore this email.',
        resetPasswordLink: 'https://seerr.example/resetpassword/example',
        recipientEmail: 'new-user@example.com',
        recipientName: 'ليلى אבג',
      }
    );
    assert.match(html, /<html lang="ar" dir="rtl">/);
    assert.match(html, /Choose a password/);
  });
});
