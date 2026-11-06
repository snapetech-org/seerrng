import PageTitle from '@app/components/Common/PageTitle';
import messages from '@app/components/WatchSessions/messages';
import SessionForm, {
  type SessionFormValues,
} from '@app/components/WatchSessions/SessionForm';
import type { WatchSessionSummary } from '@app/components/WatchSessions/types';
import { useUser } from '@app/hooks/useUser';
import axios from 'axios';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const WatchSessions = () => {
  const intl = useIntl();
  const router = useRouter();
  const { user } = useUser();
  const {
    data: sessionData,
    error: sessionError,
    mutate: refreshSessions,
  } = useSWR<{ sessions: WatchSessionSummary[] }>('/api/v1/watch-sessions');

  const createSession = async (values: SessionFormValues) => {
    const response = await axios.post<{ session: WatchSessionSummary }>(
      '/api/v1/watch-sessions',
      values
    );
    await refreshSessions();
    await router.push(`/watch-sessions/${response.data.session.id}`);
  };

  return (
    <div className="page-layout">
      <PageTitle title={intl.formatMessage(messages.title)} />
      <div className="page-title-row">
        <h1 className="page-title">{intl.formatMessage(messages.title)}</h1>
      </div>
      <p className="card-body-text">{intl.formatMessage(messages.intro)}</p>
      <p className="card-body-text">
        {intl.formatMessage(messages.requestNote)}
      </p>

      <section className="app-card-main card-layout">
        <h2 className="page-heading">
          {intl.formatMessage(messages.createTitle)}
        </h2>
        <SessionForm
          submitLabel={messages.create}
          savingLabel={messages.creating}
          onSubmit={createSession}
        />
      </section>

      <section className="app-card-main card-layout">
        <h2 className="page-heading">
          {intl.formatMessage(messages.yourSessions)}
        </h2>
        {sessionError ? (
          <p className="page-error-message" role="alert">
            {intl.formatMessage(messages.loadError)}
          </p>
        ) : sessionData?.sessions.length ? (
          <div className="card-list">
            {sessionData.sessions.map((session) => (
              <article key={session.id} className="app-card-sub card-layout">
                <h3 className="card-title">
                  <Link href={`/watch-sessions/${session.id}`}>
                    {session.title}
                  </Link>
                </h3>
                <p className="card-body-text">
                  {intl.formatMessage(
                    session.status === 'draft'
                      ? messages.draft
                      : messages.active
                  )}{' '}
                  ·{' '}
                  {intl.formatMessage(messages.memberCount, {
                    count: session.memberCount,
                  })}
                  {session.ownerId === user?.id &&
                    ` · ${intl.formatMessage(messages.owner)}`}
                </p>
                <p className="card-body-text">
                  {intl.formatMessage(messages.expires, {
                    date: intl.formatDate(session.expiresAt, {
                      dateStyle: 'medium',
                    }),
                  })}
                </p>
              </article>
            ))}
          </div>
        ) : sessionData ? (
          <p className="card-body-text">
            {intl.formatMessage(messages.emptyList)}
          </p>
        ) : (
          <p className="card-body-text">
            {intl.formatMessage(messages.loading)}
          </p>
        )}
      </section>
    </div>
  );
};

export default WatchSessions;
