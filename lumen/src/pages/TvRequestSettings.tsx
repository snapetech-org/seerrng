import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, ApiError } from '../api';
import { remember } from '../apiCache';
import { useAuth } from '../auth';
import { Section } from '../components/cards';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { ServiceNote } from '../components/extra';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';

const GATE = {
  off: {
    status: 'Approval needed',
    label: 'Request Approval',
    action: 'request',
  },
  denied: {
    status: 'Request declined',
    label: 'Request Approval Again',
    action: 'request',
  },
  pending: {
    status: 'Waiting for approval',
    label: 'Cancel Request',
    action: 'cancel',
  },
  approved: { status: 'Approved · off', label: 'Turn On', action: 'enable' },
  enabled: {
    status: 'Enabled for your account',
    label: 'Turn Off',
    action: 'disable',
  },
} as const;
const gateStatusMessages: Record<GateStatus, string> = {
  off: 'components.UserProfile.UserSettings.UserTvSeasonWatchGateAccess.statusOff',
  denied:
    'components.UserProfile.UserSettings.UserTvSeasonWatchGateAccess.statusDenied',
  pending:
    'components.UserProfile.UserSettings.UserTvSeasonWatchGateAccess.statusPending',
  approved:
    'components.UserProfile.UserSettings.UserTvSeasonWatchGateAccess.statusApproved',
  enabled:
    'components.UserProfile.UserSettings.UserTvSeasonWatchGateAccess.statusEnabled',
};
type GateStatus = keyof typeof GATE;
interface GateAccess {
  status: GateStatus;
  globallyEnabled: boolean;
}
interface QueueAccess {
  defaultEpisodeCount: number;
}
type Change =
  | { kind: 'gate'; action: (typeof GATE)[GateStatus]['action']; label: string }
  | { kind: 'queue'; count: number };

interface PendingAccessRequest {
  id: number;
  displayName: string;
  requestedAt: string | null;
}

