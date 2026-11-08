import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageErrorMessage from '@app/components/Common/PageErrorMessage';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Settings.SettingsLoadState', {
  loadError: 'Could not load settings.',
});

// Only replace an initial load. A background refresh must not unmount a loaded
// form and discard its draft. The source owner calls this only when data is absent.
export default function SettingsLoadState({
  failed,
  onRetry,
}: {
  failed: boolean;
  onRetry: () => unknown | Promise<unknown>;
}) {
  const intl = useIntl();
  if (!failed) return <LoadingSpinner />;
  return (
    <PageErrorMessage
      title={intl.formatMessage(messages.loadError)}
      retry={{
        onClick: onRetry,
        tooltip: intl.formatMessage(globalMessages.retry),
      }}
    />
  );
}
