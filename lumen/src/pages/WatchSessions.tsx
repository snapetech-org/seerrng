import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';
import WatchSessionBallots from './WatchSessionBallots';
import { JoinWatchSession, WatchSessionInvites } from './WatchSessionInvites';

const path = '/watch-sessions';
interface Summary {
  id: number;
  title: string;
  status: 'draft' | 'active';
  ownerId: number;
  memberCount: number;
  expiresAt: string;
}
interface Filters {
  genreIds?: number[];
  ranking?: string;
  releaseYearFrom?: number;
  releaseYearTo?: number;
  minimumRating?: number;
}
interface Detail extends Summary {
  filters?: Filters;
  members: { id: number; displayName: string; isOwner: boolean }[];
  ownPreferences: { includeWatchlistContributions: boolean };
}

function SessionForm({
  initial,
  onSave,
}: {
  initial?: Detail;
  onSave: (session: Detail) => void;
}) {
  const { t } = useLumenLocale();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [ranking, setRanking] = useState(
    initial?.filters?.ranking ?? 'popularity.desc'
  );
  const [years, setYears] = useState({
    releaseYearFrom: initial?.filters?.releaseYearFrom?.toString() ?? '',
    releaseYearTo: initial?.filters?.releaseYearTo?.toString() ?? '',
  });
  const [rating, setRating] = useState(
    initial?.filters?.minimumRating?.toString() ?? ''
  );
  const [genreIds, setGenreIds] = useState(initial?.filters?.genreIds ?? []);
  const genres = useApi<{ id: number; name: string }[]>('/genres/movie');
  const availableGenres = Array.isArray(genres.data) ? genres.data : [];
  const valid =
    !!title.trim() &&
    !(
      years.releaseYearFrom &&
      years.releaseYearTo &&
      Number(years.releaseYearFrom) > Number(years.releaseYearTo)
    );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);

  async function save() {
    if (pending.current || !valid) return;
    pending.current = true;
    setBusy(true);
    setError('');
    const generation = sessionGeneration();
    try {
      const { session } = await api<{ session: Detail }>(
        initial ? `${path}/${initial.id}` : path,
        {
          method: initial ? 'PUT' : 'POST',
          body: JSON.stringify({
            title: title.trim(),
            filters: {
              ranking,
              genreIds,
              ...(years.releaseYearFrom
                ? { releaseYearFrom: Number(years.releaseYearFrom) }
                : {}),
              ...(years.releaseYearTo
                ? { releaseYearTo: Number(years.releaseYearTo) }
                : {}),
              ...(rating ? { minimumRating: Number(rating) } : {}),
            },
          }),
        }
      );
      if (generation === sessionGeneration()) onSave(session);
    } catch (failure) {
      if (generation === sessionGeneration())
        setError(
          failure instanceof ApiError
            ? failure.message
            : t(
                'lumen.watchSessions.saveFailed',
                'Could not save the watch session.'
              )
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="setlist">
        <label className="set cfg-row">
          <span>{t('lumen.watchSessions.sessionTitle', 'Session Title')}</span>
          <input
            className="cfg-input"
            required
            maxLength={80}
            disabled={busy}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="set cfg-row">
          <span>{t('lumen.watchSessions.movieRanking', 'Movie Ranking')}</span>
          <select
            className="cfg-select"
            disabled={busy}
            value={ranking}
            onChange={(event) => setRanking(event.target.value)}
          >
            <option value="popularity.desc">
              {t('lumen.watchSessions.mostPopular', 'Most Popular')}
            </option>
            <option value="vote_average.desc">
              {t('lumen.watchSessions.highestRated', 'Highest Rated')}
            </option>
            <option value="primary_release_date.desc">
              {t('lumen.watchSessions.newestReleases', 'Newest Releases')}
            </option>
          </select>
        </label>
        {(
          [
            ['releaseYearFrom', t('lumen.watchSessions.fromYear', 'From Year')],
            ['releaseYearTo', t('lumen.watchSessions.toYear', 'To Year')],
          ] as const
        ).map(([key, label]) => (
          <label className="set cfg-row" key={key}>
            <span>{label}</span>
            <input
              className="cfg-input"
              type="number"
              min={1870}
              max={2100}
              disabled={busy}
              value={years[key]}
              onChange={(event) =>
                setYears({ ...years, [key]: event.target.value })
              }
            />
          </label>
        ))}
        <label className="set cfg-row">
          <span>
            {t('lumen.watchSessions.minimumRating', 'Minimum Rating')}
          </span>
          <input
            className="cfg-input"
            type="number"
            min={0}
            max={9.9}
            step={0.1}
            disabled={busy}
            value={rating}
            onChange={(event) => setRating(event.target.value)}
          />
        </label>
      </div>
      <details className="adv">
        <summary>
          {t('lumen.watchSessions.genresCount', 'Genres ({count} of 5)', {
            count: genreIds.length,
          })}
        </summary>
        <ServiceNote
          what={t('lumen.watchSessions.movieGenres', 'movie genres')}
          title={t(
            'lumen.watchSessions.genresLoadFailed',
            'Could not load movie genres'
          )}
          retryLabel={t('lumen.watchSessions.retry', 'Retry')}
          error={genres.error}
          retry={genres.reload}
        />
        {!genres.data && !genres.error && (
          <p className="note" role="status">
            {t('lumen.watchSessions.genresLoading', 'Loading movie genres…')}
          </p>
        )}
        <div className="setlist picklist">
          {[
            ...availableGenres,
            ...genreIds
              .filter((id) => !availableGenres.some((genre) => genre.id === id))
              .map((id) => ({
                id,
                name: t('lumen.watchSessions.unknownGenre', 'Genre {id}', {
                  id,
                }),
              })),
          ].map(({ id, name }) => (
            <label className="set pick" key={id}>
              <span>{name}</span>
              <input
                type="checkbox"
                checked={genreIds.includes(id)}
                disabled={
                  busy || (genreIds.length >= 5 && !genreIds.includes(id))
                }
                onChange={(event) =>
                  setGenreIds((current) =>
                    event.target.checked
                      ? [...current, id]
                      : current.filter((item) => item !== id)
                  )
                }
              />
            </label>
          ))}
        </div>
      </details>
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      <div className="toolbar">
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={busy || !valid}
        >
          {initial
            ? t('lumen.watchSessions.saveSettings', 'Save Session Settings')
            : t('lumen.watchSessions.createSession', 'Create Session')}
        </button>
      </div>
    </form>
  );
}

function SessionList() {
  const { locale, t } = useLumenLocale();
  const list = useApi<{ sessions: Summary[] }>(path);
  const navigate = useNavigate();
  return (
    <>
      <h1>{t('lumen.watchSessions.title', 'Watch Sessions')}</h1>
      <ServiceNote
        what={t('lumen.watchSessions.sessions', 'watch sessions')}
        title={t(
          'lumen.watchSessions.loadFailed',
          'Could not load watch sessions'
        )}
        retryLabel={t('lumen.watchSessions.retry', 'Retry')}
        error={list.error}
        retry={list.reload}
      />
      {!list.data && !list.error && (
        <p className="note" role="status">
          {t('lumen.watchSessions.loading', 'Loading watch sessions…')}
        </p>
      )}
      {list.data && (
        <>
          <Section
            title={t('lumen.watchSessions.yourSessions', 'Your Sessions')}
          >
            {list.data.sessions.length === 0 && (
              <p className="note">
                {t(
                  'lumen.watchSessions.noneJoined',
                  'You haven’t joined any watch sessions.'
                )}
              </p>
            )}
            <div className="setlist">
              {list.data.sessions.map((session) => (
                <div className="set cfg-row" key={session.id}>
                  <span>
                    <b>{session.title}</b>
                    <small>
                      {session.status === 'active'
                        ? t('lumen.watchSessions.active', 'Active')
                        : t('lumen.watchSessions.draft', 'Draft')}{' '}
                      ·{' '}
                      {t('lumen.watchSessions.memberCount', '{count} members', {
                        count: session.memberCount,
                      })}
                    </small>
                    <small>
                      {t('lumen.watchSessions.expires', 'Expires {date}', {
                        date: new Intl.DateTimeFormat(locale, {
                          dateStyle: 'medium',
                        }).format(new Date(session.expiresAt)),
                      })}
                    </small>
                  </span>
                  <Link
                    to={`${path}/${session.id}`}
                    className="btn btn-quiet btn-sm"
                    aria-label={t(
                      'lumen.watchSessions.openSession',
                      'Open {title}',
                      { title: session.title }
                    )}
                  >
                    {t('lumen.watchSessions.open', 'Open')}
                  </Link>
                </div>
              ))}
            </div>
          </Section>
          <Section
            title={t('lumen.watchSessions.createSection', 'Create a Session')}
          >
            <SessionForm
              onSave={(session) => navigate(`${path}/${session.id}`)}
            />
          </Section>
        </>
      )}
    </>
  );
}

function SessionRoom({ id }: { id: string }) {
  const { locale, t } = useLumenLocale();
  const { user } = useAuth();
  const navigate = useNavigate();
  const endpoint = `${path}/${id}`;
  const room = useApi<{ session: Detail }>(endpoint, {
    keepDuringRefresh: true,
  });
  const session = room.data?.session;
  const [editing, setEditing] = useState(false);
  const owner = session?.ownerId === user?.id;
  const [confirmation, setConfirmation] = useState<{
    suffix: string;
    prompt: string;
    returnsToList: boolean;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);

  async function change(
    suffix: string,
    options: RequestInit,
    returnsToList = false
  ) {
    if (pending.current || !session) return;
    pending.current = true;
    setBusy(true);
    setError('');
    const generation = sessionGeneration();
    try {
      const result = await api<{ closed?: boolean }>(
        `${endpoint}${suffix}`,
        options
      );
      if (generation !== sessionGeneration()) return;
      setConfirmation(undefined);
      if (result.closed || returnsToList) navigate(path, { replace: true });
      else room.refresh();
    } catch (failure) {
      if (generation === sessionGeneration())
        setError(
          failure instanceof ApiError
            ? failure.message
            : t(
                'lumen.watchSessions.updateFailed',
                'Could not update the watch session.'
              )
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <h1>
        {session?.title ?? t('lumen.watchSessions.title', 'Watch Sessions')}
      </h1>
      <div className="toolbar">
        <Link to={path} className="btn btn-quiet btn-sm">
          {t('lumen.watchSessions.backToSessions', 'Back to Watch Sessions')}
        </Link>
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          disabled={busy}
          onClick={room.refresh}
        >
          {t('lumen.watchSessions.refreshRoom', 'Refresh Room')}
        </button>
      </div>
      <ServiceNote
        what={t('lumen.watchSessions.session', 'the watch session')}
        title={t(
          'lumen.watchSessions.roomLoadFailed',
          'Could not load the watch session'
        )}
        retryLabel={t('lumen.watchSessions.retry', 'Retry')}
        error={room.error}
        retry={room.reload}
      />
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      {!session && !room.error && (
        <p className="note" role="status">
          {t('lumen.watchSessions.roomLoading', 'Loading the watch session…')}
        </p>
      )}
      {session && (
        <Section
          title={
            session.status === 'active'
              ? t('lumen.watchSessions.activeSession', 'Active Session')
              : t('lumen.watchSessions.waitingToStart', 'Waiting to Start')
          }
        >
          <p className="note">
            {session.status === 'active'
              ? t('lumen.watchSessions.active', 'Active')
              : t('lumen.watchSessions.draft', 'Draft')}{' '}
            ·{' '}
            {t('lumen.watchSessions.memberCount', '{count} members', {
              count: session.memberCount,
            })}{' '}
            ·{' '}
            {t('lumen.watchSessions.expires', 'Expires {date}', {
              date: new Intl.DateTimeFormat(locale, {
                dateStyle: 'medium',
              }).format(new Date(session.expiresAt)),
            })}
          </p>
          <div className="setlist">
            {session.members.map((member) => (
              <div className="set cfg-row" key={member.id}>
                <span>
                  <b>{member.displayName}</b>
                  {member.isOwner && (
                    <small>{t('lumen.watchSessions.host', 'Host')}</small>
                  )}
                </span>
                {owner && !member.isOwner && (
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    disabled={busy}
                    aria-label={t(
                      'lumen.watchSessions.removeMember',
                      'Remove {name}',
                      { name: member.displayName }
                    )}
                    onClick={() =>
                      setConfirmation({
                        suffix: `/members/${member.id}`,
                        prompt: t(
                          'lumen.watchSessions.removeMemberPrompt',
                          'Remove {name} from this session? The room closes if fewer than two members remain.',
                          { name: member.displayName }
                        ),
                        returnsToList: false,
                      })
                    }
                  >
                    {t('lumen.watchSessions.remove', 'Remove')}
                  </button>
                )}
              </div>
            ))}
            <label className="set cfg-row">
              <span>
                {t(
                  'lumen.watchSessions.contributeWatchlist',
                  'Contribute My Watchlist'
                )}
              </span>
              <input
                type="checkbox"
                disabled={busy || session.status !== 'draft'}
                checked={session.ownPreferences.includeWatchlistContributions}
                onChange={(event) =>
                  void change('/preferences', {
                    method: 'PUT',
                    body: JSON.stringify({
                      includeWatchlistContributions: event.target.checked,
                    }),
                  })
                }
              />
            </label>
          </div>
          {session.status === 'draft' && session.ownerId === user?.id && (
            <div className="toolbar">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy || session.memberCount < 2}
                onClick={() => void change('/start', { method: 'POST' })}
              >
                {t('lumen.watchSessions.startSession', 'Start Session')}
              </button>
              {session.memberCount < 2 && (
                <p className="note">
                  {t(
                    'lumen.watchSessions.minimumMembers',
                    'At least two people must join before starting.'
                  )}
                </p>
              )}
            </div>
          )}
          <div className="toolbar">
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={busy}
              onClick={() =>
                setConfirmation(
                  owner
                    ? {
                        suffix: '',
                        prompt: t(
                          'lumen.watchSessions.endPrompt',
                          'End this session for everyone?'
                        ),
                        returnsToList: true,
                      }
                    : {
                        suffix: '/members/me',
                        prompt: t(
                          'lumen.watchSessions.leavePrompt',
                          'Leave this session? Your votes will be removed, and the room closes if fewer than two members remain.'
                        ),
                        returnsToList: true,
                      }
                )
              }
            >
              {owner
                ? t('lumen.watchSessions.endSession', 'End Session')
                : t('lumen.watchSessions.leaveSession', 'Leave Session')}
            </button>
          </div>
          {confirmation && (
            <>
              <p className="note" role="alert">
                {confirmation.prompt}
              </p>
              <div className="toolbar">
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  disabled={busy}
                  onClick={() =>
                    void change(
                      confirmation.suffix,
                      { method: 'DELETE' },
                      confirmation.returnsToList
                    )
                  }
                >
                  {t('lumen.watchSessions.confirm', 'Confirm')}
                </button>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  disabled={busy}
                  onClick={() => setConfirmation(undefined)}
                >
                  {t('lumen.watchSessions.cancel', 'Cancel')}
                </button>
              </div>
            </>
          )}
        </Section>
      )}
      {session?.status === 'draft' && owner && (
        <Section
          title={t('lumen.watchSessions.sessionSettings', 'Session Settings')}
        >
          {editing ? (
            <>
              <SessionForm
                initial={session}
                onSave={() => {
                  setEditing(false);
                  room.refresh();
                }}
              />
              <div className="toolbar">
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  onClick={() => setEditing(false)}
                >
                  {t('lumen.watchSessions.cancelEditing', 'Cancel Editing')}
                </button>
              </div>
            </>
          ) : (
            <div className="toolbar">
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() => setEditing(true)}
              >
                {t('lumen.watchSessions.editSettings', 'Edit Session Settings')}
              </button>
            </div>
          )}
        </Section>
      )}
      {session?.status === 'active' && <WatchSessionBallots id={id} />}
      {session && session.ownerId === user?.id && (
        <WatchSessionInvites id={id} draft={session.status === 'draft'} />
      )}
    </>
  );
}

export default function WatchSessions() {
  const { id } = useParams();
  if (id === 'join') return <JoinWatchSession />;
  return id ? <SessionRoom key={id} id={id} /> : <SessionList />;
}
