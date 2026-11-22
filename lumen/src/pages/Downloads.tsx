import { useState } from 'react';
import { Pill } from '../components/detail';
import {
  DOWNLOAD_INBOX_PATH,
  DownloadActionSheet,
} from '../components/DownloadActionSheet';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';

const STATES: Record<string, string> = {
  active: 'downloads.activeState',
  failed: 'downloads.failedState',
  importing: 'downloads.importingState',
  rejecting: 'downloads.rejectingState',
  resolved: 'downloads.resolvedState',
};

const RESOLUTIONS: Record<string, string> = {
  'manual-import': 'downloads.imported',
  'manual-rejection': 'downloads.rejected',
  'manual-blocklist': 'downloads.blocked',
  recovered: 'downloads.recovered',
  'no-longer-in-queue': 'downloads.disappeared',
  'configuration-changed': 'downloads.changed',
  'import-failed': 'downloads.importFailed',
  'import-needs-review': 'downloads.importReview',
  'import-outcome-unknown': 'downloads.unknownImport',
  'rejection-outcome-unknown': 'downloads.unknownReject',
};

interface DownloadWarning {
  id: number;
  title: string;
  serviceName: string;
  serviceType: string;
  state: keyof typeof STATES;
  resolution?: string | null;
  manualImportCapable?: boolean;
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

function ActionTime({ value, locale }: { value: string; locale: string }) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return null;
  return <time dateTime={value}>{date.toLocaleString(locale)}</time>;
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
  const { locale, t } = useLumenLocale();
  const { data, error, reload } = useApi<DownloadResponse>(path);
  const [action, setAction] = useState<{
    warning: DownloadWarning;
    operation: 'import' | 'reject';
  }>();
  const [notice, setNotice] = useState('');

  function begin(warning: DownloadWarning, operation: 'import' | 'reject') {
    setNotice('');
    setAction({ warning, operation });
  }

  return (
    <>
      <div className="toolbar">
        <button
          className="btn btn-quiet btn-sm"
          disabled={!data && !error}
          onClick={reload}
        >
          {t('downloads.refresh', 'Refresh')}
        </button>
      </div>
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      {action && (
        <DownloadActionSheet
          {...action}
          close={() => setAction(undefined)}
          finished={(message) => {
            setAction(undefined);
            setNotice(message);
            reload();
          }}
        />
      )}
      <ServiceNote
        error={error}
        what={t('downloads.title', 'Download Inbox')}
        title={t('downloads.failed', 'The inbox could not be loaded.')}
        retryLabel={t('downloads.refresh', 'Refresh')}
        retry={reload}
      />
      {!data && !error && (
        <p className="note" role="status">
          {t('downloads.loading', 'Loading download warnings…')}
        </p>
      )}
      {!!data?.partialSources.length && (
        <p className="note wait" role="status">
          {t(
            'downloads.partial',
            'Some acquisition services could not be checked. Their warnings may be missing or out of date.'
          )}
        </p>
      )}
      {data?.truncated && (
        <p className="note" role="status">
          {t(
            'downloads.truncated',
            'Only the first 20 acquisition services were checked.'
          )}
        </p>
      )}
      {data?.results.length === 0 && (
        <p className="note">
          {t('downloads.empty', 'No download warnings in this view.')}
        </p>
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
                  <small>{t(RESOLUTIONS[warning.resolution])}</small>
                )}
                {!!warning.actions?.length && (
                  <details>
                    <summary>
                      {t('downloads.actions', 'Action history')}
                    </summary>
                    <ol>
                      {warning.actions.map((action, index) => (
                        <li key={index}>
                          <small>
                            <ActionTime value={action.at} locale={locale} /> ·{' '}
                            {t('downloads.actor', 'User {id}', {
                              id: action.actorId,
                            })}
                          </small>
                          <small>
                            {action.action === 'import'
                              ? t('downloads.import', 'Import selected files')
                              : t('downloads.reject', 'Reject download')}
                            {' · '}
                            {t(
                              RESOLUTIONS[action.state] ??
                                STATES[action.state] ??
                                'downloads.failedState',
                              'Needs review'
                            )}
                          </small>
                          <small>
                            {action.action === 'import'
                              ? action.options.importMode === 'move'
                                ? t(
                                    'downloads.move',
                                    'Move (remove source files)'
                                  )
                                : t(
                                    'downloads.copy',
                                    'Copy or hardlink (keep source files)'
                                  )
                              : `${t(action.options.blocklist ? 'downloads.blocklisted' : 'downloads.notBlocklisted')} · ${t(action.options.removeFromClient ? 'downloads.clientRemoved' : 'downloads.clientKept')}`}
                          </small>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </div>
              {(warning.state === 'active' || warning.state === 'failed') && (
                <div className="toolbar">
                  {warning.manualImportCapable && (
                    <button
                      className="btn btn-tonal btn-sm"
                      onClick={() => begin(warning, 'import')}
                    >
                      {t('downloads.preview', 'Preview files')}
                    </button>
                  )}
                  <button
                    className="btn btn-quiet btn-sm"
                    onClick={() => begin(warning, 'reject')}
                  >
                    {t('downloads.reject', 'Reject download')}
                  </button>
                </div>
              )}
              <Pill k={warning.state === 'resolved' ? 'neutral' : 'wait'}>
                {t(STATES[warning.state] ?? 'downloads.failedState')}
              </Pill>
            </li>
          ))}
        </ul>
      )}
      {(page > 1 || (data?.total ?? 0) > 25) && (
        <nav
          className="toolbar"
          aria-label={t(
            'components.Common.PaginationFooter.pagination',
            'Pagination'
          )}
        >
          <button
            className="btn btn-quiet btn-sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            {t('downloads.previous', 'Previous page')}
          </button>
          <span className="note">
            {t('lumen.downloads.page', 'Page {page}', { page })}
          </span>
          <button
            className="btn btn-quiet btn-sm"
            disabled={page >= 1000 || page * 25 >= (data?.total ?? 0)}
            onClick={() => setPage(page + 1)}
          >
            {t('downloads.next', 'Next page')}
          </button>
        </nav>
      )}
    </>
  );
}

export default function Downloads({ allowed }: { allowed: boolean }) {
  const { t } = useLumenLocale();
  const [scope, setScope] = useState<'active' | 'history'>('active');
  const [page, setPage] = useState(1);
  const path = `${DOWNLOAD_INBOX_PATH}?scope=${scope}&page=${page}`;
  return (
    <>
      <header className="ph">
        <h1>{t('downloads.title', 'Download Inbox')}</h1>
      </header>
      <p className="note">
        {t(
          'downloads.description',
          'Review acquisition warnings, select files for manual import, and reject unwanted downloads.'
        )}
      </p>
      {allowed ? (
        <>
          <div className="toolbar">
            <div
              className="seg"
              role="group"
              aria-label={t('downloads.title', 'Download Inbox')}
            >
              {(['active', 'history'] as const).map((value) => (
                <button
                  key={value}
                  aria-pressed={scope === value}
                  onClick={() => {
                    setScope(value);
                    setPage(1);
                  }}
                >
                  {value === 'active'
                    ? t('downloads.active', 'Active warnings')
                    : t('downloads.history', 'History')}
                </button>
              ))}
            </div>
          </div>
          <DownloadRows key={path} path={path} page={page} setPage={setPage} />
        </>
      ) : (
        <p className="note">{t('downloads.denied')}</p>
      )}
    </>
  );
}
