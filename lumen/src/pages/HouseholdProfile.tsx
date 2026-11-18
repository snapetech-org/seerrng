import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { tmdbImg, type RequestItem } from '../api';
import { isAdministrator, useAuth } from '../auth';
import { Section, shortDate } from '../components/cards';
import { canViewAllRequests } from '../components/detail';
import { ExtraCard, ExtraHeader, ServiceNote } from '../components/extra';
import RequestLimits from '../components/RequestLimits';
import { useApi } from '../hooks';
import { describeAll } from './Requests';
import { canViewUserWatchlist, itemId, type WatchlistData } from './Watchlist';

function RecentRequests({ id, own }: { id: number; own: boolean }) {
  const requestScope = own ? 'tab=all' : `requestedBy=${id}`;
  const requests = useApi<{ results: RequestItem[] }>(
    `/user/${id}/requests?take=10&skip=0`,
    { currentPathOnly: true }
  );
  const [rows, setRows] = useState<Awaited<ReturnType<typeof describeAll>>>();
  const [descriptionError, setDescriptionError] = useState(false);
  const results = Array.isArray(requests.data?.results)
    ? requests.data.results
    : undefined;
  const error =
    requests.error ||
    (requests.data && !results ? 'Invalid recent requests response.' : null) ||
    (descriptionError ? 'Could not load request titles.' : null);
  useEffect(() => {
    let active = true;
    if (results) {
      setDescriptionError(false);
      const update = (result: Awaited<ReturnType<typeof describeAll>>) => {
        if (active) setRows(result);
      };
      void describeAll(results, update)
        .then(update)
        .catch(() => {
          if (active) setDescriptionError(true);
        });
    }
    return () => {
      active = false;
    };
  }, [results]);

  return (
    <Section title="Recent Requests">
      <ServiceNote
        error={error}
        what="recent requests"
        retry={requests.reload}
      />
      {!error && !rows && (
        <p className="note" role="status">
          Loading requests…
        </p>
      )}
      {results && rows?.length === 0 && (
        <p className="note">No requests yet.</p>
      )}
      {results && !!rows?.length && (
        <ul className="setlist">
          {rows.map(({ r, title }) => (
            <li className="set" key={r.id}>
              <Link
                className="go"
                to={`/requests?${requestScope}&requestId=${r.id}`}
              >
                {title}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link className="btn btn-quiet btn-sm" to={`/requests?${requestScope}`}>
        View Requests
      </Link>
    </Section>
  );
}

function WatchlistPreview({ id, own }: { id: number; own: boolean }) {
  const watchlist = useApi<WatchlistData>(`/user/${id}/watchlist`, {
    currentPathOnly: true,
  });
  const items = Array.isArray(watchlist.data?.results)
    ? watchlist.data.results
    : undefined;
  const error =
    watchlist.error ||
    (watchlist.data && !items ? 'Invalid watchlist response.' : null);
  return (
    <Section title="Watchlist">
      <ServiceNote error={error} what="watchlist" retry={watchlist.reload} />
      {!error && !items && (
        <p className="note" role="status">
          Loading watchlist…
        </p>
      )}
      {items?.length === 0 && (
        <p className="note">No titles on this watchlist.</p>
      )}
      {!!items?.length && (
        <ul className="setlist">
          {items.slice(0, 10).map((item) => {
            const key = itemId(item);
            return (
              <li className="set" key={`${item.mediaType}:${item.ratingKey}`}>
                {key ? (
                  <Link
                    className="go"
                    to={`/${item.mediaType}/${encodeURIComponent(key)}`}
                  >
                    {item.title}
                  </Link>
                ) : (
                  <b>{item.title}</b>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Link
        className="btn btn-quiet btn-sm"
        to={own ? '/watchlist' : `/watchlist/user/${id}`}
      >
        View Watchlist
      </Link>
    </Section>
  );
}

function PlaybackActivity({ id }: { id: number }) {
  const activity = useApi<{
    playCount: number;
    recentlyWatched: {
      id: number;
      tmdbId: number;
      mediaType: 'movie' | 'tv';
      searchMetadata?: { title?: string | null; posterPath?: string | null };
    }[];
  }>(`/user/${id}/watch_data`, { currentPathOnly: true });

  if (activity.errorStatus === 404) return null;

  const data =
    activity.data &&
    Number.isSafeInteger(activity.data.playCount) &&
    activity.data.playCount >= 0 &&
    Array.isArray(activity.data.recentlyWatched)
      ? activity.data
      : null;
  const error =
    activity.error ||
    (activity.data && !data ? 'Invalid playback activity response.' : null);
  const watched = data?.recentlyWatched.filter(
    ({ mediaType, tmdbId }) =>
      (mediaType === 'movie' || mediaType === 'tv') &&
      Number.isSafeInteger(tmdbId) &&
      tmdbId > 0
  );

  return (
    <Section title="Playback Activity">
      <ServiceNote
        error={error}
        what="playback activity"
        retry={activity.reload}
      />
      {!data && !error && (
        <p className="note" role="status">
          Loading playback activity…
        </p>
      )}
      {data && (
        <>
          <p className="note">Total plays: {data.playCount.toLocaleString()}</p>
          {watched?.length ? (
            <div className="rail" aria-label="Recently watched">
              {watched.map(
                ({ id: mediaId, tmdbId, mediaType, searchMetadata }) => (
                  <ExtraCard
                    key={mediaId}
                    href={`/${mediaType}/${tmdbId}`}
                    img={tmdbImg(searchMetadata?.posterPath)}
                    title={
                      searchMetadata?.title ||
                      (mediaType === 'movie' ? 'Movie' : 'Series')
                    }
                    icon={mediaType === 'movie' ? 'film' : 'tv'}
                    titleKind={mediaType}
                  />
                )
              )}
            </div>
          ) : (
            <p className="note">No recently watched titles to display.</p>
          )}
        </>
      )}
    </Section>
  );
}

export default function HouseholdProfile() {
  const { id: rawId = '' } = useParams();
  const { user } = useAuth();
  const id =
    rawId === 'me'
      ? (user?.id ?? 0)
      : /^[1-9]\d{0,9}$/.test(rawId)
        ? Number(rawId)
        : 0;
  const valid = id > 0 && id <= 1_000_000_000;
  const profile = useApi<{
    id: number;
    displayName: string;
    createdAt?: string;
    userType?: number;
  }>(valid ? `/user/${id}` : null, { currentPathOnly: true });
  const own = user?.id === id;
  const permissions = user?.permissions ?? 0;
  const canViewQuota =
    own || ((permissions & (2 | 8)) !== 0 && (permissions & (2 | 16)) !== 0);
  const loaded = profile.data?.id === id;
  const joined = loaded ? shortDate(profile.data?.createdAt) : '';
  const canEdit = own || (id !== 1 && (permissions & (2 | 8)) !== 0);
  return (
    <>
      <ExtraHeader
        title={loaded ? profile.data!.displayName : 'Household Profile'}
        sub={joined ? `Joined ${joined}` : undefined}
      >
        {loaded && canEdit && (
          <Link
            className="btn btn-quiet btn-sm"
            to={own ? '/me/account' : `/admin/users/${id}`}
          >
            Edit Settings
          </Link>
        )}
      </ExtraHeader>
      {!valid && <p className="note">Invalid user ID.</p>}
      <ServiceNote
        error={profile.error}
        what="household profile"
        retry={profile.reload}
      />
      {valid && !profile.data && !profile.error && (
        <div className="detail-loading" aria-busy="true" />
      )}
      {loaded && (
        <>
          {canViewQuota && <RequestLimits key={id} id={id} />}
          {profile.data?.userType === 1 &&
            (own || isAdministrator(permissions)) && (
              <PlaybackActivity key={id} id={id} />
            )}
          {(own || canViewAllRequests(user?.permissions)) && (
            <RecentRequests key={id} id={id} own={own} />
          )}
          {(own || canViewUserWatchlist(user?.permissions ?? 0)) && (
            <WatchlistPreview key={id} id={id} own={own} />
          )}
        </>
      )}
    </>
  );
}
