import { MediaRequestStatus } from '@server/constants/media';
import { ServiceConfigurationError } from '@server/entity/MediaRequest';
import {
  isSlackUserId,
  isValidSlackRequestActionSettings,
  parseSlackApproverMappings,
  parseSlackRequestActionValue,
  verifySlackRequestSignature,
} from '@server/lib/notifications/slackActions';
import {
  PendingRequestTransitionConflictError,
  PendingRequestTransitionNotFoundError,
  transitionPendingMediaRequest,
} from '@server/lib/requestTransition';
import { getSettings } from '@server/lib/settings';
import { UserMutationActorUnauthorizedError } from '@server/lib/userSecurityMutation';
import logger from '@server/logger';
import { trackBackgroundTask } from '@server/utils/backgroundTasks';
import {
  createSafeHttpRequestOptions,
  createSafeHttpUrl,
  getRateLimitKey,
  stringifySafeHttpUrl,
} from '@server/utils/security';
import axios from 'axios';
import type { RequestHandler } from 'express';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';

const slackActionRoutes = Router();
const SLACK_ACTION_RATE_LIMIT = {
  windowMs: 60 * 1000,
  limit: 60,
} as const;
const SLACK_ACTION_MAX_BODY_BYTES = 32 * 1024;
const SLACK_RESPONSE_URL_MAX_LENGTH = 2048;

const slackActionRateLimit = rateLimit({
  ...SLACK_ACTION_RATE_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
});

