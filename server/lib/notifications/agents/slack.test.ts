import type { MediaRequest } from '@server/entity/MediaRequest';
import { initI18n } from '@server/i18n';
import { Notification } from '@server/lib/notifications';
import type { NotificationPayload } from '@server/lib/notifications/agents/agent';
import { parseSlackRequestActionValue } from '@server/lib/notifications/slackActions';
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import SlackAgent, {
  SLACK_FALLBACK_TEXT_LIMIT,
  SLACK_FIELD_TEXT_LIMIT,
  SLACK_HEADER_TEXT_LIMIT,
  SLACK_SECTION_TEXT_LIMIT,
  escapeSlackMrkdwnText,
} from './slack';

before(() => {
  initI18n();
});

const createAgent = () =>
  new SlackAgent({
    enabled: true,
    embedPoster: false,
    types: Notification.ISSUE_COMMENT,
    options: {
      webhookUrl: 'https://hooks.slack.com/services/test',
      locale: 'en',
    },
  });

describe('Slack notification formatting', () => {
  it('adds signed approval buttons only to configured pending requests', () => {
    const signingSecret = 's'.repeat(32);
    const request = {
      id: 42,
      requestedBy: { displayName: 'Requester' },
    } as unknown as MediaRequest;
    const payload: NotificationPayload = {
      notifySystem: true,
      notifyAdmin: false,
      subject: 'Example request',
      message: 'A request is waiting for review.',
      request,
    };
    const actionsAgent = new SlackAgent({
      enabled: true,
      embedPoster: false,
      types: 0,
      options: {
        webhookUrl: 'https://hooks.slack.com/services/test',
        locale: 'en',
        requestActionsEnabled: true,
        workspaceId: 'T123',
        signingSecret,
        requestManagerMappings: 'U123=1',
      },
    });
    const configuredActions = actionsAgent
      .buildEmbed(Notification.MEDIA_PENDING, payload)
      .blocks.find((block) => block.type === 'actions')?.elements;
    assert.deepStrictEqual(
      configuredActions?.map((element) =>
        element.type === 'button' ? element.action_id : undefined
      ),
      ['seerrng-request-approve', 'seerrng-request-decline']
    );
    assert.deepStrictEqual(
      parseSlackRequestActionValue(
        configuredActions?.[0]?.type === 'button'
          ? configuredActions[0].value
          : undefined,
        'T123',
        signingSecret
      ),
      { requestId: 42, action: 'approve' }
    );
    assert.equal(
      configuredActions?.[0]?.type === 'button'
        ? configuredActions[0].confirm
        : undefined,
      undefined
    );
    assert.ok(
      configuredActions?.[1]?.type === 'button' && configuredActions[1].confirm
    );

    const disabledActions = createAgent()
      .buildEmbed(Notification.MEDIA_PENDING, payload)
      .blocks.find((block) => block.type === 'actions')?.elements;
    assert.equal(disabledActions, undefined);

    const resolvedActions = actionsAgent
      .buildEmbed(Notification.MEDIA_APPROVED, payload)
      .blocks.find((block) => block.type === 'actions')?.elements;
    assert.equal(
      resolvedActions?.some(
        (element) =>
          element.type === 'button' &&
          element.action_id === 'seerrng-request-approve'
      ) ?? false,
      false
    );
  });

  it('escapes Slack control characters without splitting replacements', () => {
    assert.equal(
      escapeSlackMrkdwnText('A & B <!channel> <@U123>'),
      'A &amp; B &lt;!channel&gt; &lt;@U123&gt;'
    );
    assert.equal(escapeSlackMrkdwnText('&&', 6), '&amp;…');
  });

  it('prevents mention injection and respects Block Kit text limits', () => {
    const injection = '<!channel> <@U123> <https://evil.invalid|click>';
    const payload: NotificationPayload = {
      notifySystem: true,
      notifyAdmin: false,
      event: `${injection}${'&'.repeat(5_000)}`,
      subject: `${injection}${'S'.repeat(500)}`,
      message: `${injection}${'&'.repeat(5_000)}`,
      extra: [
        {
          name: `${injection}${'&'.repeat(5_000)}`,
          value: `${injection}${'&'.repeat(10_000)}`,
        },
      ],
    };

    const embed = createAgent().buildEmbed(
      Notification.TEST_NOTIFICATION,
      payload
    );
    const mrkdwnText = [
      embed.text,
      ...embed.blocks.flatMap((block) => [
        ...(block.text?.type === 'mrkdwn' ? [block.text.text] : []),
        ...(block.elements ?? []).flatMap((element) =>
          element.type === 'mrkdwn' ? [element.text] : []
        ),
        ...(block.fields ?? []).map((field) => field.text),
      ]),
    ].join('\n');
    assert.doesNotMatch(mrkdwnText, /<!channel>|<@U123>|<https:\/\//);
    assert.match(mrkdwnText, /&lt;!channel&gt;/);
    assert.ok(embed.text.length <= SLACK_FALLBACK_TEXT_LIMIT);

    for (const block of embed.blocks) {
      if (block.type === 'header') {
        assert.ok((block.text?.text.length ?? 0) <= SLACK_HEADER_TEXT_LIMIT);
      }
      if (block.text?.type === 'mrkdwn') {
        assert.ok(block.text.text.length <= SLACK_SECTION_TEXT_LIMIT);
        assert.equal(block.text.verbatim, true);
      }
      for (const field of block.fields ?? []) {
        assert.ok(field.text.length <= SLACK_FIELD_TEXT_LIMIT);
        assert.equal(field.verbatim, true);
      }
    }
  });
});
