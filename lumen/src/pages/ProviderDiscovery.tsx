import { Link, useSearchParams } from 'react-router-dom';
import { ExtraHeader, ServiceNote } from '../components/extra';
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
  const { data, error, errorStatus, reload } = useApi<FeedPage>(
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
      <ServiceNote error={error} what="provider feed" retry={reload} />
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
