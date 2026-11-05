import ThemePicker from '@app/components/Layout/ThemePicker';
import { useTheme } from '@app/context/ThemeContext';
import { useUser } from '@app/hooks/useUser';
import {
  ChevronLeftIcon,
  MoonIcon,
  PlayIcon,
  SunIcon,
} from '@heroicons/react/24/outline';
import type { QuotaResponse } from '@server/interfaces/api/userInterfaces';
import Link from 'next/link';
import { useIntl } from 'react-intl';
import useSWR from 'swr';
import messages from './messages';

export function PersiusBrand() {
  return (
    <Link href="/" className="persius-brand">
      <span>
        <PlayIcon aria-hidden="true" />
      </span>
      <strong>SeerrNG</strong>
    </Link>
  );
}

export function PersiusAccountLabel() {
  const { user } = useUser();
  const intl = useIntl();
  const { data } = useSWR<QuotaResponse>(
    user ? `/api/v1/user/${user.id}/quota` : null
  );
  return (
    <span className="persius-account-label">
      <strong>{user?.displayName}</strong>
      {data &&
        (data.movie.limit ?? 0) > 0 &&
        data.movie.remaining !== undefined && (
          <small>
            {intl.formatMessage(messages.movieQuota, {
              count: data.movie.remaining,
            })}
          </small>
        )}
    </span>
  );
}

export function PersiusDock() {
  const { mode, toggleMode } = useTheme();
  const intl = useIntl();
  return (
    <aside
      className="persius-dock"
      aria-label={intl.formatMessage(messages.appearance)}
    >
      <div className="persius-dock-picker">
        <ThemePicker triggerIcon={<ChevronLeftIcon aria-hidden="true" />} />
      </div>
      <button
        type="button"
        onClick={toggleMode}
        aria-label={intl.formatMessage(messages.toggleMode)}
      >
        {mode === 'dark' ? (
          <SunIcon aria-hidden="true" />
        ) : (
          <MoonIcon aria-hidden="true" />
        )}
      </button>
    </aside>
  );
}
