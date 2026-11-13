import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import IssueItem from '@app/components/IssueList/IssueItem';
import useUpstreamTheme from '@app/hooks/useUpstreamTheme';
import defineMessages from '@app/utils/defineMessages';
import { MediaType } from '@server/constants/media';
import type Issue from '@server/entity/Issue';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.IssueList.FocusedIssue', {
  unavailable:
    'This issue is unavailable or you do not have permission to view it.',
  all: 'Show All Issues',
});

const FocusedIssue = ({ issueId }: { issueId: number }) => {
  const intl = useIntl();
  const router = useRouter();
  const upstream = useUpstreamTheme();
  const { data, error } = useSWR<Issue>(`/api/v1/issue/${issueId}`);
  const supportsUpstreamDetails =
    data?.media.mediaType === MediaType.MOVIE ||
    data?.media.mediaType === MediaType.TV;

  useEffect(() => {
    if (upstream && supportsUpstreamDetails) {
      void router.replace(`/issues/${issueId}`);
    }
  }, [issueId, router, supportsUpstreamDetails, upstream]);

  if (upstream && supportsUpstreamDetails) return null;

  return (
    <section className="card-stack card-spacing-before">
      <Button
        buttonType="success"
        title={intl.formatMessage(messages.all)}
        onClick={() => void router.replace('/issues')}
      >
        {intl.formatMessage(messages.all)}
      </Button>
      {error ? (
        <p role="alert">{intl.formatMessage(messages.unavailable)}</p>
      ) : data ? (
        <IssueItem key={issueId} issue={data} initiallyExpanded />
      ) : (
        <LoadingSpinner />
      )}
    </section>
  );
};

export default FocusedIssue;
