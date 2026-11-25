import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { ServiceNote } from '../components/extra';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';

interface Job {
  id: string;
  name: string;
  type: 'process' | 'command';
  interval: string;
  cronSchedule: string;
  enabled: boolean;
  running: boolean;
  canCancel?: boolean;
  nextExecutionTime: string | null;
}

const frequencies: Record<
  string,
  { values: number[]; cron: (value: number) => string }
> = {
  seconds: { values: [30, 45, 60], cron: (value) => `*/${value} * * * * *` },
  minutes: {
    values: [3, 5, 10, 15, 20, 30, 60],
    cron: (value) => `0 */${value} * * * *`,
  },
  hours: {
    values: [1, 2, 3, 4, 6, 8, 12, 24],
    cron: (value) => `0 0 */${value} * * *`,
  },
  days: {
    values: [1, 2, 3, 4, 5, 6, 7, 10, 14, 21],
    cron: (value) => `0 0 1 */${value} * *`,
  },
};

function frequencyLabel(
  interval: string,
  value: number,
  locale: string,
  t: ReturnType<typeof useLumenLocale>['t']
) {
  if (interval === 'seconds' && value === 45) {
    return t(
      'lumen.adminJobs.frequency.atSeconds',
      'At Seconds 0 and 45 Each Minute'
    );
  }
  if (interval === 'days') {
    if (value === 1)
      return t('lumen.adminJobs.frequency.daily', 'Daily at 01:00');
    const category = new Intl.PluralRules(locale).select(value);
    return t(
      `lumen.adminJobs.frequency.days.${category}`,
      'Every {count} Days of the Month',
      { count: value }
    );
  }
  const category = new Intl.PluralRules(locale).select(value);
  return t(
    `lumen.adminJobs.frequency.${interval}.${category}`,
    `Every {count} ${interval}`,
    { count: value }
  );
}

function ScheduleFrequency({
  interval,
  schedule,
  disabled,
  onChange,
  locale,
  t,
}: {
  interval: string;
  schedule: string;
  disabled: boolean;
  onChange: (schedule: string) => void;
  locale: string;
  t: ReturnType<typeof useLumenLocale>['t'];
}) {
  if (!Object.hasOwn(frequencies, interval)) return null;
  const { values, cron } = frequencies[interval];
  const fields = schedule.trim().split(/\s+/);
  const normalized = (fields.length === 5 ? ['0', ...fields] : fields).join(
    ' '
  );
  const current = values.find((value) => cron(value) === normalized);
  return (
    <label className="sel">
      <span className="lbl">
        {t('lumen.adminJobs.frequency.label', 'Frequency')}
      </span>
      <select
        value={current ?? ''}
        disabled={disabled}
        onChange={(event) => onChange(cron(Number(event.target.value)))}
      >
        <option value="" disabled>
          {t('lumen.adminJobs.frequency.custom', 'Custom Schedule')}
        </option>
        {values.map((value) => (
          <option key={value} value={value}>
            {frequencyLabel(interval, value, locale, t)}
          </option>
        ))}
      </select>
    </label>
  );
}

type JobAction = 'run' | 'cancel' | 'enabled';
function actionLabel(
  job: Job,
  action: JobAction,
  t: ReturnType<typeof useLumenLocale>['t']
) {
  if (action === 'run')
    return t('components.Settings.SettingsJobsCache.runnow', 'Run Now');
  if (action === 'cancel')
    return t('components.Settings.SettingsJobsCache.canceljob', 'Cancel Job');
  return job.enabled
    ? t('components.Settings.SettingsJobsCache.disablejob', 'Disable')
    : t('components.Settings.SettingsJobsCache.enablejob', 'Enable');
}

