import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';

interface LogEntry {
  timestamp: string;
  level: string;
  label?: string;
  message: string;
  data?: Record<string, unknown>;
}

const levels = [
  ['debug', 'Debug and above'],
  ['info', 'Info and above'],
  ['warn', 'Warnings and errors'],
  ['error', 'Errors only'],
];

export default function AdminLogs() {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('info');
  const [take, setTake] = useState(25);
  const [page, setPage] = useState(1);
  const [live, setLive] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
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
      setCopyStatus('Log entry copied.');
    } catch {
      setCopyStatus('Could not copy the log entry.');
    }
  }

  return (
    <>
      <header className="ph">
        <h1>System Logs</h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/me">
          Back to Account
        </Link>
        <button className="btn btn-tonal btn-sm" onClick={reload}>
          Refresh
        </button>
        <label>
          <input
            type="checkbox"
            checked={live}
            onChange={(event) => setLive(event.target.checked)}
          />{' '}
          Live Refresh
        </label>
      </div>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSearch(input.trim());
        }}
      >
        <label className="sel">
          <span className="lbl">Search Logs</span>
          <input
            className="cfg-json"
            value={input}
            maxLength={200}
            onChange={(event) => setInput(event.target.value)}
          />
        </label>
        <button className="btn btn-quiet btn-sm">Search</button>
        <label className="sel">
          <span className="lbl">Severity</span>
          <select
            value={level}
            onChange={(event) => {
              setLevel(event.target.value);
              setPage(1);
            }}
          >
            {levels.map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="sel">
          <span className="lbl">Page Size</span>
          <select
            value={take}
            onChange={(event) => {
              setTake(Number(event.target.value));
              setPage(1);
            }}
          >
            {[25, 50, 100].map((size) => (
              <option key={size}>{size}</option>
            ))}
          </select>
        </label>
      </form>
      <ServiceNote error={error} what="system logs" retry={reload} />
      {copyStatus && (
        <p className="note" role="status">
          {copyStatus}
        </p>
      )}
      {!data && !error && (
        <p className="note" role="status">
          Loading system logs…
        </p>
      )}
      {data?.results.length === 0 && (
        <p className="note">No logs match these filters.</p>
      )}
      {!!data?.results.length && (
        <ul className="setlist">
          {data.results.map((entry, index) => (
            <li className="set" key={`${entry.timestamp}:${index}`}>
              <div>
                <b>{entry.message}</b>
                <small>
                  {[entry.timestamp, entry.level, entry.label]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
                {entry.data && (
                  <details>
                    <summary>Details</summary>
                    <small>{JSON.stringify(entry.data)}</small>
                  </details>
                )}
              </div>
              <button
                className="btn btn-quiet btn-sm"
                onClick={() => void copy(entry)}
              >
                Copy Entry
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
            onClick={() => setPage((value) => value - 1)}
          >
            Previous Page
          </button>
          <span>Page {page}</span>
          <button
            className="btn btn-quiet btn-sm"
            disabled={!data || page >= data.pageInfo.pages}
            onClick={() => setPage((value) => value + 1)}
          >
            Next Page
          </button>
        </div>
      )}
    </>
  );
}
