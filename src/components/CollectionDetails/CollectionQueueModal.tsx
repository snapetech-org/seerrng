import CollectionSummaryCard from '@app/components/CollectionDetails/CollectionSummaryCard';
import Button from '@app/components/Common/Button';
import Modal from '@app/components/Common/Modal';
import MediaQualitySelect from '@app/components/MediaDetails/MediaQualitySelect';
import { RequestListboxControl } from '@app/components/RequestModal/AdvancedRequester';
import useSettings from '@app/hooks/useSettings';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import type { Collection } from '@server/models/Collection';
import axios from 'axios';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.CollectionQueue', {
  title: 'Queue Collection',
  quality: 'Quality',
  existing4k: '4K (Existing Queue)',
  requestAccess:
    'Movie request access and an enabled quality are required to start a queue.',
  buffer: 'Movies Ahead',
  one: '1 movie',
  two: '2 movies',
  loading: 'Loading collection queue…',
  description:
    'Request this collection in release order, keeping one or two unwatched movies ahead. Uses your account and normal request defaults. Future requests still need permission, quota and approval. Already requested movies count toward the buffer.',
  active: 'Queue Active',
  waiting: 'Waiting',
  completed: 'All Movies Queued',
  stopped: 'Queue Stopped',
  progress:
    '{watched} watched · {requested} requested by this queue · {total} movies in total',
  stop: 'Stop Queue',
  start: 'Start Queue',
  restart: 'Restart Queue',
  stopHelp:
    'Stopping prevents future requests. Existing requests and downloaded files stay in place.',
  error: 'Could not update the collection queue. Try again later.',
  'playback-unlinked': 'Link your Plex, Jellyfin, or Emby account to continue.',
  'request-policy':
    'Review request access, quotas, blocked titles or service settings. Pending requests still require approval.',
  'provider-unavailable':
    'Playback history is unavailable. Retrying automatically.',
  'request-cancelled':
    'An earlier queue request is missing or was interrupted. Restart the queue to request missing movies again.',
});
type QueueView = {
  id: number;
  status: 'active' | 'waiting' | 'completed' | 'stopped';
  reason:
    | 'playback-unlinked'
    | 'request-policy'
    | 'provider-unavailable'
    | 'request-cancelled'
    | null;
  bufferSize: number;
  watched: number;
  requested: number;
  total: number;
};
const CollectionQueueModal = ({
  collection,
  onCancel,
}: {
  collection: Collection;
  onCancel: () => void;
}) => {
  const intl = useIntl();
  const { hasPermission } = useUser();
  const settings = useSettings();
  const [quality, setQuality] = useState<'hd' | '4k'>('hd');
  const [bufferSize, setBufferSize] = useState(1);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string>();
  const is4k = quality === '4k';
  const { data: existing4k } = useSWR<{ queue: QueueView | null }>(
    settings.currentSettings.movie4kEnabled
      ? null
      : `/api/v1/collection/${collection.id}/queue?is4k=true`
  );

  const url = `/api/v1/collection/${collection.id}/queue?is4k=${is4k}`;
  const { data, error, mutate } = useSWR<{ queue: QueueView | null }>(url, {
    refreshInterval: 3000,
    // The global 30-second dedupe window otherwise suppresses live progress polls.
    dedupingInterval: 0,
  });
  const queue = data?.queue;
  const active = queue?.status === 'active' || queue?.status === 'waiting';
  useEffect(() => {
    setBufferSize(queue?.bufferSize ?? 1);
    setFailed(undefined);
  }, [queue?.id, queue?.bufferSize, quality]);
  const canRequest =
    hasPermission(
      is4k
        ? [Permission.REQUEST_4K, Permission.REQUEST_4K_MOVIE]
        : [Permission.REQUEST, Permission.REQUEST_MOVIE],
      { type: 'or' }
    ) &&
    (!is4k || settings.currentSettings.movie4kEnabled);
  const change = async (stop: boolean) => {
    setBusy(true);
    setFailed(undefined);
    try {
      if (stop) await axios.delete(url);
      else
        await axios.post(`/api/v1/collection/${collection.id}/queue`, {
          is4k,
          bufferSize,
        });
      await mutate();
    } catch (error) {
      const message =
        axios.isAxiosError(error) &&
        [400, 403, 409, 503].includes(error.response?.status ?? 0)
          ? error.response?.data?.message
          : undefined;
      setFailed(
        typeof message === 'string' && message.length <= 512
          ? message
          : intl.formatMessage(messages.error)
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={intl.formatMessage(messages.title)} onCancel={onCancel}>
      <CollectionSummaryCard collection={collection} />
      <p className="card-body-text">
        {intl.formatMessage(messages.description)}
      </p>
      <div className="request-selection-options">
        <MediaQualitySelect
          value={quality}
          onChange={(value) => {
            if (!busy) setQuality(value);
          }}
          label={intl.formatMessage(messages.quality)}
          autoSelectAvailable={false}
          options={[
            { label: 'HD', value: 'hd' },
            ...(settings.currentSettings.movie4kEnabled || existing4k?.queue
              ? [
                  {
                    label: settings.currentSettings.movie4kEnabled
                      ? '4K'
                      : intl.formatMessage(messages.existing4k),
                    value: '4k' as const,
                  },
                ]
              : []),
          ]}
        />
        <RequestListboxControl
          id="collection-queue-buffer"
          value={bufferSize}
          onChange={setBufferSize}
          disabled={busy || active}
          label={intl.formatMessage(messages.buffer)}
          loadingLabel={intl.formatMessage(messages.loading)}
          options={[
            { value: 1, label: intl.formatMessage(messages.one) },
            { value: 2, label: intl.formatMessage(messages.two) },
          ]}
        />
      </div>
      {!data && !error && (
        <p role="status">{intl.formatMessage(messages.loading)}</p>
      )}
      {(error || failed) && (
        <p role="alert">{failed ?? intl.formatMessage(messages.error)}</p>
      )}
      {queue && (
        <div className="card-body-text" role="status">
          <p>{intl.formatMessage(messages[queue.status])}</p>
          <p>
            {intl.formatMessage(messages.progress, {
              watched: queue.watched,
              requested: queue.requested,
              total: queue.total,
            })}
          </p>
          {queue.reason && <p>{intl.formatMessage(messages[queue.reason])}</p>}
        </div>
      )}
      {!canRequest && (
        <p className="card-body-text">
          {intl.formatMessage(messages.requestAccess)}
        </p>
      )}
      <div className="request-selection-options">
        {active ? (
          <Button
            buttonType="danger"
            disabled={busy}
            onClick={() => void change(true)}
          >
            {intl.formatMessage(messages.stop)}
          </Button>
        ) : (
          <Button
            buttonType="primary"
            disabled={busy || !data || !!error || !canRequest}
            onClick={() => void change(false)}
          >
            {intl.formatMessage(queue ? messages.restart : messages.start)}
          </Button>
        )}
      </div>
      <p className="card-body-text refreshed-detail-text-muted">
        {intl.formatMessage(messages.stopHelp)}
      </p>
    </Modal>
  );
};
export default CollectionQueueModal;
