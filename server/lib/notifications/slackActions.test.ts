import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  SLACK_ACTION_CALLBACK_PATH,
  createSlackRequestActionValue,
  isSlackActionCallbackRequest,
  isSlackActionCallbackUrl,
  isValidSlackRequestActionSettings,
  parseSlackApproverMappings,
  parseSlackRequestActionValue,
  verifySlackRequestSignature,
} from './slackActions';

const signingSecret = 'a'.repeat(32);

describe('Slack request action security', () => {
  it('parses unique Slack user to SeerrNG manager mappings', () => {
    assert.deepStrictEqual(parseSlackApproverMappings('U123=4\nU456 = 9'), [
      { slackUserId: 'U123', seerrUserId: 4 },
      { slackUserId: 'U456', seerrUserId: 9 },
    ]);
    assert.equal(parseSlackApproverMappings('U123=4\nU123=5'), undefined);
    assert.equal(parseSlackApproverMappings('U123=0'), undefined);
    assert.deepStrictEqual(parseSlackApproverMappings('U123=2147483647'), [
      { slackUserId: 'U123', seerrUserId: 2_147_483_647 },
    ]);
    assert.equal(parseSlackApproverMappings('U123=2147483648'), undefined);
    assert.equal(parseSlackApproverMappings('U123=4\ninvalid'), undefined);
  });

  it('requires a complete configuration only when actions are enabled', () => {
    assert.equal(isValidSlackRequestActionSettings({}), true);
    assert.equal(
      isValidSlackRequestActionSettings({
        requestActionsEnabled: true,
        workspaceId: 'T123',
        signingSecret,
        requestManagerMappings: 'U123=4',
      }),
      true
    );
    assert.equal(
      isValidSlackRequestActionSettings({
        requestActionsEnabled: true,
        workspaceId: 'T123',
        signingSecret: 'short',
        requestManagerMappings: 'U123=4',
      }),
      false
    );
  });

  it('verifies Slack signatures against raw bytes and rejects stale payloads', () => {
    const timestamp = '1700000000';
    const nowMs = Number(timestamp) * 1000;
    const rawBody = Buffer.from([
      0x70, 0x61, 0x79, 0x6c, 0x6f, 0x61, 0x64, 0xff,
    ]);
    const signature = `v0=${createHmac('sha256', signingSecret)
      .update(`v0:${timestamp}:`)
      .update(rawBody)
      .digest('hex')}`;

    assert.equal(
      verifySlackRequestSignature(
        rawBody,
        signature,
        timestamp,
        signingSecret,
        nowMs
      ),
      true
    );
    assert.equal(
      verifySlackRequestSignature(
        rawBody,
        signature,
        timestamp,
        signingSecret,
        nowMs + 5 * 60 * 1000 + 1
      ),
      false
    );
    assert.equal(
      verifySlackRequestSignature(
        Buffer.from('changed'),
        signature,
        timestamp,
        signingSecret,
        nowMs
      ),
      false
    );
  });

  it('binds each action value to its workspace, request, and decision', () => {
    const value = createSlackRequestActionValue(
      'T123',
      25,
      'approve',
      signingSecret
    );
    assert.ok(value);
    assert.deepStrictEqual(
      parseSlackRequestActionValue(value, 'T123', signingSecret),
      { requestId: 25, action: 'approve' }
    );
    assert.equal(
      parseSlackRequestActionValue(value, 'T456', signingSecret),
      undefined
    );
    assert.equal(
      parseSlackRequestActionValue(
        value.replace('.approve.', '.decline.'),
        'T123',
        signingSecret
      ),
      undefined
    );
    const largestDatabaseId = createSlackRequestActionValue(
      'T123',
      2_147_483_647,
      'approve',
      signingSecret
    );
    assert.ok(largestDatabaseId);
    assert.equal(
      createSlackRequestActionValue(
        'T123',
        2_147_483_648,
        'approve',
        signingSecret
      ),
      undefined
    );
  });

  it('matches only the exact callback path for the signed POST exemption', () => {
    assert.equal(
      isSlackActionCallbackRequest({
        method: 'POST',
        path: SLACK_ACTION_CALLBACK_PATH,
      }),
      true
    );
    assert.equal(
      isSlackActionCallbackUrl('POST', `${SLACK_ACTION_CALLBACK_PATH}?extra=1`),
      true
    );
    assert.equal(
      isSlackActionCallbackUrl('POST', `${SLACK_ACTION_CALLBACK_PATH}/other`),
      false
    );
    assert.equal(
      isSlackActionCallbackUrl('GET', SLACK_ACTION_CALLBACK_PATH),
      false
    );
  });
});
