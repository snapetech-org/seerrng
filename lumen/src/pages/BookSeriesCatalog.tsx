import { useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, readerServiceUrl, type BookResult } from '../api';
import { useAuth } from '../auth';
import BulkBookRequest from '../components/BulkBookRequest';
import { Section } from '../components/cards';
import { canManageRequests } from '../components/detail';
import { ExtraHeader, ServiceNote } from '../components/extra';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { sessionGeneration } from '../sessionState';

type Catalog = {
  title: string;
  description?: string;
  serverName: string;
  managementUrl?: string;
  format: 'ebook' | 'audiobook';
  bookCount: number;
  resolutionTruncated: boolean;
  books: {
    title: string;
    author?: string;
    position?: string;
    matchStatus: 'matched' | 'unmatched' | 'ambiguous' | 'unavailable';
    book?: BookResult;
  }[];
};

export function bookSeriesCatalogQuery(
  target: {
    serverId: number | string;
    scope: string;
    providerId: string;
  },
  monitoring = false
) {
  const { serverId, scope, providerId } = target;
  const id = String(serverId);
  if (
    !/^(0|[1-9]\d*)$/.test(id) ||
    !Number.isSafeInteger(Number(id)) ||
    !scope ||
    scope.length > 256 ||
    providerId.length > (monitoring ? 32 : 128) ||
    (monitoring && Number(id) > 1_000_000_000) ||
    !(monitoring ? /^(hc|gr):[1-9]\d*$/ : /^hc:[1-9]\d*$/).test(providerId)
  )
    return null;
  return new URLSearchParams({ serverId: id, scope, providerId }).toString();
}

function CatalogMonitoring({ query }: { query: string }) {
  const params = new URLSearchParams(query);
  const goodreads = params.get('providerId')?.startsWith('gr:') === true;
  const { user } = useAuth();
  const permissions = user?.permissions;
  const canRequest =
    typeof permissions === 'number' &&
    Number.isSafeInteger(permissions) &&
    permissions >= 0 &&
    (BigInt(permissions) & (2n | 32n | 34359738368n)) !== 0n;
  const watch = useApi<{
    supported: boolean;
    enabled?: boolean;
    request?: { status: string };
  }>(`/book-series/watch?${query}`, { keepDuringRefresh: true });
  const [includeExtras, setIncludeExtras] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [submittedStatus, setSubmittedStatus] = useState<string>();
  const pending = useRef(false);
  const status = watch.data?.enabled
    ? 'active'
    : (submittedStatus ?? watch.data?.request?.status);

  async function submit() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFailure('');
    const generation = sessionGeneration();
    try {
      const result = await api<{ status: string }>('/book-series/watch', {
        method: 'POST',
        body: JSON.stringify({
          serverId: Number(params.get('serverId')),
          scope: params.get('scope'),
          providerId: params.get('providerId'),
          includeExtras: goodreads || includeExtras,
        }),
      });
      if (generation === sessionGeneration()) setSubmittedStatus(result.status);
    } catch (error) {
      if (generation === sessionGeneration())
        setFailure(
          friendlyError(error, 'Could not request series monitoring.')
        );
    } finally {
      pending.current = false;
      if (generation === sessionGeneration()) {
        watch.reload();
        setBusy(false);
      }
    }
  }

  return (
    <Section title="Series Monitoring">
      <ServiceNote
        error={watch.error}
        what="series monitoring"
        retry={watch.reload}
      />
      {failure && (
        <p className="note" role="alert">
          {failure}
        </p>
      )}
      {watch.data && !watch.data.supported && (
        <p className="note">
          This book service does not support series monitoring.
        </p>
      )}
      {watch.data?.supported && (
        <>
          {status && (
            <p className="note" role="status">
              Monitoring status: {status}
            </p>
          )}
          {canRequest &&
            !['active', 'pending', 'failed'].includes(status ?? '') && (
              <>
                <p className="note">
                  Request ongoing monitoring for current and future books in
                  this catalog. Approval may be required.
                </p>
                {goodreads ? (
                  <p className="note">
                    Goodreads monitoring includes all linked books because
                    primary books are not classified.
                  </p>
                ) : (
                  <label className="set">
                    Include Companion Books and Extras
                    <input
                      type="checkbox"
                      checked={includeExtras}
                      disabled={busy}
                      onChange={(event) =>
                        setIncludeExtras(event.target.checked)
                      }
                    />
                  </label>
                )}
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={busy}
                  onClick={() => void submit()}
                >
                  Request Monitoring
                </button>
              </>
            )}
        </>
      )}
    </Section>
  );
}

