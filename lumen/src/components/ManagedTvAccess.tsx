import { Link } from 'react-router-dom';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { ServiceNote } from './extra';

const statusMessages = {
  off: 'Approval needed',
  pending: 'Waiting for approval',
  approved: 'Approved · off',
  enabled: 'Enabled for this account',
  denied: 'Request declined',
} as const;

export default function ManagedTvAccess({ id }: { id: number }) {
  const { t, locale } = useLumenLocale();
  const { data, error, reload } = useApi<{
    status: keyof typeof statusMessages;
    globallyEnabled: boolean;
    requestedAt: string | null;
  }>(`/user/${id}/settings/tv-season-watch-gate`);

  return (
    <div>
      <ServiceNote
        error={error}
        what={t('lumen.managedTvAccess.title', 'TV request access')}
        retry={reload}
      />
      {!data && !error && (
        <p className="note" role="status">
          {t('lumen.managedTvAccess.loading', 'Loading TV request access…')}
        </p>
      )}
      {data && (
        <>
          <p className="note">
            {data.globallyEnabled
              ? t('lumen.managedTvAccess.everyone', 'Enabled for everyone')
              : t(
                  `lumen.managedTvAccess.status.${data.status}`,
                  statusMessages[data.status]
                )}
          </p>
          {data.requestedAt && data.status !== 'off' && (
            <p className="note">
              {t('lumen.managedTvAccess.requested', 'Requested {date}', {
                date: new Date(data.requestedAt).toLocaleDateString(locale),
              })}
            </p>
          )}
          <div className="toolbar">
            <button className="btn btn-quiet btn-sm" onClick={reload}>
              {t('lumen.managedTvAccess.refresh', 'Refresh Access')}
            </button>
            {data.status === 'pending' && (
              <Link
                className="btn btn-quiet btn-sm"
                to="/me/account/tv-requests"
              >
                {t('lumen.managedTvAccess.review', 'Review TV Access Requests')}
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
