import Button from '@app/components/Common/Button';
import { RequestListboxControl } from '@app/components/RequestModal/AdvancedRequester';
import useToasts from '@app/hooks/useToasts';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import axios from 'axios';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useSWRConfig } from 'swr';

const messages = defineMessages('components.RequestEpisodeQueueControl', {
  watchAheadLoading: 'Loading your Episode Queue setting…',
  watchAheadOverride: 'Queue Length',
  watchAheadUseDefault: 'Account default ({count})',
  watchAheadOff: 'Off',
  watchAheadOverrideHelp:
    'Queue length is a playback buffer, not a total episode limit. Existing requests and downloads stay in place. For a pending request, choose one starting episode before approval.',
  watchAheadSaved: 'Episode Queue saved.',
  watchAheadSaveFailed:
    'Could not save Episode Queue. Reload the request and try again.',
  watchAheadEpisodeOption:
    '{count, plural, one {# episode} other {# episodes}}',
});

type QueueSetting = { episodeCount: number; usesUserDefault: boolean };
const RequestEpisodeQueueControl = ({
  requestId,
  episodeCount,
  usesUserDefault,
  defaultEpisodeCount,
  onSaved,
}: {
  requestId: number;
  episodeCount: number;
  usesUserDefault?: boolean;
  defaultEpisodeCount: number;
  onSaved?: (setting: QueueSetting) => void;
}) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { mutate } = useSWRConfig();
  const initial = usesUserDefault === false ? episodeCount : -1;
  const [queueOverride, setQueueOverride] = useState(initial);
  const [savedQueueOverride, setSavedQueueOverride] = useState(initial);
  const [savingQueueOverride, setSavingQueueOverride] = useState(false);
  return (
    <div className="request-selection-options">
      <RequestListboxControl
        id="request-episode-queue-override"
        loadingLabel={intl.formatMessage(messages.watchAheadLoading)}
        label={intl.formatMessage(messages.watchAheadOverride)}
        value={queueOverride}
        options={[
          {
            value: -1,
            label: intl.formatMessage(messages.watchAheadUseDefault, {
              count: defaultEpisodeCount,
            }),
          },
          {
            value: 0,
            label: intl.formatMessage(messages.watchAheadOff),
          },
          ...[1, 2, 3, 4, 5].map((count) => ({
            value: count,
            label: intl.formatMessage(messages.watchAheadEpisodeOption, {
              count,
            }),
          })),
        ]}
        onChange={setQueueOverride}
        disabled={savingQueueOverride}
      />
      <p className="request-episode-queue-description refreshed-detail-text-muted">
        {intl.formatMessage(messages.watchAheadOverrideHelp)}
      </p>
      <Button
        type="button"
        buttonType="primary"
        buttonSize="sm"
        disabled={savingQueueOverride || queueOverride === savedQueueOverride}
        onClick={async () => {
          setSavingQueueOverride(true);
          try {
            const response = await axios.post<{
              episodeCount: number;
              usesUserDefault: boolean;
            }>(`/api/v1/request/${requestId}/episode-queue`, {
              episodeCount: queueOverride < 0 ? null : queueOverride,
            });
            setSavedQueueOverride(
              response.data.usesUserDefault ? -1 : response.data.episodeCount
            );
            onSaved?.(response.data);
            addToast(intl.formatMessage(messages.watchAheadSaved), {
              appearance: 'success',
              autoDismiss: true,
            });
            void mutate(
              (key) =>
                typeof key === 'string' && key.startsWith('/api/v1/request')
            );
          } catch {
            addToast(intl.formatMessage(messages.watchAheadSaveFailed), {
              appearance: 'error',
              autoDismiss: true,
            });
          } finally {
            setSavingQueueOverride(false);
          }
        }}
      >
        {intl.formatMessage(
          savingQueueOverride ? globalMessages.saving : globalMessages.save
        )}
      </Button>
    </div>
  );
};
export default RequestEpisodeQueueControl;
