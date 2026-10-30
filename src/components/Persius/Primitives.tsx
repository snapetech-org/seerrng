import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';
import messages from './messages';

export function OptionalDisclosure({ enabled, children, label }: { enabled: boolean; children: ReactNode; label?: string }) {
  const intl = useIntl();
  if (!enabled) return <>{children}</>;
  return <details className="persius-secondary"><summary>{label ?? intl.formatMessage(messages.details)}</summary>{children}</details>;
}
