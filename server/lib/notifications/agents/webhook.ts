import { IssueStatus, IssueType } from '@server/constants/issue';
import { MediaStatus } from '@server/constants/media';
import {
  normalizeExternalBookId,
  normalizeMusicBrainzId,
  normalizeOpenLibraryWorkId,
} from '@server/lib/externalIds';
import { getExternalNotificationAgent } from '@server/lib/externalRuntimeConfig';
import type { NotificationAgentWebhook } from '@server/lib/settings';
import { NotificationAgentKey } from '@server/lib/settings';
import logger from '@server/logger';
import {
  createSafeHttpUrl,
  redactSecrets,
  stringifySafeHttpUrl,
} from '@server/utils/security';
import axios from 'axios';
import { get } from 'lodash';
import { Notification, hasNotificationType } from '..';
import type { NotificationAgent, NotificationPayload } from './agent';
import { BaseAgent, CONFIGURABLE_NOTIFICATION_HTTP_OPTIONS } from './agent';

export const MAX_WEBHOOK_PAYLOAD_BYTES = 64 * 1024;
const MAX_WEBHOOK_PAYLOAD_DEPTH = 32;
const MAX_WEBHOOK_PAYLOAD_NODES = 2_000;
const MAX_WEBHOOK_CUSTOM_HEADERS = 20;
const MAX_WEBHOOK_HEADER_VALUE_LENGTH = 4096;
export const MAX_WEBHOOK_URL_LENGTH = 4096;
const WEBHOOK_HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

type WebhookPayloadTemplate = Record<string, unknown> | unknown[];

const assertWebhookPayloadTemplateBounds = (
  value: unknown,
  depth = 0,
  nodes = { count: 0 }
): void => {
  if (!value || typeof value !== 'object') {
    return;
  }
  if (depth > MAX_WEBHOOK_PAYLOAD_DEPTH) {
    throw new Error('Webhook payload exceeds maximum depth.');
  }
  nodes.count += 1;
  if (nodes.count > MAX_WEBHOOK_PAYLOAD_NODES) {
    throw new Error('Webhook payload exceeds maximum object count.');
  }
  for (const child of Object.values(value)) {
    assertWebhookPayloadTemplateBounds(child, depth + 1, nodes);
  }
};

export const parseWebhookPayloadTemplate = (
  value: unknown
): WebhookPayloadTemplate => {
  if (typeof value !== 'string') {
    throw new Error('Webhook payload must be a JSON string.');
  }
  if (Buffer.byteLength(value, 'utf8') > MAX_WEBHOOK_PAYLOAD_BYTES) {
    throw new Error('Webhook payload is too large.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Webhook payload must be valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Webhook payload root must be an object or array.');
  }
  assertWebhookPayloadTemplateBounds(parsed);
  return parsed as WebhookPayloadTemplate;
};

export const decodeStoredWebhookPayloadTemplate = (
  encoded: unknown
): { raw: string; template: WebhookPayloadTemplate } => {
  if (typeof encoded !== 'string') {
    throw new Error('Stored webhook payload is invalid.');
  }
  const maxEncodedLength =
    Math.ceil((MAX_WEBHOOK_PAYLOAD_BYTES * 2 + 2) / 3) * 4 + 4;
  if (encoded.length > maxEncodedLength) {
    throw new Error('Stored webhook payload is too large.');
  }
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  if (Buffer.byteLength(decoded, 'utf8') > MAX_WEBHOOK_PAYLOAD_BYTES * 2 + 2) {
    throw new Error('Stored webhook payload is too large.');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(decoded);
  } catch {
    throw new Error('Stored webhook payload is invalid.');
  }
  if (typeof raw !== 'string') {
    throw new Error('Stored webhook payload is invalid.');
  }

  return { raw, template: parseWebhookPayloadTemplate(raw) };
};

type KeyMapFunction = (
  payload: NotificationPayload,
  type: Notification
) => string;

