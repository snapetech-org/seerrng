import { IssueStatus, IssueTypeName } from '@server/constants/issue';
import { getIntl } from '@server/i18n';
import globalMessages from '@server/i18n/globalMessages';
import {
  getExternalNotificationAgent,
  getExternalRuntimeConfig,
} from '@server/lib/externalRuntimeConfig';
import type { NotificationAgentGotify } from '@server/lib/settings';
import { NotificationAgentKey } from '@server/lib/settings';
import logger from '@server/logger';
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
  getNotificationContent,
  getNotificationExtras,
} from './agent';

interface GotifyPayload {
  title: string;
  message: string;
  priority: number;
  extras: Record<string, unknown>;
}

const trimPathTrailingSlashes = (value: string): string => {
  let end = value.length;

  while (end > 0 && value[end - 1] === '/') {
    end -= 1;
  }

  return end === value.length ? value : value.slice(0, end);
};

export const escapeGotifyMarkdownText = (text: string): string =>
  text.replace(/([\\`*_{}[\]()#+\-.!|>~<])/g, '\\$1');

const escapeGotifyMarkdownUrl = (value: string): string =>
  value.replace(/[\\)]/g, '\\$&');

class GotifyAgent
  extends BaseAgent<NotificationAgentGotify>
  implements NotificationAgent
{
  protected getSettings(): NotificationAgentGotify {
    if (this.settings) {
      return this.settings;
    }

    return getExternalNotificationAgent(NotificationAgentKey.GOTIFY);
  }

  public shouldSend(): boolean {
    const settings = this.getSettings();

    if (
      settings.enabled &&
      settings.options.url &&
      settings.options.token &&
      settings.options.priority !== undefined
    ) {
      return true;
    }

    return false;
  }

  public buildPayload(
    type: Notification,
    payload: NotificationPayload
  ): GotifyPayload {
    const settings = this.getSettings();
    const intl = getIntl(settings.options.locale);
    const content = getNotificationContent(payload, intl);
    const extras = getNotificationExtras(payload, intl);
    const { applicationUrl, applicationTitle } =
      getExternalRuntimeConfig().main;
    const embedPoster = settings.embedPoster;
    const priority = settings.options.priority ?? 1;

    const title = content.event
      ? `${content.event} - ${payload.subject}`
      : payload.subject;

    let message =
      content.message && !payload.comment
        ? `${escapeGotifyMarkdownText(content.message)}  \n\n`
        : '';

    if (payload.request) {
      message += `\n**${escapeGotifyMarkdownText(
        intl.formatMessage(globalMessages.requestedBy)
      )}:** ${escapeGotifyMarkdownText(
        payload.request.requestedBy.displayName
      )}  `;

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
        message += `\n**${escapeGotifyMarkdownText(
          intl.formatMessage(globalMessages.requestStatus)
        )}:** ${escapeGotifyMarkdownText(status)}  `;
      }
    } else if (payload.comment) {
      message += `\n${escapeGotifyMarkdownText(
        intl.formatMessage(globalMessages.commentFrom, {
          userName: payload.comment.user.displayName,
        })
      )}:\n${escapeGotifyMarkdownText(payload.comment.message)}  `;
    } else if (payload.issue) {
      message += `\n\n**${escapeGotifyMarkdownText(
        intl.formatMessage(globalMessages.reportedBy)
      )}:** ${escapeGotifyMarkdownText(payload.issue.createdBy.displayName)}  `;
      message += `\n**${intl.formatMessage(globalMessages.issueType)}:** ${IssueTypeName[payload.issue.issueType]}  `;
      message += `\n**${intl.formatMessage(globalMessages.issueStatus)}:** ${
        payload.issue.status === IssueStatus.OPEN
          ? intl.formatMessage(globalMessages.open)
          : intl.formatMessage(globalMessages.resolved)
      }  `;
    }

    for (const extra of extras) {
      message += `\n\n**${escapeGotifyMarkdownText(
        extra.name
      )}**\n${escapeGotifyMarkdownText(extra.value)}  `;
    }

    const actionUrl = getNotificationActionUrl(payload, applicationUrl);

    if (actionUrl) {
      const displayUrl =
        actionUrl.length > 40 ? `${actionUrl.slice(0, 41)}...` : actionUrl;
      message += `\n\n**${escapeGotifyMarkdownText(
        intl.formatMessage(globalMessages.openIn, { applicationTitle })
      )}:** [${escapeGotifyMarkdownText(
        displayUrl
      )}](${escapeGotifyMarkdownUrl(actionUrl)})  `;
    }

    return {
      extras: {
        'client::display': {
          contentType: 'text/markdown',
        },
        ...(embedPoster && payload.image
          ? {
              'client::notification': {
                bigImageUrl: payload.image,
              },
            }
          : {}),
      },
      title,
      message,
      priority,
    };
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

    logger.debug('Sending Gotify notification', {
      label: 'Notifications',
      type: Notification[type],
      subject: payload.subject,
    });

    const gotifyBaseUrl = await createSafeHttpUrl(settings.options.url, {
      allowPrivateAddresses:
        process.env.SEERR_ALLOW_PRIVATE_NOTIFICATION_URLS === 'true',
    });

    if (!gotifyBaseUrl) {
      logger.error('Invalid Gotify URL', {
        label: 'Notifications',
        type: Notification[type],
        subject: payload.subject,
      });
      return false;
    }

    try {
      const endpoint = new URL(stringifySafeHttpUrl(gotifyBaseUrl));
      endpoint.pathname = `${trimPathTrailingSlashes(endpoint.pathname)}/message`;
      endpoint.searchParams.set('token', settings.options.token);
      const notificationPayload = this.buildPayload(type, payload);

      // codeql[js/request-forgery]
      await axios.post(
        stringifySafeHttpUrl(endpoint),
        notificationPayload,
        CONFIGURABLE_NOTIFICATION_HTTP_OPTIONS
      );

      return true;
    } catch (e) {
      logger.error('Error sending Gotify notification', {
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

export default GotifyAgent;
