import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type Paged, type TitleResult } from '../api';
import { ExtraHeader, ServiceNote } from '../components/extra';
import { useToast } from '../components/toast';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';

const feeds = {
  'anilist/trending': 'AniList Trending',
  'anilist/popular': 'AniList Popular',
  'anilist/top': 'AniList Top Rated',
  'anilist/next-season': 'AniList Next Season',
  'anilist/library': 'AniList Library',
  'trakt/watchlist': 'Trakt Watchlist',
  'trakt/history': 'Trakt History',
  'trakt/recommendations-movie': 'Trakt Movie Recommendations',
  'trakt/recommendations-tv': 'Trakt Series Recommendations',
  'mdblist/list': 'MDBList Public List',
};

interface FeedPage {
  page: number;
  hasMore: boolean;
  items: {
    id: string;
    title: string;
    year?: number;
    tmdbId?: number;
    mediaType?: 'movie' | 'tv';
    mappingAvailable?: boolean;
    identityMapped?: boolean;
    identityResolution?: 'personal' | 'curated' | 'external-id';
  }[];
}

function videoHref(item: FeedPage['items'][number]) {
  if (
    (item.mediaType === 'movie' || item.mediaType === 'tv') &&
    typeof item.tmdbId === 'number' &&
    Number.isSafeInteger(item.tmdbId) &&
    item.tmdbId > 0 &&
    item.tmdbId <= 1_000_000_000
  )
    return `/${item.mediaType}/${item.tmdbId}`;
}

