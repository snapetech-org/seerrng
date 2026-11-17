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

for (const template of [
  'resetpassword',
  'media-request',
  'media-issue',
  'test-email',
]) {
  it(`${template} allows HTTP(S) links and rejects executable, credentialed and control-character URLs`, async () => {
    const settings = getSettings();
    settings.main.applicationUrl = 'https://seerr.example';
    const email = new PreparedEmail(settings.notifications.agents.email);
    const render = (url: string) =>
      email.render(join(__dirname, `../../templates/email/${template}/html`), {
        locale: 'en',
        direction: 'ltr',
        applicationTitle: 'SeerrNG',
        applicationUrl: url,
        actionUrl: url,
        resetPasswordLink: url,
        logoUrl: url,
        imageUrl: url,
        episodeQueue: { helpUrl: url, summary: 'Queue', helpLabel: 'Help' },
        mediaExtra: [],
        mediaName: 'Fixture',
        body: 'Fixture',
        actionLabel: 'Open',
      });
    for (const unsafe of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'https://user:secret@example.com/',
      'https://example.com/\nunsafe',
    ]) {
      const html = await render(unsafe);
      assert.doesNotMatch(html, /\b(?:href|src)="/);
    }
    const html = await render('https://seerr.example/path?q=one&next=two');
    assert.match(
      html,
      /href="https:\/\/seerr\.example\/path\?q=one(?:&amp;|&)next=two"/
    );
    const css = await render("https://seerr.example/image');color:red;('");
    assert.doesNotMatch(css, /image'\)/);
  });
}
