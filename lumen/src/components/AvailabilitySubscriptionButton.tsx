import { useRef, useState } from 'react';
import {
  api,
  ApiError,
  type UserAvailabilitySubscriptionResponse,
} from '../api';
import { useAuth } from '../auth';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { Icon } from '../icons';
import { useToast } from './toast';

export default function AvailabilitySubscriptionButton({
  mediaType,
  tmdbId,
}: {
  mediaType: 'movie' | 'tv';
  tmdbId: number;
}) {
  const { user } = useAuth();
  const { t } = useLumenLocale();
  const toast = useToast();
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState<boolean>();
  const endpoint = user
    ? `/user/${user.id}/availability-subscriptions/${mediaType}/${tmdbId}`
    : null;
  const state = useApi<UserAvailabilitySubscriptionResponse>(endpoint);
  if (!endpoint || (!state.data?.canSubscribe && !state.data?.subscribed)) {
    return null;
  }

  const subscribed = confirmed ?? state.data.subscribed;
  const label = t(
    subscribed
      ? 'lumen.availabilitySubscription.unsubscribe'
      : 'lumen.availabilitySubscription.subscribe',
    subscribed ? 'Stop Availability Notifications' : 'Notify Me When Available'
  );

  async function toggle() {
    if (busyRef.current || !endpoint || !state.data) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await api<UserAvailabilitySubscriptionResponse>(endpoint, {
        method: subscribed ? 'DELETE' : 'POST',
      });
      setConfirmed(!subscribed);
      state.reload();
      toast(
        t(
          subscribed
            ? 'lumen.availabilitySubscription.unsubscribed'
            : 'lumen.availabilitySubscription.subscribed',
          subscribed
            ? 'Availability notifications are off.'
            : 'You will be notified when this title is available.'
        )
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setConfirmed(undefined);
        state.reload();
        toast(
          t(
            'lumen.availabilitySubscription.requestEnded',
            'This title no longer has an active request from another user.'
          )
        );
      } else {
        toast(
          friendlyError(
            error,
            t(
              'lumen.availabilitySubscription.updateFailed',
              'Unable to update availability notifications. Please try again.'
            ),
            t
          )
        );
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={label}
      title={label}
      aria-pressed={subscribed}
      disabled={busy}
      onClick={() => void toggle()}
    >
      <Icon name={subscribed ? 'bell' : 'bellOff'} />
    </button>
  );
}
