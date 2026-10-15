import { safeStringEqual } from '@server/utils/security';
import { createHmac } from 'node:crypto';

export const SLACK_ACTION_CALLBACK_PATH = '/api/v1/notifications/slack/actions';
export const SLACK_ACTION_REQUEST_FRESHNESS_MS = 5 * 60 * 1000;
const MAX_SLACK_ACTION_ENTITY_ID = 2_147_483_647;
const MAX_SLACK_ACTION_MAPPINGS = 100;
const MIN_SLACK_SIGNING_SECRET_LENGTH = 32;
const MAX_SLACK_SIGNING_SECRET_LENGTH = 256;
const SLACK_ID_PATTERN = /^[A-Z0-9]{2,64}$/;

const isValidSlackSigningSecret = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length >= MIN_SLACK_SIGNING_SECRET_LENGTH &&
  value.length <= MAX_SLACK_SIGNING_SECRET_LENGTH;

export type SlackRequestAction = 'approve' | 'decline';

export interface SlackApproverMapping {
  slackUserId: string;
  seerrUserId: number;
}

export interface SlackRequestActionSettings {
  requestActionsEnabled?: boolean;
  workspaceId?: string;
  signingSecret?: string;
  requestManagerMappings?: string;
}

export const isSlackWorkspaceId = (value: unknown): value is string =>
  typeof value === 'string' && SLACK_ID_PATTERN.test(value);

export const isSlackUserId = (value: unknown): value is string =>
  typeof value === 'string' && SLACK_ID_PATTERN.test(value);

export const parseSlackApproverMappings = (
  value: unknown
): SlackApproverMapping[] | undefined => {
  if (typeof value !== 'string' || value.length > 4096) {
    return undefined;
  }

  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > MAX_SLACK_ACTION_MAPPINGS) {
    return undefined;
  }

  const seenSlackUsers = new Set<string>();
  const mappings: SlackApproverMapping[] = [];
  for (const line of lines) {
    const match = /^([A-Z0-9]{2,64})\s*=\s*([1-9]\d{0,9})$/.exec(line);
    if (!match) {
      return undefined;
    }

    const [, slackUserId, rawSeerrUserId] = match;
    const seerrUserId = Number(rawSeerrUserId);
    if (
      !isSlackUserId(slackUserId) ||
      !Number.isSafeInteger(seerrUserId) ||
      seerrUserId > MAX_SLACK_ACTION_ENTITY_ID ||
      seenSlackUsers.has(slackUserId)
    ) {
      return undefined;
    }

    seenSlackUsers.add(slackUserId);
    mappings.push({ slackUserId, seerrUserId });
  }

  return mappings;
};

export const isValidSlackRequestActionSettings = (
  settings: SlackRequestActionSettings
): boolean => {
  if (!settings.requestActionsEnabled) {
    return true;
  }

  return (
    isSlackWorkspaceId(settings.workspaceId) &&
    isValidSlackSigningSecret(settings.signingSecret) &&
    (parseSlackApproverMappings(settings.requestManagerMappings)?.length ?? 0) >
      0
  );
};

export const isSlackActionCallbackRequest = (request: {
  method: string;
  path: string;
}): boolean =>
  request.method.toUpperCase() === 'POST' &&
  request.path === SLACK_ACTION_CALLBACK_PATH;

export const isSlackActionCallbackUrl = (
  method: string | undefined,
  requestUrl: string | undefined
): boolean =>
  method?.toUpperCase() === 'POST' &&
  requestUrl?.split('?', 1)[0] === SLACK_ACTION_CALLBACK_PATH;

const createSlackRequestSignature = (
  timestamp: string,
  rawBody: Buffer,
  signingSecret: string
): string => {
  const hmac = createHmac('sha256', signingSecret);
  hmac.update(`v0:${timestamp}:`);
  hmac.update(rawBody);
  return `v0=${hmac.digest('hex')}`;
};

export const verifySlackRequestSignature = (
  rawBody: Buffer | undefined,
  signature: string | undefined,
  timestamp: string | undefined,
  signingSecret: string,
  nowMs = Date.now()
): boolean => {
  if (
    !Buffer.isBuffer(rawBody) ||
    typeof signature !== 'string' ||
    !/^v0=[a-f0-9]{64}$/.test(signature) ||
    typeof timestamp !== 'string' ||
    !/^\d{1,12}$/.test(timestamp) ||
    !isValidSlackSigningSecret(signingSecret)
  ) {
    return false;
  }

  const timestampMs = Number(timestamp) * 1000;
  if (
    !Number.isSafeInteger(timestampMs) ||
    Math.abs(nowMs - timestampMs) > SLACK_ACTION_REQUEST_FRESHNESS_MS
  ) {
    return false;
  }

  return safeStringEqual(
    createSlackRequestSignature(timestamp, rawBody, signingSecret),
    signature
  );
};

const createActionValueSignature = (
  workspaceId: string,
  requestId: number,
  action: SlackRequestAction,
  signingSecret: string
): string => {
  const key = createHmac('sha256', signingSecret)
    .update('seerrng/slack-request-action/v1')
    .digest();
  return createHmac('sha256', key)
    .update(`v1:${workspaceId}:${requestId}:${action}`)
    .digest('hex');
};

export const createSlackRequestActionValue = (
  workspaceId: string,
  requestId: number,
  action: SlackRequestAction,
  signingSecret: string
): string | undefined => {
  if (
    !isSlackWorkspaceId(workspaceId) ||
    !Number.isSafeInteger(requestId) ||
    requestId <= 0 ||
    requestId > MAX_SLACK_ACTION_ENTITY_ID ||
    !['approve', 'decline'].includes(action) ||
    !isValidSlackSigningSecret(signingSecret)
  ) {
    return undefined;
  }

  return `v1.${requestId}.${action}.${createActionValueSignature(
    workspaceId,
    requestId,
    action,
    signingSecret
  )}`;
};

export const parseSlackRequestActionValue = (
  value: unknown,
  workspaceId: string,
  signingSecret: string
): { requestId: number; action: SlackRequestAction } | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const match = /^v1\.([1-9]\d{0,9})\.(approve|decline)\.([a-f0-9]{64})$/.exec(
    value
  );
  if (
    !match ||
    !isSlackWorkspaceId(workspaceId) ||
    !isValidSlackSigningSecret(signingSecret)
  ) {
    return undefined;
  }

  const requestId = Number(match[1]);
  const action = match[2] as SlackRequestAction;
  if (requestId > MAX_SLACK_ACTION_ENTITY_ID) {
    return undefined;
  }

  const expectedSignature = createActionValueSignature(
    workspaceId,
    requestId,
    action,
    signingSecret
  );
  if (!safeStringEqual(expectedSignature, match[3])) {
    return undefined;
  }

  return { requestId, action };
};
