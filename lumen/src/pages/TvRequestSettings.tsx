import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { remember } from '../apiCache';
import { useAuth } from '../auth';
import { Section } from '../components/cards';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
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

function RequestSettings({
  id,
  permissions,
}: {
  id: number;
  permissions: number;
}) {
  const base = `/user/${id}/settings`;
  const gatePath = base + '/tv-season-watch-gate';
  const queuePath = base + '/episode-queue';
  const gate = useApi<GateAccess>(gatePath);
  const queue = useApi<QueueAccess>(queuePath);
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
      remember(path, next);
      if (isQueue) {
        setDraft(undefined);
        queue.refresh();
      } else gate.refresh();
      setNotice(
        isQueue ? 'Episode Queue default saved.' : 'TV request access updated.'
      );
    } catch {
      if (generation !== sessionGeneration()) return;
      setFailure(
        'Could not confirm the change. Review the current settings before trying again.'
      );
      if (isQueue) queue.reload();
      else gate.reload();
    } finally {
      setConfirmation(undefined);
      setBusy(false);
      working.current = false;
    }
  }

  const label =
    confirmation?.kind === 'queue'
      ? 'Save Episode Queue Default'
      : (confirmation?.label ?? '');
  return (
    <>
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      {failure && (
        <p className="note" role="alert">
          {failure}
        </p>
      )}
      <Section title="Previous-Season Watch Requirement">
        <p className="note">
          When enabled, later TV seasons unlock after you finish the previous
          regular season. Specials are skipped.
        </p>
        <ServiceNote
          error={gate.error}
          what="TV request access"
          retry={gate.reload}
        />
        {!gate.data && !gate.error && (
          <p className="note" role="status">
            Loading TV request access…
          </p>
        )}
        {gate.data && (
          <div className="setlist">
            <div className="set">
              <b>
                {bypass
                  ? 'You can override this rule'
                  : gate.data.globallyEnabled
                    ? 'Enabled for everyone'
                    : policy?.status}
              </b>
              {!bypass && !gate.data.globallyEnabled && policy && (
                <button
                  className="btn btn-tonal btn-sm"
                  disabled={busy}
                  onClick={() =>
                    setConfirmation({
                      kind: 'gate',
                      action: policy.action,
                      label: policy.label,
                    })
                  }
                >
                  {policy.label}
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
            Linked Accounts
          </Link>
        </div>
      </Section>
      <Section title="Episode Queue">
        <p className="note">
          Playback can keep upcoming episodes requested on interactive TV
          requests. User managers set the account default.
        </p>
        <ServiceNote
          error={queue.error}
          what="Episode Queue defaults"
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
                  <span className="lbl">Episodes Ahead</span>
                  <select
                    aria-label="Episodes Ahead"
                    value={count}
                    disabled={busy}
                    onChange={(event) => setDraft(Number(event.target.value))}
                  >
                    <option value={0}>Off</option>
                    {[1, 2, 3, 4, 5].map((value) => (
                      <option key={value} value={value}>
                        {value} {value === 1 ? 'episode' : 'episodes'}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <b>
                  {count
                    ? `${count} ${count === 1 ? 'episode' : 'episodes'} ahead`
                    : 'Off'}
                </b>
              )}
              {canManageUsers && (
                <button
                  className="btn btn-tonal btn-sm"
                  disabled={busy || count === queue.data.defaultEpisodeCount}
                  onClick={() => setConfirmation({ kind: 'queue', count })}
                >
                  Save Default
                </button>
              )}
            </div>
          </div>
        )}
      </Section>
      {confirmation && (
        <ConfirmSheet
          title={label + '?'}
          body={
            confirmation.kind === 'queue'
              ? 'This applies to existing and future interactive TV requests. Episodes already requested stay in place.'
              : 'This changes the previous-season watch requirement for your account.'
          }
          confirm={label}
          busy={busy}
          onConfirm={() => void save()}
          onClose={() => {
            if (!working.current) setConfirmation(undefined);
          }}
        />
      )}
    </>
  );
}

export default function TvRequestSettings() {
  const { user } = useAuth();
  return (
    <>
      <header className="ph">
        <h1>TV Request Settings</h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/me/account">
          Back to Account Settings
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