const KeyMap: Record<string, string | KeyMapFunction> = {
  notification_type: (_payload, type) => Notification[type],
  event: 'event',
  subject: 'subject',
  message: 'message',
  image: 'image',
  notifyuser_username: 'notifyUser.displayName',
  notifyuser_email: 'notifyUser.email',
  notifyuser_avatar: 'notifyUser.avatar',
  notifyuser_settings_discordIds: 'notifyUser.settings.discordIds',
  notifyuser_settings_telegramChatId: 'notifyUser.settings.telegramChatId',
  media_imdbid: 'media.imdbId',
  media_tmdbid: 'media.tmdbId',
  media_tvdbid: 'media.tvdbId',
  media_mbid: (payload) =>
    payload.media?.mbId ? normalizeMusicBrainzId(payload.media.mbId) : '',
  media_externalid: (payload) => {
    if (payload.media?.mbId) {
      return normalizeMusicBrainzId(payload.media.mbId);
    }

    const canonicalIdentifier = payload.media?.identifiers?.find(
      (identifier) => identifier.canonical
    );

    if (canonicalIdentifier) {
      return normalizeExternalBookId(
        canonicalIdentifier.value,
        canonicalIdentifier.provider
      );
    }

    const externalId = payload.media?.externalServiceId ?? '';

    return String(externalId);
  },
  media_openlibraryid: (payload) =>
    normalizeOpenLibraryWorkId(
      payload.media?.identifiers?.find(
        (identifier) => identifier.provider === 'openlibrary'
      )?.value ?? ''
    ),
  media_isbn: (payload) =>
    payload.media?.identifiers?.find(
      (identifier) => identifier.provider === 'isbn'
    )?.value ?? '',
  media_url: 'mediaUrl',
  media_type: 'media.mediaType',
  media_jellyfinMediaId: (payload) =>
    payload.media?.jellyfinMediaId ?? payload.media?.jellyfinMediaId4k ?? '',
  media_status: (payload) =>
    payload.media ? MediaStatus[payload.media.status] : '',
  media_status4k: (payload) =>
    payload.media ? MediaStatus[payload.media.status4k] : '',
  media_plexRatingKey: (payload) => payload.media?.ratingKey ?? '',
  media_plexRatingKey4k: (payload) => payload.media?.ratingKey4k ?? '',
  request_id: 'request.id',
  requestedBy_jellyfinUserId: 'request.requestedBy.jellyfinUserId',
  requestedBy_username: 'request.requestedBy.displayName',
  requestedBy_email: 'request.requestedBy.email',
  requestedBy_avatar: 'request.requestedBy.avatar',
  requestedBy_settings_discordIds: 'request.requestedBy.settings.discordIds',
  requestedBy_settings_telegramChatId:
    'request.requestedBy.settings.telegramChatId',
  issue_id: 'issue.id',
  issue_type: (payload) =>
    payload.issue ? IssueType[payload.issue.issueType] : '',
  issue_status: (payload) =>
    payload.issue ? IssueStatus[payload.issue.status] : '',
  reportedBy_username: 'issue.createdBy.displayName',
  reportedBy_email: 'issue.createdBy.email',
  reportedBy_avatar: 'issue.createdBy.avatar',
  reportedBy_settings_discordIds: 'issue.createdBy.settings.discordIds',
  reportedBy_settings_telegramChatId: 'issue.createdBy.settings.telegramChatId',
  comment_message: 'comment.message',
  commentedBy_username: 'comment.user.displayName',
  commentedBy_email: 'comment.user.email',
  commentedBy_avatar: 'comment.user.avatar',
  commentedBy_settings_discordIds: 'comment.user.settings.discordIds',
  commentedBy_settings_telegramChatId: 'comment.user.settings.telegramChatId',
};

type WebhookTemplateFilter = (value: string) => string;

const WEBHOOK_TEMPLATE_FILTERS: Record<string, WebhookTemplateFilter> = {
  lowercase: (value) => value.toLowerCase(),
  urlencode: (value) => encodeURIComponent(value),
  slugify: (value) =>
    value
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, ''),
};

