import { IssueStatus, IssueTypeName } from '@server/constants/issue';
import { getIntl } from '@server/i18n';
import globalMessages from '@server/i18n/globalMessages';
import {
  getExternalNotificationAgent,
  getExternalRuntimeConfig,
} from '@server/lib/externalRuntimeConfig';
import type { NotificationAgentNtfy } from '@server/lib/settings';
import { NotificationAgentKey } from '@server/lib/settings';
import logger from '@server/logger';
import type { AvailableLocale } from '@server/types/languages';
import {
  createSafeHttpUrl,
  redactSecrets,
  stringifySafeHttpUrl,
} from '@server/utils/security';
import axios from 'axios';
import { Notification, hasNotificationType } from '..';
import type { NotificationAgent, NotificationPayload } from './agent';
import {
  BaseAgent,
  CONFIGURABLE_NOTIFICATION_HTTP_OPTIONS,
  getNotificationActionUrl,
  getNotificationEvent,
  truncateNotificationUtf8,
} from './agent';

export const NTFY_MESSAGE_BYTE_LIMIT = 4_096;
export const NTFY_TITLE_BYTE_LIMIT = 256;

export const escapeNtfyMarkdownText = (text: string): string =>
  text.replace(/([\\`*_{}[\]()#+\-.!|>~<])/g, '\\$1');

const ntfyMarkdownToPlainText = (text: string): string =>
  text.replace(/\\([\\`*_{}[\]()#+\-.!|>~<])/g, '$1').replace(/\*\*/g, '');

class NtfyAgent
  extends BaseAgent<NotificationAgentNtfy>
  implements NotificationAgent
{
  protected getSettings(): NotificationAgentNtfy {
    if (this.settings) {
      return this.settings;
    }

    return getExternalNotificationAgent(NotificationAgentKey.NTFY);
  }

  public buildPayload(type: Notification, payload: NotificationPayload) {
    const settings = this.getSettings();
    const intl = getIntl(settings.options.locale as AvailableLocale);
    const event = getNotificationEvent(payload, intl);
    const { applicationUrl } = getExternalRuntimeConfig().main;
    const embedPoster = settings.embedPoster;

    const topic = settings.options.topic;
    const tags = settings.options.tags
      ?.split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    const priority = settings.options.priority ?? 3;

    const title = truncateNotificationUtf8(
      event ? `${event} - ${payload.subject}` : payload.subject,
      NTFY_TITLE_BYTE_LIMIT
    );
    let message =
      payload.message && !payload.comment
        ? escapeNtfyMarkdownText(payload.message)
        : '';

    if (payload.request) {
      message += `${message ? '\n\n' : ''}**${escapeNtfyMarkdownText(
        intl.formatMessage(globalMessages.requestedBy)
      )}:** ${escapeNtfyMarkdownText(payload.request.requestedBy.displayName)}`;

      let status = '';
      switch (type) {
        case Notification.MEDIA_PENDING:
          status = intl.formatMessage(globalMessages.pendingApproval);
          break;
        case Notification.MEDIA_APPROVED:
        case Notification.MEDIA_AUTO_APPROVED:
          status = intl.formatMessage(globalMessages.processing);
          break;
        case Notification.MEDIA_AVAILABLE:
          status = intl.formatMessage(globalMessages.available);
          break;
        case Notification.MEDIA_DECLINED:
          status = intl.formatMessage(globalMessages.declined);
          break;
        case Notification.MEDIA_FAILED:
          status = intl.formatMessage(globalMessages.failed);
          break;
      }

      if (status) {
        message += `\n**${intl.formatMessage(globalMessages.requestStatus)}:** ${status}`;
      }
    } else if (payload.comment) {
      message += `\n**${escapeNtfyMarkdownText(
        intl.formatMessage(globalMessages.commentFrom, {
          userName: payload.comment.user.displayName,
        })
      )}:**\n${escapeNtfyMarkdownText(payload.comment.message)}`;
    } else if (payload.issue) {
      message += `\n\n**${intl.formatMessage(globalMessages.reportedBy)}:** ${escapeNtfyMarkdownText(payload.issue.createdBy.displayName)}`;
      message += `\n**${intl.formatMessage(globalMessages.issueType)}:** ${IssueTypeName[payload.issue.issueType]}`;
      message += `\n**${intl.formatMessage(globalMessages.issueStatus)}:** ${
        payload.issue.status === IssueStatus.OPEN
          ? intl.formatMessage(globalMessages.open)
          : intl.formatMessage(globalMessages.resolved)
      }`;
    }

    for (const extra of payload.extra ?? []) {
      message += `\n\n**${escapeNtfyMarkdownText(
        extra.name
      )}**\n${escapeNtfyMarkdownText(extra.value)}`;
    }

    let markdown = true;
    if (Buffer.byteLength(message, 'utf8') > NTFY_MESSAGE_BYTE_LIMIT) {
      message = truncateNotificationUtf8(
        ntfyMarkdownToPlainText(message),
        NTFY_MESSAGE_BYTE_LIMIT
      );
      markdown = false;
    }

    const attach = embedPoster ? payload.image : undefined;

    const click = getNotificationActionUrl(payload, applicationUrl);

    const ntfyPayload: Record<string, unknown> = {
      topic,
      priority,
      title,
      message,
      markdown,
    };
    if (tags && tags.length > 0) {
      ntfyPayload.tags = tags;
    }
    if (attach) {
      ntfyPayload.attach = attach;
    }
    if (click) {
      ntfyPayload.click = click;
    }

    return ntfyPayload;
  }

  public shouldSend(): boolean {
    const settings = this.getSettings();

    if (settings.enabled && settings.options.url && settings.options.topic) {
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

    logger.debug('Sending ntfy notification', {
      label: 'Notifications',
      type: Notification[type],
      subject: payload.subject,
    });

    const baseUrl = await createSafeHttpUrl(settings.options.url, {
      allowPrivateAddresses:
        process.env.SEERR_ALLOW_PRIVATE_NOTIFICATION_URLS === 'true',
    });
    if (!baseUrl) {
      logger.error('Invalid ntfy URL', {
        label: 'Notifications',
        type: Notification[type],
        subject: payload.subject,
      });
      return false;
    }

    try {
      let authHeader;
      if (
        settings.options.authMethodUsernamePassword &&
        settings.options.username &&
        settings.options.password
      ) {
        const encodedAuth = Buffer.from(
          `${settings.options.username}:${settings.options.password}`
        ).toString('base64');

        authHeader = `Basic ${encodedAuth}`;
      } else if (settings.options.authMethodToken) {
        authHeader = `Bearer ${settings.options.token}`;
      }

      await axios.post(
        stringifySafeHttpUrl(baseUrl),
        this.buildPayload(type, payload),
        authHeader
          ? {
              ...CONFIGURABLE_NOTIFICATION_HTTP_OPTIONS,
              headers: {
                Authorization: authHeader,
              },
            }
          : CONFIGURABLE_NOTIFICATION_HTTP_OPTIONS
      );

      return true;
    } catch (e) {
      logger.error('Error sending ntfy notification', {
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

export default NtfyAgent;
