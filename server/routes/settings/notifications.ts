import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { defineMessages, getIntl } from '@server/i18n';
import { getExternalRuntimeConfig } from '@server/lib/externalRuntimeConfig';
import { Notification } from '@server/lib/notifications';
import type { NotificationAgent } from '@server/lib/notifications/agents/agent';
import AppriseAgent from '@server/lib/notifications/agents/apprise';
import DiscordAgent from '@server/lib/notifications/agents/discord';
import EmailAgent from '@server/lib/notifications/agents/email';
import GotifyAgent from '@server/lib/notifications/agents/gotify';
import NtfyAgent from '@server/lib/notifications/agents/ntfy';
import PushbulletAgent from '@server/lib/notifications/agents/pushbullet';
import PushoverAgent from '@server/lib/notifications/agents/pushover';
import SlackAgent from '@server/lib/notifications/agents/slack';
import TelegramAgent from '@server/lib/notifications/agents/telegram';
import WebhookAgent, {
  decodeStoredWebhookPayloadTemplate,
  parseWebhookPayloadTemplate,
} from '@server/lib/notifications/agents/webhook';
import WebPushAgent from '@server/lib/notifications/agents/webpush';
import {
  isValidSlackRequestActionSettings,
  parseSlackApproverMappings,
} from '@server/lib/notifications/slackActions';
import { Permission } from '@server/lib/permissions';
import {
  getSettings,
  type NotificationAgentApprise,
  type NotificationAgentConfig,
  type NotificationAgentDiscord,
  type NotificationAgentEmail,
  type NotificationAgentGotify,
  type NotificationAgentNtfy,
  type NotificationAgentPushbullet,
  type NotificationAgentPushover,
  type NotificationAgentSlack,
  type NotificationAgentTelegram,
  type NotificationAgentWebhook,
} from '@server/lib/settings';
import logger from '@server/logger';
import { authorizedMutation } from '@server/middleware/authorizedMutation';
import {
  isAvailableLocale,
  type AvailableLocale,
} from '@server/types/languages';
import {
  REDACTED_SECRET,
  isSafeHttpUrl,
  preserveRedactedSecrets,
  redactSecrets,
} from '@server/utils/security';
import {
  parseOptionalBodyBoolean,
  parseOptionalNonNegativeInteger,
} from '@server/utils/validation';
import type { RequestHandler } from 'express';
import { Router } from 'express';
import { In } from 'typeorm';

const notificationRoutes = Router();
const adminPost = (path: string, handler: RequestHandler) =>
  notificationRoutes.post(path, authorizedMutation(Permission.ADMIN, handler));
const MAX_WEBHOOK_CUSTOM_HEADERS = 20;
const MAX_WEBHOOK_HEADER_VALUE_LENGTH = 4096;
const MAX_NOTIFICATION_OPTION_STRING_LENGTH = 4096;
const MAX_NOTIFICATION_TYPES = 0x7fffffff;
const MAX_NOTIFICATION_PRIORITY = 1000;
const MAX_PORT = 65_535;
const MAX_PGP_PRIVATE_KEY_LENGTH = 128 * 1024;
const WEBHOOK_HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

const messages = defineMessages('notifications.test', {
  subject: 'Test Notification',
  message: 'Check check, 1, 2, 3. Are we coming in clear?',
});

type RouteError = { status: number; message: string };
type UrlNotificationBody = {
  enabled: boolean;
  embedPoster: boolean;
  types: number;
  options: Record<string, unknown> & { url: string };
};

type WebhookUrlNotificationBody = {
  enabled: boolean;
  embedPoster: boolean;
  types: number;
  options: Record<string, unknown> & { webhookUrl: string };
};

type UrlNotificationSchema = {
  booleanOptions?: readonly string[];
  priority?: boolean;
  stringOptions?: readonly string[];
};

type WebhookUrlNotificationSchema = {
  booleanOptions?: readonly string[];
  stringOptions?: readonly string[];
};

const DISCORD_NOTIFICATION_SCHEMA = {
  stringOptions: ['botUsername', 'botAvatarUrl', 'webhookRoleId', 'locale'],
  booleanOptions: ['enableMentions', 'useUserLocale'],
} as const satisfies WebhookUrlNotificationSchema;
const SLACK_NOTIFICATION_SCHEMA = {
  stringOptions: [
    'locale',
    'workspaceId',
    'signingSecret',
    'requestManagerMappings',
  ],
  booleanOptions: ['requestActionsEnabled'],
} as const satisfies WebhookUrlNotificationSchema;
const GOTIFY_NOTIFICATION_SCHEMA = {
  stringOptions: ['token', 'locale'],
  priority: true,
} as const satisfies UrlNotificationSchema;
const APPRISE_NOTIFICATION_SCHEMA = {
  stringOptions: ['configKey', 'tag', 'locale', 'username', 'password'],
  booleanOptions: ['authMethodUsernamePassword'],
} as const satisfies UrlNotificationSchema;
const NTFY_NOTIFICATION_SCHEMA = {
  stringOptions: ['topic', 'locale', 'username', 'password', 'token'],
  booleanOptions: ['authMethodUsernamePassword', 'authMethodToken'],
  priority: true,
} as const satisfies UrlNotificationSchema;

type GenericNotificationBody = {
  enabled: boolean;
  embedPoster: boolean;
  types?: number;
  options: Record<string, unknown>;
};

type GenericNotificationSchema = {
  booleanOptions?: readonly string[];
  numberOptions?: readonly string[];
  optionalStringOptions?: readonly {
    maxLength?: number;
    name: string;
  }[];
  requiredStringOptions?: readonly string[];
  typesRequired?: boolean;
};

type NotificationAgents = ReturnType<
  typeof getSettings
>['notifications']['agents'];

export const persistNotificationAgent = async <
  K extends keyof NotificationAgents,
>(
  key: K,
  value: NotificationAgents[K]
): Promise<NotificationAgents[K]> => {
  const settings = getSettings();
  const notifications = await settings.persistSection(
    'notifications',
    (current) => ({
      ...current,
      // Resolve redaction placeholders only after the settings file has been
      // refreshed under its write lock. Resolving them against an earlier
      // process-local snapshot can resurrect a credential another instance
      // rotated while this request was being validated.
      agents: {
        ...current.agents,
        [key]: preserveRedactedSecrets(value, current.agents[key]),
      },
    })
  );
  return notifications.agents[key];
};

