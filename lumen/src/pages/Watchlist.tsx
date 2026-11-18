import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { ServiceNote } from '../components/extra';
import { useToast } from '../components/toast';
import { friendlyError } from '../errors';
import { useApi, usePublicSettings } from '../hooks';

const MEDIA_LABELS = {
  movie: 'Movies',
  tv: 'Series',
  music: 'Music',
  book: 'Books',
  comic: 'Comics',
  magazine: 'Magazines',
};
const SORT_LABELS = {
  'added-desc': 'Recently Added',
  'title-asc': 'Title (A to Z)',
  'title-desc': 'Title (Z to A)',
};
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
  path: string;
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
      toast(friendlyError(error, 'Couldn’t remove this title'));
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
          Loading {label}…
        </p>
      )}
      {rows?.length === 0 && <p className="note">No titles on this page.</p>}
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
                  <small>{MEDIA_LABELS[item.mediaType]}</small>
                </div>
                {id && canRemoveItem(item) && (
                  <button
                    className="btn btn-quiet btn-sm"
                    type="button"
                    aria-label={`Remove ${item.title} from Watchlist`}
                    disabled={Boolean(removing)}
                    onClick={() => void remove(item, id)}
                  >
                    {removing === `${item.mediaType}:${id}`
                      ? 'Removing…'
                      : 'Remove'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {(page > 1 || (data?.totalPages ?? 0) > 1) && (
        <nav className="toolbar" aria-label="Watchlist Pages">
          <button
            className="btn btn-quiet btn-sm"
            disabled={page <= 1 || Boolean(removing)}
            onClick={() => movePage(page - 1)}
          >
            Previous Page
          </button>
          <span className="note">Page {page}</span>
          <button
            className="btn btn-quiet btn-sm"
            disabled={
              page >= Math.min(data?.totalPages ?? 0, 500) || Boolean(removing)
            }
            onClick={() => movePage(page + 1)}
          >
            Next Page
          </button>
        </nav>
      )}
    </>
  );
}

export function UserWatchlist() {
  const { userId } = useParams();
  const { user } = useAuth();
  const target = userId && /^[1-9]\d{0,9}$/.test(userId) ? Number(userId) : 0;

  if (
    !user ||
    !target ||
    target > 1_000_000_000 ||
    !canViewUserWatchlist(user.permissions)
  ) {
    return (
      <header className="ph">
        <h1>User Watchlist</h1>
        <p className="note">This watchlist is unavailable.</p>
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
  const settings = usePublicSettings();
  const [params, setParams] = useSearchParams();
  const [filtersSupported, setFiltersSupported] = useState<boolean>();
  if (!user) return null;

  const search = params.get('search')?.trim().slice(0, 100) ?? '';
  const media = params.get('mediaType') ?? '';
  const sort = params.get('sortBy') ?? '';
  const label = targetUserId
    ? 'User Watchlist'
    : discover
      ? 'Discover Watchlist'
      : 'Watchlist';
  const categories = discover ? settings?.enabledMediaCategories : undefined;
  const mediaOptions = Object.entries(MEDIA_LABELS).filter(([type]) =>
    type === 'book'
      ? categories?.ebook !== false || categories?.audiobook !== false
      : categories?.[type] !== false
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
  const path = `${base}/watchlist?${query}`;

  return (
    <>
      <header className="ph">
        <h1>{label}</h1>
        {targetUserId ? (
          (user.permissions & (2 | 8)) !== 0 && (
            <div className="toolbar">
              <Link className="chip" to={`/admin/users/${targetUserId}`}>
                Back to User
              </Link>
            </div>
          )
        ) : (
          <div className="toolbar">
            <Link
              className="chip"
              to={discover ? '/watchlist' : '/watchlist/discover'}
            >
              {discover ? 'Personal Watchlist' : 'Discover Watchlist'}
            </Link>
          </div>
        )}
      </header>
      {filtersSupported === false && (
        <p className="note">
          Plex and SeerrNG items share this list. Filters are unavailable in
          this view.
        </p>
      )}
      {filtersSupported && (
        <form
          key={filterKey}
          className="toolbar"
          aria-label="Watchlist Filters"
          onSubmit={apply}
          onReset={() => {
            setParams(new URLSearchParams());
          }}
        >
          <label className="search">
            <input
              type="search"
              name="search"
              aria-label="Search Titles"
              placeholder="Search titles…"
              defaultValue={search}
              maxLength={100}
            />
          </label>
          <label className="sel">
            <span className="lbl">Media Type</span>
            <select
              name="mediaType"
              defaultValue={mediaTypes.includes(media) ? media : ''}
            >
              <option value="">All Types</option>
              {mediaOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="sel">
            <span className="lbl">Sort By</span>
            <select
              name="sortBy"
              defaultValue={Object.hasOwn(SORT_LABELS, sort) ? sort : ''}
            >
              <option value="">Added Order</option>
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-tonal btn-sm" type="submit">
            Apply Filters
          </button>
          <button className="btn btn-quiet btn-sm" type="reset">
            Clear Filters
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
