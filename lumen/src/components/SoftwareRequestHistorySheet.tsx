import { useRef } from 'react';
import { createPortal } from 'react-dom';
import type { SoftwareRequest } from '../extras';
import { useApi } from '../hooks';
import { ServiceNote } from './extra';
import { useDialog } from './useDialog';

interface SoftwareHistory extends SoftwareRequest {
  status: string;
  message?: string;
  history: {
    id: number;
    status: string;
    createdAt: string;
    message?: string;
  }[];
  assets: { id: string; name: string }[];
  bundle?: { name: string } | null;
}

const statusLabel = (value: string) =>
  value.replace(/[_-]+/g, ' ').replace(/^./, (first) => first.toUpperCase());

export function SoftwareRequestHistorySheet({
  id,
  close,
}: {
  id: number;
  close: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, close);
  const path = `/request/software/status/${id}`;
  const { data, error, reload } = useApi<SoftwareHistory>(path);
  return createPortal(
    <div className="sheet-wrap open">
      <div className="sheet-scrim" aria-hidden="true" onClick={close} />
      <div
        className="sheet"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Software request history"
      >
        <div className="grab" />
        <div className="pk">
          <header>
            <h2>Software Request History</h2>
            <p className="note">{data?.request.title ?? `Request #${id}`}</p>
          </header>
          <ServiceNote
            error={error}
            what="software request history"
            retry={reload}
          />
          {!data && !error && (
            <p className="note" role="status">
              Loading software request history…
            </p>
          )}
          {data && (
            <>
              <p className="note">
                {statusLabel(data.status)}
                {data.request.platform?.name &&
                  ` · ${data.request.platform.name}`}
              </p>
              {data.message && <p className="note">{data.message}</p>}
              {(data.assets.length > 0 || data.bundle) && (
                <section aria-label="Downloads">
                  <h3>Download Files</h3>
                  <ul className="setlist">
                    {data.assets
                      .filter(({ id }) => id && id !== '.' && id !== '..')
                      .map((asset) => (
                        <li className="set" key={asset.id}>
                          <a
                            className="go"
                            href={`/api/v1${path}/downloads/${encodeURIComponent(asset.id)}`}
                            download
                          >
                            {asset.name}
                          </a>
                        </li>
                      ))}
                    {data.bundle && (
                      <li className="set">
                        <a
                          className="go"
                          href={`/api/v1${path}/bundle`}
                          download
                        >
                          {data.bundle.name}
                        </a>
                      </li>
                    )}
                  </ul>
                </section>
              )}
              {data.history.length ? (
                <ol className="setlist">
                  {[...data.history].reverse().map((event) => (
                    <li className="set" key={event.id}>
                      <div>
                        <b>{statusLabel(event.status)}</b>
                        <div className="note">
                          <time dateTime={event.createdAt}>
                            {new Date(event.createdAt).toLocaleString()}
                          </time>
                        </div>
                        {event.message && (
                          <p className="note">{event.message}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="note">
                  No history has been recorded for this request.
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
