import {
  settingsDisplayMessages,
  useSettingsDisplay,
} from '@app/components/Settings/settingsDisplayContext';
import type { HTMLAttributes, ReactNode } from 'react';
import { useIntl } from 'react-intl';

type Props = HTMLAttributes<HTMLElement> & {
  as?: 'p' | 'span';
  topic?: string;
  children: ReactNode;
};
export default function SettingsHelp({
  as: Tag = 'p',
  topic,
  children,
  className = '',
  ...props
}: Props) {
  const { compact } = useSettingsDisplay();
  if (!compact)
    return (
      <Tag className={className} {...props}>
        {children}
      </Tag>
    );
  return (
    <CompactSettingsHelp topic={topic} className={className} {...props}>
      {children}
    </CompactSettingsHelp>
  );
}

function CompactSettingsHelp({
  topic,
  children,
  className = '',
  ...props
}: Omit<Props, 'as'>) {
  const intl = useIntl();
  return (
    <details className={`settings-help ${className}`} {...props}>
      <summary
        aria-label={
          topic
            ? intl.formatMessage(settingsDisplayMessages.helpFor, {
                setting: topic,
              })
            : undefined
        }
      >
        {intl.formatMessage(settingsDisplayMessages.help)}
      </summary>
      <div className="settings-help-content">{children}</div>
    </details>
  );
}
