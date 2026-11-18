import { useState } from 'react';
import { Pill } from '../components/detail';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';

const STATES = {
  active: 'Needs Attention',
  failed: 'Needs Review',
  importing: 'Import Pending',
  rejecting: 'Rejection Pending',
  resolved: 'Resolved',
};

const RESOLUTIONS: Record<string, string> = {
  'manual-import': 'Manually imported',
  'manual-rejection': 'Manually rejected',
  'manual-blocklist': 'Manually blocklisted',
  recovered: 'Recovered',
  'no-longer-in-queue': 'No longer in the queue',
  'configuration-changed': 'Service configuration changed',
  'import-failed': 'Import failed',
  'import-needs-review': 'Import completed without a confirmed file import',
  'import-outcome-unknown': 'Import outcome unknown',
  'rejection-outcome-unknown': 'Rejection outcome unknown',
};

interface DownloadWarning {
  id: number;
  title: string;
  serviceName: string;
  serviceType: string;
  state: keyof typeof STATES;
  resolution?: string | null;
  warnings: string[];
  actions?: {
    at: string;
    actorId: number;
    action: 'import' | 'reject';
    state: string;
    options: {
      blocklist?: boolean;
      removeFromClient?: boolean;
      importMode?: 'copy' | 'move';
    };
  }[];
}

interface DownloadResponse {
  results: DownloadWarning[];
  total: number;
  partialSources: unknown[];
  truncated: boolean;
}

function ActionTime({ value }: { value: string }) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return null;
  return <time dateTime={value}>{date.toLocaleString()}</time>;
}

function DownloadRows({
  path,
  page,
  setPage,
}: {
  path: string;
  page: number;
  setPage: (page: number) => void;
}) {
  const { data, error, reload } = useApi<DownloadResponse>(path);

  return (
    <>
      <div className="toolbar">
        <button
          className="btn btn-quiet btn-sm"
          disabled={!data && !error}
          onClick={reload}
        >
          Refresh
        </button>
      </div>
      <ServiceNote error={error} what="download warnings" retry={reload} />
      {!data && !error && (
        <p className="note" role="status">
          Loading download warnings…
        </p>
      )}
      {!!data?.partialSources.length && (
        <p className="note" role="status">
          Some acquisition services could not be checked. Their warnings may be
          missing or out of date.
        </p>
      )}
      {data?.truncated && (
        <p className="note" role="status">
          Only the first 20 acquisition services were checked.
        </p>
      )}
      {data?.results.length === 0 && (
        <p className="note">No download warnings in this view.</p>
      )}
      {!!data?.results.length && (
        <ul className="setlist">
          {data.results.map((warning) => (
            <li className="set" key={warning.id}>
              <div>
                <b>{warning.title}</b>
                <small>
                  {warning.serviceName} · {warning.serviceType}
                </small>
                {warning.warnings.map((text, index) => (
                  <small key={index}>{text}</small>
                ))}
                {warning.resolution && RESOLUTIONS[warning.resolution] && (
                  <small>{RESOLUTIONS[warning.resolution]}</small>
                )}
                {!!warning.actions?.length && (
                  <details>
                    <summary>Action History</summary>
                    <ol>
                      {warning.actions.map((action, index) => (
                        <li key={index}>
                          <small>
                            <ActionTime value={action.at} /> · User{' '}
                            {action.actorId}
                          </small>
                          <small>
                            {action.action === 'import' ? 'Import' : 'Reject'}
                            {' · '}
                            {RESOLUTIONS[action.state] ??
                              STATES[action.state as keyof typeof STATES] ??
                              'Needs Review'}
                          </small>
                          <small>
                            {action.action === 'import'
                              ? action.options.importMode === 'move'
                                ? 'Move'
                                : 'Copy or hardlink'
                              : `${action.options.blocklist ? 'Blocklist requested' : 'Release not blocklisted'} · ${action.options.removeFromClient ? 'Client removal requested' : 'Client files kept'}`}
                          </small>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </div>
              <Pill k={warning.state === 'resolved' ? 'neutral' : 'wait'}>
                {STATES[warning.state] ?? 'Needs Review'}
              </Pill>
            </li>
          ))}
        </ul>
      )}
      {(page > 1 || (data?.total ?? 0) > 25) && (
        <nav className="toolbar" aria-label="Download Inbox Pages">
          <button
            className="btn btn-quiet btn-sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous Page
          </button>
          <span className="note">Page {page}</span>
          <button
            className="btn btn-quiet btn-sm"
            disabled={page >= 1000 || page * 25 >= (data?.total ?? 0)}
            onClick={() => setPage(page + 1)}
          >
            Next Page
          </button>
        </nav>
      )}
    </>
  );
}

export default function Downloads({ allowed }: { allowed: boolean }) {
  const [scope, setScope] = useState<'active' | 'history'>('active');
  const [page, setPage] = useState(1);
  const path = `/downloads/interventions?scope=${scope}&page=${page}`;
  return (
    <>
      <header className="ph">
        <h1>Download Inbox</h1>
      </header>
      {allowed ? (
        <>
          <div className="toolbar">
            <div className="seg" role="group" aria-label="Download Inbox Views">
              {(['active', 'history'] as const).map((value) => (
                <button
                  key={value}
                  aria-pressed={scope === value}
                  onClick={() => {
                    setScope(value);
                    setPage(1);
                  }}
                >
                  {value === 'active' ? 'Active Warnings' : 'History'}
                </button>
              ))}
            </div>
          </div>
          <DownloadRows key={path} path={path} page={page} setPage={setPage} />
        </>
      ) : (
        <p className="note">Manage Downloads permission is required.</p>
      )}
    </>
  );
}
