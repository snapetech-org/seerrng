import useSettings from '@app/hooks/useSettings';
import defineMessages from '@app/utils/defineMessages';
import {
  ArrowUpCircleIcon,
  BeakerIcon,
  CodeBracketIcon,
  ServerIcon,
} from '@heroicons/react/24/outline';
import type { StatusResponse } from '@server/interfaces/api/settingsInterfaces';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Layout.VersionStatus', {
  streammain: 'SeerrNG Main',
  streamstable: 'SeerrNG Stable',
  outofdate: 'Out of Date',
  commitsbehind:
    '{commitsBehind} {commitsBehind, plural, one {commit} other {commits}} behind',
});

interface VersionStatusProps {
  onClick?: () => void;
}

const VersionStatus = ({ onClick }: VersionStatusProps) => {
  const settings = useSettings();
  const intl = useIntl();
  const [statusEnabled, setStatusEnabled] = useState(false);

  useEffect(() => {
    if ('requestIdleCallback' in window) {
      const idleCallback = window.requestIdleCallback(
        () => setStatusEnabled(true),
        { timeout: 10000 }
      );

      return () => window.cancelIdleCallback(idleCallback);
    }

    const timeout = globalThis.setTimeout(() => setStatusEnabled(true), 5000);

    return () => globalThis.clearTimeout(timeout);
  }, []);

  const { data } = useSWR<StatusResponse>(
    statusEnabled
      ? `/api/v1/status?checkUpdateAvailable=${settings.currentSettings.versionCheck}`
      : null,
    {
      refreshInterval: 60 * 1000,
      revalidateOnFocus: false,
    }
  );

  if (!data) {
    return null;
  }

  const versionStream =
    data.commitTag === 'local'
      ? 'Keep it up! 👍'
      : data.version.startsWith('main-')
        ? intl.formatMessage(messages.streammain)
        : intl.formatMessage(messages.streamstable);

  return (
    <Link
      href="/settings/about"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && onClick) {
          onClick();
        }
      }}
      role="button"
      tabIndex={0}
      className={`mx-2 flex items-center rounded-lg p-2 text-xs ring-1 ring-gray-700 transition duration-300 ${
        data.updateAvailable
          ? 'bg-yellow-500 text-white hover:bg-yellow-400'
          : 'bg-gray-900 text-gray-300 hover:bg-gray-800'
      }`}
    >
      {data.commitTag === 'local' ? (
        <CodeBracketIcon className="h-6 w-6" />
      ) : data.version.startsWith('main-') ? (
        <BeakerIcon className="h-6 w-6" />
      ) : (
        <ServerIcon className="h-6 w-6" />
      )}
      <div className="flex min-w-0 flex-1 flex-col truncate px-2 last:pe-0">
        <span className="font-bold">{versionStream}</span>
        {data.commitsBehind !== undefined && (
          <span className="truncate">
            {data.commitTag === 'local' ? (
              '(⌐■_■)'
            ) : data.commitsBehind > 0 ? (
              intl.formatMessage(messages.commitsbehind, {
                commitsBehind: data.commitsBehind,
              })
            ) : data.commitsBehind === -1 ? (
              intl.formatMessage(messages.outofdate)
            ) : (
              <code className="bg-transparent p-0">
                {data.version.replace('main-', '')}
              </code>
            )}
          </span>
        )}
      </div>
      {data.updateAvailable && <ArrowUpCircleIcon className="h-6 w-6" />}
    </Link>
  );
};

export default VersionStatus;
