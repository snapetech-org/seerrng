import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { ServiceNote } from '../components/extra';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';

interface Job {
  id: string;
  name: string;
  type: 'process' | 'command';
  interval: string;
  cronSchedule: string;
  enabled: boolean;
  running: boolean;
  nextExecutionTime: string | null;
}

type Pending = { job: Job; action: 'run' | 'cancel' | 'enabled' };
function actionLabel({ job, action }: Pending) {
  if (action === 'run') return 'Run Now';
  if (action === 'cancel') return 'Cancel Job';
  return job.enabled ? 'Disable Schedule' : 'Enable Schedule';
}

export default function AdminJobs() {
  const { data, error, reload } = useApi<Job[]>('/settings/jobs', {
    keepDuringRefresh: true,
  });
  const [pending, setPending] = useState<Pending>();
  const [edit, setEdit] = useState<{ job: Job; schedule: string }>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const working = useRef(false);

  useEffect(() => {
    if (error || busy || edit || pending) return;
    const timer = window.setInterval(reload, 15000);
    return () => window.clearInterval(timer);
  }, [error, busy, edit, pending, reload]);

  async function save(
    job: Job,
    action: Pending['action'] | 'schedule',
    body?: object
  ) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setFailure('');
    try {
      await api(`/settings/jobs/${encodeURIComponent(job.id)}/${action}`, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      setEdit(undefined);
    } catch (error) {
      setFailure(friendlyError(error, 'The job could not be updated.'));
    } finally {
      setPending(undefined);
      setBusy(false);
      working.current = false;
      reload();
    }
  }

  return (
    <>
      <header className="ph">
        <h1>Scheduled Jobs</h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/me">
          Back to Account
        </Link>
        <button
          className="btn btn-quiet btn-sm"
          disabled={busy}
          onClick={reload}
        >
          Refresh
        </button>
      </div>
      <ServiceNote error={error} what="scheduled jobs" retry={reload} />
      {failure && (
        <p className="note" role="alert">
          {failure}
        </p>
      )}
      {!data && !error && (
        <p className="note" role="status">
          Loading scheduled jobs…
        </p>
      )}
      {data?.length === 0 && <p className="note">No scheduled jobs.</p>}
      {!!data?.length && (
        <ul className="setlist">
          {data.map((job) => (
            <li className="set" key={job.id}>
              <div>
                <b>{job.name}</b>
                <small>
                  {job.type === 'process' ? 'Process' : 'Command'} ·{' '}
                  {job.running ? 'Running' : 'Idle'} ·{' '}
                  {job.enabled ? 'Enabled' : 'Disabled'}
                </small>
                {job.enabled && job.nextExecutionTime && (
                  <small>
                    Next run {new Date(job.nextExecutionTime).toLocaleString()}
                  </small>
                )}
                <small>{job.cronSchedule}</small>
              </div>
              {edit?.job.id === job.id ? (
                <form
                  className="toolbar"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (edit.schedule.trim())
                      void save(job, 'schedule', {
                        schedule: edit.schedule.trim(),
                      });
                  }}
                >
                  <label className="sel">
                    <span className="lbl">Cron Schedule</span>
                    <input
                      className="cfg-json"
                      value={edit.schedule}
                      maxLength={100}
                      disabled={busy}
                      onChange={(event) =>
                        setEdit({ job, schedule: event.target.value })
                      }
                    />
                  </label>
                  <button
                    className="btn btn-tonal btn-sm"
                    disabled={
                      busy ||
                      !edit.schedule.trim() ||
                      edit.schedule.trim() === job.cronSchedule
                    }
                  >
                    Save Schedule
                  </button>
                  <button
                    className="btn btn-quiet btn-sm"
                    type="button"
                    disabled={busy}
                    onClick={() => setEdit(undefined)}
                  >
                    Cancel Editing
                  </button>
                </form>
              ) : (
                <div className="toolbar">
                  {job.interval !== 'fixed' && (
                    <button
                      className="btn btn-quiet btn-sm"
                      disabled={busy}
                      onClick={() =>
                        setEdit({ job, schedule: job.cronSchedule })
                      }
                    >
                      Edit Schedule
                    </button>
                  )}
                  <button
                    className="btn btn-tonal btn-sm"
                    disabled={busy}
                    onClick={() => setPending({ job, action: 'enabled' })}
                  >
                    {actionLabel({ job, action: 'enabled' })}
                  </button>
                  <button
                    className="btn btn-tonal btn-sm"
                    disabled={busy}
                    onClick={() =>
                      setPending({
                        job,
                        action: job.running ? 'cancel' : 'run',
                      })
                    }
                  >
                    {job.running ? 'Cancel Job' : 'Run Now'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {pending && (
        <ConfirmSheet
          title={`${actionLabel(pending)}?`}
          body={pending.job.name}
          confirm={actionLabel(pending)}
          cancel="Go Back"
          busy={busy}
          onConfirm={() =>
            void save(
              pending.job,
              pending.action,
              pending.action === 'enabled'
                ? { enabled: !pending.job.enabled }
                : undefined
            )
          }
          onClose={() => {
            if (!working.current) setPending(undefined);
          }}
        />
      )}
    </>
  );
}