const renderWebhookTemplateString = (
  template: string,
  payload: NotificationPayload,
  type: Notification
): string =>
  template.replace(/{{([^{}]+)}}/g, (placeholder, expression: string) => {
    const [variableName, ...filterNames] = expression
      .split('|')
      .map((part) => part.trim());

    if (!variableName || !/^[A-Za-z][A-Za-z0-9_]*$/.test(variableName)) {
      if (expression.includes('|')) {
        throw new Error('Webhook template expression is invalid.');
      }
      return placeholder;
    }

    const variable = Object.prototype.hasOwnProperty.call(KeyMap, variableName)
      ? KeyMap[variableName]
      : undefined;
    if (!variable) {
      if (filterNames.length > 0) {
        throw new Error('Webhook template variable is unknown.');
      }
      return placeholder;
    }

    const variableValue =
      typeof variable === 'function'
        ? variable(payload, type)
        : get(payload, variable);
    let rendered = String(variableValue ?? '');

    for (const filterName of filterNames) {
      const filter = Object.prototype.hasOwnProperty.call(
        WEBHOOK_TEMPLATE_FILTERS,
        filterName
      )
        ? WEBHOOK_TEMPLATE_FILTERS[filterName]
        : undefined;
      if (!filter) {
        throw new Error('Webhook template filter is unknown.');
      }
      rendered = filter(rendered);
    }

    return rendered;
  });

