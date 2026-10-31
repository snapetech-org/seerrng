import { EmbedColors } from '@server/constants/discord';
import { IssueStatus, IssueTypeName } from '@server/constants/issue';
import { getIntl } from '@server/i18n';
import globalMessages from '@server/i18n/globalMessages';
import {
  getExternalNotificationAgent,
  getExternalRuntimeConfig,
} from '@server/lib/externalRuntimeConfig';
import { forEachNotificationUserBatch } from '@server/lib/notifications/userBatches';
import type { NotificationAgentDiscord } from '@server/lib/settings';
import { NotificationAgentKey } from '@server/lib/settings';
import logger from '@server/logger';
import type { AvailableLocale } from '@server/types/languages';
import { normalizeDiscordSnowflake } from '@server/utils/discord';
import {
  createSafeHttpUrl,
  redactSecrets,
  stringifySafeHttpUrl,
} from '@server/utils/security';
import axios from 'axios';
import {
  Notification,
  hasNotificationType,
  shouldSendAdminNotification,
} from '..';
import type { NotificationAgent, NotificationPayload } from './agent';
import {
  BaseAgent,
  CONFIGURABLE_NOTIFICATION_HTTP_OPTIONS,
  getNotificationActionUrl,
  getNotificationEvent,
  truncateNotificationText,
} from './agent';

const MAX_DISCORD_MENTION_CONTENT_LENGTH = 1_800;
export const DISCORD_EMBED_TITLE_LIMIT = 256;
export const DISCORD_EMBED_DESCRIPTION_LIMIT = 4_096;
export const DISCORD_EMBED_FIELD_NAME_LIMIT = 256;
export const DISCORD_EMBED_FIELD_VALUE_LIMIT = 1_024;
export const DISCORD_EMBED_FIELD_COUNT_LIMIT = 25;
export const DISCORD_EMBED_TOTAL_TEXT_LIMIT = 6_000;

interface DiscordImageEmbed {
  url?: string;
  proxy_url?: string;
  height?: number;
  width?: number;
}

interface Field {
  name: string;
  value: string;
  inline?: boolean;
}
interface DiscordRichEmbed {
  title?: string;
  type?: 'rich';
  description?: string;
  url?: string;
  timestamp?: string;
  color?: number;
  footer?: {
    text: string;
    icon_url?: string;
    proxy_icon_url?: string;
  };
  image?: DiscordImageEmbed;
  thumbnail?: DiscordImageEmbed;
  provider?: {
    name?: string;
    url?: string;
  };
  author?: {
    name?: string;
    url?: string;
    icon_url?: string;
    proxy_icon_url?: string;
  };
  fields?: Field[];
}

interface DiscordWebhookPayload {
  embeds: DiscordRichEmbed[];
  username?: string;
  avatar_url?: string;
  tts: boolean;
  content?: string;
  allowed_mentions?: {
    parse?: ('users' | 'roles' | 'everyone')[];
    roles?: string[];
    users?: string[];
  };
}

export const boundDiscordEmbed = (
  embed: DiscordRichEmbed
): DiscordRichEmbed => {
  let remaining = DISCORD_EMBED_TOTAL_TEXT_LIMIT;
  const take = (value: string | undefined, limit: number) => {
    if (!value || remaining <= 0) {
      return undefined;
    }
    const bounded = truncateNotificationText(value, Math.min(limit, remaining));
    remaining -= bounded.length;
    return bounded || undefined;
  };

  const title = take(embed.title, DISCORD_EMBED_TITLE_LIMIT);
  const description = take(embed.description, DISCORD_EMBED_DESCRIPTION_LIMIT);
  const fields: Field[] = [];
  for (const field of (embed.fields ?? []).slice(
    0,
    DISCORD_EMBED_FIELD_COUNT_LIMIT
  )) {
    const name = take(field.name, DISCORD_EMBED_FIELD_NAME_LIMIT);
    const value = take(field.value, DISCORD_EMBED_FIELD_VALUE_LIMIT);
    if (!name || !value) {
      break;
    }
    fields.push({ ...field, name, value });
  }

  return {
    ...embed,
    title,
    description,
    fields: fields.length ? fields : undefined,
  };
};