const sendTestNotification = async (agent: NotificationAgent, user: User) => {
  const intl = getIntl(user.settings?.locale as AvailableLocale);

  return await agent.send(Notification.TEST_NOTIFICATION, {
    notifySystem: true,
    notifyAdmin: false,
    notifyUser: user,
    subject: intl.formatMessage(messages.subject),
    message: intl.formatMessage(messages.message),
  });
};

const validateWebhookPayload = (value: unknown) => {
  try {
    parseWebhookPayloadTemplate(value);
  } catch (error) {
    return {
      status: 400,
      message:
        error instanceof Error ? error.message : 'Webhook payload is invalid.',
    };
  }
};

const validateWebhookHeaders = (
  headers: unknown
): { status: number; message: string } | undefined => {
  if (headers === undefined) {
    return;
  }

  if (!Array.isArray(headers)) {
    return { status: 400, message: 'Webhook custom headers must be an array.' };
  }

  if (headers.length > MAX_WEBHOOK_CUSTOM_HEADERS) {
    return { status: 400, message: 'Too many webhook custom headers.' };
  }

  for (const header of headers) {
    if (!header || typeof header !== 'object') {
      return { status: 400, message: 'Invalid webhook custom header.' };
    }

    const { key, value } = header as { key?: unknown; value?: unknown };
    if (typeof key !== 'string' || typeof value !== 'string') {
      return { status: 400, message: 'Invalid webhook custom header.' };
    }

    if (
      !WEBHOOK_HEADER_NAME.test(key.trim()) ||
      /[\r\n]/.test(value) ||
      value.length > MAX_WEBHOOK_HEADER_VALUE_LENGTH
    ) {
      return { status: 400, message: 'Invalid webhook custom header.' };
    }
  }
};

export const redactWebhookCustomHeaders = (
  headers: { key: string; value: string }[] | undefined
): { key: string; value: string }[] =>
  (headers ?? []).map((header) => ({
    key: header.key,
    value: header.value ? REDACTED_SECRET : header.value,
  }));

const parseWebhookBody = (body: unknown) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      error: { status: 400, message: 'Webhook settings must be an object.' },
    };
  }

  const value = body as {
    enabled?: unknown;
    embedPoster?: unknown;
    types?: unknown;
    options?: unknown;
  };
  const enabled = parseOptionalBodyBoolean(value.enabled, 'Enabled');
  if ('error' in enabled) {
    return { error: { status: 400, message: enabled.error } };
  }
  const embedPoster = parseOptionalBodyBoolean(
    value.embedPoster,
    'Embed poster'
  );
  if ('error' in embedPoster) {
    return { error: { status: 400, message: embedPoster.error } };
  }
  const types = parseOptionalNonNegativeInteger(
    value.types,
    MAX_NOTIFICATION_TYPES
  );
  if (types === undefined) {
    return {
      error: { status: 400, message: 'Notification types must be valid.' },
    };
  }
  if (
    !value.options ||
    typeof value.options !== 'object' ||
    Array.isArray(value.options)
  ) {
    return {
      error: { status: 400, message: 'Webhook options must be an object.' },
    };
  }

  const options = value.options as {
    jsonPayload?: unknown;
    webhookUrl?: unknown;
    authHeader?: unknown;
    customHeaders?: unknown;
    supportVariables?: unknown;
  };
  const supportVariables = parseOptionalBodyBoolean(
    options.supportVariables,
    'Support variables'
  );
  if ('error' in supportVariables) {
    return { error: { status: 400, message: supportVariables.error } };
  }
  if (typeof options.webhookUrl !== 'string') {
    return { error: { status: 400, message: 'Webhook URL must be a string.' } };
  }
  if (options.webhookUrl.length > MAX_NOTIFICATION_OPTION_STRING_LENGTH) {
    return {
      error: {
        status: 400,
        message: `Webhook URL must be ${MAX_NOTIFICATION_OPTION_STRING_LENGTH} characters or fewer.`,
      },
    };
  }
  if (
    options.authHeader !== undefined &&
    typeof options.authHeader !== 'string'
  ) {
    return { error: { status: 400, message: 'Auth header must be a string.' } };
  }
  if (
    typeof options.authHeader === 'string' &&
    options.authHeader.length > MAX_WEBHOOK_HEADER_VALUE_LENGTH
  ) {
    return {
      error: {
        status: 400,
        message: `Auth header must be ${MAX_WEBHOOK_HEADER_VALUE_LENGTH} characters or fewer.`,
      },
    };
  }
  let customHeaders: { key: string; value: string }[] | undefined;
  if (options.customHeaders !== undefined) {
    if (!Array.isArray(options.customHeaders)) {
      return {
        error: {
          status: 400,
          message: 'Webhook custom headers must be an array.',
        },
      };
    }

    customHeaders = [];
    for (const header of options.customHeaders) {
      if (!header || typeof header !== 'object') {
        return {
          error: { status: 400, message: 'Invalid webhook custom header.' },
        };
      }
      const { key, value } = header as { key?: unknown; value?: unknown };
      if (typeof key !== 'string' || typeof value !== 'string') {
        return {
          error: { status: 400, message: 'Invalid webhook custom header.' },
        };
      }
      customHeaders.push({ key, value });
    }
  }

  const parsedWebhook: NotificationAgentWebhook = {
    enabled: enabled.value ?? false,
    embedPoster: embedPoster.value ?? false,
    types,
    options: {
      jsonPayload: options.jsonPayload as string,
      webhookUrl: options.webhookUrl,
      authHeader: options.authHeader,
      customHeaders,
      supportVariables: supportVariables.value ?? false,
    },
  };

  return {
    value: parsedWebhook,
  };
};

