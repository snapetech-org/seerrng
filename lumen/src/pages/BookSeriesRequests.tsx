import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { canManageRequests } from '../components/detail';
import { ExtraHeader, ServiceNote } from '../components/extra';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';
import { bookSeriesCatalogQuery } from './BookSeriesCatalog';

const endpoint = '/book-series/watch/requests';
const actions = [
  {
    id: 'approve',
    key: 'approve',
    states: ['pending', 'failed', 'stopped', 'declined', 'active'],
  },
  { id: 'decline', key: 'decline', states: ['pending'] },
  { id: 'stop', key: 'stop', states: ['active', 'failed'] },
] as const;

type RequestRow = {
  id: number;
  title: string;
  format: string;
  status: string;
  includeExtras: boolean;
  serverName?: string;
  destination?: string;
  target?: { serverId: number; scope: string; providerId: string };
};

export default function BookSeriesRequests() {
  const { t } = useLumenLocale();
  const { user } = useAuth();
  const manage = canManageRequests(user?.permissions);
  const requests = useApi<RequestRow[]>(endpoint, { keepDuringRefresh: true });
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [awaitingReadback, setAwaitingReadback] = useState<RequestRow[] | null>(
    null
  );
  const actionsDisabled =
    busy || (awaitingReadback !== null && awaitingReadback === requests.data);

  async function update(id: number, action: (typeof actions)[number]['id']) {
    if (!manage || pending.current || actionsDisabled) return;
    pending.current = true;
    const generation = sessionGeneration();
    setBusy(true);
    setFailure('');
    try {
      await api(`${endpoint}/${id}/${action}`, { method: 'POST' });
    } catch (error) {
      if (generation === sessionGeneration())
        setFailure(
          friendlyError(
            error,
            t(
              'lumen.bookSeries.updateFailed',
              'Could not update series monitoring.'
            )
          )
        );
    } finally {
      pending.current = false;
      if (generation === sessionGeneration()) {
        setAwaitingReadback(requests.data);
        requests.reload();
        setBusy(false);
      }
    }
  }

  return (
    <>
      <ExtraHeader
        title={t('lumen.bookSeries.requests', 'Book Series Requests')}
      >
        <Link className="chip" to="/requests">
          {t('lumen.bookSeries.backToRequests', 'Back to Requests')}
        </Link>
        <Link className="chip" to="/book-series">
          {t('lumen.bookSeries.findTitle', 'Find a Book Series')}
        </Link>
      </ExtraHeader>
      <p className="note">
        {t(
          'lumen.bookSeries.stoppingKeepsBooks',
          'Stopping monitoring keeps books already added to the service.'
        )}
      </p>
      <ServiceNote
        error={requests.error}
        what={t('lumen.bookSeries.requestsWhat', 'book series requests')}
        title={t(
          'lumen.bookSeries.requestsLoadFailed',
          'Could not load book series requests'
        )}
        retryLabel={t('lumen.bookSeries.retry', 'Retry')}
        retry={requests.reload}
      />
      {failure && (
        <p className="note" role="alert">
          {failure}
        </p>
      )}
      {!requests.data && !requests.error && (
        <p className="note" role="status">
          {t(
            'lumen.bookSeries.requestsLoading',
            'Loading book series requests…'
          )}
        </p>
      )}
      {requests.data?.length === 0 && (
        <p className="note">
          {t('lumen.bookSeries.noRequests', 'No book series requests.')}
        </p>
      )}
      <ul className="setlist">
        {requests.data?.map((row) => {
          const catalog = row.target && bookSeriesCatalogQuery(row.target);
          const search =
            !catalog && row.target?.providerId.startsWith('gr:')
              ? new URLSearchParams({
                  query: row.title,
                  format: row.format,
                }).toString()
              : null;
          return (
            <li className="set" key={row.id}>
              <div>
                {catalog ? (
                  <Link to={`/book-series/catalog?${catalog}`}>
                    <b>{row.title}</b>
                  </Link>
                ) : search ? (
                  <Link to={`/book-series?${search}`}>
                    <b>{row.title}</b>
                  </Link>
                ) : (
                  <b>{row.title}</b>
                )}
                <p className="note">
                  {row.serverName ? `${row.serverName} · ` : ''}
                  {row.format === 'audiobook'
                    ? t('lumen.bookSeries.audiobooks', 'Audiobooks')
                    : t('lumen.bookSeries.ebooks', 'Ebooks')}{' '}
                  · {t(`lumen.bookSeries.status.${row.status}`, row.status)}
                </p>
                <p className="note">
                  {row.includeExtras
                    ? t('lumen.bookSeries.includesExtras', 'Includes extras')
                    : t(
                        'lumen.bookSeries.primaryBooksOnly',
                        'Primary books only'
                      )}
                </p>
                {manage && (
                  <p className="note">
                    {row.destination ||
                      t(
                        'lumen.bookSeries.destinationUnavailable',
                        'The original service destination is unavailable.'
                      )}
                  </p>
                )}
              </div>
              {manage && (
                <div className="toolbar">
                  {actions
                    .filter(({ states }) =>
                      states.some((state) => state === row.status)
                    )
                    .map(({ id, key }) => (
                      <button
                        key={id}
                        className="btn btn-quiet btn-sm"
                        type="button"
                        disabled={actionsDisabled}
                        onClick={() => void update(row.id, id)}
                      >
                        {key === 'approve'
                          ? t('lumen.bookSeries.approve', 'Approve')
                          : key === 'decline'
                            ? t('lumen.bookSeries.decline', 'Decline')
                            : t(
                                'lumen.bookSeries.stopMonitoring',
                                'Stop Monitoring'
                              )}
                      </button>
                    ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
