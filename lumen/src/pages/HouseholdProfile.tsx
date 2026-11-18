import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { RequestItem } from '../api';
import { useAuth } from '../auth';
import { Section } from '../components/cards';
import { canViewAllRequests } from '../components/detail';
import { ExtraHeader, ServiceNote } from '../components/extra';
import RequestLimits from '../components/RequestLimits';
import { useApi } from '../hooks';
import { describeAll } from './Requests';
import { canViewUserWatchlist, itemId, type WatchlistData } from './Watchlist';

function RecentRequests({ id, own }: { id: number; own: boolean }) {
  const requests = useApi<{ results: RequestItem[] }>(
    `/user/${id}/requests?take=10&skip=0`,
    { currentPathOnly: true }
  );
  const [rows, setRows] = useState<Awaited<ReturnType<typeof describeAll>>>();
  const [descriptionError, setDescriptionError] = useState(false);
  useEffect(() => {
    let active = true;
    if (requests.data) {
      setDescriptionError(false);
      const update = (result: Awaited<ReturnType<typeof describeAll>>) => {
        if (active) setRows(result);
      };
      void describeAll(requests.data.results, update)
        .then(update)
        .catch(() => {
          if (active) setDescriptionError(true);
        });
    }
    return () => {
      active = false;
    };
  }, [requests.data]);

  return (
    <Section title="Recent Requests">
      <ServiceNote
        error={
          requests.error ||
          (descriptionError ? 'Could not load request titles.' : null)
        }
        what="recent requests"
        retry={requests.reload}
      />
      {!requests.error && !descriptionError && !rows && (
        <p className="note" role="status">
          Loading requests…
        </p>
      )}
      {requests.data && rows?.length === 0 && (
        <p className="note">No requests yet.</p>
      )}
      {requests.data && !!rows?.length && (
        <ul className="setlist">
          {rows.map(({ r, title }) => (
            <li className="set" key={r.id}>
              <Link className="go" to={`/requests?requestId=${r.id}`}>
                {title}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        className="btn btn-quiet btn-sm"
        to={own ? '/requests' : `/requests?requestedBy=${id}`}
      >
        View Requests
      </Link>
    </Section>
  );
}

function WatchlistPreview({ id, own }: { id: number; own: boolean }) {
  const watchlist = useApi<WatchlistData>(`/user/${id}/watchlist`, {
    currentPathOnly: true,
  });
  return (
    <Section title="Watchlist">
      <ServiceNote
        error={watchlist.error}
        what="watchlist"
        retry={watchlist.reload}
      />
      {!watchlist.error && !watchlist.data && (
        <p className="note" role="status">
          Loading watchlist…
        </p>
      )}
      {watchlist.data?.results.length === 0 && (
        <p className="note">No titles on this watchlist.</p>
      )}
      {!!watchlist.data?.results.length && (
        <ul className="setlist">
          {watchlist.data.results.slice(0, 10).map((item) => {
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

export default function HouseholdProfile() {
  const { id: rawId = '' } = useParams();
  const { user } = useAuth();
  const id = /^[1-9]\d{0,9}$/.test(rawId) ? Number(rawId) : 0;
  const valid = id > 0 && id <= 1_000_000_000;
  const profile = useApi<{ id: number; displayName: string }>(
    valid ? `/user/${id}` : null,
    { currentPathOnly: true }
  );
  const own = user?.id === id;
  const permissions = user?.permissions ?? 0;
  const canViewQuota =
    own || ((permissions & (2 | 8)) !== 0 && (permissions & (2 | 16)) !== 0);
  const loaded = profile.data?.id === id;
  return (
    <>
      <ExtraHeader
        title={loaded ? profile.data!.displayName : 'Household Profile'}
      />
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
