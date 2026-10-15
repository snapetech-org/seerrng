import Spinner from '@app/assets/spinner.svg';
import Button from '@app/components/Common/Button';
import Tooltip from '@app/components/Common/Tooltip';
import useToasts from '@app/hooks/useToasts';
import { useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import { BellIcon, BellSlashIcon } from '@heroicons/react/24/outline';
import type { UserAvailabilitySubscriptionResponse } from '@server/interfaces/api/userInterfaces';
import axios from 'axios';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.AvailabilitySubscriptionButton', {
  subscribe: 'Notify Me When Available',
  unsubscribe: 'Stop Availability Notifications',
  subscribed: 'You will be notified when this title is available.',
  unsubscribed: 'Availability notifications are off.',
  updateFailed:
    'Unable to update availability notifications. Please try again.',
  requestEnded: 'This title no longer has an active request from another user.',
});

interface AvailabilitySubscriptionButtonProps {
  mediaType: 'movie' | 'tv';
  tmdbId: number;
}

const AvailabilitySubscriptionButton = ({
  mediaType,
  tmdbId,
}: AvailabilitySubscriptionButtonProps) => {
  const { user } = useUser();
  const { addToast } = useToasts();
  const intl = useIntl();
  const [isUpdating, setIsUpdating] = useState(false);
  const endpoint = user
    ? `/api/v1/user/${user.id}/availability-subscriptions/${mediaType}/${tmdbId}`
    : null;
  const { data, mutate } =
    useSWR<UserAvailabilitySubscriptionResponse>(endpoint);

  if (!data || (!data.canSubscribe && !data.subscribed)) {
    return null;
  }

  const label = intl.formatMessage(
    data.subscribed ? messages.unsubscribe : messages.subscribe
  );

  const updateSubscription = async () => {
    if (!endpoint || isUpdating) {
      return;
    }

    setIsUpdating(true);
    try {
      if (data.subscribed) {
        await axios.delete(endpoint);
      } else {
        await axios.post(endpoint);
      }
      await mutate();
      addToast(
        intl.formatMessage(
          data.subscribed ? messages.unsubscribed : messages.subscribed
        ),
        { appearance: 'success', autoDismiss: true }
      );
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        await mutate();
        addToast(intl.formatMessage(messages.requestEnded), {
          appearance: 'info',
          autoDismiss: true,
        });
      } else {
        addToast(intl.formatMessage(messages.updateFailed), {
          appearance: 'error',
          autoDismiss: true,
        });
      }
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Tooltip content={label}>
      <Button
        buttonType={data.subscribed ? 'default' : 'ghost'}
        buttonSize="sm"
        iconOnly
        onClick={updateSubscription}
        disabled={isUpdating}
        aria-label={label}
        aria-pressed={data.subscribed}
      >
        {isUpdating ? (
          <Spinner />
        ) : data.subscribed ? (
          <BellIcon />
        ) : (
          <BellSlashIcon />
        )}
      </Button>
    </Tooltip>
  );
};

export default AvailabilitySubscriptionButton;
