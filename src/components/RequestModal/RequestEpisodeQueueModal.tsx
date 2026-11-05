import Modal from '@app/components/Common/Modal';
import RequestEpisodeQueueControl from '@app/components/RequestModal/RequestEpisodeQueueControl';
import defineMessages from '@app/utils/defineMessages';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.RequestEpisodeQueueModal', {
  title: 'Episode Queue',
  loadError:
    'Could not load the account default. Close this dialog and try again.',
});

const RequestEpisodeQueueModal = ({
  request,
  onCancel,
}: {
  request: {
    id: number;
    requestedBy: { id: number };
    watchAheadEpisodeCount?: number;
    watchAheadUsesUserDefault?: boolean;
  };
  onCancel: () => void;
}) => {
  const intl = useIntl();
  const { data, error } = useSWR<{ defaultEpisodeCount: number }>(
    `/api/v1/user/${request.requestedBy.id}/settings/episode-queue`
  );
  return (
    <Modal
      title={intl.formatMessage(messages.title)}
      onCancel={onCancel}
      loading={!data && !error}
    >
      {error ? (
        <p role="alert">{intl.formatMessage(messages.loadError)}</p>
      ) : data ? (
        <RequestEpisodeQueueControl
          requestId={request.id}
          episodeCount={request.watchAheadEpisodeCount ?? 0}
          usesUserDefault={request.watchAheadUsesUserDefault}
          defaultEpisodeCount={data.defaultEpisodeCount}
        />
      ) : null}
    </Modal>
  );
};
export default RequestEpisodeQueueModal;
