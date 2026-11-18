import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { isAdministrator, useAuth } from '../auth';
import { friendlyError } from '../errors';
import {
  patchHref,
  softwareSelectionLabel,
  type SoftwareRequest,
} from '../extras';
import { useApi } from '../hooks';
import { sessionGeneration } from '../sessionState';
import { canManageRequests } from './detail';
import { ServiceNote } from './extra';
import { useDialog } from './useDialog';

interface SoftwareHistory extends SoftwareRequest {
  request: SoftwareRequest['request'] & {
    requestedBy?: { id: number } | null;
    actions?: { retry: boolean; cancel: boolean; cancelReason?: string } | null;
  };
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

const labels = {
  approve: 'Approve',
  decline: 'Decline',
  withdraw: 'Withdraw',
  cancel: 'Cancel Request',
  retry: 'Retry',
  'stop-tracking': 'Stop Tracking',
  clear: 'Clear History',
};

type Action = keyof typeof labels;
const confirmation = {
  decline: 'Decline this software request?',
  withdraw: 'Withdraw this pending software request?',
  cancel: 'Cancel this software request?',
  'stop-tracking':
    'Remove this request and its history from SeerrNG? The provider download will continue.',
  clear: 'Permanently clear this cancelled request and its history?',
};

export function SoftwareRequestHistorySheet({
  id,
  close,
  changed,
}: {
  id: number;
  close: () => void;
  changed: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [failure, setFailure] = useState('');
  const dismiss = () => {
    if (!pending.current) close();
  };
  useDialog(ref, dismiss);
  const path = `/request/software/status/${id}`;
  const { data, error, reload } = useApi<SoftwareHistory>(path);
  const owner =
    !!user &&
    data?.request.requestedBy?.id === user.id &&
    (isAdministrator(user.permissions) || ((user.permissions ?? 0) & 32) !== 0);
  const manage = canManageRequests(user?.permissions);
  const status = data?.request.status;
  const selection = data?.request.selection;
  const patch = selection?.kind === 'patch' ? selection : null;
  const project = patch && patchHref(patch.projectId, patch.versionId);
  const capabilities = data?.request.actions;
  const actions: Action[] = [];
  if (status === 'pending') {
    if (manage) actions.push('approve', 'decline');
    if (owner) actions.push('withdraw');
  }
  if (manage || owner) {
    if (status === 'failed' && capabilities?.retry !== false)
      actions.push('retry');
    if (
      status &&
      ['approved', 'searching', 'downloading', 'importing', 'failed'].includes(
        status
      ) &&
      capabilities?.cancel !== false
    )
      actions.push('cancel');
    if (status === 'downloading' || status === 'importing')
      actions.push('stop-tracking');
    if (status === 'cancelled') actions.push('clear');
  }

  async function run(action: Action, verified = false) {
    if (pending.current || !actions.includes(action)) return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setFailure('');
    try {
      const removes = action === 'clear' || action === 'stop-tracking';
      await api(
        action === 'clear' ? path : `${path}/${action}`,
        {
          method: action === 'clear' ? 'DELETE' : 'POST',
          body:
            action === 'retry' || action === 'cancel'
              ? JSON.stringify({ confirmNoExistingDownload: verified })
              : undefined,
        },
        'empty'
      );
      if (generation !== sessionGeneration()) return;
      changed();
      setConfirm(null);
      setUncertain(false);
      if (removes) close();
      else reload();
    } catch (cause) {
      if (generation !== sessionGeneration()) return;
      if (
        cause instanceof ApiError &&
        cause.status === 409 &&
        cause.confirmationRequired === 'confirmNoExistingDownload' &&
        (action === 'retry' || action === 'cancel')
      ) {
        setConfirm(action);
        setUncertain(true);
      } else {
        setFailure(
          friendlyError(cause, 'Could not update the software request.')
        );
        setConfirm(null);
        setUncertain(false);
        reload();
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return createPortal(
    <div className="sheet-wrap open">
      <div className="sheet-scrim" aria-hidden="true" onClick={dismiss} />
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
          {failure && (
            <p className="note" role="alert">
              {failure}
            </p>
          )}
          {data && (
            <>
              <p className="note">
                {statusLabel(data.status)}
                {data.request.platform?.name &&
                  ` · ${data.request.platform.name}`}
              </p>
              {selection?.kind === 'game-content' && (
                <p className="note">
                  {softwareSelectionLabel(selection)}
                  {selection.mode === 'edition' && selection.editionId
                    ? ` · IGDB edition ${selection.editionId}`
                    : selection.mode === 'missing-selected' &&
                        selection.addonIds?.length
                      ? ` · IGDB add-ons ${selection.addonIds.join(', ')}`
                      : ''}
                </p>
              )}
              {patch && (
                <div className="toolbar">
                  {project && (
                    <Link className="chip" to={project}>
                      {patch.versionId
                        ? 'Open Requested Patch Version'
                        : 'Open Patch Project'}
                    </Link>
                  )}
                  <span className="note">
                    {patch.keepOriginal ? 'Keep original' : 'Replace original'}
                  </span>
                </div>
              )}
              {confirm ? (
                <>
                  <p className="note">
                    {uncertain
                      ? 'The provider could not confirm whether a download started. Check the download client’s queue and history. Continue only if there is no matching download.'
                      : confirmation[confirm as keyof typeof confirmation]}
                  </p>
                  <div className="rqa">
                    <button
                      className="btn btn-quiet btn-sm"
                      disabled={busy}
                      onClick={() => {
                        setConfirm(null);
                        setUncertain(false);
                      }}
                    >
                      Go Back
                    </button>
                    <button
                      className="btn btn-tonal btn-sm"
                      disabled={busy}
                      onClick={() => void run(confirm, uncertain)}
                    >
                      {uncertain
                        ? `No Download Found — ${labels[confirm]}`
                        : `Confirm ${labels[confirm]}`}
                    </button>
                  </div>
                </>
              ) : (
                <div className="rqa">
                  {actions.map((action) => (
                    <button
                      className="btn btn-tonal btn-sm"
                      key={action}
                      disabled={busy}
                      onClick={() =>
                        action === 'approve' || action === 'retry'
                          ? void run(action)
                          : setConfirm(action)
                      }
                    >
                      {labels[action]}
                    </button>
                  ))}
                </div>
              )}
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
            <button className="btn btn-quiet" disabled={busy} onClick={dismiss}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
