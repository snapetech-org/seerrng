import { IssueStatus, IssueTypeName } from '@server/constants/issue';
import { getIntl } from '@server/i18n';
import globalMessages from '@server/i18n/globalMessages';
import {
  getExternalNotificationAgent,
  getExternalRuntimeConfig,
} from '@server/lib/externalRuntimeConfig';
import type { NotificationAgentApprise } from '@server/lib/settings';
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
  getNotificationContent,
  getNotificationExtras,
  truncateNotificationUtf8,
} from './agent';

/** Apprise accepts this many bytes in a title or body before it truncates. */
export const APPRISE_TITLE_BYTE_LIMIT = 256;
export const APPRISE_BODY_BYTE_LIMIT = 4_096;

/** Apprise's message `type` values. */
export type AppriseMessageType = 'info' | 'success' | 'warning' | 'failure';

export const appriseMessageType = (type: Notification): AppriseMessageType => {
  switch (type) {
    case Notification.MEDIA_FAILED:
      return 'failure';
    case Notification.MEDIA_AVAILABLE:
    case Notification.SOFTWARE_AVAILABLE:
    case Notification.ISSUE_RESOLVED:
      return 'success';
    case Notification.MEDIA_DECLINED:
    case Notification.ISSUE_CREATED:
    case Notification.ISSUE_REOPENED:
      return 'warning';
    default:
      return 'info';
  }
};

/**
 * Builds the stateful Apprise endpoint: `{base}/notify/{configKey}`. The
 * destination URLs live in the Apprise configuration, so SeerrNG never stores
 * or sends them.
 */
export const appriseEndpoint = (baseUrl: string, configKey: string): string =>
  `${baseUrl.replace(/\/+$/, '')}/notify/${encodeURIComponent(configKey)}`;

class AppriseAgent
  extends BaseAgent<NotificationAgentApprise>
  implements NotificationAgent
{
  protected getSettings(): NotificationAgentApprise {
    if (this.settings) {
      return this.settings;
    }

    return getExternalNotificationAgent(NotificationAgentKey.APPRISE);
  }

  public buildPayload(type: Notification, payload: NotificationPayload) {
    const settings = this.getSettings();
    const intl = getIntl(settings.options.locale as AvailableLocale);
    const { applicationUrl } = getExternalRuntimeConfig().main;
    const content = getNotificationContent(payload, intl);
    const extras = getNotificationExtras(payload, intl);

    const title = truncateNotificationUtf8(
      content.event ? `${content.event} - ${payload.subject}` : payload.subject,
      APPRISE_TITLE_BYTE_LIMIT
    );

    const lines: string[] = [];
    if (content.message && !payload.comment) {
      lines.push(content.message);
    }

    if (payload.request) {
      lines.push(
        `${intl.formatMessage(globalMessages.requestedBy)}: ${payload.request.requestedBy.displayName}`
      );
      const status = (() => {
        switch (type) {
          case Notification.MEDIA_PENDING:
            return intl.formatMessage(globalMessages.pendingApproval);
          case Notification.MEDIA_APPROVED:
          case Notification.MEDIA_AUTO_APPROVED:
            return intl.formatMessage(globalMessages.processing);
          case Notification.MEDIA_AVAILABLE:
            return intl.formatMessage(globalMessages.available);
          case Notification.MEDIA_DECLINED:
            return intl.formatMessage(globalMessages.declined);
          case Notification.MEDIA_FAILED:
            return intl.formatMessage(globalMessages.failed);
          default:
            return undefined;
        }
      })();
      if (status) {
        lines.push(
          `${intl.formatMessage(globalMessages.requestStatus)}: ${status}`
        );
      }
    } else if (payload.comment) {
      lines.push(
        `${intl.formatMessage(globalMessages.commentFrom, {
          userName: payload.comment.user.displayName,
        })}:`,
        payload.comment.message
      );
    } else if (payload.issue) {
      lines.push(
        `${intl.formatMessage(globalMessages.reportedBy)}: ${payload.issue.createdBy.displayName}`,
        `${intl.formatMessage(globalMessages.issueType)}: ${IssueTypeName[payload.issue.issueType]}`,
        `${intl.formatMessage(globalMessages.issueStatus)}: ${
          payload.issue.status === IssueStatus.OPEN
            ? intl.formatMessage(globalMessages.open)
            : intl.formatMessage(globalMessages.resolved)
        }`
      );
    }

    for (const extra of extras) {
      lines.push(`${extra.name}: ${extra.value}`);
    }

    const click = getNotificationActionUrl(payload, applicationUrl);
    if (click) {
      lines.push(click);
    }

    const body = truncateNotificationUtf8(
      lines.join('\n') || title,
      APPRISE_BODY_BYTE_LIMIT
    );

    const appriseMessage: Record<string, string> = {
      title,
      body,
      type: appriseMessageType(type),
      format: 'text',
    };
    if (settings.options.tag) {
      appriseMessage.tag = settings.options.tag;
    }
    return appriseMessage;
  }

  public shouldSend(): boolean {
    const settings = this.getSettings();

    return !!(
      settings.enabled &&
      settings.options.url &&
      settings.options.configKey
    );
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

    logger.debug('Sending Apprise notification', {
      label: 'Notifications',
      type: Notification[type],
      subject: payload.subject,
    });

    const endpoint = await createSafeHttpUrl(
      appriseEndpoint(settings.options.url, settings.options.configKey),
      {
        allowPrivateAddresses:
          process.env.SEERR_ALLOW_PRIVATE_NOTIFICATION_URLS === 'true',
      }
    );
    if (!endpoint) {
      logger.error('Invalid Apprise URL', {
        label: 'Notifications',
        type: Notification[type],
        subject: payload.subject,
      });
      return false;
    }

    try {
      const headers: Record<string, string> = {};
      if (
        settings.options.authMethodUsernamePassword &&
        settings.options.username &&
        settings.options.password
      ) {
        headers.Authorization = `Basic ${Buffer.from(
          `${settings.options.username}:${settings.options.password}`
        ).toString('base64')}`;
      }

      await axios.post(
        stringifySafeHttpUrl(endpoint),
        this.buildPayload(type, payload),
        {
          ...CONFIGURABLE_NOTIFICATION_HTTP_OPTIONS,
          headers,
        }
      );

      return true;
    } catch (e) {
      logger.error('Error sending Apprise notification', {
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

export default AppriseAgent;