export default function BookSeriesCatalog() {
  const { user } = useAuth();
  const { id } = useParams();
  const [params] = useSearchParams();
  const query = bookSeriesCatalogQuery({
    serverId: params.get('serverId') ?? '',
    scope: params.get('scope') ?? '',
    providerId: params.get('providerId') ?? '',
  });
  const path =
    id && /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id))
      ? `/book-series/${id}`
      : query
        ? `/book-series/catalog?${query}`
        : null;
  const catalog = useApi<
    Catalog & {
      entries?: Catalog['books'];
      truncated?: boolean;
      watchTarget?: Parameters<typeof bookSeriesCatalogQuery>[0];
    }
  >(path, {
    currentPathOnly: true,
  });
  const data = catalog.data;
  const managementUrl =
    canManageRequests(user?.permissions) && data?.managementUrl
      ? readerServiceUrl(data.managementUrl)
      : null;
  const seriesSearch = data
    ? new URLSearchParams({ query: data.title, format: data.format }).toString()
    : '';
  const books = data?.entries ?? data?.books ?? [];
  const matchedBooks = [
    ...new Map(
      books.flatMap((entry) =>
        entry.matchStatus === 'matched' && entry.book?.id
          ? [[entry.book.id, entry.book] as const]
          : []
      )
    ).values(),
  ];
  const monitoringTarget =
    data?.watchTarget ??
    (query
      ? {
          serverId: params.get('serverId') ?? '',
          scope: params.get('scope') ?? '',
          providerId: params.get('providerId') ?? '',
        }
      : null);
  const monitoringQuery =
    monitoringTarget && bookSeriesCatalogQuery(monitoringTarget, true);
  return (
    <>
      <ExtraHeader
        title={data?.title || 'Book Series Catalog'}
        sub={data?.serverName}
      >
        <Link className="chip" to="/book-series/requests">
          Book Series Requests
        </Link>
        <Link
          className="chip"
          to={`/book-series${seriesSearch ? `?${seriesSearch}` : ''}`}
        >
          Find a Book Series
        </Link>
        {managementUrl && (
          <a
            className="chip"
            href={managementUrl.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            Manage Series in {data?.serverName}
          </a>
        )}
        {data && path && (
          <BulkBookRequest
            key={path}
            source={{ id: path, books: matchedBooks }}
            fixedFormat={data.format}
            onComplete={catalog.reload}
          />
        )}
      </ExtraHeader>
      {!path && (
        <p className="note" role="alert">
          The series catalog link is incomplete or invalid.
        </p>
      )}
      <ServiceNote
        error={catalog.error}
        what="book series catalog"
        retry={catalog.reload}
      />
      {path && !data && !catalog.error && (
        <p className="note" role="status">
          Loading series catalog…
        </p>
      )}
      {data && (
        <>
          <p className="note">
            {data.format === 'audiobook' ? 'Audiobooks' : 'Ebooks'} ·{' '}
            {data.bookCount ?? books.length} series entries
          </p>
          {data.description && <p>{data.description}</p>}
          {monitoringQuery && (
            <CatalogMonitoring key={monitoringQuery} query={monitoringQuery} />
          )}
          {(data.resolutionTruncated || data.truncated) && (
            <p className="note">
              Only part of this catalog could be checked for matches.
            </p>
          )}
          {!books.length && <p className="note">No books in this preview.</p>}
          <ul className="setlist">
            {books.map((entry, index) => (
              <li className="set" key={index}>
                <div>
                  <b>
                    {entry.position ? `${entry.position}. ` : ''}
                    {entry.title}
                  </b>
                  {entry.author && <p className="note">{entry.author}</p>}
                </div>
                {entry.matchStatus === 'matched' && entry.book?.id ? (
                  <Link
                    className="go"
                    to={`/book/${encodeURIComponent(entry.book.id)}${data.format === 'audiobook' ? '?f=audio' : ''}`}
                  >
                    View Book
                  </Link>
                ) : (
                  <small>
                    {entry.matchStatus === 'ambiguous'
                      ? 'Multiple Possible Matches'
                      : entry.matchStatus === 'unavailable'
                        ? 'Match Unavailable'
                        : 'No Match'}
                  </small>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
