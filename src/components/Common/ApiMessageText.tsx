import { apiMessages } from '@app/i18n/apiMessages';
import { matchApiMessage } from '@app/utils/apiMessage';
import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';

/** Display a known API/status phrase in the active locale; keep data verbatim. */
export default function ApiMessageText({
  children,
  trustedKey,
  trustedParams,
}: {
  children: ReactNode;
  /** Explicit server-authored descriptor; null means the source is opaque. */
  trustedKey?: string | null;
  trustedParams?: Record<string, string> | null;
}) {
  const intl = useIntl();
  if (typeof children !== 'string') return <>{children}</>;

  const languageFor = (messageId: string) =>
    intl.messages[messageId] === undefined ? 'en' : intl.locale;

  if (trustedKey !== undefined) {
    const descriptor = apiMessages[trustedKey];
    if (!descriptor) return <bdi dir="auto" lang="und">{children}</bdi>;
    const values = Object.fromEntries(
      Object.entries(trustedParams ?? {}).map(([name, value]) => [
        name,
        <bdi key={name} dir="auto" lang="und">
          {value}
        </bdi>,
      ])
    );
    return (
      <span lang={languageFor(descriptor.id)} dir="auto">
        {intl.formatMessage(descriptor, values)}
      </span>
    );
  }

  const match = matchApiMessage(children);
  if (!match) return <bdi dir="auto" lang="und">{children}</bdi>;
  const values = Object.fromEntries(
    Object.entries(match.values).map(([name, value]) => [
      name,
      <bdi key={name} dir="auto" lang="und">
        {value}
      </bdi>,
    ])
  );
  return (
    <span lang={languageFor(apiMessages[match.key].id)} dir="auto">
      {intl.formatMessage(apiMessages[match.key], values)}
    </span>
  );
}