const parseUrlNotificationBody = (
  body: unknown,
  label: string,
  schema: UrlNotificationSchema
): { value: UrlNotificationBody } | { error: RouteError } => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      error: { status: 400, message: `${label} settings must be an object.` },
    };
  }

  const value = body as {
    enabled?: unknown;
    embedPoster?: unknown;
    types?: unknown;
    options?: unknown;
  };
  const enabled = parseOptionalBodyBoolean(value.enabled, 'Enabled');
  if ('error' in enabled) {
    return { error: { status: 400, message: enabled.error } };
  }
  const embedPoster = parseOptionalBodyBoolean(
    value.embedPoster,
    'Embed poster'
  );
  if ('error' in embedPoster) {
    return { error: { status: 400, message: embedPoster.error } };
  }
  const types = parseOptionalNonNegativeInteger(
    value.types,
    MAX_NOTIFICATION_TYPES
  );
  if (types === undefined) {
    return {
      error: { status: 400, message: 'Notification types must be valid.' },
    };
  }
  if (
    !value.options ||
    typeof value.options !== 'object' ||
    Array.isArray(value.options)
  ) {
    return {
      error: { status: 400, message: `${label} options must be an object.` },
    };
  }

  const options = value.options as Record<string, unknown>;
  if (typeof options.url !== 'string') {
    return {
      error: { status: 400, message: `${label} URL must be a string.` },
    };
  }
  if (options.url.length > MAX_NOTIFICATION_OPTION_STRING_LENGTH) {
    return {
      error: {
        status: 400,
        message: `${label} URL must be ${MAX_NOTIFICATION_OPTION_STRING_LENGTH} characters or fewer.`,
      },
    };
  }

  const validateOptionalString = (option: string) => {
    const optionValue = options[option];
    if (optionValue === undefined || optionValue === null) {
      return;
    }
    if (typeof optionValue !== 'string') {
      return {
        status: 400,
        message: `${label} ${option} must be a string.`,
      };
    }
    if (option === 'locale' && !isAvailableLocale(optionValue)) {
      return {
        status: 400,
        message: `${label} locale must be a supported locale.`,
      };
    }
    if (optionValue.length > MAX_NOTIFICATION_OPTION_STRING_LENGTH) {
      return {
        status: 400,
        message: `${label} ${option} must be ${MAX_NOTIFICATION_OPTION_STRING_LENGTH} characters or fewer.`,
      };
    }
  };

  const validateOptionalBoolean = (option: string) => {
    const optionValue = options[option];
    if (optionValue === undefined || optionValue === null) {
      return;
    }
    if (typeof optionValue !== 'boolean') {
      return {
        status: 400,
        message: `${label} ${option} must be a boolean.`,
      };
    }
  };

  const validateOptionalPriority = () => {
    const optionValue = options.priority;
    if (optionValue === undefined || optionValue === null) {
      return;
    }
    if (
      typeof optionValue !== 'number' ||
      !Number.isInteger(optionValue) ||
      optionValue < 0 ||
      optionValue > MAX_NOTIFICATION_PRIORITY
    ) {
      return {
        status: 400,
        message: `${label} priority must be an integer between 0 and ${MAX_NOTIFICATION_PRIORITY}.`,
      };
    }
  };

  const optionErrors = [
    ...(schema.stringOptions ?? []).map(validateOptionalString),
    ...(schema.booleanOptions ?? []).map(validateOptionalBoolean),
    ...(schema.priority ? [validateOptionalPriority()] : []),
  ].filter(Boolean);
  if (optionErrors.length > 0) {
    return { error: optionErrors[0] as RouteError };
  }

  const parsedOptions: Record<string, unknown> = { url: options.url };
  for (const option of schema.stringOptions ?? []) {
    if (typeof options[option] === 'string') {
      parsedOptions[option] = options[option];
    }
  }
  for (const option of schema.booleanOptions ?? []) {
    if (typeof options[option] === 'boolean') {
      parsedOptions[option] = options[option];
    }
  }
  if (schema.priority && typeof options.priority === 'number') {
    parsedOptions.priority = options.priority;
  }

  return {
    value: {
      enabled: enabled.value ?? false,
      embedPoster: embedPoster.value ?? false,
      types,
      options: parsedOptions as Record<string, unknown> & { url: string },
    },
  };
};

const parseGenericNotificationBody = (
  body: unknown,
  label: string,
  schema: GenericNotificationSchema = {}
): { value: GenericNotificationBody } | { error: RouteError } => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      error: { status: 400, message: `${label} settings must be an object.` },
    };
  }

  const value = body as {
    enabled?: unknown;
    embedPoster?: unknown;
    types?: unknown;
    options?: unknown;
  };
  const enabled = parseOptionalBodyBoolean(value.enabled, 'Enabled');
  if ('error' in enabled) {
    return { error: { status: 400, message: enabled.error } };
  }
  const embedPoster = parseOptionalBodyBoolean(
    value.embedPoster,
    'Embed poster'
  );
  if ('error' in embedPoster) {
    return { error: { status: 400, message: embedPoster.error } };
  }
  const types =
    value.types === undefined && schema.typesRequired === false
      ? undefined
      : parseOptionalNonNegativeInteger(value.types, MAX_NOTIFICATION_TYPES);
  if (
    types === undefined &&
    (schema.typesRequired !== false || value.types !== undefined)
  ) {
    return {
      error: { status: 400, message: 'Notification types must be valid.' },
    };
  }
  if (
    !value.options ||
    typeof value.options !== 'object' ||
    Array.isArray(value.options)
  ) {
    return {
      error: { status: 400, message: `${label} options must be an object.` },
    };
  }

  const rawOptions = value.options as Record<string, unknown>;
  const options: Record<string, unknown> = {};
  for (const option of schema.requiredStringOptions ?? []) {
    const optionValue = rawOptions[option];
    if (typeof optionValue !== 'string') {
      return {
        error: {
          status: 400,
          message: `${label} ${option} must be a string.`,
        },
      };
    }
    if (option === 'locale' && !isAvailableLocale(optionValue)) {
      return {
        error: {
          status: 400,
          message: `${label} locale must be a supported locale.`,
        },
      };
    }

    if (optionValue.length > MAX_NOTIFICATION_OPTION_STRING_LENGTH) {
      return {
        error: {
          status: 400,
          message: `${label} ${option} must be ${MAX_NOTIFICATION_OPTION_STRING_LENGTH} characters or fewer.`,
        },
      };
    }
    options[option] = optionValue;
  }
  for (const option of schema.optionalStringOptions ?? []) {
    const optionValue = rawOptions[option.name];
    if (optionValue === undefined) {
      continue;
    }
    if (typeof optionValue !== 'string') {
      return {
        error: {
          status: 400,
          message: `${label} ${option.name} must be a string.`,
        },
      };
    }
    if (option.name === 'locale' && !isAvailableLocale(optionValue)) {
      return {
        error: {
          status: 400,
          message: `${label} locale must be a supported locale.`,
        },
      };
    }
    const maxLength = option.maxLength ?? MAX_NOTIFICATION_OPTION_STRING_LENGTH;
    if (optionValue.length > maxLength) {
      return {
        error: {
          status: 400,
          message: `${label} ${option.name} must be ${maxLength} characters or fewer.`,
        },
      };
    }
    options[option.name] = optionValue;
  }
  for (const option of schema.booleanOptions ?? []) {
    const optionValue = rawOptions[option];
    if (typeof optionValue !== 'boolean') {
      return {
        error: {
          status: 400,
          message: `${label} ${option} must be a boolean.`,
        },
      };
    }
    options[option] = optionValue;
  }
  for (const option of schema.numberOptions ?? []) {
    const optionValue = rawOptions[option];
    if (
      typeof optionValue !== 'number' ||
      !Number.isInteger(optionValue) ||
      optionValue < 1 ||
      optionValue > MAX_PORT
    ) {
      return {
        error: {
          status: 400,
          message: `${label} ${option} must be an integer between 1 and 65535.`,
        },
      };
    }
    options[option] = optionValue;
  }

  return {
    value: {
      enabled: enabled.value ?? false,
      embedPoster: embedPoster.value ?? false,
      ...(types === undefined ? {} : { types }),
      options,
    },
  };
};

