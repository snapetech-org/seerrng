import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { ServiceNote } from '../components/extra';
import { useToast } from '../components/toast';
import { friendlyError } from '../errors';
import { useExtras } from '../extras';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';

const MEDIA_LABELS = {
  movie: ['lumen.watchlist.movies', 'Movies'],
  tv: ['lumen.watchlist.series', 'Series'],
  music: ['lumen.watchlist.music', 'Music'],
  book: ['lumen.watchlist.books', 'Books'],
  comic: ['lumen.watchlist.comics', 'Comics'],
  magazine: ['lumen.watchlist.magazines', 'Magazines'],
} as const;
const SORT_LABELS = {
  'added-desc': ['lumen.watchlist.recentlyAdded', 'Recently Added'],
  'title-asc': ['lumen.watchlist.titleAZ', 'Title (A to Z)'],
  'title-desc': ['lumen.watchlist.titleZA', 'Title (Z to A)'],
} as const;
interface WatchlistItem {
  source?: 'local' | 'plex';
  id: number;
  ratingKey: string;
  mediaType: keyof typeof MEDIA_LABELS;
  title: string;
  tmdbId?: number;
  mbId?: string;
  externalId?: string;
}

export interface WatchlistData {
  results: WatchlistItem[];
  totalPages: number;
  filtersSupported: boolean;
}

export function canViewUserWatchlist(permissions: number) {
  return (permissions & (2 | 16 | 134217728)) !== 0;
}

export function itemId(item: WatchlistItem) {
  if (item.mediaType === 'movie' || item.mediaType === 'tv') {
    return Number.isSafeInteger(item.tmdbId) && (item.tmdbId ?? 0) > 0
      ? String(item.tmdbId)
      : undefined;
  }
  const id = item.mediaType === 'music' ? item.mbId : item.externalId;
  return id && id !== '.' && id !== '..' ? id : undefined;
}

