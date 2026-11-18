import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ServiceNote } from './extra';

export default function ProviderFailure({
  error,
  what,
  provider,
  code,
  retryAt,
  retry,
}: {
  error: string;
  what: string;
  provider?: string;
  code?: string;
  retryAt?: number;
  retry: () => void;
}) {
  const remaining = () =>
    Math.max(0, Math.ceil(((retryAt ?? 0) - Date.now()) / 1000));
  const [seconds, setSeconds] = useState(remaining);
  useEffect(() => {
    if (!retryAt) return;
    const timer = window.setInterval(() => {
      const next = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
      setSeconds(next);
      if (!next) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  const retryable =
    code !== 'PROVIDER_LIST_NOT_FOUND' &&
    code !== 'PROVIDER_SETUP_REQUIRED' &&
    code !== 'RECONNECT_REQUIRED';
  return (
    <>
      <ServiceNote
        error={seconds ? `${error} Retry in ${seconds} seconds.` : error}
        what={what}
        retry={retryable ? retry : undefined}
        retryDisabled={seconds > 0}
      />
      {code === 'RECONNECT_REQUIRED' && (
        <div className="toolbar">
          <Link
            className="chip"
            to={`/me/account/linked-accounts${provider ? `?${new URLSearchParams({ reconnect: provider })}` : ''}`}
          >
            Reconnect Provider
          </Link>
        </div>
      )}
    </>
  );
}