function IdentityMapping({
  item,
  updated,
}: {
  item: FeedPage['items'][number];
  updated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<{ term: string; type: string }>();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const toast = useToast();
  const search = useApi<Paged<TitleResult>>(
    open && matches
      ? `/search?${new URLSearchParams({ query: matches.term, type: matches.type, page: '1' })}`
      : null
  );

  async function change(id?: number) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const path = '/integrations/discovery/mappings';
      if (id === undefined) {
        await api(
          `${path}/${encodeURIComponent(item.id)}`,
          { method: 'DELETE' },
          'empty'
        );
      } else {
        await api(path, {
          method: 'PUT',
          body: JSON.stringify({
            identity: item.id,
            tmdbId: id,
            mediaType: matches?.type,
          }),
        });
      }
      setOpen(false);
      setMatches(undefined);
      updated();
    } catch (cause) {
      toast(friendlyError(cause, 'Couldn’t update the provider match'));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="toolbar">
        <button
          className="btn btn-quiet btn-sm"
          type="button"
          disabled={busy}
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
            setMatches(undefined);
          }}
        >
          {videoHref(item) ? 'Change Match' : 'Match Title'}
        </button>
        {item.identityMapped && (
          <button
            className="btn btn-quiet btn-sm"
            type="button"
            disabled={busy}
            onClick={() => void change()}
          >
            Reset Match
          </button>
        )}
      </div>
      {open && (
        <>
          <form
            className="toolbar"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const term = String(form.get('query') ?? '').trim();
              const type = form.get('type') === 'tv' ? 'tv' : 'movie';
              if (term.length < 2 || term.length > 256) return;
              if (matches?.term === term && matches.type === type)
                search.reload();
              else setMatches({ term, type });
            }}
          >
            <label className="search">
              <input
                name="query"
                type="search"
                aria-label="Find a Match"
                defaultValue={item.title}
                required
                minLength={2}
                maxLength={256}
                disabled={busy}
              />
            </label>
            <label className="sel">
              <span className="lbl">Media Type</span>
              <select
                name="type"
                aria-label="Match Media Type"
                defaultValue={item.mediaType ?? 'movie'}
                disabled={busy}
              >
                <option value="movie">Movies</option>
                <option value="tv">Series</option>
              </select>
            </label>
            <button
              className="btn btn-tonal btn-sm"
              type="submit"
              disabled={busy}
            >
              Search Matches
            </button>
          </form>
          {matches && (
            <ServiceNote
              error={search.error}
              what="catalogue matches"
              retry={search.reload}
            />
          )}
          {matches && !search.data && !search.error && (
            <p className="note" role="status">
              Searching for matches…
            </p>
          )}
          {matches && search.data && (
            <ul className="setlist">
              {search.data.results
                .filter(
                  (result) =>
                    result.mediaType === matches.type &&
                    Number.isSafeInteger(result.id) &&
                    result.id > 0 &&
                    result.id <= 1_000_000_000
                )
                .map((result) => {
                  const title =
                    result.title ?? result.name ?? String(result.id);
                  return (
                    <li className="set" key={result.id}>
                      <div>
                        <b>{title}</b>
                        <small>
                          {(result.releaseDate ?? result.firstAirDate)?.slice(
                            0,
                            4
                          )}{' '}
                          · TMDB {result.id}
                        </small>
                      </div>
                      <button
                        className="btn btn-tonal btn-sm"
                        type="button"
                        disabled={busy}
                        aria-label={`Match ${title}`}
                        onClick={() => void change(result.id)}
                      >
                        Use Match
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function FeedFailure({
  error,
  code,
  retryAt,
  retry,
}: {
  error: string;
  code?: string;
  retryAt?: number;
  retry: () => void;
}) {
  const remaining = () =>
    Math.max(0, Math.ceil(((retryAt ?? 0) - Date.now()) / 1000));
  const [seconds, setSeconds] = useState(remaining);
  useEffect(() => {
    if (!retryAt) return;
    const timer = window.setInterval(() => {
      const next = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
      setSeconds(next);
      if (!next) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  const retryable =
    code !== 'PROVIDER_LIST_NOT_FOUND' &&
    code !== 'PROVIDER_SETUP_REQUIRED' &&
    code !== 'RECONNECT_REQUIRED';
  return (
    <>
      <ServiceNote
        error={seconds ? `${error} Retry in ${seconds} seconds.` : error}
        what="provider feed"
        retry={retryable ? retry : undefined}
        retryDisabled={seconds > 0}
      />
      {code === 'RECONNECT_REQUIRED' && (
        <div className="toolbar">
          <Link className="chip" to="/me/account/linked-accounts">
            Reconnect Provider
          </Link>
        </div>
      )}
    </>
  );
}

export default function ProviderDiscovery() {
  const [params, setParams] = useSearchParams();
  const requestedFeed = params.get('feed') ?? '';
  const feed = Object.hasOwn(feeds, requestedFeed)
    ? requestedFeed
    : 'anilist/trending';
  const requestedPage = params.get('page') ?? '';
  const page = /^[1-9]\d?$|^100$/.test(requestedPage)
    ? Number(requestedPage)
    : 1;
  const list = params.get('list')?.trim() ?? '';
  const unmatched = params.get('unmatched') === '1';
  const query = new URLSearchParams({ page: String(page) });
  const needsList = feed === 'mdblist/list';
  if (needsList && list.length <= 2048) query.set('list', list);
  const enabled = !needsList || (!!list && list.length <= 2048);
  const { data, error, errorStatus, apiError, reload } = useApi<FeedPage>(
    enabled ? `/integrations/discovery/feeds/${feed}?${query}` : null
  );
  const current = data?.page === page ? data : null;
  const items = current?.items.filter((item) => !unmatched || !videoHref(item));

  function update(name: string, value: string, resetPage = true) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    if (resetPage) next.delete('page');
    setParams(next);
  }

  return (
    <>
      <ExtraHeader title="Provider Discovery">
        <div className="toolbar">
          <Link className="chip" to="/me/account/linked-accounts">
            Linked Accounts
          </Link>
          <Link className="chip" to="/">
            Discover
          </Link>
        </div>
      </ExtraHeader>
      <div className="toolbar">
        <label className="sel">
          <span className="lbl">Provider Feed</span>
          <select
            aria-label="Provider Feed"
            value={feed}
            onChange={(event) => update('feed', event.target.value)}
          >
            {Object.entries(feeds).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={unmatched}
            onChange={(event) =>
              update('unmatched', event.target.checked ? '1' : '', false)
            }
          />{' '}
          Unmatched Only
        </label>
      </div>
      {needsList && (
        <form
          className="toolbar"
          key={list}
          onSubmit={(event) => {
            event.preventDefault();
            const value = String(
              new FormData(event.currentTarget).get('list') ?? ''
            ).trim();
            update('list', value);
          }}
        >
          <label className="search">
            <input
              name="list"
              type="text"
              aria-label="MDBList Reference"
              defaultValue={list}
              maxLength={2048}
              required
            />
          </label>
          <button className="btn btn-tonal btn-sm" type="submit">
            Open List
          </button>
        </form>
      )}
      {error && (
        <FeedFailure
          key={`${feed}:${page}:${apiError?.retryAt ?? ''}`}
          error={error}
          code={apiError?.code}
          retryAt={apiError?.retryAt}
          retry={reload}
        />
      )}
      {(errorStatus === 401 || errorStatus === 403) && (
        <p className="note">
          Check that this provider is enabled and linked in your account.
        </p>
      )}
      {enabled && !current && !error && (
        <p className="note" role="status">
          Loading feed…
        </p>
      )}
      {items?.length === 0 && (
        <p className="note">
          {unmatched
            ? 'No unmatched titles on this page.'
            : 'No titles on this page.'}
        </p>
      )}
      {!!items?.length && (
        <ul className="setlist">
          {items.map((item) => {
            const href = videoHref(item);
            return (
              <li className="set" key={item.id}>
                <div>
                  {href ? (
                    <Link className="go" to={href}>
                      {item.title}
                    </Link>
                  ) : (
                    <b>{item.title}</b>
                  )}
                  <small>
                    {[
                      item.year,
                      href
                        ? item.mediaType === 'movie'
                          ? 'Movie'
                          : 'Series'
                        : 'No catalogue match',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                </div>
                {(item.mappingAvailable ||
                  item.identityMapped ||
                  item.identityResolution === 'curated' ||
                  item.identityResolution === 'external-id') && (
                  <IdentityMapping item={item} updated={reload} />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {enabled && (page > 1 || current?.hasMore) && (
        <nav className="toolbar" aria-label="Provider Feed Pages">
          <button
            className="btn btn-quiet btn-sm"
            type="button"
            disabled={page <= 1}
            onClick={() => update('page', String(page - 1), false)}
          >
            Previous Page
          </button>
          <span className="note">Page {page}</span>
          <button
            className="btn btn-quiet btn-sm"
            type="button"
            disabled={!current?.hasMore || page >= 100}
            onClick={() => update('page', String(page + 1), false)}
          >
            Next Page
          </button>
        </nav>
      )}
    </>
  );
}