const parseWebhookUrlNotificationBody = (
  body: unknown,
  label: string,
  schema: WebhookUrlNotificationSchema
): { value: WebhookUrlNotificationBody } | { error: RouteError } => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      error: { status: 400, message: `${label} settings must be an object.` },
    };
  }

  const value = body as {
    enabled?: unknown;
    embedPoster?: unknown;
    types?: unknown;
    options?: unknown;
  };
  const enabled = parseOptionalBodyBoolean(value.enabled, 'Enabled');
  if ('error' in enabled) {
    return { error: { status: 400, message: enabled.error } };
  }
  const embedPoster = parseOptionalBodyBoolean(
    value.embedPoster,
    'Embed poster'
  );
  if ('error' in embedPoster) {
    return { error: { status: 400, message: embedPoster.error } };
  }
  const types = parseOptionalNonNegativeInteger(
    value.types,
    MAX_NOTIFICATION_TYPES
  );
  if (types === undefined) {
    return {
      error: { status: 400, message: 'Notification types must be valid.' },
    };
  }
  if (
    !value.options ||
    typeof value.options !== 'object' ||
    Array.isArray(value.options)
  ) {
    return {
      error: { status: 400, message: `${label} options must be an object.` },
    };
  }

  const options = value.options as Record<string, unknown>;
  if (typeof options.webhookUrl !== 'string') {
    return {
      error: { status: 400, message: `${label} webhook URL must be a string.` },
    };
  }
  if (options.webhookUrl.length > MAX_NOTIFICATION_OPTION_STRING_LENGTH) {
    return {
      error: {
        status: 400,
        message: `${label} webhook URL must be ${MAX_NOTIFICATION_OPTION_STRING_LENGTH} characters or fewer.`,
      },
    };
  }

  const parsedOptions: Record<string, unknown> = {
    webhookUrl: options.webhookUrl,
  };
  for (const option of schema.stringOptions ?? []) {
    const optionValue = options[option];
    if (optionValue === undefined || optionValue === null) {
      continue;
    }
    if (typeof optionValue !== 'string') {
      return {
        error: {
          status: 400,
          message: `${label} ${option} must be a string.`,
        },
      };
    }
    if (option === 'locale' && !isAvailableLocale(optionValue)) {
      return {
        error: {
          status: 400,
          message: `${label} locale must be a supported locale.`,
        },
      };
    }
    if (optionValue.length > MAX_NOTIFICATION_OPTION_STRING_LENGTH) {
      return {
        error: {
          status: 400,
          message: `${label} ${option} must be ${MAX_NOTIFICATION_OPTION_STRING_LENGTH} characters or fewer.`,
        },
      };
    }
    parsedOptions[option] = optionValue;
  }
  for (const option of schema.booleanOptions ?? []) {
    const optionValue = options[option];
    if (optionValue === undefined || optionValue === null) {
      continue;
    }
    if (typeof optionValue !== 'boolean') {
      return {
        error: {
          status: 400,
          message: `${label} ${option} must be a boolean.`,
        },
      };
    }
    parsedOptions[option] = optionValue;
  }

  return {
    value: {
      enabled: enabled.value ?? false,
      embedPoster: embedPoster.value ?? false,
      types,
      options: parsedOptions as Record<string, unknown> & {
        webhookUrl: string;
      },
    },
  };
};

const validateNotificationUrl = async (
  value: unknown,
  label: string,
  options: { allowTemplates?: boolean } = {}
) => {
  const allowPrivateAddresses =
    process.env.SEERR_ALLOW_PRIVATE_NOTIFICATION_URLS === 'true';

  if (
    !(await isSafeHttpUrl(value, {
      ...options,
      allowPrivateAddresses,
    }))
  ) {
    return {
      status: 400,
      message: allowPrivateAddresses
        ? `${label} must be a valid HTTP or HTTPS URL.`
        : `${label} must be a valid public HTTP or HTTPS URL.`,
    };
  }
};

notificationRoutes.get('/discord', (_req, res) => {
  const settings = getSettings();

  res.status(200).json(redactSecrets(settings.notifications.agents.discord));
});