function WatchlistPage({
  path,
  label,
  mediaTypes,
  page,
  movePage,
  setFiltersSupported,
  canRemove,
}: {
  path: string | null;
  label: string;
  mediaTypes: string[];
  page: number;
  movePage: (page: number, replace?: boolean) => void;
  setFiltersSupported: (supported: boolean) => void;
  canRemove: boolean;
}) {
  const { data, error, reload, refresh } = useApi<WatchlistData>(path);
  const [removed, setRemoved] = useState<string[]>([]);
  const [removing, setRemoving] = useState<string>();
  const pending = useRef(false);
  const toast = useToast();
  const { t } = useLumenLocale();

  useEffect(() => {
    if (data) setFiltersSupported(data.filtersSupported);
  }, [data, setFiltersSupported]);

  useEffect(() => {
    const lastPage = data?.totalPages;
    if (!removing && lastPage && page > lastPage) movePage(lastPage, true);
  }, [data?.totalPages, movePage, page, removing]);

  function canRemoveItem(item: WatchlistItem) {
    return (
      canRemove &&
      (item.source === 'local' ||
        (item.source === undefined && data?.filtersSupported))
    );
  }

  async function remove(item: WatchlistItem, id: string) {
    if (!canRemoveItem(item) || pending.current) return;
    const { mediaType } = item;
    const key = `${mediaType}:${id}`;
    pending.current = true;
    setRemoving(key);
    try {
      await api(`/watchlist/${encodeURIComponent(id)}?mediaType=${mediaType}`, {
        method: 'DELETE',
      });
      if (data?.filtersSupported) setRemoved((previous) => [...previous, key]);
      refresh();
    } catch (error) {
      toast(
        friendlyError(
          error,
          t('lumen.watchlist.removeFailure', 'Couldn’t remove this title'),
          (id, fallback) => t(id, fallback)
        )
      );
    } finally {
      pending.current = false;
      setRemoving(undefined);
    }
  }

  const rows = data?.results.filter(
    (item) =>
      mediaTypes.includes(item.mediaType) &&
      !removed.includes(`${item.mediaType}:${itemId(item)}`)
  );

  return (
    <>
      <ServiceNote error={error} what={label.toLowerCase()} retry={reload} />
      {!data && !error && (
        <p className="note" role="status">
          {t('lumen.watchlist.loading', 'Loading {label}…', { label })}
        </p>
      )}
      {rows?.length === 0 && (
        <p className="note">
          {t('lumen.watchlist.noTitles', 'No titles on this page.')}
        </p>
      )}
      {!!rows?.length && (
        <ul className="setlist">
          {rows.map((item) => {
            const id = itemId(item);
            return (
              <li className="set" key={`${item.mediaType}:${item.ratingKey}`}>
                <div>
                  {id ? (
                    <Link
                      className="go"
                      to={`/${item.mediaType}/${encodeURIComponent(id)}`}
                    >
                      {item.title}
                    </Link>
                  ) : (
                    <b>{item.title}</b>
                  )}
                  <small>
                    {t(
                      MEDIA_LABELS[item.mediaType][0],
                      MEDIA_LABELS[item.mediaType][1]
                    )}
                  </small>
                </div>
                {id && canRemoveItem(item) && (
                  <button
                    className="btn btn-quiet btn-sm"
                    type="button"
                    aria-label={t(
                      'lumen.watchlist.removeTitle',
                      'Remove {title} from Watchlist',
                      { title: item.title }
                    )}
                    disabled={Boolean(removing)}
                    onClick={() => void remove(item, id)}
                  >
                    {removing === `${item.mediaType}:${id}`
                      ? t('lumen.watchlist.removing', 'Removing…')
                      : t('lumen.watchlist.remove', 'Remove')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {(page > 1 || (data?.totalPages ?? 0) > 1) && (
        <nav
          className="toolbar"
          aria-label={t('lumen.watchlist.pages', 'Watchlist pages')}
        >
          <button
            className="btn btn-quiet btn-sm"
            disabled={page <= 1 || Boolean(removing)}
            onClick={() => movePage(page - 1)}
          >
            {t('lumen.watchlist.previous', 'Previous Page')}
          </button>
          <span className="note">
            {t('lumen.watchlist.page', 'Page {page}', { page })}
          </span>
          <button
            className="btn btn-quiet btn-sm"
            disabled={
              page >= Math.min(data?.totalPages ?? 0, 500) || Boolean(removing)
            }
            onClick={() => movePage(page + 1)}
          >
            {t('lumen.watchlist.next', 'Next Page')}
          </button>
        </nav>
      )}
    </>
  );
}

export function UserWatchlist() {
  const { userId } = useParams();
  const { user } = useAuth();
  const { t } = useLumenLocale();
  const target = userId && /^[1-9]\d{0,9}$/.test(userId) ? Number(userId) : 0;

  if (
    !user ||
    !target ||
    target > 1_000_000_000 ||
    !canViewUserWatchlist(user.permissions)
  ) {
    return (
      <header className="ph">
        <h1>{t('lumen.watchlist.userTitle', 'User Watchlist')}</h1>
        <p className="note">
          {t('lumen.watchlist.unavailable', 'This watchlist is unavailable.')}
        </p>
      </header>
    );
  }

  return <Watchlist key={target} targetUserId={target} />;
}

export default function Watchlist({
  discover = false,
  targetUserId,
}: {
  discover?: boolean;
  targetUserId?: number;
}) {
  const { user } = useAuth();
  const extras = useExtras();
  const { t } = useLumenLocale();
  const [params, setParams] = useSearchParams();
  const [filtersSupported, setFiltersSupported] = useState<boolean>();
  if (!user) return null;

  const search = params.get('search')?.trim().slice(0, 100) ?? '';
  const media = params.get('mediaType') ?? '';
  const sort = params.get('sortBy') ?? '';
  const label = targetUserId
    ? t('lumen.watchlist.userTitle', 'User Watchlist')
    : discover
      ? t('lumen.watchlist.discoverTitle', 'Discover Watchlist')
      : t('lumen.watchlist.title', 'Watchlist');
  const categoryEnabled = (type: keyof typeof MEDIA_LABELS) => {
    if (targetUserId !== undefined) return true;
    if (!(discover ? extras.ready : extras.accountReady)) return false;
    const isEnabled = discover
      ? extras.categoryEnabled
      : extras.accountCategoryEnabled;
    return type === 'book'
      ? isEnabled('ebook') || isEnabled('audiobook')
      : isEnabled(type);
  };
  const mediaOptions = Object.entries(MEDIA_LABELS).filter(([type]) =>
    categoryEnabled(type as keyof typeof MEDIA_LABELS)
  );
  const mediaTypes = mediaOptions.map(([type]) => type);
  const requestedPage = Number(params.get('page'));
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage >= 1
      ? Math.min(requestedPage, 500)
      : 1;

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const selected = new URLSearchParams();
    for (const key of ['search', 'mediaType', 'sortBy']) {
      const value = String(form.get(key) ?? '').trim();
      if (value) selected.set(key, value);
    }
    setParams(selected);
  }

  const query = new URLSearchParams();
  if (filtersSupported !== false) {
    if (search) query.set('search', search);
    if (mediaTypes.includes(media)) query.set('mediaType', media);
    if (Object.hasOwn(SORT_LABELS, sort)) query.set('sortBy', sort);
  }
  const filterKey = query.toString();
  query.set('page', String(page));
  const base = discover ? '/discover' : `/user/${targetUserId ?? user.id}`;
  const path =
    targetUserId !== undefined ||
    (discover ? extras.ready : extras.accountReady)
      ? `${base}/watchlist?${query}`
      : null;

  return (
    <>
      <header className="ph">
        <h1>{label}</h1>
        {targetUserId ? (
          (user.permissions & (2 | 8)) !== 0 && (
            <div className="toolbar">
              <Link className="chip" to={`/admin/users/${targetUserId}`}>
                {t('lumen.watchlist.backToUser', 'Back to User')}
              </Link>
            </div>
          )
        ) : (
          <div className="toolbar">
            <Link
              className="chip"
              to={discover ? '/watchlist' : '/watchlist/discover'}
            >
              {discover
                ? t('lumen.watchlist.personalTitle', 'Personal Watchlist')
                : t('lumen.watchlist.discoverTitle', 'Discover Watchlist')}
            </Link>
          </div>
        )}
      </header>
      {filtersSupported === false && (
        <p className="note">
          {t(
            'lumen.watchlist.filtersUnavailable',
            'Plex and SeerrNG items share this list. Filters are unavailable in this view.'
          )}
        </p>
      )}
      {filtersSupported && (
        <form
          key={filterKey}
          className="toolbar"
          aria-label={t('lumen.watchlist.filters', 'Watchlist filters')}
          onSubmit={apply}
          onReset={() => {
            setParams(new URLSearchParams());
          }}
        >
          <label className="search">
            <input
              type="search"
              name="search"
              aria-label={t('lumen.watchlist.search', 'Search titles')}
              placeholder={t(
                'lumen.watchlist.searchPlaceholder',
                'Search titles…'
              )}
              defaultValue={search}
              maxLength={100}
            />
          </label>
          <label className="sel">
            <span className="lbl">
              {t('lumen.watchlist.mediaType', 'Media Type')}
            </span>
            <select
              name="mediaType"
              defaultValue={mediaTypes.includes(media) ? media : ''}
            >
              <option value="">
                {t('lumen.watchlist.allTypes', 'All Types')}
              </option>
              {mediaOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {t(label[0], label[1])}
                </option>
              ))}
            </select>
          </label>
          <label className="sel">
            <span className="lbl">
              {t('lumen.watchlist.sortBy', 'Sort By')}
            </span>
            <select
              name="sortBy"
              defaultValue={Object.hasOwn(SORT_LABELS, sort) ? sort : ''}
            >
              <option value="">
                {t('lumen.watchlist.addedOrder', 'Added Order')}
              </option>
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {t(label[0], label[1])}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-tonal btn-sm" type="submit">
            {t('lumen.watchlist.apply', 'Apply Filters')}
          </button>
          <button className="btn btn-quiet btn-sm" type="reset">
            {t('lumen.watchlist.clear', 'Clear Filters')}
          </button>
        </form>
      )}
      <WatchlistPage
        key={path}
        path={path}
        label={label}
        mediaTypes={mediaTypes}
        page={page}
        movePage={(next, replace) => {
          const selected = new URLSearchParams(filterKey);
          if (next > 1) selected.set('page', String(next));
          setParams(selected, { replace });
        }}
        setFiltersSupported={setFiltersSupported}
        canRemove={targetUserId === undefined}
      />
    </>
  );
}
