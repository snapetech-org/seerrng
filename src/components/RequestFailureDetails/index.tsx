import Button from '@app/components/Common/Button';
import globalMessages from '@app/i18n/globalMessages';
import {
  getRequestFailureDescriptionId,
  getRequestFailureInfo,
  getRequestFailureSearchHref,
} from '@app/utils/requestFailure';
import type { MediaRequestFailureReason } from '@server/constants/media';
import { MediaType } from '@server/constants/media';
import { useIntl } from 'react-intl';

interface RequestFailureDetailsProps {
  failureReason?: MediaRequestFailureReason | string | null;
  requestId: number;
  requestType: string;
  searchTitle?: string;
  descriptionId?: string;
}

const RequestFailureDetails = ({
  failureReason,
  requestId,
  requestType,
  searchTitle,
  descriptionId,
}: RequestFailureDetailsProps) => {
  const intl = useIntl();
  const failureInfo = getRequestFailureInfo(failureReason);

  if (!failureInfo) {
    return null;
  }

  const reasonId = descriptionId ?? getRequestFailureDescriptionId(requestId);
  const searchHref = getRequestFailureSearchHref(
    failureReason,
    requestType,
    searchTitle
  );

  return (
    <section
      className="page-error-message"
      data-severity="error"
      aria-labelledby={`${reasonId}-heading`}
    >
      <div>
        <h4 className="card-title" id={`${reasonId}-heading`}>
          {intl.formatMessage(globalMessages.requestFailureDetails)}
        </h4>
        <div id={reasonId}>
          <p className="page-error-message-detail">
            {intl.formatMessage(globalMessages[failureInfo.messageKey])}
          </p>
          {failureInfo.retryUnavailable && (
            <p className="page-error-message-detail">
              {intl.formatMessage(
                globalMessages.requestFailureRetryUnavailable
              )}
            </p>
          )}
        </div>
      </div>
      {searchHref && requestType === MediaType.TV && (
        <Button
          as="a"
          href={searchHref}
          buttonType="primary"
          buttonSize="sm"
          buttonIcon="browse"
          aria-describedby={reasonId}
        >
          {intl.formatMessage(globalMessages.requestFailureFindAnotherListing)}
        </Button>
      )}
    </section>
  );
};

export default RequestFailureDetails;
