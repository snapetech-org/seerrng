import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApi } from '../hooks';
import { RequestFiles } from './RequestFiles';
import { ServiceNote } from './extra';
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

interface RequestHistory {
  request: { type: string };
  current: Status;
  history: { results: StatusEvent[]; total: number };
}

const downloadableTypes = new Set(['movie', 'tv', 'book', 'comic', 'magazine']);

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

export default function RequestHistorySheet({
  id,
  title,
  close,
}: {
  id: number;
  title?: string;
  close: () => void;
}) {
  const [showFiles, setShowFiles] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, close);
  const { data, error, reload } = useApi<RequestHistory>(
    `/request/status/${id}`
  );

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
            <p className="note">{title ?? `Request #${id}`}</p>
          </header>
          <ServiceNote error={error} what="request history" retry={reload} />
          {!data && !error && (
            <p className="note" role="status">
              Loading request history…
            </p>
          )}
          {data && (
            <>
              <p className="note">
                Current status: {stages.get(data.current.stage) ?? 'Unknown'}
              </p>
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
                    const timestamp = new Date(event.createdAt);
                    return (
                      <li className="set" key={event.id}>
                        <div>
                          <b>{stages.get(event.stage) ?? 'Status updated'}</b>
                          <div className="note">
                            {Number.isFinite(timestamp.valueOf()) && (
                              <time dateTime={event.createdAt}>
                                {timestamp.toLocaleString()}
                              </time>
                            )}
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
