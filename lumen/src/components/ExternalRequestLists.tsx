import {
  IMDB_CSV_IMPORT_BATCH_SIZE,
  parseImdbWatchlistCsv,
} from '@app/utils/imdbWatchlistCsv';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useLumenLocale } from '../i18n';
import { Section } from './cards';

type ExternalList = {
  id: number;
  provider: 'imdb' | 'imdb-csv' | 'goodreads' | 'hardcover';
  sourceUrl: string;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
};
type SyncResult = {
  requested: number;
  alreadyRequested: number;
  unmatched: number;
  failed: number;
  error?: string;
};

const labels = {
  imdb: ['IMDb Watchlist', 'lumen.account.external.imdb'],
  csv: ['IMDb Watchlist (CSV Import)', 'lumen.account.external.csv'],
  goodreads: ['Goodreads To-Read Shelf', 'lumen.account.external.goodreads'],
  hardcover: ['Hardcover Want to Read', 'lumen.account.external.hardcover'],
} as const;

export function ExternalRequestLists() {
  const { t, locale } = useLumenLocale();
  const [lists, setLists] = useState<ExternalList[]>([]);
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api<ExternalList[]>('/request/lists');
      if (!Array.isArray(result))
        throw new Error(
          t('lumen.account.external.error', 'Could not load external lists.')
        );
      setLists(result);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t('lumen.account.external.error', 'Could not load external lists.')
      );
    } finally {
      setLoading(false);
    }
  }, [t]);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      setStatus(await action());
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t(
              'lumen.account.external.error',
              'Could not update the external list.'
            )
      );
    } finally {
      setBusy(false);
    }
  };
  const summary = (result: SyncResult) =>
    t(
      'lumen.account.external.summary',
      'Sync complete: {requested} requested, {already} already requested, {unmatched} not found, {failed} failed.',
      {
        requested: result.requested,
        already: result.alreadyRequested,
        unmatched: result.unmatched,
        failed: result.failed,
      }
    );
  const addUrl = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await api('/request/lists', {
        method: 'POST',
        body: JSON.stringify({ url: url.trim() }),
      });
      setUrl('');
      return t('lumen.account.external.added', 'External list added.');
    });
  };
  const addHardcover = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const result = await api<{ validatedBooks: number }>(
        '/request/lists/hardcover',
        { method: 'POST', body: JSON.stringify({ apiToken: token.trim() }) }
      );
      setToken('');
      return t(
        'lumen.account.external.connected',
        'Hardcover connected. Books found on your shelf: {count}.',
        { count: result.validatedBooks }
      );
    });
  };
  const sync = (list: ExternalList) =>
    void run(async () => {
      const result = await api<SyncResult>(`/request/lists/${list.id}/sync`, {
        method: 'POST',
      });
      return result.error
        ? `${summary(result)} ${result.error}`
        : summary(result);
    });
  const remove = (list: ExternalList) =>
    void run(async () => {
      await api(`/request/lists/${list.id}`, { method: 'DELETE' }, 'empty');
      return t('lumen.account.external.removed', 'External list removed.');
    });
  const importCsv = (list: ExternalList, file: File) =>
    void run(async () => {
      if (file.size > 5 * 1024 * 1024)
        throw new Error(
          t(
            'lumen.account.external.tooLarge',
            'The IMDb export file must be 5 MB or smaller.'
          )
        );
      const { ids } = parseImdbWatchlistCsv(await file.text());
      let total: SyncResult = {
        requested: 0,
        alreadyRequested: 0,
        unmatched: 0,
        failed: 0,
      };
      for (
        let offset = 0;
        offset < ids.length;
        offset += IMDB_CSV_IMPORT_BATCH_SIZE
      ) {
        const next = await api<SyncResult>(`/request/lists/${list.id}/import`, {
          method: 'POST',
          body: JSON.stringify({
            itemIds: ids.slice(offset, offset + IMDB_CSV_IMPORT_BATCH_SIZE),
          }),
        });
        total = {
          requested: total.requested + next.requested,
          alreadyRequested: total.alreadyRequested + next.alreadyRequested,
          unmatched: total.unmatched + next.unmatched,
          failed: total.failed + next.failed,
          error: next.error ?? total.error,
        };
      }
      return total.error ? `${summary(total)} ${total.error}` : summary(total);
    });

  return (
    <Section
      title={t('lumen.account.external.title', 'External Request Lists')}
    >
      <p className="note">
        {t(
          'lumen.account.external.description',
          'Connect a public IMDb watchlist, Goodreads to-read shelf, or Hardcover Want to Read shelf. New items are checked daily and requested through your normal permissions and approval settings. IMDb CSV exports can be imported when server-side sync is unavailable.'
        )}
      </p>
      <form className="set cfg-row" onSubmit={addUrl}>
        <label htmlFor="external-list-url">
          {t('lumen.account.external.url', 'Public List URL')}
        </label>
        <input
          id="external-list-url"
          className="cfg-input"
          type="url"
          autoComplete="url"
          maxLength={2048}
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.imdb.com/user/ur12345678/watchlist/"
        />
        <button
          className="btn btn-primary btn-sm"
          disabled={busy || !url.trim()}
        >
          {t('lumen.account.external.add', 'Add List')}
        </button>
      </form>
      <form className="set cfg-row" onSubmit={addHardcover}>
        <label htmlFor="external-list-token">
          {t('lumen.account.external.token', 'Hardcover API Token')}
        </label>
        <input
          id="external-list-token"
          className="cfg-input"
          type="password"
          autoComplete="off"
          maxLength={4096}
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <button
          className="btn btn-primary btn-sm"
          disabled={busy || token.trim().length < 16}
        >
          {t('lumen.account.external.connect', 'Connect Hardcover')}
        </button>
      </form>
      {status && (
        <p className="note" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="note" role="alert">
          {error}{' '}
          <button
            className="btn btn-quiet btn-sm"
            type="button"
            onClick={() => void load()}
          >
            {t('lumen.account.retry', 'Retry')}
          </button>
        </p>
      )}
      {loading ? (
        <p className="note" role="status">
          {t('lumen.account.loading', 'Loading…')}
        </p>
      ) : lists.length === 0 ? (
        <p className="note">
          {t(
            'lumen.account.external.empty',
            'No external lists are connected.'
          )}
        </p>
      ) : (
        <div className="setlist">
          {lists.map((list) => (
            <div className="set" key={list.id}>
              <strong>
                {t(
                  labels[
                    list.provider === 'imdb-csv' ? 'csv' : list.provider
                  ][1],
                  labels[
                    list.provider === 'imdb-csv' ? 'csv' : list.provider
                  ][0]
                )}
              </strong>
              <small>
                <a href={list.sourceUrl} target="_blank" rel="noreferrer">
                  {list.sourceUrl}
                </a>
              </small>
              <small>
                {list.lastSyncedAt
                  ? new Intl.DateTimeFormat(locale, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(list.lastSyncedAt))
                  : t('lumen.account.external.never', 'Not Synced Yet')}
              </small>
              {list.lastSyncError && (
                <small role="alert">{list.lastSyncError}</small>
              )}
              <div className="toolbar">
                {(list.provider === 'imdb' || list.provider === 'imdb-csv') && (
                  <label className="note">
                    {t('lumen.account.external.import', 'Import IMDb CSV')}
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      disabled={busy}
                      onChange={(e) => {
                        const input = e.currentTarget;
                        const file = input.files?.[0];
                        input.value = '';
                        if (file) importCsv(list, file);
                      }}
                    />
                  </label>
                )}
                {list.provider !== 'imdb-csv' && (
                  <button
                    className="btn btn-quiet btn-sm"
                    type="button"
                    disabled={busy}
                    onClick={() => sync(list)}
                  >
                    {t('lumen.account.external.sync', 'Sync Now')}
                  </button>
                )}
                <button
                  className="btn btn-danger btn-sm"
                  type="button"
                  disabled={busy}
                  onClick={() => remove(list)}
                >
                  {t('lumen.account.external.remove', 'Remove')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
