import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, tmdbImg } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import { sessionGeneration } from '../sessionState';

type Decision = 'want' | 'pass';
interface Movie {
  candidateId: number;
  id: number;
  title: string;
  posterPath?: string;
  overview?: string;
}
const pageSize = 20;

export default function WatchSessionBallots({ id }: { id: string }) {
  const path = `/watch-sessions/${id}`;
  const deck = useApi<{ candidates: Movie[]; hasMore: boolean }>(
    path + '/deck'
  );
  const ballots = useApi<{ ballots: (Movie & { decision: Decision })[] }>(
    path + '/my-ballots'
  );
  const [skip, setSkip] = useState(0);
  const matches = useApi<{ matches: Movie[]; hasMore: boolean }>(
    `${path}/matches?take=${pageSize}&skip=${skip}`,
    { currentPathOnly: true }
  );
  const [submitted, setSubmitted] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const card = deck.data?.candidates.find(
    (movie) => !submitted.includes(movie.candidateId)
  );

  async function vote(movie: Movie, decision: Decision) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    const generation = sessionGeneration();
    try {
      await api(`${path}/candidates/${movie.candidateId}/ballot`, {
        method: 'PUT',
        body: JSON.stringify({ decision }),
      });
      if (generation !== sessionGeneration()) return;
      setSubmitted((ids) =>
        ids.includes(movie.candidateId) ? ids : [...ids, movie.candidateId]
      );
      ballots.refresh();
      setSkip(0);
      matches.refresh();
    } catch (failure) {
      if (generation === sessionGeneration())
        setError(
          failure instanceof ApiError
            ? failure.message
            : 'Could not save your vote.'
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function voteButtons(movie: Movie, current?: Decision) {
    return (
      <div className="toolbar">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || current === 'want'}
          aria-label={`Want to Watch ${movie.title}`}
          onClick={() => void vote(movie, 'want')}
        >
          Want to Watch
        </button>
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          disabled={busy || current === 'pass'}
          aria-label={`Pass on ${movie.title}`}
          onClick={() => void vote(movie, 'pass')}
        >
          Pass
        </button>
      </div>
    );
  }

  function reloadDeck() {
    deck.reload();
  }

  const image = tmdbImg(card?.posterPath);
  return (
    <>
      <Section title="Vote on Movies">
        <ServiceNote
          what="session movies"
          error={deck.error}
          retry={reloadDeck}
        />
        {error && (
          <p className="note" role="alert">
            {error}
          </p>
        )}
        {!deck.data && !deck.error && (
          <p className="note" role="status">
            Loading session movies…
          </p>
        )}
        {card && (
          <>
            {image && (
              <div className="poster">
                <div className="art">
                  <img src={image} alt="" />
                </div>
              </div>
            )}
            <h3>{card.title}</h3>
            {card.overview && <p>{card.overview}</p>}
            {voteButtons(card)}
          </>
        )}
        {!card && deck.data && (
          <>
            <p className="note">No movies left in this batch.</p>
            {deck.data.hasMore && (
              <div className="toolbar">
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  disabled={busy}
                  onClick={reloadDeck}
                >
                  Load More Movies
                </button>
              </div>
            )}
          </>
        )}
      </Section>
      <Section title="Your Votes">
        <ServiceNote
          what="your votes"
          error={ballots.error}
          retry={ballots.reload}
        />
        {!ballots.data && !ballots.error && (
          <p className="note" role="status">
            Loading your votes…
          </p>
        )}
        {ballots.data?.ballots.length === 0 && (
          <p className="note">You haven’t voted yet.</p>
        )}
        <div className="setlist">
          {ballots.data?.ballots.map((movie) => (
            <div className="set cfg-row" key={movie.candidateId}>
              <span>
                <b>{movie.title}</b>
                <small>
                  {movie.decision === 'want' ? 'Want to Watch' : 'Passed'}
                </small>
              </span>
              {voteButtons(movie, movie.decision)}
            </div>
          ))}
        </div>
      </Section>
      <Section title="Group Matches">
        <ServiceNote
          what="group matches"
          error={matches.error}
          retry={matches.reload}
        />
        {!matches.data && !matches.error && (
          <p className="note" role="status">
            Loading group matches…
          </p>
        )}
        {matches.data?.matches.length === 0 && (
          <p className="note">No group matches on this page.</p>
        )}
        <div className="setlist">
          {matches.data?.matches.map((movie) => (
            <div className="set cfg-row" key={movie.candidateId}>
              <span>
                <b>{movie.title}</b>
              </span>
              <Link
                to={`/movie/${movie.id}`}
                className="btn btn-quiet btn-sm"
                aria-label={`Open ${movie.title}`}
              >
                Open Movie
              </Link>
            </div>
          ))}
        </div>
        <div className="toolbar">
          {skip > 0 && (
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={busy}
              onClick={() => setSkip((value) => value - pageSize)}
            >
              Previous Matches
            </button>
          )}
          {matches.data?.hasMore && (
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={busy}
              onClick={() => setSkip((value) => value + pageSize)}
            >
              Next Matches
            </button>
          )}
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={busy}
            onClick={matches.refresh}
          >
            Refresh Matches
          </button>
        </div>
      </Section>
    </>
  );
}
