import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { bookRequestLabel, type RequestItem } from '../api';
import { useApi } from '../hooks';
import { Pill } from './detail';
import { ServiceNote } from './extra';
import { RequestFiles } from './RequestFiles';
import { useDialog } from './useDialog';

interface Status {
  stage: string;
  message?: string | null;
  attempt: number;
}

interface StatusEvent extends Status {
  id: number;
  createdAt: string;
}

interface CurrentStatus extends Status {
  retryable?: boolean;
  percent?: number | null;
  size?: number | null;
  sizeLeft?: number | null;
  downloadCount?: number;
  service?: string | null;
  estimatedCompletionTime?: string | null;
  bookImportProgresses?: {
    format: 'ebook' | 'audiobook';
    attemptCount?: number;
    maxAttempts?: number;
    nextAttemptAt?: string | null;
  }[];
}

interface RequestHistory {
  request: RequestItem;
  current: CurrentStatus;
  history: { results: StatusEvent[]; total: number };
}

const downloadableTypes = new Set(['movie', 'tv', 'book', 'comic', 'magazine']);
const seasonStatus = new Map([
  [1, 'Waiting for approval'],
  [2, 'Approved'],
  [3, 'Declined'],
  [4, 'Failed'],
  [5, 'Completed'],
]);

const stages = new Map([
  ['requested', 'Requested'],
  ['approved', 'Approved'],
  ['searching', 'Searching'],
  ['downloading', 'Downloading'],
  ['importing', 'Importing'],
  ['library', 'Checking library'],
  ['available', 'Available'],
  ['unavailable', 'Unavailable'],
  ['failed', 'Failed'],
  ['declined', 'Declined'],
  ['cancelled', 'Cancelled'],
]);

function formatSize(bytes: number) {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const scale = Math.min(
    units.length - 1,
    bytes > 0 ? Math.floor(Math.log2(bytes) / 10) : 0
  );
  return `${(bytes / 1024 ** scale).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${units[scale]}`;
}

function StatusTime({ value }: { value: string }) {
  const time = new Date(value);
  if (!Number.isFinite(time.valueOf())) return null;
  return <time dateTime={value}>{time.toLocaleString()}</time>;
}

function RequestProgress({ current }: { current: CurrentStatus }) {
  const {
    percent,
    size,
    sizeLeft,
    downloadCount,
    service,
    estimatedCompletionTime,
  } = current;
  const hasSize =
    typeof size === 'number' &&
    Number.isFinite(size) &&
    size > 0 &&
    typeof sizeLeft === 'number' &&
    Number.isFinite(sizeLeft) &&
    sizeLeft >= 0 &&
    sizeLeft <= size;
  return (
    <>
      <p className="note">
        Current status: {stages.get(current.stage) ?? 'Unknown'}
        {typeof percent === 'number' &&
          Number.isFinite(percent) &&
          percent >= 0 &&
          percent <= 100 &&
          ` · ${Math.round(percent)}%`}
        {service && ` · ${service}`}
      </p>
      {current.message && <p className="note">{current.message}</p>}
      {hasSize && (
        <p className="note">
          {formatSize(size - sizeLeft)} of {formatSize(size)} downloaded
        </p>
      )}
      {!!downloadCount && downloadCount > 0 && (
        <p className="note">
          {downloadCount} {downloadCount === 1 ? 'download' : 'downloads'}
        </p>
      )}
      {estimatedCompletionTime &&
        Number.isFinite(Date.parse(estimatedCompletionTime)) && (
          <p className="note">
            Estimated completion <StatusTime value={estimatedCompletionTime} />
          </p>
        )}
      {current.bookImportProgresses?.map((item) => (
        <p className="note" key={item.format}>
          {item.format === 'ebook' ? 'Ebook' : 'Audiobook'} import pending
          {typeof item.attemptCount === 'number' &&
            ` · Attempt ${item.attemptCount}`}
          {typeof item.maxAttempts === 'number' &&
            typeof item.attemptCount === 'number' &&
            ` of ${item.maxAttempts}`}
          {item.nextAttemptAt &&
            Number.isFinite(Date.parse(item.nextAttemptAt)) && (
              <>
                {' '}
                · Next attempt <StatusTime value={item.nextAttemptAt} />
              </>
            )}
        </p>
      ))}
    </>
  );
}