function AccessReview({ viewerId }: { viewerId: number }) {
  const { t } = useLumenLocale();
  const { data, error, reload } = useApi<PendingAccessRequest[]>(
    '/user/tv-season-watch-gate-requests'
  );
  const [pending, setPending] = useState<{
    request: PendingAccessRequest;
    decision: 'approve' | 'deny';
  }>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const working = useRef(false);
  useEffect(() => {
    const timer = window.setInterval(reload, 60_000);
    return () => window.clearInterval(timer);
  }, [reload]);

  const label =
    pending?.decision === 'approve'
      ? t(
          'components.UserList.TvSeasonWatchGateApprovalQueue.approve',
          'Approve'
        )
      : t('components.UserList.TvSeasonWatchGateApprovalQueue.deny', 'Decline');

  async function review() {
    if (!pending || pending.request.id === viewerId || working.current) return;
    const generation = sessionGeneration();
    let reviewed = false;
    let staleRequest = false;
    working.current = true;
    setBusy(true);
    setFailure('');
    setNotice('');
    try {
      await api(
        `/user/${pending.request.id}/settings/tv-season-watch-gate/review`,
        {
          method: 'POST',
          body: JSON.stringify({ decision: pending.decision }),
        }
      );
      if (generation !== sessionGeneration()) return;
      reviewed = true;
      setFailure('');
      setNotice(
        `Request ${pending.decision === 'approve' ? 'approved' : 'declined'}.`
      );
    } catch (error) {
      if (generation !== sessionGeneration()) return;
      staleRequest = error instanceof ApiError && error.status === 409;
      setFailure(
        friendlyError(
          error,
          t(
            'components.UserList.TvSeasonWatchGateApprovalQueue.error',
            'Could not review this request.'
          )
        )
      );
    } finally {
      if (generation === sessionGeneration()) {
        if (reviewed) setPending(undefined);
        setBusy(false);
        if (reviewed || staleRequest) reload();
      }
      working.current = false;
    }
  }

  return (
    <Section
      title={t(
        'components.UserList.TvSeasonWatchGateApprovalQueue.title',
        'Previous-season watch requests'
      )}
    >
      <ServiceNote
        error={error}
        what={t('lumen.error.what.accessRequests', 'TV access requests')}
        retry={reload}
      />
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      {!data && !error && (
        <p className="note" role="status">
          Loading access requests…
        </p>
      )}
      {data?.length === 0 && (
        <p className="note">
          {t(
            'components.UserList.TvSeasonWatchGateApprovalQueue.empty',
            'No pending access requests.'
          )}
        </p>
      )}
      {!!data?.length && (
        <ul className="setlist">
          {data.map((request) => (
            <li className="set" key={request.id}>
              <div>
                <b>{request.displayName}</b>
                {request.requestedAt && (
                  <small>
                    {t(
                      'components.UserList.TvSeasonWatchGateApprovalQueue.requested',
                      'Requested {date}',
                      {
                        date: new Date(
                          request.requestedAt
                        ).toLocaleDateString(),
                      }
                    )}
                  </small>
                )}
              </div>
              {request.id === viewerId ? (
                <small>
                  {t(
                    'components.UserList.TvSeasonWatchGateApprovalQueue.ownRequest',
                    'Another user manager must review your request.'
                  )}
                </small>
              ) : (
                <div className="toolbar">
                  <button
                    className="btn btn-quiet btn-sm"
                    onClick={() => setPending({ request, decision: 'deny' })}
                  >
                    {t(
                      'components.UserList.TvSeasonWatchGateApprovalQueue.deny',
                      'Decline'
                    )}
                  </button>
                  <button
                    className="btn btn-tonal btn-sm"
                    onClick={() => setPending({ request, decision: 'approve' })}
                  >
                    {t(
                      'components.UserList.TvSeasonWatchGateApprovalQueue.approve',
                      'Approve'
                    )}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {pending && (
        <ConfirmSheet
          title={t(
            pending.decision === 'approve'
              ? 'components.UserList.TvSeasonWatchGateApprovalQueue.approveTitle'
              : 'components.UserList.TvSeasonWatchGateApprovalQueue.denyTitle',
            `${label} access?`
          )}
          body={
            pending.decision === 'approve'
              ? 'This user can turn on the previous-season watch requirement for their account.'
              : t(
                  'components.UserList.TvSeasonWatchGateApprovalQueue.denyDescription',
                  'This user can request access again from their account.'
                )
          }
          confirm={label}
          cancel={t('lumen.tvRequests.cancel', 'Cancel')}
          busy={busy}
          children={
            failure ? (
              <p className="note" role="alert">
                {failure}
              </p>
            ) : undefined
          }
          onConfirm={() => void review()}
          onClose={() => {
            if (!working.current) {
              setPending(undefined);
              setFailure('');
            }
          }}
        />
      )}
    </Section>
  );
}

function episodeAheadLabel(
  count: number,
  locale: string,
  t: ReturnType<typeof useLumenLocale>['t']
) {
  const plural = new Intl.PluralRules(locale).select(count);
  const key = `lumen.tvRequests.episodeAhead.${plural}`;
  const fallback =
    plural === 'one' ? '{count} episode ahead' : '{count} episodes ahead';
  return t(key, fallback, { count });
}

function episodeOptionLabel(
  count: number,
  locale: string,
  t: ReturnType<typeof useLumenLocale>['t']
) {
  const plural = new Intl.PluralRules(locale).select(count);
  const key = `lumen.tvRequests.episodeOption.${plural}`;
  const fallback = plural === 'one' ? '{count} episode' : '{count} episodes';
  const formattedCount = new Intl.NumberFormat(locale).format(count);
  return t(key, fallback, { count: formattedCount });
}

function RequestSettings({
  id,
  permissions,
}: {
  id: number;
  permissions: number;
}) {
  const { locale, t } = useLumenLocale();
  const base = `/user/${id}/settings`;
  const gatePath = base + '/tv-season-watch-gate';
  const queuePath = base + '/episode-queue';
  const gate = useApi<GateAccess>(gatePath);
  const queue = useApi<QueueAccess>(queuePath);
  const { hash } = useLocation();
  const loaded = Boolean(
    (gate.data || gate.error) && (queue.data || queue.error)
  );
  useEffect(() => {
    if (loaded && hash === '#episode-queue') {
      document
        .getElementById('episode-queue')
        ?.scrollIntoView({ block: 'start' });
    }
  }, [hash, loaded]);
  const [draft, setDraft] = useState<number>();
  const [confirmation, setConfirmation] = useState<Change>();
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const canManageUsers = (permissions & (2 | 8)) !== 0;
  const bypass = (permissions & (2 | 16)) !== 0;
  const policy = gate.data && GATE[gate.data.status];
  const count = draft ?? queue.data?.defaultEpisodeCount ?? 0;
  const gateActionLabel = (status: GateStatus) => {
    const action = GATE[status].action;
    const message =
      action === 'request'
        ? status === 'denied'
          ? 'components.UserProfile.UserSettings.UserTvSeasonWatchGateAccess.requestAgain'
          : 'components.UserProfile.UserSettings.UserTvSeasonWatchGateAccess.requestAccess'
        : action === 'cancel'
          ? 'components.UserProfile.UserSettings.UserTvSeasonWatchGateAccess.cancelRequest'
          : action === 'enable'
            ? 'components.UserProfile.UserSettings.UserTvSeasonWatchGateAccess.turnOn'
            : 'components.UserProfile.UserSettings.UserTvSeasonWatchGateAccess.turnOff';
    return t(message, GATE[status].label);
  };
  const reloadGate = gate.reload;
  useEffect(() => {
    const timer = window.setInterval(reloadGate, 60_000);
    return () => window.clearInterval(timer);
  }, [reloadGate]);

  async function save() {
    if (!confirmation || working.current) return;
    const isQueue = confirmation.kind === 'queue';
    if (
      isQueue
        ? !canManageUsers || !queue.data
        : bypass ||
          !gate.data ||
          gate.data.globallyEnabled ||
          policy?.action !== confirmation.action
    )
      return;
    const path = isQueue ? queuePath : gatePath;
    const generation = sessionGeneration();
    let saved = false;
    working.current = true;
    setBusy(true);
    setNotice('');
    setFailure('');
    try {
      const next = await api<QueueAccess | GateAccess>(path, {
        method: 'POST',
        body: JSON.stringify(
          isQueue
            ? { defaultEpisodeCount: confirmation.count }
            : { action: confirmation.action }
        ),
      });
      if (generation !== sessionGeneration()) return;
      saved = true;
      remember(path, next);
      if (isQueue) {
        setDraft(undefined);
        queue.refresh();
      } else gate.refresh();
      setNotice(
        isQueue
          ? t(
              'components.UserProfile.UserSettings.UserEpisodeQueueSettings.saved',
              'Episode Queue default saved.'
            )
          : t(
              'components.UserProfile.UserSettings.UserTvSeasonWatchGateAccess.saved',
              'TV request access updated.'
            )
      );
    } catch {
      if (generation !== sessionGeneration()) return;
      setFailure(
        isQueue
          ? t(
              'components.UserProfile.UserSettings.UserEpisodeQueueSettings.error',
              'Could not update this Episode Queue default. Try again.'
            )
          : t(
              'components.UserProfile.UserSettings.UserTvSeasonWatchGateAccess.error',
              'Could not update TV request access. Please try again.'
            )
      );
      if (isQueue) queue.reload();
      else gate.reload();
    } finally {
      if (saved) setConfirmation(undefined);
      setBusy(false);
      working.current = false;
    }
  }

  const label =
    confirmation?.kind === 'queue'
      ? t(
          'components.UserProfile.UserSettings.UserEpisodeQueueSettings.save',
          'Save default'
        )
      : (confirmation?.label ?? '');
  return (
    <>
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      <Section
        title={t(
          'components.UserProfile.UserSettings.UserTvSeasonWatchGateAccess.title',
          'Previous-season watch requirement'
        )}
      >
        <p className="note">
          {t(
            'components.UserProfile.UserSettings.UserTvSeasonWatchGateAccess.description',
            'When enabled, later TV seasons unlock after you finish the previous regular season. Specials are skipped.'
          )}
        </p>
        <ServiceNote
          error={gate.error}
          what={t(
            'components.UserProfile.UserSettings.UserTvSeasonWatchGateAccess.title',
            'TV request access'
          )}
          retry={gate.reload}
        />
        {!gate.data && !gate.error && (
          <p className="note" role="status">
            {t('lumen.tvRequests.loadingAccess', 'Loading TV request access…')}
          </p>
        )}
        {gate.data && (
          <div className="setlist">
            <div className="set">
              <b>
                {bypass
                  ? t(
                      'components.UserProfile.UserSettings.UserTvSeasonWatchGateAccess.statusBypass',
                      'You can override this rule'
                    )
                  : gate.data.globallyEnabled
                    ? t(
                        'components.UserProfile.UserSettings.UserTvSeasonWatchGateAccess.statusGlobal',
                        'Enabled for everyone'
                      )
                    : policy &&
                      t(gateStatusMessages[gate.data.status], policy.status)}
              </b>
              {!bypass && !gate.data.globallyEnabled && policy && (
                <button
                  className="btn btn-tonal btn-sm"
                  disabled={busy}
                  onClick={() =>
                    setConfirmation({
                      kind: 'gate',
                      action: policy.action,
                      label: gateActionLabel(gate.data!.status),
                    })
                  }
                >
                  {gateActionLabel(gate.data.status)}
                </button>
              )}
            </div>
          </div>
        )}
        <div className="toolbar">
          <Link
            to="/me/account/linked-accounts"
            className="btn btn-quiet btn-sm"
          >
            {t(
              'components.UserProfile.UserSettings.menuLinkedAccounts',
              'Linked Accounts'
            )}
          </Link>
        </div>
      </Section>
      {canManageUsers && <AccessReview viewerId={id} />}
      <Section
        title={t('components.RequestModal.watchAheadLabel', 'Episode Queue')}
        id="episode-queue"
      >
        <p className="note">
          {t(
            'components.UserProfile.UserSettings.UserEpisodeQueueSettings.defaultHelp',
            'Playback can keep upcoming episodes requested on interactive TV requests. User managers set the account default.'
          )}
        </p>
        <ServiceNote
          error={queue.error}
          what={t(
            'components.UserProfile.UserSettings.UserEpisodeQueueSettings.title',
            'Episode Queue defaults'
          )}
          retry={queue.reload}
        />
        {!queue.data && !queue.error && (
          <p className="note" role="status">
            Loading Episode Queue…
          </p>
        )}
        {queue.data && (
          <div className="setlist">
            <div className="set">
              {canManageUsers ? (
                <label className="sel">
                  <span className="lbl">
                    {t(
                      'components.UserProfile.UserSettings.UserEpisodeQueueSettings.defaultLabel',
                      'Episodes Ahead'
                    )}
                  </span>
                  <select
                    aria-label={t(
                      'components.UserProfile.UserSettings.UserEpisodeQueueSettings.defaultLabel',
                      'Episodes Ahead'
                    )}
                    value={count}
                    disabled={busy}
                    onChange={(event) => setDraft(Number(event.target.value))}
                  >
                    <option value={0}>
                      {t(
                        'components.RequestEpisodeQueueControl.watchAheadOff',
                        'Off'
                      )}
                    </option>
                    {[1, 2, 3, 4, 5].map((value) => (
                      <option key={value} value={value}>
                        {episodeOptionLabel(value, locale, t)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <b>
                  {count
                    ? episodeAheadLabel(count, locale, t)
                    : t(
                        'components.RequestEpisodeQueueControl.watchAheadOff',
                        'Off'
                      )}
                </b>
              )}
              {canManageUsers && (
                <button
                  className="btn btn-tonal btn-sm"
                  disabled={busy || count === queue.data.defaultEpisodeCount}
                  onClick={() => setConfirmation({ kind: 'queue', count })}
                >
                  {t(
                    'components.UserProfile.UserSettings.UserEpisodeQueueSettings.save',
                    'Save default'
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </Section>
      {confirmation && (
        <ConfirmSheet
          title={
            confirmation.kind === 'queue'
              ? t(
                  'components.UserProfile.UserSettings.UserEpisodeQueueSettings.modalTitle',
                  'Apply this Episode Queue default?'
                )
              : t(
                  confirmation.action === 'request'
                    ? 'components.UserProfile.UserSettings.UserTvSeasonWatchGateAccess.modalRequestTitle'
                    : confirmation.action === 'cancel'
                      ? 'components.UserProfile.UserSettings.UserTvSeasonWatchGateAccess.modalCancelTitle'
                      : confirmation.action === 'enable'
                        ? 'components.UserProfile.UserSettings.UserTvSeasonWatchGateAccess.modalEnableTitle'
                        : 'components.UserProfile.UserSettings.UserTvSeasonWatchGateAccess.modalDisableTitle',
                  `${label}?`
                )
          }
          body={
            confirmation.kind === 'queue'
              ? confirmation.count === 0
                ? t(
                    'components.UserProfile.UserSettings.UserEpisodeQueueSettings.modalOff',
                    'This stops future Episode Queue additions; existing requests stay in place.'
                  )
                : t(
                    'components.UserProfile.UserSettings.UserEpisodeQueueSettings.modalOn',
                    'This keeps {count} episodes queued ahead on existing and future requests.',
                    { count: confirmation.count }
                  )
              : t(
                  confirmation.action === 'request'
                    ? 'components.UserProfile.UserSettings.UserTvSeasonWatchGateAccess.modalRequestDescription'
                    : confirmation.action === 'cancel'
                      ? 'components.UserProfile.UserSettings.UserTvSeasonWatchGateAccess.modalCancelDescription'
                      : confirmation.action === 'enable'
                        ? 'components.UserProfile.UserSettings.UserTvSeasonWatchGateAccess.modalEnableDescription'
                        : 'components.UserProfile.UserSettings.UserTvSeasonWatchGateAccess.modalDisableDescription',
                  'This changes the previous-season watch requirement for your account.'
                )
          }
          confirm={label}
          cancel={t('lumen.tvRequests.cancel', 'Cancel')}
          busy={busy}
          children={
            failure ? (
              <p className="note" role="alert">
                {failure}
              </p>
            ) : undefined
          }
          onConfirm={() => void save()}
          onClose={() => {
            if (!working.current) {
              setConfirmation(undefined);
              setFailure('');
            }
          }}
        />
      )}
    </>
  );
}

export default function TvRequestSettings() {
  const { t } = useLumenLocale();
  const { user } = useAuth();
  return (
    <>
      <header className="ph">
        <h1>{t('lumen.account.tvRequestSettings', 'TV Request Settings')}</h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/me/account">
          {t('lumen.account.backToSettings', 'Back to Account Settings')}
        </Link>
      </div>
      {user && (
        <RequestSettings
          key={user.id}
          id={user.id}
          permissions={user.permissions}
        />
      )}
    </>
  );
}
