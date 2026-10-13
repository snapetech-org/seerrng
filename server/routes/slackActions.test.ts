import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';

import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import {
  SLACK_ACTION_CALLBACK_PATH,
  createSlackRequestActionValue,
  isSlackActionCallbackUrl,
} from '@server/lib/notifications/slackActions';
import { getSettings } from '@server/lib/settings';
import csrfProtection from '@server/middleware/csrfProtection';
import { setupTestDb } from '@server/test/db';
import { waitForBackgroundTasks } from '@server/utils/backgroundTasks';
import axios from 'axios';
import type { Express } from 'express';
import express from 'express';
import request from 'supertest';
import slackActionRoutes from './slackActions';

setupTestDb();

const signingSecret = 'slack-action-test-secret-1234567890';
const workspaceId = 'T123456';

let app: Express;
let originalSlackAgent: ReturnType<
  typeof getSettings
>['notifications']['agents']['slack'];

const makeCallbackPayload = (
  requestId: number,
  action: 'approve' | 'decline',
  slackUserId = 'U123456',
  responseUrl?: string
) =>
  JSON.stringify({
    type: 'block_actions',
    team: { id: workspaceId },
    user: { id: slackUserId },
    actions: [
      {
        action_id:
          action === 'approve'
            ? 'seerrng-request-approve'
            : 'seerrng-request-decline',
        value: createSlackRequestActionValue(
          workspaceId,
          requestId,
          action,
          signingSecret
        ),
      },
    ],
    ...(responseUrl ? { response_url: responseUrl } : {}),
  });

const makeSignedBody = (payload: string, timestamp: string) => {
  const body = new URLSearchParams({ payload }).toString();
  const signature = `v0=${createHmac('sha256', signingSecret)
    .update(`v0:${timestamp}:`)
    .update(Buffer.from(body))
    .digest('hex')}`;
  return { body, signature };
};

const createPendingRequest = async (): Promise<MediaRequest> => {
  const userRepository = getRepository(User);
  const mediaRepository = getRepository(Media);
  const requestRepository = getRepository(MediaRequest);
  const requestedBy = await userRepository.findOneOrFail({
    where: { id: 2 },
  });
  const media = await mediaRepository.save(
    new Media({
      mediaType: MediaType.MOVIE,
      tmdbId: 10_001,
      status: MediaStatus.UNKNOWN,
      status4k: MediaStatus.UNKNOWN,
    })
  );
  return requestRepository.save(
    new MediaRequest({
      type: MediaType.MOVIE,
      status: MediaRequestStatus.PENDING,
      media,
      requestedBy,
      is4k: false,
    })
  );
};