export default function RequestHistorySheet({
  id,
  title,
  close,
  renderActions,
  describeRequest,
}: {
  id: number;
  title?: string;
  describeRequest?: (request: RequestItem) => Promise<{ title: string }>;
  close: () => void;
  renderActions?: (request: RequestItem, title: string) => ReactNode;
}) {
  const [showFiles, setShowFiles] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, close);
  const history = useApi<RequestHistory>(`/request/status/${id}`);
  const data =
    typeof history.data?.current?.stage === 'string' &&
    Array.isArray(history.data?.history?.results)
      ? history.data
      : null;
  const error =
    history.error ||
    (history.data && !data ? 'Invalid request history response.' : null);
  const reload = history.reload;

  const [resolvedTitle, setResolvedTitle] = useState<string>();
  const request = data?.request;
  useEffect(() => {
    if (title || !describeRequest || request?.id !== id || !request.media)
      return;
    let active = true;
    void describeRequest(request).then(
      (description) => {
        if (active && description.title) setResolvedTitle(description.title);
      },
      () => {}
    );
    return () => {
      active = false;
    };
  }, [describeRequest, id, request, title]);
  const displayTitle = title || resolvedTitle || `Request #${id}`;

  return createPortal(
    <div className="sheet-wrap open">
      <div className="sheet-scrim" aria-hidden="true" onClick={close} />
      <div
        className="sheet"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Request history"
      >
        <div className="grab" />
        <div className="pk">
          <header>
            <h2>Request History</h2>
            <p className="note">{displayTitle}</p>
            {request?.type === 'book' && (
              <p className="note">{bookRequestLabel(request.bookFormat)}</p>
            )}
            {request?.is4k &&
              (request.type === 'movie' || request.type === 'tv') && (
                <p className="note">
                  {request.type === 'movie' ? 'Movie' : 'Series'} · 4K
                </p>
              )}
          </header>
          <ServiceNote error={error} what="request history" retry={reload} />
          {!data && !error && (
            <p className="note" role="status">
              Loading request history…
            </p>
          )}
          {data && (
            <>
              <RequestProgress current={data.current} />
              {request?.type === 'tv' && !!request.seasons?.length && (
                <ul className="setlist" aria-label="Requested seasons">
                  {request.seasons.map(
                    ({ seasonNumber, episodeNumbers, status }) => (
                      <li className="set" key={seasonNumber}>
                        <b>
                          {seasonNumber === 0
                            ? 'Specials'
                            : `Season ${seasonNumber}`}
                        </b>
                        <small>
                          {episodeNumbers?.length
                            ? `Episodes ${episodeNumbers.join(', ')}`
                            : 'All episodes'}
                          {status !== undefined &&
                            seasonStatus.has(status) &&
                            ` · ${seasonStatus.get(status)}`}
                        </small>
                      </li>
                    )
                  )}
                </ul>
              )}
              {data.request?.status === 1 && data.request.quotaException && (
                <Pill k="wait">Over Quota</Pill>
              )}
              {data.request?.id === id &&
                renderActions?.(
                  {
                    ...data.request,
                    currentStatus: {
                      ...data.current,
                      percent: data.current.percent ?? null,
                      message: data.current.message ?? undefined,
                    },
                  },
                  displayTitle
                )}

              {data.current.stage === 'available' &&
                downloadableTypes.has(data.request?.type) &&
                (showFiles ? (
                  <RequestFiles id={id} />
                ) : (
                  <button
                    className="btn btn-tonal btn-sm"
                    onClick={() => setShowFiles(true)}
                  >
                    Find Download Files
                  </button>
                ))}
              {data.history.results.length ? (
                <ol className="setlist">
                  {data.history.results.map((event) => {
                    return (
                      <li className="set" key={event.id}>
                        <div>
                          <b>{stages.get(event.stage) ?? 'Status updated'}</b>
                          <div className="note">
                            <StatusTime value={event.createdAt} />
                            {event.attempt > 1 && ` · Attempt ${event.attempt}`}
                          </div>
                          {event.message && (
                            <p className="note">{event.message}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="note">
                  No history has been recorded for this request.
                </p>
              )}
              {data.history.total > data.history.results.length && (
                <p className="note">
                  Showing the latest {data.history.results.length} of{' '}
                  {data.history.total} events.
                </p>
              )}
            </>
          )}
          <div className="pk-foot">
            {data && (
              <button className="btn btn-tonal" onClick={reload}>
                Refresh Status
              </button>
            )}
            <button className="btn btn-quiet" onClick={close}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
