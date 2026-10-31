import { apiMessages } from '@app/i18n/apiMessages';
import { matchApiMessage } from '@app/utils/apiMessage';
import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';

/** Display a known API/status phrase in the active locale; keep data verbatim. */
export default function ApiMessageText({ children }: { children: ReactNode }) {
  const intl = useIntl();
  if (typeof children !== 'string') return <>{children}</>;
  const match = matchApiMessage(children);
  if (!match) return <bdi dir="auto">{children}</bdi>;
  const values = Object.fromEntries(
    Object.entries(match.values).map(([name, value]) => [
      name,
      <bdi key={name} dir="auto">
        {value}
      </bdi>,
    ])
  );
  return (
    <span lang={intl.locale} dir="auto">
      {intl.formatMessage(apiMessages[match.key], values)}
    </span>
  );
}