before(() => {
  app = express();
  app.use(
    express.urlencoded({
      extended: true,
      verify: (req, _res, buffer) => {
        if (isSlackActionCallbackUrl(req.method, req.url)) {
          req.rawBody = Buffer.from(buffer);
        }
      },
    })
  );
  app.use(csrfProtection());
  app.use('/api/v1/notifications', slackActionRoutes);
  app.use(
    (
      error: { status?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      void _next;
      res.status(error.status ?? 500).json(error);
    }
  );
});

beforeEach(() => {
  const slack = getSettings().notifications.agents.slack;
  originalSlackAgent = structuredClone(slack);
  slack.options = {
    ...slack.options,
    requestActionsEnabled: true,
    workspaceId,
    signingSecret,
    requestManagerMappings: 'U123456=1',
  };
});

afterEach(async () => {
  getSettings().notifications.agents.slack = originalSlackAgent;
  await waitForBackgroundTasks();
});

describe('Slack request action callback', () => {
  it('keeps the callback hidden until enabled and requires form encoding', async () => {
    const settings = getSettings().notifications.agents.slack.options;
    settings.requestActionsEnabled = false;

    const disabled = await request(app)
      .post(SLACK_ACTION_CALLBACK_PATH)
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('payload=ignored');
    assert.strictEqual(disabled.status, 404);

    settings.requestActionsEnabled = true;
    const unsupportedContentType = await request(app)
      .post(SLACK_ACTION_CALLBACK_PATH)
      .set('Content-Type', 'application/json')
      .send({ payload: 'ignored' });
    assert.strictEqual(unsupportedContentType.status, 415);
  });

  it('acknowledges and applies a signed approval through the normal transition', async () => {
    const createdRequest = await createPendingRequest();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const { body, signature } = makeSignedBody(
      makeCallbackPayload(createdRequest.id, 'approve'),
      timestamp
    );

    const response = await request(app)
      .post(SLACK_ACTION_CALLBACK_PATH)
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('X-Slack-Request-Timestamp', timestamp)
      .set('X-Slack-Signature', signature)
      .send(body);

    assert.strictEqual(response.status, 200);
    await waitForBackgroundTasks();
    const updated = await getRepository(MediaRequest).findOneOrFail({
      where: { id: createdRequest.id },
      relations: { modifiedBy: true },
    });
    assert.strictEqual(updated.status, MediaRequestStatus.APPROVED);
    assert.strictEqual(updated.modifiedBy?.id, 1);
  });

  it('acknowledges signed callbacks without a supported action', async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const { body, signature } = makeSignedBody(
      JSON.stringify({ type: 'block_actions', team: { id: workspaceId } }),
      timestamp
    );

    const response = await request(app)
      .post(SLACK_ACTION_CALLBACK_PATH)
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('X-Slack-Request-Timestamp', timestamp)
      .set('X-Slack-Signature', signature)
      .send(body);

    assert.strictEqual(response.status, 200);
    await waitForBackgroundTasks();
  });

  it('acknowledges a valid Slack callback but rechecks mapped-user permission', async () => {
    const settings = getSettings().notifications.agents.slack.options;
    settings.requestManagerMappings = 'U123456=2';
    const createdRequest = await createPendingRequest();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const { body, signature } = makeSignedBody(
      makeCallbackPayload(createdRequest.id, 'decline'),
      timestamp
    );

    const response = await request(app)
      .post(SLACK_ACTION_CALLBACK_PATH)
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('X-Slack-Request-Timestamp', timestamp)
      .set('X-Slack-Signature', signature)
      .send(body);

    assert.strictEqual(response.status, 200);
    await waitForBackgroundTasks();
    const unchanged = await getRepository(MediaRequest).findOneOrFail({
      where: { id: createdRequest.id },
    });
    assert.strictEqual(unchanged.status, MediaRequestStatus.PENDING);
  });

  it('rejects invalid signatures before acknowledging an action', async () => {
    const createdRequest = await createPendingRequest();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const { body } = makeSignedBody(
      makeCallbackPayload(createdRequest.id, 'approve'),
      timestamp
    );

    const response = await request(app)
      .post(SLACK_ACTION_CALLBACK_PATH)
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('X-Slack-Request-Timestamp', timestamp)
      .set('X-Slack-Signature', `v0=${'0'.repeat(64)}`)
      .send(body);

    assert.strictEqual(response.status, 401);
    await waitForBackgroundTasks();
    const unchanged = await getRepository(MediaRequest).findOneOrFail({
      where: { id: createdRequest.id },
    });
    assert.strictEqual(unchanged.status, MediaRequestStatus.PENDING);
  });

  it('does not post a Slack response to a callback-supplied URL outside Slack', async () => {
    const post = mock.method(axios, 'post', async () => ({ status: 200 }));
    const createdRequest = await createPendingRequest();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const { body, signature } = makeSignedBody(
      makeCallbackPayload(
        createdRequest.id,
        'approve',
        'U123456',
        'http://127.0.0.1/admin'
      ),
      timestamp
    );

    const response = await request(app)
      .post(SLACK_ACTION_CALLBACK_PATH)
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('X-Slack-Request-Timestamp', timestamp)
      .set('X-Slack-Signature', signature)
      .send(body);

    assert.strictEqual(response.status, 200);
    await waitForBackgroundTasks();
    assert.strictEqual(post.mock.callCount(), 0);
  });
});
