import Button from '@app/components/Common/Button';
import PageTitle from '@app/components/Common/PageTitle';
import messages from '@app/components/WatchSessions/messages';
import { useUser } from '@app/hooks/useUser';
import { buildLoginPath } from '@app/utils/loginReturn';
import {
  captureWatchSessionInviteTokenFromHash,
  clearStoredWatchSessionInviteToken,
  readStoredWatchSessionInviteToken,
} from '@app/utils/watchSessionInvite';
import axios from 'axios';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

const WatchSessionJoin = () => {
  const intl = useIntl();
  const router = useRouter();
  const { user, loading } = useUser();
  const [token, setToken] = useState('');
  const [tokenRead, setTokenRead] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const attempted = useRef(false);

  useEffect(() => {
    if (!router.isReady) return;
    const inviteToken =
      captureWatchSessionInviteTokenFromHash() ??
      readStoredWatchSessionInviteToken();
    setToken(inviteToken ?? '');
    setTokenRead(true);
  }, [router.isReady]);

  useEffect(() => {
    if (!user || !tokenRead || attempted.current) return;
    if (!token) {
      setJoinError(intl.formatMessage(messages.joinError));
      return;
    }
    attempted.current = true;
    setJoining(true);
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${window.location.search}`
    );
    void axios
      .post<{ sessionId: number }>('/api/v1/watch-sessions/invites/accept', {
        token,
      })
      .then((response) => {
        clearStoredWatchSessionInviteToken();
        return router.replace(`/watch-sessions/${response.data.sessionId}`);
      })
      .catch((error) => {
        const status = axios.isAxiosError(error)
          ? error.response?.status
          : undefined;
        if (status === 404 || status === 409) {
          clearStoredWatchSessionInviteToken();
        }
        setJoinError(
          intl.formatMessage(
            status === 403
              ? messages.joinPermissionError
              : status === 409
                ? messages.joinConflictError
                : messages.joinError
          )
        );
      })
      .finally(() => setJoining(false));
  }, [intl, router, token, tokenRead, user]);

  const signIn = () => {
    void router.push(buildLoginPath('/watch-sessions/join'));
  };

  return (
    <div className="page-layout">
      <PageTitle title={intl.formatMessage(messages.joinTitle)} />
      <div data-page-layout-part="content" data-page-flow="stack">
        <div className="page-title-row">
          <h1 className="page-title">
            {intl.formatMessage(messages.joinTitle)}
          </h1>
        </div>
        {user && joining ? (
          <p className="card-body-text" role="status">
            {intl.formatMessage(messages.joining)}
          </p>
        ) : user && joinError ? (
          <p className="page-error-message" role="alert">
            {joinError}
          </p>
        ) : user ? (
          <p className="card-body-text">
            {intl.formatMessage(messages.loading)}
          </p>
        ) : loading ? (
          <p className="card-body-text">
            {intl.formatMessage(messages.loading)}
          </p>
        ) : (
          <>
            <p className="card-body-text">
              {intl.formatMessage(messages.joinPrompt)}
            </p>
            <div className="app-action-row">
              <Button type="button" buttonType="primary" onClick={signIn}>
                {intl.formatMessage(messages.signIn)}
              </Button>
            </div>
          </>
        )}
        <Link href="/watch-sessions">
          {intl.formatMessage(messages.backToSessions)}
        </Link>
      </div>
    </div>
  );
};

export default WatchSessionJoin;