type SlackActionRequest = {
  requestId: number;
  status: MediaRequestStatus.APPROVED | MediaRequestStatus.DECLINED;
  managerId: number | undefined;
  responseUrl: string | undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const parseSlackActionRequest = (
  serializedPayload: string,
  workspaceId: string,
  signingSecret: string
): SlackActionRequest | undefined => {
  if (serializedPayload.length > SLACK_ACTION_MAX_BODY_BYTES) {
    return undefined;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(serializedPayload);
  } catch {
    return undefined;
  }
  if (!isRecord(payload) || payload.type !== 'block_actions') {
    return undefined;
  }

  const team = payload.team;
  const user = payload.user;
  const actions = payload.actions;
  if (
    !isRecord(team) ||
    team.id !== workspaceId ||
    !isRecord(user) ||
    !isSlackUserId(user.id) ||
    !Array.isArray(actions) ||
    actions.length !== 1 ||
    !isRecord(actions[0])
  ) {
    return undefined;
  }

  const action = actions[0];
  if (typeof action.action_id !== 'string') {
    return undefined;
  }
  const parsedValue = parseSlackRequestActionValue(
    action.value,
    workspaceId,
    signingSecret
  );
  if (!parsedValue) {
    return undefined;
  }

  const expectedActionId =
    parsedValue.action === 'approve'
      ? 'seerrng-request-approve'
      : 'seerrng-request-decline';
  if (action.action_id !== expectedActionId) {
    return undefined;
  }

  const managerId = parseSlackApproverMappings(
    getSettings().notifications.agents.slack.options.requestManagerMappings
  )?.find((mapping) => mapping.slackUserId === user.id)?.seerrUserId;
  const responseUrl =
    typeof payload.response_url === 'string' &&
    payload.response_url.length <= SLACK_RESPONSE_URL_MAX_LENGTH
      ? payload.response_url
      : undefined;

  return {
    requestId: parsedValue.requestId,
    status:
      parsedValue.action === 'approve'
        ? MediaRequestStatus.APPROVED
        : MediaRequestStatus.DECLINED,
    managerId,
    responseUrl,
  };
};

const sendSlackResponse = async (
  responseUrl: string | undefined,
  message: string,
  replaceOriginal: boolean
): Promise<void> => {
  if (!responseUrl) {
    return;
  }

  let candidate: URL;
  try {
    candidate = new URL(responseUrl);
  } catch {
    return;
  }
  if (
    candidate.protocol !== 'https:' ||
    candidate.hostname !== 'hooks.slack.com' ||
    candidate.port ||
    candidate.username ||
    candidate.password ||
    !/^\/actions\/[A-Za-z0-9._/-]+$/.test(candidate.pathname) ||
    candidate.hash
  ) {
    return;
  }

  const safeUrl = await createSafeHttpUrl(responseUrl);
  if (!safeUrl) {
    return;
  }

  await axios.post(
    stringifySafeHttpUrl(safeUrl),
    {
      text: message,
      response_type: replaceOriginal ? undefined : 'ephemeral',
      replace_original: replaceOriginal,
    },
    {
      ...createSafeHttpRequestOptions(false, false, true, true),
      timeout: 2000,
      maxRedirects: 0,
      maxBodyLength: 2048,
      maxContentLength: 2048,
    }
  );
};

const processSlackAction = async (
  action: SlackActionRequest
): Promise<void> => {
  if (!action.managerId) {
    await sendSlackResponse(
      action.responseUrl,
      'Your Slack account is not mapped to a SeerrNG request manager.',
      false
    );
    return;
  }

  try {
    await transitionPendingMediaRequest(
      action.requestId,
      action.managerId,
      action.status
    );
    const decision =
      action.status === MediaRequestStatus.APPROVED ? 'approved' : 'declined';
    await sendSlackResponse(
      action.responseUrl,
      `Request ${action.requestId} ${decision}.`,
      true
    );
  } catch (error) {
    if (error instanceof UserMutationActorUnauthorizedError) {
      await sendSlackResponse(
        action.responseUrl,
        'Your SeerrNG user no longer has permission to manage requests.',
        false
      );
      return;
    }
    if (error instanceof PendingRequestTransitionConflictError) {
      await sendSlackResponse(
        action.responseUrl,
        'This request has already been reviewed.',
        false
      );
      return;
    }
    if (error instanceof PendingRequestTransitionNotFoundError) {
      await sendSlackResponse(
        action.responseUrl,
        'This request is no longer available.',
        false
      );
      return;
    }
    if (error instanceof ServiceConfigurationError) {
      await sendSlackResponse(
        action.responseUrl,
        'This request cannot be approved because its configured destination is no longer available.',
        false
      );
      return;
    }

    logger.error('Unable to process Slack request action', {
      label: 'Slack Request Actions',
      requestId: action.requestId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    await sendSlackResponse(
      action.responseUrl,
      'SeerrNG could not update this request. Open it in SeerrNG to check its status.',
      false
    );
  }
};

const slackActionHandler: RequestHandler = (req, res) => {
  const settings = getSettings().notifications.agents.slack.options;
  if (
    !settings.requestActionsEnabled ||
    !isValidSlackRequestActionSettings(settings)
  ) {
    return res.sendStatus(404);
  }
  if (!req.is('application/x-www-form-urlencoded')) {
    return res.sendStatus(415);
  }

  const serializedPayload = req.body?.payload;
  if (
    typeof serializedPayload !== 'string' ||
    Buffer.byteLength(serializedPayload, 'utf8') >
      SLACK_ACTION_MAX_BODY_BYTES ||
    !verifySlackRequestSignature(
      req.rawBody,
      req.get('x-slack-signature'),
      req.get('x-slack-request-timestamp'),
      settings.signingSecret!
    )
  ) {
    return res.sendStatus(401);
  }

  const action = parseSlackActionRequest(
    serializedPayload,
    settings.workspaceId!,
    settings.signingSecret!
  );

  res.status(200).end();
  if (action) {
    trackBackgroundTask('Slack request action', () =>
      processSlackAction(action)
    );
  }
};

slackActionRoutes.post(
  '/slack/actions',
  slackActionRateLimit,
  slackActionHandler
);

export default slackActionRoutes;

export { SLACK_ACTION_RATE_LIMIT };
