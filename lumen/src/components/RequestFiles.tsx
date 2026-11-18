import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../auth';
import { useApi } from '../hooks';
import { ServiceNote } from './extra';
import { useDialog } from './useDialog';

type BookFormat = 'ebook' | 'audiobook';
type ReaderType = 'book' | 'comic' | 'magazine';

interface DownloadList {
  results: { id: string; name: string; format?: 'ebook' | 'audiobook' }[];
  hadErrors?: boolean;
}

export function RequestFiles({
  id,
  format,
}: {
  id: number;
  format?: BookFormat;
}) {
  const path = `/request/status/${id}/downloads`;
  const { data, error, reload } = useApi<DownloadList>(path);
  const files = data?.results.filter(
    (file) =>
      /^[A-Za-z0-9_-]{43}$/.test(file.id) && (!format || file.format === format)
  );
  return (
    <section aria-labelledby="request-files-heading">
      <h3 id="request-files-heading">Download Files</h3>
      <ServiceNote error={error} what="request files" retry={reload} />
      {!data && !error && (
        <p className="note" role="status">
          Checking for downloadable files…
        </p>
      )}
      {data?.hadErrors && (
        <p className="note" role="status">
          Some sources couldn’t be checked.{' '}
          <button className="btn btn-quiet btn-sm" onClick={reload}>
            Check again
          </button>
        </p>
      )}
      {files?.length ? (
        <ul className="setlist">
          {files.map((file) => (
            <li className="set" key={file.id}>
              <div>
                <a className="go" href={`/api/v1${path}/${file.id}`} download>
                  {file.name}
                </a>
                {file.format && (
                  <div className="note">
                    {file.format === 'ebook' ? 'Ebook' : 'Audiobook'}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : data && !data.hadErrors ? (
        <p className="note">No downloadable files were found.</p>
      ) : null}
    </section>
  );
}

interface AvailableRequests {
  results: {
    request: {
      id: number;
      bookFormat?: string;
      requestedBy?: { id: number };
      media?: { id: number };
      type: string;
    };
    status: { stage: string };
  }[];
}

function ReaderFilesSheet({
  mediaId,
  type,
  format,
  userId,
  close,
}: {
  mediaId: number;
  type: ReaderType;
  format?: BookFormat;
  userId: number;
  close: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<number | null>(null);
  useDialog(ref, close);
  const params = new URLSearchParams({
    take: '100',
    skip: '0',
    requestedBy: String(userId),
    mediaType: type,
    filter: 'available',
    timeFrame: 'all',
    sort: 'added',
    sortDirection: 'desc',
    mediaId: String(mediaId),
  });
  if (format) params.set('bookFormat', format);
  const { data, error, reload } = useApi<AvailableRequests>(
    `/request/status?${params}`
  );
  const matches = data?.results.filter(
    ({ request, status }) =>
      request.id > 0 &&
      Number.isSafeInteger(request.id) &&
      request.requestedBy?.id === userId &&
      request.media?.id === mediaId &&
      request.type === type &&
      status.stage === 'available' &&
      (!format ||
        (request.bookFormat ?? 'ebook') === format ||
        request.bookFormat === 'both')
  );
  const requestId =
    matches?.find(({ request }) => request.id === selected)?.request.id ??
    matches?.[0]?.request.id;

  return createPortal(
    <div className="sheet-wrap open">
      <div className="sheet-scrim" aria-hidden="true" onClick={close} />
      <div
        className="sheet"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Download request files"
      >
        <div className="grab" />
        <div className="pk">
          <ServiceNote error={error} what="available requests" retry={reload} />
          {!data && !error && (
            <p className="note" role="status">
              Checking your requests…
            </p>
          )}
          {matches?.length === 0 && (
            <p className="note">
              You have no available requests for this selection.
            </p>
          )}
          {!!matches && matches.length > 1 && (
            <label className="sel">
              <span className="lbl">Request</span>
              <select
                value={requestId}
                onChange={(event) => setSelected(Number(event.target.value))}
              >
                {matches.map(({ request }) => (
                  <option key={request.id} value={request.id}>
                    Request #{request.id}
                  </option>
                ))}
              </select>
            </label>
          )}
          {requestId && (
            <RequestFiles key={requestId} id={requestId} format={format} />
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

export function ReaderDownloads({
  mediaId,
  type,
  format,
}: {
  mediaId?: number;
  type: ReaderType;
  format?: BookFormat;
}) {
  const { user } = useAuth();
  const [selection, setSelection] = useState<string | null>(null);
  if (!user || !mediaId || !Number.isSafeInteger(mediaId) || mediaId < 1)
    return null;
  const key = `${user.id}:${type}:${mediaId}:${format ?? ''}`;
  return (
    <>
      <button
        className="btn btn-quiet btn-sm"
        onClick={() => setSelection(key)}
      >
        {format === 'ebook'
          ? 'Download Ebook'
          : format === 'audiobook'
            ? 'Download Audiobook'
            : 'Download Files'}
      </button>
      {selection === key && (
        <ReaderFilesSheet
          mediaId={mediaId}
          type={type}
          format={format}
          userId={user.id}
          close={() => setSelection(null)}
        />
      )}
    </>
  );
}
