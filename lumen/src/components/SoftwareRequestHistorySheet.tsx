import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { isAdministrator, useAuth } from '../auth';
import { friendlyError } from '../errors';
import {
  patchHref,
  useGameContentCatalog,
  type SoftwareRequest,
} from '../extras';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
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

const statusMessageIds: Record<string, string> = {
  pending: 'components.RequestStatus.SoftwareRequests.pending',
  approved: 'components.RequestStatus.SoftwareRequests.approved',
  searching: 'components.RequestStatus.SoftwareRequests.searching',
  downloading: 'components.RequestStatus.SoftwareRequests.downloading',
  importing: 'components.RequestStatus.SoftwareRequests.importing',
  available: 'components.RequestStatus.SoftwareRequests.available',
  failed: 'components.RequestStatus.SoftwareRequests.failed',
  declined: 'components.RequestStatus.SoftwareRequests.declined',
  cancelled: 'components.RequestStatus.SoftwareRequests.cancelled',
};
const actionMessageIds: Record<string, string> = {
  approve: 'components.RequestStatus.SoftwareRequests.approve',
  decline: 'components.RequestStatus.SoftwareRequests.decline',
  withdraw: 'components.RequestStatus.SoftwareRequests.withdraw',
  cancel: 'components.RequestStatus.SoftwareRequests.cancel',
  retry: 'components.RequestStatus.SoftwareRequests.retry',
  'stop-tracking':
    'components.RequestStatus.SoftwareRequests.removeFromRequests',
  clear: 'components.RequestStatus.SoftwareRequests.clearCancelled',
};

type Action =
  | 'approve'
  | 'decline'
  | 'withdraw'
  | 'cancel'
  | 'retry'
  | 'stop-tracking'
  | 'clear';
type ConfirmationAction = Exclude<Action, 'approve'>;
const confirmationMessageIds: Record<ConfirmationAction, string> = {
  decline: 'lumen.softwareHistory.confirmDecline',
  withdraw: 'lumen.softwareHistory.confirmWithdraw',
  cancel: 'lumen.softwareHistory.confirmCancel',
  retry: 'components.RequestStatus.SoftwareRequests.retryCheckRequired',
  'stop-tracking': 'lumen.softwareHistory.confirmStopTracking',
  clear: 'components.RequestStatus.SoftwareRequests.clearCancelledTitle',
};

function statusLabel(value: string, t: ReturnType<typeof useLumenLocale>['t']) {
  const id = statusMessageIds[value];
  return id
    ? t(id, value)
    : value
        .replace(/[_-]+/g, ' ')
        .replace(/^./, (first) => first.toUpperCase());
}