adminPost('/discord', async (req, res) => {
  const settings = getSettings();
  const parsedBody = parseWebhookUrlNotificationBody(
    req.body,
    'Discord',
    DISCORD_NOTIFICATION_SCHEMA
  );
  if ('error' in parsedBody) {
    return res.status(parsedBody.error.status).json(parsedBody.error);
  }
  const body = parsedBody.value;
  const merged = preserveRedactedSecrets(
    body as NotificationAgentDiscord,
    settings.notifications.agents.discord
  );
  const validationError = merged.enabled
    ? await validateNotificationUrl(
        merged.options.webhookUrl,
        'Discord webhook URL'
      )
    : undefined;

  if (validationError) {
    return res.status(validationError.status).json(validationError);
  }

  const discord = await persistNotificationAgent(
    'discord',
    body as NotificationAgentDiscord
  );

  res.status(200).json(redactSecrets(discord));
});

adminPost('/discord/test', async (req, res, next) => {
  if (!req.user) {
    return next({
      status: 500,
      message: 'User information is missing from the request.',
    });
  }

  const parsedBody = parseWebhookUrlNotificationBody(
    req.body,
    'Discord',
    DISCORD_NOTIFICATION_SCHEMA
  );
  if ('error' in parsedBody) {
    return next(parsedBody.error);
  }
  const body = preserveRedactedSecrets(
    parsedBody.value as NotificationAgentDiscord,
    getExternalRuntimeConfig().notifications.agents.discord
  );

  const validationError = await validateNotificationUrl(
    body.options.webhookUrl,
    'Discord webhook URL'
  );

  if (validationError) {
    return next(validationError);
  }

  const discordAgent = new DiscordAgent(body as NotificationAgentDiscord);
  if (await sendTestNotification(discordAgent, req.user)) {
    return res.status(204).send();
  } else {
    return next({
      status: 500,
      message: 'Failed to send Discord notification.',
    });
  }
});

notificationRoutes.get('/slack', (_req, res) => {
  const settings = getSettings();

  res.status(200).json(redactSecrets(settings.notifications.agents.slack));
});

adminPost('/slack', async (req, res) => {
  const settings = getSettings();
  const parsedBody = parseWebhookUrlNotificationBody(
    req.body,
    'Slack',
    SLACK_NOTIFICATION_SCHEMA
  );
  if ('error' in parsedBody) {
    return res.status(parsedBody.error.status).json(parsedBody.error);
  }
  const body = {
    ...parsedBody.value,
    options: {
      ...settings.notifications.agents.slack.options,
      ...parsedBody.value.options,
    },
  } as NotificationAgentSlack;
  const merged = preserveRedactedSecrets(
    body,
    settings.notifications.agents.slack
  );
  const validationError = merged.enabled
    ? await validateNotificationUrl(
        merged.options.webhookUrl,
        'Slack webhook URL'
      )
    : undefined;

  if (validationError) {
    return res.status(validationError.status).json(validationError);
  }

  if (!isValidSlackRequestActionSettings(merged.options)) {
    return res.status(400).json({
      status: 400,
      message:
        'Slack request actions require a workspace ID, signing secret, and at least one valid request manager mapping.',
    });
  }

  if (merged.options.requestActionsEnabled) {
    const mappings = parseSlackApproverMappings(
      merged.options.requestManagerMappings
    )!;
    const managerIds = [
      ...new Set(mappings.map(({ seerrUserId }) => seerrUserId)),
    ];
    const managers = await getRepository(User).findBy({ id: In(managerIds) });
    const managerIdSet = new Set(managers.map(({ id }) => id));
    if (
      managers.length !== managerIds.length ||
      managers.some(
        (manager) => !manager.hasPermission(Permission.MANAGE_REQUESTS)
      ) ||
      managerIds.some((managerId) => !managerIdSet.has(managerId))
    ) {
      return res.status(400).json({
        status: 400,
        message:
          'Every Slack request manager mapping must reference a SeerrNG user with request management permission.',
      });
    }
  }

  const slack = await persistNotificationAgent(
    'slack',
    body as NotificationAgentSlack
  );

  res.status(200).json(redactSecrets(slack));
});

adminPost('/slack/test', async (req, res, next) => {
  if (!req.user) {
    return next({
      status: 500,
      message: 'User information is missing from the request.',
    });
  }

  const parsedBody = parseWebhookUrlNotificationBody(
    req.body,
    'Slack',
    SLACK_NOTIFICATION_SCHEMA
  );
  if ('error' in parsedBody) {
    return next(parsedBody.error);
  }
  const body = preserveRedactedSecrets(
    parsedBody.value as NotificationAgentSlack,
    getSettings().notifications.agents.slack
  );

  const validationError = await validateNotificationUrl(
    body.options.webhookUrl,
    'Slack webhook URL'
  );

  if (validationError) {
    return next(validationError);
  }

  const slackAgent = new SlackAgent(body as NotificationAgentSlack);
  if (await sendTestNotification(slackAgent, req.user)) {
    return res.status(204).send();
  } else {
    return next({
      status: 500,
      message: 'Failed to send Slack notification.',
    });
  }
});

notificationRoutes.get('/telegram', (_req, res) => {
  const settings = getSettings();

  res.status(200).json(redactSecrets(settings.notifications.agents.telegram));
});

adminPost('/telegram', async (req, res) => {
  const parsedBody = parseGenericNotificationBody(req.body, 'Telegram', {
    requiredStringOptions: ['botAPI', 'chatId', 'messageThreadId'],
    optionalStringOptions: [{ name: 'botUsername', maxLength: 256 }],
    booleanOptions: ['sendSilently'],
  });
  if ('error' in parsedBody) {
    return res.status(parsedBody.error.status).json(parsedBody.error);
  }
  const body = parsedBody.value;

  const telegram = await persistNotificationAgent(
    'telegram',
    body as NotificationAgentTelegram
  );

  res.status(200).json(redactSecrets(telegram));
});

adminPost('/telegram/test', async (req, res, next) => {
  if (!req.user) {
    return next({
      status: 500,
      message: 'User information is missing from the request.',
    });
  }

  const parsedBody = parseGenericNotificationBody(req.body, 'Telegram', {
    requiredStringOptions: ['botAPI', 'chatId', 'messageThreadId'],
    optionalStringOptions: [{ name: 'botUsername', maxLength: 256 }],
    booleanOptions: ['sendSilently'],
  });
  if ('error' in parsedBody) {
    return next(parsedBody.error);
  }
  const testSettings = preserveRedactedSecrets(
    parsedBody.value as NotificationAgentTelegram,
    getExternalRuntimeConfig().notifications.agents.telegram
  );
  const telegramAgent = new TelegramAgent(testSettings);
  if (await sendTestNotification(telegramAgent, req.user)) {
    return res.status(204).send();
  } else {
    return next({
      status: 500,
      message: 'Failed to send Telegram notification.',
    });
  }
});

