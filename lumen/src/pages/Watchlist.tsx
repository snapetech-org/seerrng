import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, artUrl, bookArt, tmdbImg } from '../api';
import { useAuth } from '../auth';
import { Cover } from '../components/cards';
import { CategorySettingsNote, ServiceNote } from '../components/extra';
import { useToast } from '../components/toast';
import {
  createDiscoverNavigationContextId,
  storeDiscoverNavigationContext,
  type DiscoverNavigationItem,
} from '../discoverNavigation';
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

type WatchlistMetadata = {
  title?: string;
  name?: string;
  posterPath?: string | null;
  releaseDate?: string;
  firstAirDate?: string;
  firstPublishYear?: number;
  startYear?: string;
  author?: string;
  publisher?: string;
  latestIssue?: string;
  type?: string;
  artist?: { name?: string };
};

function watchlistDetailPath(item: WatchlistItem, id: string) {
  const encoded = encodeURIComponent(id);
  switch (item.mediaType) {
    case 'movie':
    case 'tv':
      return `/${item.mediaType}/${encoded}`;
    case 'music':
      return `/music/${encoded}`;
    case 'book':
      return `/book/${encoded}`;
    case 'comic':
      return `/comic/${encoded}`;
    case 'magazine':
      return `/magazine/${encoded}`;
  }
}

function WatchlistPoster({
  item,
  id,
  discoverContextId,
  discoverItems,
  canRemove,
  removing,
  remove,
}: {
  item: WatchlistItem;
  id?: string;
  discoverContextId: string;
  discoverItems: DiscoverNavigationItem[];
  canRemove: boolean;
  removing?: string;
  remove: (item: WatchlistItem, id: string) => void;
}) {
  const { t } = useLumenLocale();
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const detailPath = id ? watchlistDetailPath(item, id) : null;
  useEffect(() => {
    const node = ref.current;
    if (!node || near) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100% 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [near]);
  const { data } = useApi<WatchlistMetadata>(near ? detailPath : null);
  const title = data?.title || data?.name || item.title;
  const image =
    item.mediaType === 'movie' || item.mediaType === 'tv'
      ? tmdbImg(data?.posterPath)
      : item.mediaType === 'book'
        ? bookArt(data?.posterPath)
        : artUrl(data?.posterPath);
  const year =
    data?.releaseDate?.slice(0, 4) ||
    data?.firstAirDate?.slice(0, 4) ||
    data?.startYear ||
    (data?.firstPublishYear ? String(data.firstPublishYear) : '');
  const subtitle = [
    item.mediaType === 'book' ? data?.author : '',
    item.mediaType === 'music' ? data?.artist?.name : '',
    item.mediaType === 'comic' || item.mediaType === 'magazine'
      ? data?.publisher
      : '',
    item.mediaType === 'magazine' && data?.latestIssue
      ? `#${data.latestIssue}`
      : year,
  ]
    .filter(Boolean)
    .join(' · ');
  const category = t(
    MEDIA_LABELS[item.mediaType][0],
    MEDIA_LABELS[item.mediaType][1]
  );
  const icon =
    item.mediaType === 'movie'
      ? 'film'
      : item.mediaType === 'tv'
        ? 'tv'
        : item.mediaType === 'music'
          ? 'music'
          : item.mediaType === 'book'
            ? 'book'
            : item.mediaType === 'comic'
              ? 'comic'
              : 'magazine';
  const href =
    detailPath && (item.mediaType === 'movie' || item.mediaType === 'tv')
      ? `${detailPath}?discoverContext=${encodeURIComponent(discoverContextId)}`
      : detailPath;
  const open = () => {
    if (id && (item.mediaType === 'movie' || item.mediaType === 'tv'))
      storeDiscoverNavigationContext(discoverContextId, discoverItems, {
        id: Number(id),
        mediaType: item.mediaType,
      });
  };

  return (
    <div
      className={`poster ${item.mediaType === 'book' ? 'book' : item.mediaType === 'music' ? 'sq' : ''}`}
      ref={ref}
      role="listitem"
    >
      <div className="art">
        <Cover src={image} title={title} sub={subtitle} icon={icon} />
        {href ? (
          <Link className="hit" to={href} aria-label={title} onClick={open} />
        ) : null}
      </div>
      {href ? (
        <Link
          className="t"
          to={href}
          onClick={open}
          tabIndex={-1}
          aria-hidden="true"
        >
          {title}
        </Link>
      ) : (
        <div className="t">{title}</div>
      )}
      <div className="m">
        <span className="card-meta">
          {[category, subtitle].filter(Boolean).join(' · ')}
        </span>
      </div>
      {id && canRemove && (
        <button
          className="btn btn-quiet btn-sm"
          type="button"
          aria-label={t(
            'lumen.watchlist.removeTitle',
            'Remove {title} from Watchlist',
            { title: item.title }
          )}
          disabled={Boolean(removing)}
          onClick={() => remove(item, id)}
        >
          {removing === `${item.mediaType}:${id}`
            ? t('lumen.watchlist.removing', 'Removing…')
            : t('lumen.watchlist.remove', 'Remove')}
        </button>
      )}
    </div>
  );
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
  const [discoverContextId] = useState(createDiscoverNavigationContextId);
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
        (item.source === undefined && data?.filtersSupported === true))
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
  const discoverItems: DiscoverNavigationItem[] =
    rows?.flatMap((item) => {
      const id = itemId(item);
      return id && (item.mediaType === 'movie' || item.mediaType === 'tv')
        ? [{ id: Number(id), mediaType: item.mediaType }]
        : [];
    }) ?? [];

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
          {page === 1 && (data?.totalPages ?? 0) <= 1
            ? t('lumen.watchlist.empty', 'Your Watchlist is empty.')
            : t('lumen.watchlist.noTitles', 'No titles on this page.')}
        </p>
      )}
      {!!rows?.length && (
        <div className="grid" role="list" aria-label={label}>
          {rows.map((item) => {
            const id = itemId(item);
            return (
              <WatchlistPoster
                key={`${item.mediaType}:${item.ratingKey}`}
                item={item}
                id={id}
                discoverContextId={discoverContextId}
                discoverItems={discoverItems}
                canRemove={canRemoveItem(item)}
                removing={removing}
                remove={(target, targetId) => void remove(target, targetId)}
              />
            );
          })}
        </div>
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
      {targetUserId === undefined && (
        <CategorySettingsNote error={extras.error} retry={extras.retry} />
      )}
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
