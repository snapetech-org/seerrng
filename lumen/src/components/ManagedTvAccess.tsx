import { Link } from 'react-router-dom';
import { useApi } from '../hooks';
import { ServiceNote } from './extra';

const statuses = {
  off: 'Approval needed',
  pending: 'Waiting for approval',
  approved: 'Approved · off',
  enabled: 'Enabled for this account',
  denied: 'Request declined',
};

export default function ManagedTvAccess({ id }: { id: number }) {
  const { data, error, reload } = useApi<{
    status: keyof typeof statuses;
    globallyEnabled: boolean;
    requestedAt: string | null;
  }>(`/user/${id}/settings/tv-season-watch-gate`);

  return (
    <div>
      <ServiceNote error={error} what="TV request access" retry={reload} />
      {!data && !error && (
        <p className="note" role="status">
          Loading TV request access…
        </p>
      )}
      {data && (
        <>
          <p className="note">
            {data.globallyEnabled
              ? 'Enabled for everyone'
              : statuses[data.status]}
          </p>
          {data.requestedAt && data.status !== 'off' && (
            <p className="note">
              Requested {new Date(data.requestedAt).toLocaleDateString()}
            </p>
          )}
          <div className="toolbar">
            <button className="btn btn-quiet btn-sm" onClick={reload}>
              Refresh Access
            </button>
            {data.status === 'pending' && (
              <Link
                className="btn btn-quiet btn-sm"
                to="/me/account/tv-requests"
              >
                Review TV Access Requests
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