notificationRoutes.get('/pushbullet', (_req, res) => {
  const settings = getSettings();

  res.status(200).json(redactSecrets(settings.notifications.agents.pushbullet));
});

adminPost('/pushbullet', async (req, res) => {
  const parsedBody = parseGenericNotificationBody(req.body, 'Pushbullet', {
    requiredStringOptions: ['accessToken'],
    optionalStringOptions: [{ name: 'channelTag' }],
  });
  if ('error' in parsedBody) {
    return res.status(parsedBody.error.status).json(parsedBody.error);
  }
  const body = parsedBody.value;

  const pushbullet = await persistNotificationAgent(
    'pushbullet',
    body as NotificationAgentPushbullet
  );

  res.status(200).json(redactSecrets(pushbullet));
});

adminPost('/pushbullet/test', async (req, res, next) => {
  if (!req.user) {
    return next({
      status: 500,
      message: 'User information is missing from the request.',
    });
  }

  const parsedBody = parseGenericNotificationBody(req.body, 'Pushbullet', {
    requiredStringOptions: ['accessToken'],
    optionalStringOptions: [{ name: 'channelTag' }],
  });
  if ('error' in parsedBody) {
    return next(parsedBody.error);
  }
  const testSettings = preserveRedactedSecrets(
    parsedBody.value as NotificationAgentPushbullet,
    getExternalRuntimeConfig().notifications.agents.pushbullet
  );
  const pushbulletAgent = new PushbulletAgent(testSettings);
  if (await sendTestNotification(pushbulletAgent, req.user)) {
    return res.status(204).send();
  } else {
    return next({
      status: 500,
      message: 'Failed to send Pushbullet notification.',
    });
  }
});

notificationRoutes.get('/pushover', (_req, res) => {
  const settings = getSettings();

  res.status(200).json(redactSecrets(settings.notifications.agents.pushover));
});

adminPost('/pushover', async (req, res) => {
  const parsedBody = parseGenericNotificationBody(req.body, 'Pushover', {
    requiredStringOptions: ['accessToken', 'userToken', 'sound'],
  });
  if ('error' in parsedBody) {
    return res.status(parsedBody.error.status).json(parsedBody.error);
  }
  const body = parsedBody.value;

  const pushover = await persistNotificationAgent(
    'pushover',
    body as NotificationAgentPushover
  );

  res.status(200).json(redactSecrets(pushover));
});

adminPost('/pushover/test', async (req, res, next) => {
  if (!req.user) {
    return next({
      status: 500,
      message: 'User information is missing from the request.',
    });
  }

  const parsedBody = parseGenericNotificationBody(req.body, 'Pushover', {
    requiredStringOptions: ['accessToken', 'userToken', 'sound'],
  });
  if ('error' in parsedBody) {
    return next(parsedBody.error);
  }
  const testSettings = preserveRedactedSecrets(
    parsedBody.value as NotificationAgentPushover,
    getExternalRuntimeConfig().notifications.agents.pushover
  );
  const pushoverAgent = new PushoverAgent(testSettings);
  if (await sendTestNotification(pushoverAgent, req.user)) {
    return res.status(204).send();
  } else {
    return next({
      status: 500,
      message: 'Failed to send Pushover notification.',
    });
  }
});

notificationRoutes.get('/email', (_req, res) => {
  const settings = getSettings();

  res.status(200).json(redactSecrets(settings.notifications.agents.email));
});

adminPost('/email', async (req, res) => {
  const parsedBody = parseGenericNotificationBody(req.body, 'Email', {
    requiredStringOptions: ['emailFrom', 'smtpHost', 'senderName'],
    optionalStringOptions: [
      { name: 'authUser' },
      { name: 'authPass' },
      { name: 'pgpPrivateKey', maxLength: MAX_PGP_PRIVATE_KEY_LENGTH },
      { name: 'pgpPassword' },
    ],
    booleanOptions: [
      'userEmailRequired',
      'secure',
      'ignoreTls',
      'requireTls',
      'allowSelfSigned',
    ],
    numberOptions: ['smtpPort'],
    typesRequired: false,
  });
  if ('error' in parsedBody) {
    return res.status(parsedBody.error.status).json(parsedBody.error);
  }
  const body = parsedBody.value;

  const email = await persistNotificationAgent(
    'email',
    body as NotificationAgentEmail
  );

  res.status(200).json(redactSecrets(email));
});

adminPost('/email/test', async (req, res, next) => {
  if (!req.user) {
    return next({
      status: 500,
      message: 'User information is missing from the request.',
    });
  }

  const parsedBody = parseGenericNotificationBody(req.body, 'Email', {
    requiredStringOptions: ['emailFrom', 'smtpHost', 'senderName'],
    optionalStringOptions: [
      { name: 'authUser' },
      { name: 'authPass' },
      { name: 'pgpPrivateKey', maxLength: MAX_PGP_PRIVATE_KEY_LENGTH },
      { name: 'pgpPassword' },
    ],
    booleanOptions: [
      'userEmailRequired',
      'secure',
      'ignoreTls',
      'requireTls',
      'allowSelfSigned',
    ],
    numberOptions: ['smtpPort'],
    typesRequired: false,
  });
  if ('error' in parsedBody) {
    return next(parsedBody.error);
  }
  const testSettings = preserveRedactedSecrets(
    parsedBody.value as NotificationAgentEmail,
    getSettings().notifications.agents.email
  );
  const emailAgent = new EmailAgent(testSettings);
  if (await sendTestNotification(emailAgent, req.user)) {
    return res.status(204).send();
  } else {
    return next({
      status: 500,
      message: 'Failed to send email notification.',
    });
  }
});

notificationRoutes.get('/webpush', (_req, res) => {
  const settings = getSettings();

  res.status(200).json(redactSecrets(settings.notifications.agents.webpush));
});