export default function AdminJobs() {
  const { locale, t } = useLumenLocale();
  const { data, error, reload } = useApi<Job[]>('/settings/jobs', {
    keepDuringRefresh: true,
  });
  const [edit, setEdit] = useState<{ job: Job; schedule: string }>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  const working = useRef(false);

  useEffect(() => {
    if (error || busy || edit) return;
    const timer = window.setInterval(reload, 15000);
    return () => window.clearInterval(timer);
  }, [error, busy, edit, reload]);

  async function save(job: Job, action: JobAction | 'schedule', body?: object) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setFailure('');
    setNotice('');
    try {
      await api(`/settings/jobs/${encodeURIComponent(job.id)}/${action}`, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      if (action === 'schedule') {
        const updated = await api<Job[]>('/settings/jobs');
        const persisted = updated.find((item) => item.id === job.id);
        const expectedSchedule = (body as { schedule?: string } | undefined)
          ?.schedule;
        if (!persisted || persisted.cronSchedule !== expectedSchedule) {
          setFailure(
            t(
              'lumen.adminJobs.confirmFailure',
              'Could not confirm the saved schedule. Try again.'
            )
          );
          return;
        }
        setNotice(t('lumen.adminJobs.scheduleSaved', 'Schedule saved.'));
      } else {
        const jobname = t(
          `components.Settings.SettingsJobsCache.${job.id}`,
          job.name
        );
        const message =
          action === 'run'
            ? 'jobstarted'
            : action === 'cancel'
              ? 'jobcancelled'
              : body && 'enabled' in body && body.enabled
                ? 'jobenabled'
                : 'jobdisabled';
        const fallback =
          message === 'jobstarted'
            ? '{jobname} started.'
            : message === 'jobcancelled'
              ? '{jobname} canceled.'
              : message === 'jobenabled'
                ? '{jobname} enabled.'
                : '{jobname} disabled.';
        setNotice(
          t(`components.Settings.SettingsJobsCache.${message}`, fallback, {
            jobname,
          })
        );
      }
      setEdit(undefined);
    } catch (error) {
      setFailure(
        friendlyError(
          error,
          t('lumen.adminJobs.updateFailure', 'The job could not be updated.')
        )
      );
    } finally {
      setBusy(false);
      working.current = false;
      reload();
    }
  }

  return (
    <>
      <header className="ph">
        <h1>{t('lumen.adminJobs.title', 'Scheduled Jobs')}</h1>
      </header>
      <p className="note">
        {t(
          'components.Settings.SettingsJobsCache.jobsDescription',
          'SeerrNG runs maintenance jobs on a schedule. Running a job manually does not change its schedule.'
        )}
      </p>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/admin">
          {t('lumen.admin.title', 'Administration')}
        </Link>
        <Link className="btn btn-quiet btn-sm" to="/admin/caches">
          {t('lumen.adminJobs.systemCaches', 'System Caches')}
        </Link>
        <button
          className="btn btn-quiet btn-sm"
          disabled={busy}
          onClick={reload}
        >
          {t('lumen.adminJobs.refresh', 'Refresh')}
        </button>
      </div>
      <ServiceNote
        error={error}
        what={t('lumen.adminJobs.scheduledJobs', 'scheduled jobs')}
        retry={reload}
      />
      {failure && (
        <p className="note" role="alert">
          {failure}
        </p>
      )}
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      {!data && !error && (
        <p className="note" role="status">
          {t('lumen.adminJobs.loading', 'Loading scheduled jobs…')}
        </p>
      )}
      {data?.length === 0 && (
        <p className="note">
          {t('lumen.adminJobs.empty', 'No scheduled jobs.')}
        </p>
      )}
      {!!data?.length && (
        <ul className="setlist">
          {data.map((job) => (
            <li className="set" key={job.id}>
              <div>
                <b>
                  {t(
                    `components.Settings.SettingsJobsCache.${job.id}`,
                    job.name
                  )}
                </b>
                <small>
                  {t(
                    `components.Settings.SettingsJobsCache.${job.type}`,
                    job.type === 'process' ? 'Process' : 'Command'
                  )}{' '}
                  ·{' '}
                  {job.running
                    ? t('lumen.adminJobs.running', 'Running')
                    : t('lumen.adminJobs.idle', 'Idle')}{' '}
                  ·{' '}
                  {job.enabled
                    ? t(
                        'components.Settings.SettingsJobsCache.enabled',
                        'Enabled'
                      )
                    : t(
                        'components.Settings.SettingsJobsCache.disabled',
                        'Disabled'
                      )}
                </small>
                {job.enabled && job.nextExecutionTime && (
                  <small>
                    {t('lumen.adminJobs.nextRun', 'Next run {date}', {
                      date: new Date(job.nextExecutionTime).toLocaleString(
                        locale
                      ),
                    })}
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
                  <ScheduleFrequency
                    interval={job.interval}
                    schedule={edit.schedule}
                    disabled={busy}
                    onChange={(schedule) => setEdit({ job, schedule })}
                    locale={locale}
                    t={t}
                  />
                  <label className="sel">
                    <span className="lbl">
                      {t('lumen.adminJobs.cronSchedule', 'Cron Schedule')}
                    </span>
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
                    {t('lumen.adminJobs.saveSchedule', 'Save Schedule')}
                  </button>
                  <button
                    className="btn btn-quiet btn-sm"
                    type="button"
                    disabled={busy}
                    onClick={() => setEdit(undefined)}
                  >
                    {t('lumen.adminJobs.cancelEditing', 'Cancel Editing')}
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
                      {t('lumen.adminJobs.editSchedule', 'Edit Schedule')}
                    </button>
                  )}
                  <button
                    className="btn btn-tonal btn-sm"
                    disabled={busy}
                    onClick={() =>
                      void save(job, 'enabled', { enabled: !job.enabled })
                    }
                  >
                    {actionLabel(job, 'enabled', t)}
                  </button>
                  <button
                    className="btn btn-tonal btn-sm"
                    disabled={busy || (job.running && job.canCancel === false)}
                    onClick={() =>
                      void save(job, job.running ? 'cancel' : 'run')
                    }
                  >
                    {job.running
                      ? job.canCancel === false
                        ? t(
                            'lumen.adminJobs.cancellationUnavailable',
                            'Cancellation Unavailable'
                          )
                        : actionLabel(job, 'cancel', t)
                      : actionLabel(job, 'run', t)}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
