import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';
import messages from './messages';

export function OptionalDisclosure({
  enabled,
  children,
  label,
  className,
  panelClassName,
}: {
  enabled: boolean;
  children: ReactNode;
  label?: string;
  className?: string;
  panelClassName?: string;
}) {
  const intl = useIntl();
  if (!enabled) return <>{children}</>;
  return (
    <details
      className={['persius-secondary', className].filter(Boolean).join(' ')}
    >
      <summary>{label ?? intl.formatMessage(messages.details)}</summary>
      {panelClassName ? (
        <div className={panelClassName}>{children}</div>
      ) : (
        children
      )}
    </details>
  );
}
