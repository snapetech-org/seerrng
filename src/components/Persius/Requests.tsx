import CachedImage from '@app/components/Common/CachedImage';
import type { RequestResultsResponse } from '@server/interfaces/api/requestInterfaces';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';
import messages from './messages';

export function RequestTabs({
  filter,
  scope,
  onChange,
}: {
  filter: string;
  scope: string;
  onChange: (filter: string) => void;
}) {
  const intl = useIntl();
  const { data: active } = useSWR<RequestResultsResponse>(
    `/api/v1/request?take=1&skip=0&filter=active${scope}`,
    { refreshInterval: 15000 }
  );
  const { data: ready } = useSWR<RequestResultsResponse>(
    `/api/v1/request?take=1&skip=0&filter=available${scope}`,
    { refreshInterval: 15000 }
  );
  const { data: all } = useSWR<RequestResultsResponse>(
    `/api/v1/request?take=1&skip=0&filter=all${scope}`,
    { refreshInterval: 15000 }
  );
  return (
    <div
      className="persius-segments persius-request-tabs"
      role="group"
      aria-label={intl.formatMessage(messages.requests)}
    >
      {[
        { value: 'active', label: messages.active, data: active },
        { value: 'available', label: messages.ready, data: ready },
        { value: 'all', label: messages.all, data: all },
      ].map((tab) => (
        <button
          type="button"
          key={tab.value}
          aria-pressed={filter === tab.value}
          onClick={() => onChange(tab.value)}
        >
          {intl.formatMessage(tab.label)}
          {tab.data && <small>{tab.data.pageInfo.results}</small>}
        </button>
      ))}
    </div>
  );
}

export function RequestRow({
  title,
  href,
  artwork,
  artworkType,
  metadata,
  status,
  actions,
  details,
  progress,
}: {
  title: string;
  href: string;
  artwork: string;
  artworkType: 'book' | 'tmdb' | 'music';
  metadata: ReactNode;
  status: ReactNode;
  actions: ReactNode;
  details?: ReactNode;
  progress?: number;
}) {
  return (
    <article className="persius-request" data-interface-role="request-card">
      <Link
        href={href}
        className="persius-request-art"
        data-artwork-type={artworkType}
        aria-label={title}
      >
        <CachedImage
          type={artworkType}
          src={artwork}
          alt=""
          fill
          sizes="150px"
        />
        {progress !== undefined && (
          <progress
            className="persius-download-progress"
            max={100}
            value={progress}
            aria-label={title}
          />
        )}
      </Link>
      <div className="persius-request-copy">
        <Link href={href} className="persius-request-title" title={title}>
          {title}
        </Link>
        <p className="persius-request-meta">{metadata}</p>
        <div className="persius-request-status">{status}</div>
        {details}
        <div className="persius-request-actions">{actions}</div>
      </div>
    </article>
  );
}