class WebhookAgent
  extends BaseAgent<NotificationAgentWebhook>
  implements NotificationAgent
{
  protected getSettings(): NotificationAgentWebhook {
    if (this.settings) {
      return this.settings;
    }

    return getExternalNotificationAgent(NotificationAgentKey.WEBHOOK);
  }

  private parseKeys(
    finalPayload: Record<string, unknown>,
    payload: NotificationPayload,
    type: Notification,
    options: { depth: number; nodes: { count: number } } = {
      depth: 0,
      nodes: { count: 0 },
    }
  ): Record<string, unknown> {
    if (options.depth > MAX_WEBHOOK_PAYLOAD_DEPTH) {
      throw new Error('Webhook payload exceeds maximum depth.');
    }

    options.nodes.count += 1;
    if (options.nodes.count > MAX_WEBHOOK_PAYLOAD_NODES) {
      throw new Error('Webhook payload exceeds maximum object count.');
    }

    Object.keys(finalPayload).forEach((key) => {
      if (key === '{{extra}}') {
        finalPayload.extra = payload.extra ?? [];
        delete finalPayload[key];
        key = 'extra';
      } else if (key === '{{media}}') {
        if (payload.media) {
          finalPayload.media = finalPayload[key];
        } else {
          finalPayload.media = null;
        }
        delete finalPayload[key];
        key = 'media';
      } else if (key === '{{request}}') {
        if (payload.request) {
          finalPayload.request = finalPayload[key];
        } else {
          finalPayload.request = null;
        }
        delete finalPayload[key];
        key = 'request';
      } else if (key === '{{issue}}') {
        if (payload.issue) {
          finalPayload.issue = finalPayload[key];
        } else {
          finalPayload.issue = null;
        }
        delete finalPayload[key];
        key = 'issue';
      } else if (key === '{{comment}}') {
        if (payload.comment) {
          finalPayload.comment = finalPayload[key];
        } else {
          finalPayload.comment = null;
        }
        delete finalPayload[key];
        key = 'comment';
      }

      if (typeof finalPayload[key] === 'string') {
        finalPayload[key] = renderWebhookTemplateString(
          finalPayload[key] as string,
          payload,
          type
        );
      } else if (finalPayload[key] && typeof finalPayload[key] === 'object') {
        finalPayload[key] = this.parseKeys(
          finalPayload[key] as Record<string, unknown>,
          payload,
          type,
          {
            depth: options.depth + 1,
            nodes: options.nodes,
          }
        );
      }
    });

    return finalPayload;
  }

  private buildPayload(type: Notification, payload: NotificationPayload) {
    const parsedJSON = decodeStoredWebhookPayloadTemplate(
      this.getSettings().options.jsonPayload
    ).template;

    return this.parseKeys(parsedJSON as Record<string, unknown>, payload, type);
  }

  public shouldSend(): boolean {
    const settings = this.getSettings();

    if (settings.enabled && settings.options.webhookUrl) {
      return true;
    }

    return false;
  }

  public async send(
    type: Notification,
    payload: NotificationPayload
  ): Promise<boolean> {
    const settings = this.getSettings();

    if (
      !payload.notifySystem ||
      !hasNotificationType(type, settings.types ?? 0)
    ) {
      return true;
    }

    logger.debug('Sending webhook notification', {
      label: 'Notifications',
      type: Notification[type],
      subject: payload.subject,
    });

    let webhookUrl = settings.options.webhookUrl;

    if (settings.options.supportVariables) {
      Object.keys(KeyMap).forEach((keymapKey) => {
        const keymapValue = KeyMap[keymapKey as keyof typeof KeyMap];
        const variableValue =
          type === Notification.TEST_NOTIFICATION
            ? 'test'
            : typeof keymapValue === 'function'
              ? keymapValue(payload, type)
              : get(payload, keymapValue) || 'test';
        // A literal replacement: no pattern is built from the key, and
        // encodeURIComponent never emits "$", so the value cannot inject a
        // replacement token.
        webhookUrl = webhookUrl.replaceAll(
          `{{${keymapKey}}}`,
          encodeURIComponent(variableValue)
        );
      });
    }

    if (webhookUrl.length > MAX_WEBHOOK_URL_LENGTH) {
      logger.error('Rendered webhook notification URL is too large', {
        label: 'Notifications',
        type: Notification[type],
        subject: payload.subject,
      });
      return false;
    }

    const safeWebhookUrl = await createSafeHttpUrl(webhookUrl, {
      allowPrivateAddresses:
        process.env.SEERR_ALLOW_PRIVATE_NOTIFICATION_URLS === 'true',
    });
    if (!safeWebhookUrl) {
      logger.error('Invalid webhook notification URL', {
        label: 'Notifications',
        type: Notification[type],
        subject: payload.subject,
      });
      return false;
    }

    try {
      const headers: Record<string, string> = {};

      if (settings.options.authHeader) {
        headers.Authorization = settings.options.authHeader;
      }

      if (
        settings.options.customHeaders &&
        settings.options.customHeaders.length > 0
      ) {
        settings.options.customHeaders
          .slice(0, MAX_WEBHOOK_CUSTOM_HEADERS)
          .forEach((header) => {
            const key = header.key?.trim();
            const value = header.value?.trim();

            if (
              key &&
              value &&
              WEBHOOK_HEADER_NAME.test(key) &&
              !/[\r\n]/.test(value) &&
              value.length <= MAX_WEBHOOK_HEADER_VALUE_LENGTH
            ) {
              // Don't override Authorization header if it's already set via authHeader
              if (
                key.toLowerCase() !== 'authorization' ||
                !settings.options.authHeader
              ) {
                headers[key] = value;
              }
            }
          });
      }

      await axios.post(
        stringifySafeHttpUrl(safeWebhookUrl),
        this.buildPayload(type, payload),
        Object.keys(headers).length > 0
          ? { ...CONFIGURABLE_NOTIFICATION_HTTP_OPTIONS, headers }
          : CONFIGURABLE_NOTIFICATION_HTTP_OPTIONS
      );

      return true;
    } catch (e) {
      logger.error('Error sending webhook notification', {
        label: 'Notifications',
        type: Notification[type],
        subject: payload.subject,
        errorMessage: e.message,
        response: redactSecrets(e?.response?.data),
      });

      return false;
    }
  }
}

export default WebhookAgent;
