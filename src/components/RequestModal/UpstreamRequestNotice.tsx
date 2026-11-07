import Alert from '@app/components/Common/Alert';
import defineMessages from '@app/utils/defineMessages';
import { useIntl } from 'react-intl';
const messages = defineMessages('components.RequestModal.UpstreamNotice', {
  automatic: 'This request will be approved automatically.',
  approval: 'This request will need approval from an administrator.',
});
/** Presentation only; the modal remains the owner of approval and eligibility. */
export default function UpstreamRequestNotice({
  hasAutoApprove,
}: {
  hasAutoApprove: boolean;
}) {
  const intl = useIntl();
  return (
    <Alert type="info">
      {intl.formatMessage(
        hasAutoApprove ? messages.automatic : messages.approval
      )}
    </Alert>
  );
}