adminPost('/webpush', async (req, res) => {
  const parsedBody = parseGenericNotificationBody(req.body, 'Web push');
  if ('error' in parsedBody) {
    return res.status(parsedBody.error.status).json(parsedBody.error);
  }
  const body = parsedBody.value;

  const webpush = await persistNotificationAgent(
    'webpush',
    body as NotificationAgentConfig
  );

  res.status(200).json(redactSecrets(webpush));
});

adminPost('/webpush/test', async (req, res, next) => {
  if (!req.user) {
    return next({
      status: 500,
      message: 'User information is missing from the request.',
    });
  }

  const parsedBody = parseGenericNotificationBody(req.body, 'Web push');
  if ('error' in parsedBody) {
    return next(parsedBody.error);
  }
  const testSettings = preserveRedactedSecrets(
    parsedBody.value as NotificationAgentConfig,
    getSettings().notifications.agents.webpush
  );
  const webpushAgent = new WebPushAgent(testSettings);
  if (await sendTestNotification(webpushAgent, req.user)) {
    return res.status(204).send();
  } else {
    return next({
      status: 500,
      message: 'Failed to send web push notification.',
    });
  }
});

notificationRoutes.get('/webhook', (_req, res) => {
  const settings = getSettings();

  const webhookSettings = settings.notifications.agents.webhook;
  let jsonPayload = '{}';
  try {
    jsonPayload = decodeStoredWebhookPayloadTemplate(
      webhookSettings.options.jsonPayload
    ).raw;
  } catch (error) {
    logger.error('Stored webhook payload configuration is invalid.', {
      label: 'Notifications',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  const response: typeof webhookSettings = {
    enabled: webhookSettings.enabled,
    embedPoster: webhookSettings.embedPoster,
    types: webhookSettings.types,
    options: {
      ...webhookSettings.options,
      jsonPayload,
      customHeaders: redactWebhookCustomHeaders(
        webhookSettings.options.customHeaders
      ),
      supportVariables: webhookSettings.options.supportVariables ?? false,
    },
  };

  res.status(200).json(redactSecrets(response));
});

adminPost('/webhook', async (req, res, next) => {
  const settings = getSettings();
  try {
    const parsedBody = parseWebhookBody(req.body);
    if ('error' in parsedBody) {
      return next(parsedBody.error);
    }
    const body = parsedBody.value;
    const payloadError = validateWebhookPayload(body.options.jsonPayload);
    const headerError = validateWebhookHeaders(body.options.customHeaders);
    if (payloadError) {
      return next(payloadError);
    }
    if (headerError) {
      return next(headerError);
    }
    const customHeaders = (body.options.customHeaders ?? []) as {
      key: string;
      value: string;
    }[];

    const merged = preserveRedactedSecrets(
      {
        enabled: body.enabled,
        embedPoster: body.embedPoster,
        types: body.types,
        options: {
          jsonPayload: Buffer.from(
            JSON.stringify(body.options.jsonPayload)
          ).toString('base64'),
          webhookUrl: body.options.webhookUrl,
          authHeader: body.options.authHeader,
          customHeaders,
          supportVariables: body.options.supportVariables,
        },
      },
      settings.notifications.agents.webhook
    );
    const validationError = merged.enabled
      ? await validateNotificationUrl(
          merged.options.webhookUrl,
          'Webhook URL',
          {
            allowTemplates: merged.options.supportVariables,
          }
        )
      : undefined;

    if (validationError) {
      return next(validationError);
    }

    const webhook = await persistNotificationAgent('webhook', {
      enabled: body.enabled,
      embedPoster: body.embedPoster,
      types: body.types,
      options: {
        jsonPayload: Buffer.from(
          JSON.stringify(body.options.jsonPayload)
        ).toString('base64'),
        webhookUrl: body.options.webhookUrl,
        authHeader: body.options.authHeader,
        customHeaders,
        supportVariables: body.options.supportVariables,
      },
    });

    res.status(200).json(
      redactSecrets({
        ...webhook,
        options: {
          ...settings.notifications.agents.webhook.options,
          customHeaders: redactWebhookCustomHeaders(
            settings.notifications.agents.webhook.options.customHeaders
          ),
        },
      })
    );
  } catch (e) {
    next({ status: 500, message: e.message });
  }
});

adminPost('/webhook/test', async (req, res, next) => {
  if (!req.user) {
    return next({
      status: 500,
      message: 'User information is missing from the request.',
    });
  }

  try {
    const parsedBody = parseWebhookBody(req.body);
    if ('error' in parsedBody) {
      return next(parsedBody.error);
    }
    const body = parsedBody.value;
    const payloadError = validateWebhookPayload(body.options.jsonPayload);
    const headerError = validateWebhookHeaders(body.options.customHeaders);
    if (payloadError) {
      return next(payloadError);
    }
    if (headerError) {
      return next(headerError);
    }
    const customHeaders = (body.options.customHeaders ?? []) as {
      key: string;
      value: string;
    }[];

    const testBody = preserveRedactedSecrets(
      {
        enabled: body.enabled,
        embedPoster: body.embedPoster,
        types: body.types,
        options: {
          jsonPayload: Buffer.from(
            JSON.stringify(body.options.jsonPayload)
          ).toString('base64'),
          webhookUrl: body.options.webhookUrl,
          authHeader: body.options.authHeader,
          customHeaders,
          supportVariables: body.options.supportVariables,
        },
      },
      getSettings().notifications.agents.webhook
    );
    const validationError = await validateNotificationUrl(
      testBody.options.webhookUrl,
      'Webhook URL',
      { allowTemplates: testBody.options.supportVariables }
    );

    if (validationError) {
      return next(validationError);
    }

    const webhookAgent = new WebhookAgent(testBody);
    if (await sendTestNotification(webhookAgent, req.user)) {
      return res.status(204).send();
    } else {
      return next({
        status: 500,
        message: 'Failed to send webhook notification.',
      });
    }
  } catch (e) {
    next({ status: 500, message: e.message });
  }
});

notificationRoutes.get('/gotify', (_req, res) => {
  const settings = getSettings();

  res.status(200).json(redactSecrets(settings.notifications.agents.gotify));
});

adminPost('/gotify', async (req, res) => {
  const parsedBody = parseUrlNotificationBody(
    req.body,
    'Gotify',
    GOTIFY_NOTIFICATION_SCHEMA
  );
  if ('error' in parsedBody) {
    return res.status(parsedBody.error.status).json(parsedBody.error);
  }
  const body = parsedBody.value;
  const validationError = body.enabled
    ? await validateNotificationUrl(body.options.url, 'Gotify URL')
    : undefined;

  if (validationError) {
    return res.status(validationError.status).json(validationError);
  }

  const gotify = await persistNotificationAgent(
    'gotify',
    body as NotificationAgentGotify
  );

  res.status(200).json(redactSecrets(gotify));
});

adminPost('/gotify/test', async (req, res, next) => {
  if (!req.user) {
    return next({
      status: 500,
      message: 'User information is missing from the request.',
    });
  }

  const parsedBody = parseUrlNotificationBody(
    req.body,
    'Gotify',
    GOTIFY_NOTIFICATION_SCHEMA
  );
  if ('error' in parsedBody) {
    return next(parsedBody.error);
  }
  const body = preserveRedactedSecrets(
    parsedBody.value as NotificationAgentGotify,
    getExternalRuntimeConfig().notifications.agents.gotify
  );

  const validationError = await validateNotificationUrl(
    body.options.url,
    'Gotify URL'
  );

  if (validationError) {
    return next(validationError);
  }

  const gotifyAgent = new GotifyAgent(body as NotificationAgentGotify);
  if (await sendTestNotification(gotifyAgent, req.user)) {
    return res.status(204).send();
  } else {
    return next({
      status: 500,
      message: 'Failed to send Gotify notification.',
    });
  }
});

notificationRoutes.get('/ntfy', (_req, res) => {
  const settings = getSettings();

  res.status(200).json(redactSecrets(settings.notifications.agents.ntfy));
});

adminPost('/ntfy', async (req, res) => {
  const parsedBody = parseUrlNotificationBody(
    req.body,
    'ntfy',
    NTFY_NOTIFICATION_SCHEMA
  );
  if ('error' in parsedBody) {
    return res.status(parsedBody.error.status).json(parsedBody.error);
  }
  const body = parsedBody.value;
  const validationError = body.enabled
    ? await validateNotificationUrl(body.options.url, 'ntfy URL')
    : undefined;

  if (validationError) {
    return res.status(validationError.status).json(validationError);
  }

  const ntfy = await persistNotificationAgent(
    'ntfy',
    body as NotificationAgentNtfy
  );

  res.status(200).json(redactSecrets(ntfy));
});

adminPost('/ntfy/test', async (req, res, next) => {
  if (!req.user) {
    return next({
      status: 500,
      message: 'User information is missing from the request.',
    });
  }

  const parsedBody = parseUrlNotificationBody(
    req.body,
    'ntfy',
    NTFY_NOTIFICATION_SCHEMA
  );
  if ('error' in parsedBody) {
    return next(parsedBody.error);
  }
  const body = preserveRedactedSecrets(
    parsedBody.value as NotificationAgentNtfy,
    getExternalRuntimeConfig().notifications.agents.ntfy
  );

  const validationError = await validateNotificationUrl(
    body.options.url,
    'ntfy URL'
  );

  if (validationError) {
    return next(validationError);
  }

  const ntfyAgent = new NtfyAgent(body as NotificationAgentNtfy);
  if (await sendTestNotification(ntfyAgent, req.user)) {
    return res.status(204).send();
  } else {
    return next({
      status: 500,
      message: 'Failed to send ntfy notification.',
    });
  }
});

/** Apprise config keys are simple identifiers; anything else is a path injection risk. */
const APPRISE_CONFIG_KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const validateAppriseConfigKey = (
  configKey: unknown
): { status: number; message: string } | undefined =>
  typeof configKey === 'string' && APPRISE_CONFIG_KEY_PATTERN.test(configKey)
    ? undefined
    : {
        status: 400,
        message:
          'Apprise configuration key must be 1 to 64 letters, numbers, hyphens, or underscores.',
      };

notificationRoutes.get('/apprise', (_req, res) => {
  const settings = getSettings();

  res.status(200).json(redactSecrets(settings.notifications.agents.apprise));
});

adminPost('/apprise', async (req, res) => {
  const parsedBody = parseUrlNotificationBody(
    req.body,
    'apprise',
    APPRISE_NOTIFICATION_SCHEMA
  );
  if ('error' in parsedBody) {
    return res.status(parsedBody.error.status).json(parsedBody.error);
  }
  const body = parsedBody.value;
  const keyError = body.enabled
    ? validateAppriseConfigKey(body.options.configKey)
    : undefined;
  if (keyError) {
    return res.status(keyError.status).json(keyError);
  }
  const validationError = body.enabled
    ? await validateNotificationUrl(body.options.url, 'Apprise URL')
    : undefined;

  if (validationError) {
    return res.status(validationError.status).json(validationError);
  }

  const apprise = await persistNotificationAgent(
    'apprise',
    body as NotificationAgentApprise
  );

  res.status(200).json(redactSecrets(apprise));
});

adminPost('/apprise/test', async (req, res, next) => {
  if (!req.user) {
    return next({
      status: 500,
      message: 'User information is missing from the request.',
    });
  }

  const parsedBody = parseUrlNotificationBody(
    req.body,
    'apprise',
    APPRISE_NOTIFICATION_SCHEMA
  );
  if ('error' in parsedBody) {
    return next(parsedBody.error);
  }
  const body = preserveRedactedSecrets(
    parsedBody.value as NotificationAgentApprise,
    getExternalRuntimeConfig().notifications.agents.apprise
  );

  const keyError = validateAppriseConfigKey(body.options.configKey);
  if (keyError) {
    return next(keyError);
  }

  const validationError = await validateNotificationUrl(
    body.options.url,
    'Apprise URL'
  );

  if (validationError) {
    return next(validationError);
  }

  const appriseAgent = new AppriseAgent(body as NotificationAgentApprise);
  if (await sendTestNotification(appriseAgent, req.user)) {
    return res.status(204).send();
  } else {
    return next({
      status: 500,
      message: 'Failed to send Apprise notification.',
    });
  }
});

export default notificationRoutes;
