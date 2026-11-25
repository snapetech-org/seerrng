import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';

interface LogEntry {
  timestamp: string;
  level: string;
  label?: string;
  message: string;
  data?: Record<string, unknown>;
}

const levels = ['debug', 'info', 'warn', 'error'] as const;
const MAX_LOG_OFFSET = 100_000;
const pageSizes = [10, 25, 50, 100];
const logTimeOptions: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
};

function formatLogTimestamp(value: string, locale: string) {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return value;
  return new Intl.DateTimeFormat(locale, logTimeOptions).format(timestamp);
}

export default function AdminLogs() {
  const { user } = useAuth();
  if (!user) return null;
  const storageKey = `lumen-log-display:${user.id}`;
  return <LogViewer key={storageKey} storageKey={storageKey} />;
}

function LogViewer({ storageKey }: { storageKey: string }) {
  const { locale, t } = useLumenLocale();
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [{ level, take }, setDisplay] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      return {
        level: levels.find((value) => value === saved?.level) ?? 'debug',
        take: pageSizes.find((value) => value === saved?.take) ?? 25,
      };
    } catch {
      return { level: 'debug', take: 25 };
    }
  });
  const [params, setParams] = useSearchParams();
  const lastPage = Math.floor(MAX_LOG_OFFSET / take) + 1;
  const bookmarkPage = params.get('page') ?? '';
  const page = /^[1-9]\d{0,4}$/.test(bookmarkPage)
    ? Math.min(Number(bookmarkPage), lastPage)
    : 1;
  const [live, setLive] = useState(true);
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ level, take }));
    } catch {
      // The current controls still work when storage is unavailable.
    }
  }, [level, storageKey, take]);

  useEffect(() => {
    const nextSearch = input.trim();
    if (nextSearch === search) return;
    const timer = window.setTimeout(() => {
      const nextParams = new URLSearchParams(params);
      nextParams.delete('page');
      setParams(nextParams, { replace: true });
      setSearch(nextSearch);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [input, params, search, setParams]);

  function setPage(nextPage: number, replace = false) {
    if (nextPage === 1 && !params.has('page')) return;
    const next = new URLSearchParams(params);
    if (nextPage === 1) next.delete('page');
    else next.set('page', String(nextPage));
    setParams(next, { replace });
  }
  const query = new URLSearchParams({
    take: String(take),
    skip: String((page - 1) * take),
    filter: level,
  });
  if (search) query.set('search', search);
  const { data, error, reload } = useApi<{
    pageInfo: { pages: number };
    results: LogEntry[];
  }>(`/settings/logs?${query}`, {
    currentPathOnly: true,
    keepDuringRefresh: true,
  });
  const { data: appData } = useApi<{ appDataPath?: string }>(
    '/status/appdata',
    { currentPathOnly: true }
  );
  const entries = useMemo(() => {
    const occurrences = new Map<string, number>();
    return data?.results.map((entry) => {
      const details = entry.data ? JSON.stringify(entry.data) : undefined;
      const identity = JSON.stringify([
        entry.timestamp,
        entry.level,
        entry.label,
        entry.message,
        details,
      ]);
      const occurrence = (occurrences.get(identity) ?? 0) + 1;
      occurrences.set(identity, occurrence);
      return { entry, details, key: `${identity}:${occurrence}` };
    });
  }, [data]);

  useEffect(() => {
    if (!live || error) return;
    const timer = window.setInterval(reload, 5000);
    return () => window.clearInterval(timer);
  }, [live, error, reload]);

  async function copy(entry: LogEntry) {
    try {
      await navigator.clipboard.writeText(
        `${entry.timestamp} [${entry.level}]${entry.label ? `[${entry.label}]` : ''}: ${entry.message}${entry.data ? `\n${JSON.stringify(entry.data, null, 2)}` : ''}`
      );
      setCopyStatus(
        t(
          'components.Settings.SettingsLogs.copiedLogMessage',
          'Copied log message to clipboard.'
        )
      );
    } catch {
      setCopyStatus(
        t('lumen.adminLogs.copyFailure', 'Could not copy the log entry.')
      );
    }
  }

  return (
    <>
      <header className="ph">
        <h1>{t('lumen.adminLogs.title', 'System Logs')}</h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/admin">
          {t('lumen.admin.title', 'Administration')}
        </Link>
        <button className="btn btn-tonal btn-sm" onClick={reload}>
          {t('lumen.adminLogs.refresh', 'Refresh')}
        </button>
        <label>
          <input
            type="checkbox"
            checked={live}
            onChange={(event) => setLive(event.target.checked)}
          />{' '}
          {t('lumen.adminLogs.liveRefresh', 'Live Refresh')}
        </label>
      </div>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1, true);
          setSearch(input.trim());
        }}
      >
        <label className="sel">
          <span className="lbl">
            {t('components.Settings.SettingsLogs.searchLogs', 'Search Logs')}
          </span>
          <input
            className="cfg-json"
            value={input}
            maxLength={200}
            onChange={(event) => setInput(event.target.value)}
          />
        </label>
        <button className="btn btn-quiet btn-sm">
          {t('lumen.adminLogs.search', 'Search')}
        </button>
        <label className="sel">
          <span className="lbl">
            {t('components.Settings.SettingsLogs.level', 'Severity')}
          </span>
          <select
            value={level}
            onChange={(event) => {
              setDisplay({ level: event.target.value, take });
              setPage(1, true);
            }}
          >
            {levels.map((value) => (
              <option value={value} key={value}>
                {t(`lumen.adminLogs.level.${value}`, value)}
              </option>
            ))}
          </select>
        </label>
        <label className="sel">
          <span className="lbl">
            {t('lumen.adminLogs.pageSize', 'Page Size')}
          </span>
          <select
            value={take}
            onChange={(event) => {
              setDisplay({ level, take: Number(event.target.value) });
              setPage(1, true);
            }}
          >
            {pageSizes.map((size) => (
              <option key={size}>{size}</option>
            ))}
          </select>
        </label>
      </form>
      <p className="note">
        {t(
          'lumen.adminLogs.logLocation',
          'You can also view these logs directly via stdout or in the log file:'
        )}{' '}
        <code dir="ltr">
          {`${(appData?.appDataPath || '/app/config').replace(/[\\/]+$/, '')}/logs/seerr.log`}
        </code>
      </p>
      <ServiceNote
        error={error}
        what={t('lumen.adminLogs.systemLogs', 'system logs')}
        retry={reload}
      />
      {copyStatus && (
        <p className="note" role="status">
          {copyStatus}
        </p>
      )}
      {!data && !error && (
        <p className="note" role="status">
          {t('lumen.adminLogs.loading', 'Loading system logs…')}
        </p>
      )}
      {entries?.length === 0 && (
        <div>
          <p className="note">
            {t('lumen.adminLogs.noResults', 'No logs match these filters.')}
          </p>
          {level !== 'debug' && (
            <button
              className="btn btn-quiet btn-sm"
              type="button"
              onClick={() => {
                setDisplay({ level: 'debug', take });
                setPage(1, true);
              }}
            >
              {t('lumen.adminLogs.showAll', 'Show All Logs')}
            </button>
          )}
        </div>
      )}
      {!!entries?.length && (
        <ul className="setlist">
          {entries.map(({ entry, details, key }) => (
            <li className="set" key={key}>
              <div>
                <b>{entry.message}</b>
                <small>
                  {[
                    formatLogTimestamp(entry.timestamp, locale),
                    entry.level.toUpperCase(),
                    entry.label,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
                {details && (
                  <details>
                    <summary>
                      {t(
                        'components.Settings.SettingsLogs.logDetails',
                        'Details'
                      )}
                    </summary>
                    <small>{details}</small>
                  </details>
                )}
              </div>
              <button
                className="btn btn-quiet btn-sm"
                onClick={() => void copy(entry)}
              >
                {t(
                  'components.Settings.SettingsLogs.copyToClipboard',
                  'Copy Entry'
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {(page > 1 || (data?.pageInfo.pages ?? 0) > 1) && (
        <div className="toolbar">
          <button
            className="btn btn-quiet btn-sm"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            {t('lumen.adminLogs.previousPage', 'Previous Page')}
          </button>
          <span>{t('lumen.adminLogs.page', 'Page {page}', { page })}</span>
          <button
            className="btn btn-quiet btn-sm"
            disabled={!data || page >= Math.min(data.pageInfo.pages, lastPage)}
            onClick={() => setPage(page + 1)}
          >
            {t('lumen.adminLogs.nextPage', 'Next Page')}
          </button>
        </div>
      )}
    </>
  );
}
