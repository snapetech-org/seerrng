import PageErrorMessage from '@app/components/Common/PageErrorMessage';
import useApiRateLimit from '@app/hooks/useApiRateLimit';
import defineMessages from '@app/utils/defineMessages';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.ApiRateLimitNotice', {
  title: 'Requests Paused',
  description:
    'SeerrNG is receiving too many requests. Please wait {seconds, plural, one {# second} other {# seconds}} before trying again. Your changes have been kept.',
});

export default function ApiRateLimitNotice() {
  const seconds = useApiRateLimit();
  const intl = useIntl();
  if (!seconds) return null;
  return (
    <PageErrorMessage
      severity="warning"
      title={intl.formatMessage(messages.title)}
      description={intl.formatMessage(messages.description, { seconds })}
    />
  );
}
