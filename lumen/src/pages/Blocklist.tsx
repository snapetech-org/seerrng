import { useRef, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import {
  canManageBlocklist,
  canViewBlocklist,
  notifyBlocklistChanged,
} from '../blocklist';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';

const TYPES: Record<string, string> = {
  movie: 'Movie',
  tv: 'Series',
  music: 'Music',
  book: 'Book',
  comic: 'Comic',
  magazine: 'Magazine',
};
const PAGE_SIZE = 10;
const FILTERS = {
  filter: [
    ['all', 'All Sources'],
    ['manual', 'Manual'],
    ['blocklistedTags', 'Automatic Tags'],
    ['blocklistedGenres', 'Automatic Genres'],
  ],
  mediaType: [['all', 'All Media'], ...Object.entries(TYPES)],
  timeFrame: [
    ['all', 'Any Time'],
    ['7d', 'Last 7 Days'],
    ['14d', 'Last 14 Days'],
    ['30d', 'Last 30 Days'],
    ['6m', 'Last 6 Months'],
  ],
  sort: [
    ['date', 'Date Added'],
    ['title', 'Title'],
    ['mediaType', 'Media Type'],
  ],
  sortDirection: [
    ['desc', 'Descending'],
    ['asc', 'Ascending'],
  ],
};
const LABELS = {
  filter: 'Source',
  mediaType: 'Media Type',
  timeFrame: 'Time Frame',
  sort: 'Sort By',
  sortDirection: 'Sort Direction',
};
const DEFAULTS = {
  filter: 'all',
  mediaType: 'all',
  timeFrame: 'all',
  sort: 'date',
  sortDirection: 'desc',
};

interface Entry {
  id: number;
  title?: string;
  mediaType: string;
  tmdbId?: number;
  externalId?: string | null;
  user?: { displayName?: string };
  createdAt: string;
  blocklistedTags?: string | null;
  blocklistedGenres?: string | null;
}
interface Response {
  results: Entry[];
  pageInfo: { pages: number };
}

function removalPath(entry: Entry) {
  if (!Object.hasOwn(TYPES, entry.mediaType)) return undefined;
  const id =
    entry.mediaType === 'movie' || entry.mediaType === 'tv'
      ? Number.isSafeInteger(entry.tmdbId) && (entry.tmdbId ?? 0) > 0
        ? String(entry.tmdbId)
        : ''
      : entry.externalId;
  return id
    ? `/blocklist/${encodeURIComponent(id)}?mediaType=${entry.mediaType}`
    : undefined;
}

function BlocklistEntries({ manager }: { manager: boolean }) {
  const { locale, t } = useLumenLocale();
  const [filters, setFilters] = useState(DEFAULTS);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<Entry>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const working = useRef(false);
  const args = new URLSearchParams({
    ...filters,
    search: query,
    take: String(PAGE_SIZE),
    skip: String((page - 1) * PAGE_SIZE),
  });
  const { data, error, reload, refresh } = useApi<Response>(
    '/blocklist?' + args.toString()
  );

  async function remove() {
    const path = target && removalPath(target);
    if (!manager || !path || working.current) return;
    working.current = true;
    setBusy(true);
    setNotice('');
    try {
      await api<void>(path, { method: 'DELETE' });
      if (page > 1 && data?.results.length === 1) setPage(page - 1);
      else refresh();
      setNotice(t('lumen.blocklist.removed', 'Removed from the Blocklist.'));
    } catch {
      reload();
      setNotice(
        t(
          'lumen.blocklist.removalUnconfirmed',
          'Could not confirm removal. Check the Blocklist before trying again.'
        )
      );
    } finally {
      notifyBlocklistChanged();
      setTarget(undefined);
      working.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(search.trim());
          setPage(1);
        }}
      >
        {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((key) => (
          <label key={key} className="sel">
            <span className="lbl">
              {t(`lumen.blocklist.label.${key}`, LABELS[key])}
            </span>
            <select
              aria-label={t(`lumen.blocklist.label.${key}`, LABELS[key])}
              value={filters[key]}
              onChange={(event) => {
                setFilters({ ...filters, [key]: event.target.value });
                setPage(1);
              }}
            >
              {FILTERS[key].map(([value, title]) => (
                <option key={value} value={value}>
                  {t(`lumen.blocklist.option.${key}.${value}`, title)}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="search">
          <input
            type="search"
            aria-label={t('lumen.blocklist.searchLabel', 'Search Blocklist')}
            placeholder={t(
              'lumen.blocklist.searchPlaceholder',
              'Search the Blocklist'
            )}
            maxLength={512}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <button className="btn btn-tonal btn-sm">
          {t('lumen.blocklist.search', 'Search')}
        </button>
      </form>
      <ServiceNote
        error={error}
        what={t('lumen.blocklist.serviceName', 'the Blocklist')}
        retry={reload}
      />
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      {!data && !error && (
        <p className="note" role="status">
          {t('lumen.blocklist.loading', 'Loading Blocklist…')}
        </p>
      )}
      {data?.results.length === 0 && (
        <p className="note">
          {t('lumen.blocklist.noMatches', 'No entries match this view.')}
        </p>
      )}
      {!!data?.results.length && (
        <ul className="setlist">
          {data.results.map((entry) => {
            const date = new Date(entry.createdAt);
            const sources = [
              entry.blocklistedTags
                ? t('lumen.blocklist.source.tags', 'Automatic Tags')
                : '',
              entry.blocklistedGenres
                ? t('lumen.blocklist.source.genres', 'Automatic Genres')
                : '',
            ].filter(Boolean);
            const title =
              entry.title || entry.externalId || `TMDB #${entry.tmdbId}`;
            return (
              <li className="set" key={entry.id}>
                <div>
                  <b>{title}</b>
                  <small>
                    {[
                      t(
                        `lumen.blocklist.media.${entry.mediaType}`,
                        TYPES[entry.mediaType] || entry.mediaType
                      ),
                      ...(!sources.length
                        ? [t('lumen.blocklist.source.manual', 'Manual')]
                        : sources),
                      entry.user?.displayName,
                      Number.isFinite(date.valueOf())
                        ? new Intl.DateTimeFormat(locale, {
                            dateStyle: 'short',
                          }).format(date)
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                </div>
                {manager && removalPath(entry) && (
                  <button
                    className="btn btn-quiet btn-sm"
                    aria-label={t(
                      'lumen.blocklist.removeEntry',
                      'Remove {title} from Blocklist',
                      { title }
                    )}
                    disabled={busy}
                    onClick={() => setTarget(entry)}
                  >
                    {t('lumen.blocklist.remove', 'Remove')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {data && (page > 1 || data.pageInfo.pages > 1) && (
        <nav
          className="toolbar"
          aria-label={t('lumen.blocklist.pages', 'Blocklist Pages')}
        >
          <button
            className="btn btn-quiet btn-sm"
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
          >
            {t('lumen.blocklist.previousPage', 'Previous Page')}
          </button>
          <span>{t('lumen.blocklist.page', 'Page {page}', { page })}</span>
          <button
            className="btn btn-quiet btn-sm"
            onClick={() => setPage(page + 1)}
            disabled={page >= data.pageInfo.pages || page * PAGE_SIZE > 100000}
          >
            {t('lumen.blocklist.nextPage', 'Next Page')}
          </button>
        </nav>
      )}
      {target && (
        <ConfirmSheet
          title={t(
            'lumen.blocklist.removeQuestion',
            'Remove from the Blocklist?'
          )}
          body={
            target.title
              ? t(
                  'lumen.blocklist.removeBodyTitle',
                  '“{title}” can be requested again after removal.',
                  { title: target.title }
                )
              : t(
                  'lumen.blocklist.removeBody',
                  'This item can be requested again after removal.'
                )
          }
          confirm={t('lumen.blocklist.confirmRemove', 'Remove from Blocklist')}
          busy={busy}
          onConfirm={() => void remove()}
          onClose={() => {
            if (!working.current) setTarget(undefined);
          }}
        />
      )}
    </>
  );
}

export default function Blocklist() {
  const { t } = useLumenLocale();
  const { user } = useAuth();
  return (
    <>
      <header className="ph">
        <h1>{t('lumen.blocklist.title', 'Blocklist')}</h1>
      </header>
      {canViewBlocklist(user?.permissions) ? (
        <BlocklistEntries manager={canManageBlocklist(user?.permissions)} />
      ) : (
        <p className="note">
          {t(
            'lumen.blocklist.noPermission',
            'You do not have permission to view the Blocklist.'
          )}
        </p>
      )}
    </>
  );
}