class DiscordAgent
  extends BaseAgent<NotificationAgentDiscord>
  implements NotificationAgent
{
  protected getSettings(): NotificationAgentDiscord {
    if (this.settings) {
      return this.settings;
    }

    return getExternalNotificationAgent(NotificationAgentKey.DISCORD);
  }

  public buildEmbed(
    type: Notification,
    payload: NotificationPayload,
    locale?: AvailableLocale
  ): DiscordRichEmbed {
    const intl = getIntl(locale);
    const event = getNotificationEvent(payload, intl);
    const { applicationUrl } = getExternalRuntimeConfig().main;
    const { embedPoster } = this.getSettings();

    const appUrl =
      applicationUrl || `http://localhost:${process.env.PORT || 5055}`;
    let color = EmbedColors.DARK_PURPLE;
    const fields: Field[] = [];

    if (payload.request) {
      fields.push({
        name: intl.formatMessage(globalMessages.requestedBy),
        value: payload.request.requestedBy.displayName,
        inline: true,
      });

      let status = '';
      switch (type) {
        case Notification.MEDIA_PENDING:
          color = EmbedColors.ORANGE;
          status = `[${intl.formatMessage(globalMessages.pendingApproval)}](${appUrl}/requests)`;
          break;
        case Notification.MEDIA_APPROVED:
        case Notification.MEDIA_AUTO_APPROVED:
          color = EmbedColors.PURPLE;
          status = intl.formatMessage(globalMessages.processing);
          break;
        case Notification.MEDIA_AVAILABLE:
          color = EmbedColors.GREEN;
          status = intl.formatMessage(globalMessages.available);
          break;
        case Notification.MEDIA_DECLINED:
          color = EmbedColors.RED;
          status = intl.formatMessage(globalMessages.declined);
          break;
        case Notification.MEDIA_FAILED:
          color = EmbedColors.RED;
          status = intl.formatMessage(globalMessages.failed);
          break;
      }

      if (status) {
        fields.push({
          name: intl.formatMessage(globalMessages.requestStatus),
          value: status,
          inline: true,
        });
      }
    } else if (payload.comment) {
      fields.push({
        name: intl.formatMessage(globalMessages.commentFrom, {
          userName: payload.comment.user.displayName,
        }),
        value: payload.comment.message,
        inline: false,
      });
    } else if (payload.issue) {
      fields.push(
        {
          name: intl.formatMessage(globalMessages.reportedBy),
          value: payload.issue.createdBy.displayName,
          inline: true,
        },
        {
          name: intl.formatMessage(globalMessages.issueType),
          value: IssueTypeName[payload.issue.issueType],
          inline: true,
        },
        {
          name: intl.formatMessage(globalMessages.issueStatus),
          value:
            payload.issue.status === IssueStatus.OPEN
              ? intl.formatMessage(globalMessages.open)
              : intl.formatMessage(globalMessages.resolved),
          inline: true,
        }
      );

      switch (type) {
        case Notification.ISSUE_CREATED:
        case Notification.ISSUE_REOPENED:
          color = EmbedColors.RED;
          break;
        case Notification.ISSUE_COMMENT:
          color = EmbedColors.ORANGE;
          break;
        case Notification.ISSUE_RESOLVED:
          color = EmbedColors.GREEN;
          break;
      }
    }

    for (const extra of payload.extra ?? []) {
      fields.push({
        name: extra.name,
        value: extra.value,
        inline: true,
      });
    }

    const url = getNotificationActionUrl(payload, applicationUrl);

    return boundDiscordEmbed({
      title: event ? `${event}: ${payload.subject}` : payload.subject,
      url,
      description: payload.message,
      color,
      timestamp: new Date().toISOString(),
      fields,
      thumbnail: embedPoster
        ? {
            url: payload.image,
          }
        : undefined,
    });
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

    logger.debug('Sending Discord notification', {
      label: 'Notifications',
      type: Notification[type],
      subject: payload.subject,
    });

    const webhookUrl = await createSafeHttpUrl(settings.options.webhookUrl, {
      allowPrivateAddresses:
        process.env.SEERR_ALLOW_PRIVATE_NOTIFICATION_URLS === 'true',
    });
    if (!webhookUrl) {
      logger.error('Invalid Discord webhook URL', {
        label: 'Notifications',
        type: Notification[type],
        subject: payload.subject,
      });
      return false;
    }

    const userMentions: string[] = [];
    const userMentionSet = new Set<string>();
    const allowedUserIds: string[] = [];
    const allowedRoleIds: string[] = [];
    const addUserMention = (id: unknown, role = false): boolean => {
      const normalized = normalizeDiscordSnowflake(id);
      if (!normalized) {
        return true;
      }

      const mention = role ? `<@&${normalized}>` : `<@${normalized}>`;
      if (userMentionSet.has(mention)) {
        return true;
      }
      const nextLength = userMentions.join(' ').length + mention.length + 1;
      if (nextLength > MAX_DISCORD_MENTION_CONTENT_LENGTH) {
        return false;
      }

      userMentionSet.add(mention);
      userMentions.push(mention);
      (role ? allowedRoleIds : allowedUserIds).push(normalized);
      return true;
    };

    try {
      if (settings.options.enableMentions) {
        if (payload.notifyUser) {
          if (
            payload.notifyUser.settings?.hasNotificationType(
              NotificationAgentKey.DISCORD,
              type
            ) &&
            payload.notifyUser.settings.discordIds?.length
          ) {
            for (const discordId of payload.notifyUser.settings.discordIds) {
              addUserMention(discordId);
            }
          }
        }

        if (payload.notifyAdmin) {
          await forEachNotificationUserBatch(async (users) => {
            for (const user of users) {
              if (
                user.settings?.hasNotificationType(
                  NotificationAgentKey.DISCORD,
                  type
                ) &&
                shouldSendAdminNotification(type, user, payload)
              ) {
                for (const discordId of user.settings.discordIds ?? []) {
                  if (!addUserMention(discordId)) {
                    return false;
                  }
                }
              }
            }
          });
        }
      }

      if (settings.options.webhookRoleId) {
        addUserMention(settings.options.webhookRoleId, true);
      }

      // Discord webhooks go to a channel, not per-user,
      // so if use user locale is set, we'll use the locale of the user being notified
      // if not, we'll use the default locale set in the notification settings
      const locale = settings.options.useUserLocale
        ? (payload.notifyUser?.settings?.locale as AvailableLocale)
        : (settings.options.locale as AvailableLocale);

      if (settings.options.webhookThreadId) {
        webhookUrl.searchParams.set(
          'thread_id',
          settings.options.webhookThreadId
        );
      }

      await axios.post(
        stringifySafeHttpUrl(webhookUrl),
        {
          username: settings.options.botUsername
            ? settings.options.botUsername
            : getExternalRuntimeConfig().main.applicationTitle,
          avatar_url: settings.options.botAvatarUrl,
          embeds: [this.buildEmbed(type, payload, locale)],
          tts: false,
          content: userMentions.join(' '),
          allowed_mentions: {
            parse: [],
            users: allowedUserIds,
            roles: allowedRoleIds,
          },
        } as DiscordWebhookPayload,
        CONFIGURABLE_NOTIFICATION_HTTP_OPTIONS
      );

      return true;
    } catch (e) {
      logger.error('Error sending Discord notification', {
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

export default DiscordAgent;