export function SoftwareRequestHistorySheet({
  id,
  close,
  changed,
}: {
  id: number;
  close: () => void;
  changed: () => void;
}) {
  const { locale, t } = useLumenLocale();
  const ref = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmationAction | null>(null);
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
  const { data: catalog } = useGameContentCatalog(
    selection?.kind === 'game-content' ? data?.request.catalogId : null
  );
  const requestedEdition =
    selection?.kind === 'game-content' && selection.mode === 'edition'
      ? selection.editionId
      : undefined;
  const requestedAddons =
    selection?.kind === 'game-content' && selection.mode === 'missing-selected'
      ? selection.addonIds
      : undefined;
  const editionTitle =
    requestedEdition && Array.isArray(catalog?.editions)
      ? catalog.editions.find((edition) => edition?.igdbId === requestedEdition)
          ?.title
      : undefined;
  const addons = Array.isArray(catalog?.addons) ? catalog.addons : [];
  const patch = selection?.kind === 'patch' ? selection : null;
  const project =
    patch &&
    patchHref(
      patch.projectId,
      patch.versionId,
      data?.request.category,
      data?.request.platform?.slug
    );
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
          friendlyError(
            cause,
            t(
              'components.RequestStatus.SoftwareRequests.manageError',
              'This software request could not be updated.'
            )
          )
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
        aria-label={t(
          'components.RequestStatus.SoftwareRequests.history',
          'History'
        )}
      >
        <div className="grab" />
        <div className="pk">
          <header>
            <h2>
              {t(
                'components.RequestStatus.SoftwareRequests.history',
                'History'
              )}
            </h2>
            <p className="note">{data?.request.title ?? `Request #${id}`}</p>
          </header>
          <ServiceNote
            error={error}
            what={t(
              'components.RequestStatus.SoftwareRequests.title',
              'Software Requests'
            )}
            retry={reload}
          />
          {!data && !error && (
            <p className="note" role="status">
              {t(
                'components.RequestStatus.SoftwareRequests.historyLoading',
                'Loading status history…'
              )}
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
                {statusLabel(data.status, t)}
                {data.request.platform?.name &&
                  ` · ${data.request.platform.name}`}
              </p>
              {selection?.kind === 'game-content' && (
                <p className="note">
                  {selection.mode === 'edition'
                    ? t(
                        'lumen.softwareHistory.selectionEdition',
                        'Complete Edition'
                      )
                    : (selection.addonIds?.length ?? 0) === 1
                      ? t('lumen.softwareHistory.selectionOneAddon', '1 Add-on')
                      : (selection.addonIds?.length ?? 0) > 1
                        ? t(
                            'lumen.softwareHistory.selectionManyAddons',
                            '{count} Add-ons',
                            { count: selection.addonIds?.length ?? 0 }
                          )
                        : t(
                            'lumen.softwareHistory.selectionAddons',
                            'Selected Add-ons'
                          )}
                  {requestedEdition &&
                    ` · ${editionTitle || `IGDB edition ${requestedEdition}`}`}
                  {!!requestedAddons?.length &&
                    ` · ${requestedAddons
                      .map(
                        (id) =>
                          addons.find((addon) => addon?.igdbId === id)?.title ||
                          `IGDB add-on ${id}`
                      )
                      .join(', ')}`}
                </p>
              )}
              {patch && (
                <div className="toolbar">
                  {project && (
                    <Link className="chip" to={project}>
                      {patch.versionId
                        ? t(
                            'lumen.softwareHistory.openPatchVersion',
                            'Open Requested Patch Version'
                          )
                        : t(
                            'lumen.softwareHistory.openPatchProject',
                            'Open Patch Project'
                          )}
                    </Link>
                  )}
                  <span className="note">
                    {patch.keepOriginal
                      ? t('lumen.softwareHistory.keepOriginal', 'Keep original')
                      : t(
                          'lumen.softwareHistory.replaceOriginal',
                          'Replace original'
                        )}
                  </span>
                </div>
              )}
              {confirm ? (
                <>
                  <p className="note">
                    {uncertain
                      ? t(
                          'components.RequestStatus.SoftwareRequests.retryCheckRequired',
                          'The provider cannot confirm whether the previous download started. Check the download client’s queue and history. Continue only if no matching download exists.'
                        )
                      : t(
                          confirmationMessageIds[confirm],
                          confirm === 'clear'
                            ? 'Permanently clear this cancelled request and its history?'
                            : 'Confirm this software request action?'
                        )}
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
                      {t('i18n.back', 'Go Back')}
                    </button>
                    <button
                      className="btn btn-tonal btn-sm"
                      disabled={busy}
                      onClick={() => void run(confirm, uncertain)}
                    >
                      {uncertain
                        ? t(
                            'lumen.softwareHistory.confirmAfterNoDownload',
                            'No Download Found — {action}',
                            {
                              action: t(actionMessageIds[confirm], confirm),
                            }
                          )
                        : t(
                            'lumen.softwareHistory.confirmAction',
                            'Confirm {action}',
                            {
                              action: t(actionMessageIds[confirm], confirm),
                            }
                          )}
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
                      {t(actionMessageIds[action], action)}
                    </button>
                  ))}
                </div>
              )}
              {data.message && <p className="note">{data.message}</p>}
              {(data.assets.length > 0 || data.bundle) && (
                <section
                  aria-label={t(
                    'components.RequestStatus.SoftwareRequests.downloadCopies',
                    'Download copies'
                  )}
                >
                  <h3>
                    {t(
                      'components.RequestStatus.SoftwareRequests.downloadCopies',
                      'Download copies'
                    )}
                  </h3>
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
                        <b>{statusLabel(event.status, t)}</b>
                        <div className="note">
                          <time dateTime={event.createdAt}>
                            {new Date(event.createdAt).toLocaleString(locale)}
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
                  {t(
                    'components.RequestStatus.SoftwareRequests.noHistory',
                    'No saved status updates are available.'
                  )}
                </p>
              )}
            </>
          )}
          <div className="pk-foot">
            <button className="btn btn-quiet" disabled={busy} onClick={dismiss}>
              {t('i18n.close', 'Close')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
