import Button from '@app/components/Common/Button';
import ConfirmButton from '@app/components/Common/ConfirmButton';
import PageTitle from '@app/components/Common/PageTitle';
import SettingsFormRow from '@app/components/Settings/SettingsFormRow';
import messages from '@app/components/WatchSessions/messages';
import type { SessionFormValues } from '@app/components/WatchSessions/SessionForm';
import SessionForm from '@app/components/WatchSessions/SessionForm';
import type {
  SessionMovie,
  SessionMovieBallot,
  WatchSessionDetail,
  WatchSessionInvite,
} from '@app/components/WatchSessions/types';
import { useUser } from '@app/hooks/useUser';
import axios from 'axios';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

interface SessionMoviePage {
  candidates?: SessionMovie[];
  ballots?: SessionMovieBallot[];
  matches?: SessionMovie[];
  hasMore: boolean;
}

const inviteStatusMessages = {
  open: messages.inviteOpen,
  claimed: messages.inviteClaimed,
  expired: messages.inviteExpired,
  revoked: messages.inviteRevoked,
};

const WatchSessionDetailPage = () => {
  const intl = useIntl();
  const router = useRouter();
  const { user } = useUser();
  const rawId = router.query.id;
  const sessionId =
    typeof rawId === 'string' && /^\d+$/.test(rawId) && Number(rawId) > 0
      ? Number(rawId)
      : undefined;
  const sessionUrl = sessionId ? `/api/v1/watch-sessions/${sessionId}` : null;
  const {
    data: sessionData,
    error: sessionError,
    mutate: refreshSession,
  } = useSWR<{ session: WatchSessionDetail }>(sessionUrl);
  const session = sessionData?.session;
  const owner = Boolean(session && user && session.ownerId === user.id);
  const isDraft = session?.status === 'draft';
  const isActive = session?.status === 'active';
  const inviteUrl =
    owner && isDraft && sessionId
      ? `/api/v1/watch-sessions/${sessionId}/invites`
      : null;
  const { data: inviteData, mutate: refreshInvites } = useSWR<{
    invites: WatchSessionInvite[];
  }>(inviteUrl);
  const deckUrl =
    isActive && sessionId ? `/api/v1/watch-sessions/${sessionId}/deck` : null;
  const {
    data: deck,
    error: deckError,
    mutate: refreshDeck,
  } = useSWR<SessionMoviePage>(deckUrl);
  const myBallotsUrl =
    isActive && sessionId
      ? `/api/v1/watch-sessions/${sessionId}/my-ballots`
      : null;
  const {
    data: myBallotData,
    error: myBallotError,
    mutate: refreshMyBallots,
  } = useSWR<{ ballots: SessionMovieBallot[] }>(myBallotsUrl);
  const matchesUrl =
    isActive && sessionId
      ? `/api/v1/watch-sessions/${sessionId}/matches?take=20&skip=0`
      : null;
  const {
    data: matchPage,
    error: matchesError,
    mutate: refreshMatches,
  } = useSWR<SessionMoviePage>(matchesUrl, {
    refreshInterval: isActive ? 10000 : 0,
  });
  const [additionalMatches, setAdditionalMatches] = useState<SessionMovie[]>(
    []
  );
  const [matchSkip, setMatchSkip] = useState(20);
  const [moreMatchPages, setMoreMatchPages] = useState<boolean>();
  const [latestInviteUrl, setLatestInviteUrl] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sharingWatchlist, setSharingWatchlist] = useState(false);

  useEffect(() => {
    setSharingWatchlist(
      session?.ownPreferences.includeWatchlistContributions ?? false
    );
  }, [session?.id, session?.ownPreferences.includeWatchlistContributions]);

  useEffect(() => {
    setAdditionalMatches([]);
    setMatchSkip(20);
    setMoreMatchPages(undefined);
  }, [sessionId]);

  const runAction = async (action: () => Promise<void>): Promise<boolean> => {
    setActionError('');
    setActionMessage('');
    setBusy(true);
    try {
      await action();
      return true;
    } catch (error) {
      const apiMessage = axios.isAxiosError<{ message?: string }>(error)
        ? error.response?.data?.message
        : undefined;
      setActionError(apiMessage ?? intl.formatMessage(messages.networkError));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async (values: SessionFormValues) => {
    if (!sessionUrl) return;
    await axios.put(sessionUrl, values);
    await refreshSession();
    setActionMessage(intl.formatMessage(messages.settingsSaved));
  };

  const createInvite = async () => {
    if (!sessionId) return;
    const response = await axios.post<{ token: string }>(
      `/api/v1/watch-sessions/${sessionId}/invites`
    );
    setLatestInviteUrl(
      `${window.location.origin}/watch-sessions/join#token=${encodeURIComponent(response.data.token)}`
    );
    await refreshInvites();
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(latestInviteUrl);
      setActionMessage(intl.formatMessage(messages.inviteCopied));
      setActionError('');
    } catch {
      setActionError(intl.formatMessage(messages.inviteCopyFailed));
    }
  };

  const changeWatchlistPreference = async (enabled: boolean) => {
    if (!sessionId) return;
    const saved = await runAction(async () => {
      await axios.put(`/api/v1/watch-sessions/${sessionId}/preferences`, {
        includeWatchlistContributions: enabled,
      });
      await refreshSession();
    });
    if (!saved) setSharingWatchlist(!enabled);
  };

  const startSession = async () => {
    if (!sessionId) return;
    await runAction(async () => {
      await axios.post(`/api/v1/watch-sessions/${sessionId}/start`);
      await refreshSession();
    });
  };

  const closeSession = async () => {
    if (!sessionId) return;
    await runAction(async () => {
      await axios.delete(`/api/v1/watch-sessions/${sessionId}`);
      await router.replace('/watch-sessions');
    });
  };

  const leaveSession = async () => {
    if (!sessionId) return;
    await runAction(async () => {
      await axios.delete(`/api/v1/watch-sessions/${sessionId}/members/me`);
      await router.replace('/watch-sessions');
    });
  };

  const removeMember = async (memberId: number) => {
    if (!sessionId) return;
    await runAction(async () => {
      const response = await axios.delete<{ closed?: boolean }>(
        `/api/v1/watch-sessions/${sessionId}/members/${memberId}`
      );
      if (response.data.closed) {
        await router.replace('/watch-sessions');
      } else {
        await refreshSession();
      }
    });
  };

  const revokeInvite = async (inviteId: number) => {
    if (!sessionId) return;
    await runAction(async () => {
      await axios.delete(
        `/api/v1/watch-sessions/${sessionId}/invites/${inviteId}`
      );
      await refreshInvites();
    });
  };

  const submitBallot = async (
    movie: SessionMovie,
    decision: 'want' | 'pass'
  ) => {
    if (!sessionId) return;
    await runAction(async () => {
      await axios.put(
        `/api/v1/watch-sessions/${sessionId}/candidates/${movie.candidateId}/ballot`,
        { decision }
      );
      await Promise.all([refreshDeck(), refreshMatches(), refreshMyBallots()]);
    });
  };

  const loadMoreMatches = async () => {
    if (!sessionId) return;
    await runAction(async () => {
      const response = await axios.get<SessionMoviePage>(
        `/api/v1/watch-sessions/${sessionId}/matches`,
        { params: { take: 20, skip: matchSkip } }
      );
      setAdditionalMatches((current) => [
        ...current,
        ...(response.data.matches ?? []),
      ]);
      setMoreMatchPages(response.data.hasMore);
      setMatchSkip((current) => current + 20);
    });
  };

  const loadError = sessionError || !sessionData;

  return (
    <div className="page-layout">
      <PageTitle title={session?.title ?? intl.formatMessage(messages.title)} />
      <div className="page-title-row">
        <h1 className="page-title">
          {session?.title ?? intl.formatMessage(messages.title)}
        </h1>
      </div>
      {loadError ? (
        <p className="page-error-message" role="alert">
          {sessionError
            ? intl.formatMessage(messages.pageError)
            : intl.formatMessage(messages.loading)}
        </p>
      ) : !session ? (
        <p className="page-error-message" role="alert">
          {intl.formatMessage(messages.sessionUnavailable)}
        </p>
      ) : (
        <>
          <p className="card-body-text">
            {intl.formatMessage(isDraft ? messages.draft : messages.active)} ·{' '}
            {intl.formatMessage(messages.memberCount, {
              count: session.memberCount,
            })}
            ·{' '}
            {intl.formatMessage(messages.expires, {
              date: intl.formatDate(session.expiresAt, { dateStyle: 'medium' }),
            })}
          </p>

          <section className="app-card-main card-layout">
            <h2 className="page-heading">
              {intl.formatMessage(messages.members)}
            </h2>
            <ul className="card-list">
              {session.members.map((member) => (
                <li key={member.id} className="app-card-sub card-layout">
                  <p className="card-body-text">
                    {member.displayName}
                    {member.isOwner &&
                      ` · ${intl.formatMessage(messages.owner)}`}
                  </p>
                  {owner && isDraft && !member.isOwner && (
                    <ConfirmButton
                      type="button"
                      onClick={() => void removeMember(member.id)}
                      confirmText={intl.formatMessage(
                        messages.confirmRemoveMember
                      )}
                      disabled={busy}
                    >
                      {intl.formatMessage(messages.removeMember)}
                    </ConfirmButton>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {isDraft && (
            <>
              {owner && (
                <section className="app-card-main card-layout">
                  <h2 className="page-heading">
                    {intl.formatMessage(messages.sessionSettings)}
                  </h2>
                  <SessionForm
                    key={session.id}
                    initialTitle={session.title}
                    initialFilters={session.filters}
                    submitLabel={messages.saveChanges}
                    savingLabel={messages.savingChanges}
                    onSubmit={saveSettings}
                  />
                </section>
              )}

              {owner && (
                <section className="app-card-main card-layout">
                  <h2 className="page-heading">
                    {intl.formatMessage(messages.inviteLinks)}
                  </h2>
                  <p className="card-body-text">
                    {intl.formatMessage(messages.inviteHelp)}
                  </p>
                  <div className="app-action-row">
                    <Button
                      type="button"
                      buttonType="primary"
                      disabled={busy}
                      onClick={() => void runAction(createInvite)}
                    >
                      {intl.formatMessage(messages.createInvite)}
                    </Button>
                  </div>
                  {latestInviteUrl && (
                    <div className="app-action-row">
                      <input
                        type="text"
                        readOnly
                        aria-label={intl.formatMessage(messages.copyInvite)}
                        value={latestInviteUrl}
                      />
                      <Button
                        type="button"
                        buttonType="primary"
                        onClick={() => void copyInvite()}
                      >
                        {intl.formatMessage(messages.copyInvite)}
                      </Button>
                    </div>
                  )}
                  {inviteData?.invites.length ? (
                    <ul className="card-list">
                      {inviteData.invites.map((invite) => (
                        <li
                          key={invite.id}
                          className="app-card-sub card-layout"
                        >
                          <p className="card-body-text">
                            {intl.formatMessage(
                              inviteStatusMessages[invite.status]
                            )}{' '}
                            ·{' '}
                            {intl.formatDate(invite.expiresAt, {
                              dateStyle: 'medium',
                            })}
                          </p>
                          {invite.status === 'open' && (
                            <Button
                              type="button"
                              buttonType="default"
                              disabled={busy}
                              onClick={() => void revokeInvite(invite.id)}
                            >
                              {intl.formatMessage(messages.revokeInvite)}
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="card-body-text">
                      {intl.formatMessage(messages.noInvites)}
                    </p>
                  )}
                  {session.memberCount < 2 ? (
                    <p className="card-body-text">
                      {intl.formatMessage(messages.membersNeeded)}
                    </p>
                  ) : (
                    <Button
                      type="button"
                      buttonType="success"
                      disabled={busy}
                      onClick={() => void startSession()}
                    >
                      {intl.formatMessage(messages.start)}
                    </Button>
                  )}
                </section>
              )}

              {session.memberCount > 0 && (
                <section className="app-card-main card-layout">
                  <h2 className="page-heading">
                    {intl.formatMessage(messages.includeWatchlist)}
                  </h2>
                  <SettingsFormRow
                    htmlFor="watch-session-watchlist-sharing"
                    label={intl.formatMessage(messages.includeWatchlist)}
                    description={intl.formatMessage(
                      messages.includeWatchlistHelp
                    )}
                    labelClassName="checkbox-label"
                  >
                    <input
                      id="watch-session-watchlist-sharing"
                      type="checkbox"
                      checked={sharingWatchlist}
                      disabled={busy}
                      onChange={(event) => {
                        setSharingWatchlist(event.target.checked);
                        void changeWatchlistPreference(event.target.checked);
                      }}
                    />
                  </SettingsFormRow>
                  <p className="card-body-text">
                    {intl.formatMessage(messages.preferencesLocked)}
                  </p>
                </section>
              )}

              {!owner && (
                <p className="card-body-text">
                  {intl.formatMessage(messages.waitingToStart)}
                </p>
              )}
            </>
          )}

          {isActive && (
            <>
              <section className="app-card-main card-layout">
                <h2 className="page-heading">
                  {intl.formatMessage(messages.myChoices)}
                </h2>
                <p className="card-body-text">
                  {intl.formatMessage(messages.privateChoices)}
                </p>
                {myBallotError ? (
                  <p className="page-error-message" role="alert">
                    {intl.formatMessage(messages.movieLoadError)}
                  </p>
                ) : myBallotData?.ballots.length ? (
                  <ul className="card-list">
                    {myBallotData.ballots.map((ballot) => (
                      <li
                        key={ballot.candidateId}
                        className="app-card-sub card-layout"
                      >
                        <h3 className="card-title">
                          <Link href={`/movie/${ballot.id}`}>
                            {ballot.title}
                          </Link>
                        </h3>
                        <p className="card-body-text">
                          {intl.formatMessage(
                            ballot.decision === 'want'
                              ? messages.want
                              : messages.pass
                          )}
                        </p>
                        <div className="app-action-row">
                          <Button
                            type="button"
                            buttonType="success"
                            disabled={busy || ballot.decision === 'want'}
                            onClick={() => void submitBallot(ballot, 'want')}
                          >
                            {intl.formatMessage(messages.want)}
                          </Button>
                          <Button
                            type="button"
                            buttonType="default"
                            disabled={busy || ballot.decision === 'pass'}
                            onClick={() => void submitBallot(ballot, 'pass')}
                          >
                            {intl.formatMessage(messages.pass)}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : myBallotData ? (
                  <p className="card-body-text">
                    {intl.formatMessage(messages.noChoices)}
                  </p>
                ) : (
                  <p className="card-body-text">
                    {intl.formatMessage(messages.loading)}
                  </p>
                )}
              </section>

              <section className="app-card-main card-layout">
                <h2 className="page-heading">
                  {intl.formatMessage(messages.movies)}
                </h2>
                {deckError ? (
                  <>
                    <p className="page-error-message" role="alert">
                      {intl.formatMessage(messages.movieLoadError)}
                    </p>
                    <Button
                      type="button"
                      buttonType="default"
                      onClick={() => void refreshDeck()}
                    >
                      {intl.formatMessage(messages.retry)}
                    </Button>
                  </>
                ) : deck?.candidates?.length ? (
                  <ul className="card-list">
                    {deck.candidates.map((movie) => (
                      <li
                        key={movie.candidateId}
                        className="app-card-sub card-layout"
                      >
                        <h3 className="card-title">
                          <Link href={`/movie/${movie.id}`}>{movie.title}</Link>
                        </h3>
                        <p className="card-body-text">
                          {movie.releaseDate?.slice(0, 4)} ·{' '}
                          {movie.voteAverage.toFixed(1)}
                        </p>
                        {movie.overview && (
                          <p className="card-body-text">{movie.overview}</p>
                        )}
                        <div className="app-action-row">
                          <Button
                            type="button"
                            buttonType="success"
                            disabled={busy}
                            onClick={() => void submitBallot(movie, 'want')}
                          >
                            {intl.formatMessage(messages.want)}
                          </Button>
                          <Button
                            type="button"
                            buttonType="default"
                            disabled={busy}
                            onClick={() => void submitBallot(movie, 'pass')}
                          >
                            {intl.formatMessage(messages.pass)}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : deck ? (
                  <>
                    <p className="card-body-text">
                      {intl.formatMessage(
                        deck?.hasMore
                          ? messages.allReviewed
                          : messages.deckComplete
                      )}
                    </p>
                    <Button
                      type="button"
                      buttonType="default"
                      onClick={() => void refreshDeck()}
                    >
                      {intl.formatMessage(messages.retry)}
                    </Button>
                  </>
                ) : (
                  <p className="card-body-text">
                    {intl.formatMessage(messages.loading)}
                  </p>
                )}
              </section>

              <section className="app-card-main card-layout">
                <h2 className="page-heading">
                  {intl.formatMessage(messages.matches)}
                </h2>
                {matchesError ? (
                  <>
                    <p className="page-error-message" role="alert">
                      {intl.formatMessage(messages.movieLoadError)}
                    </p>
                    <Button
                      type="button"
                      buttonType="default"
                      onClick={() => void refreshMatches()}
                    >
                      {intl.formatMessage(messages.retry)}
                    </Button>
                  </>
                ) : matchPage?.matches?.length || additionalMatches.length ? (
                  <ul className="card-list">
                    {[...(matchPage?.matches ?? []), ...additionalMatches].map(
                      (movie) => (
                        <li
                          key={movie.candidateId}
                          className="app-card-sub card-layout"
                        >
                          <h3 className="card-title">
                            <Link href={`/movie/${movie.id}`}>
                              {movie.title}
                            </Link>
                          </h3>
                          <p className="card-body-text">
                            {intl.formatMessage(messages.matchLabel)}
                          </p>
                        </li>
                      )
                    )}
                  </ul>
                ) : matchPage ? (
                  <p className="card-body-text">
                    {intl.formatMessage(messages.noMatches)}
                  </p>
                ) : (
                  <p className="card-body-text">
                    {intl.formatMessage(messages.loading)}
                  </p>
                )}
                {!matchesError && (moreMatchPages ?? matchPage?.hasMore) && (
                  <Button
                    type="button"
                    buttonType="default"
                    disabled={busy}
                    onClick={() => void loadMoreMatches()}
                  >
                    {intl.formatMessage(messages.loadMoreMatches)}
                  </Button>
                )}
              </section>
            </>
          )}

          {actionMessage && (
            <p className="card-body-text" role="status">
              {actionMessage}
            </p>
          )}
          {actionError && (
            <p className="page-error-message" role="alert">
              {actionError}
            </p>
          )}

          <div className="app-action-row">
            {owner ? (
              <ConfirmButton
                type="button"
                onClick={() => void closeSession()}
                confirmText={intl.formatMessage(messages.confirmClose)}
                disabled={busy}
              >
                {intl.formatMessage(messages.close)}
              </ConfirmButton>
            ) : (
              <ConfirmButton
                type="button"
                onClick={() => void leaveSession()}
                confirmText={intl.formatMessage(messages.confirmLeave)}
                disabled={busy}
              >
                {intl.formatMessage(messages.leave)}
              </ConfirmButton>
            )}
            <Link href="/watch-sessions">
              {intl.formatMessage(messages.backToSessions)}
            </Link>
          </div>
        </>
      )}
    </div>
  );
};

export default WatchSessionDetailPage;
