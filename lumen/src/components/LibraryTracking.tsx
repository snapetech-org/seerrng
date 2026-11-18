import { useRef, useState } from 'react';
import { api, type TvDetails } from '../api';
import { useApi } from '../hooks';
import { sessionGeneration } from '../sessionState';
import { ConfirmSheet } from './ConfirmSheet';
import { type MappingCandidate, videoHref } from './IdentityMapping';
import { ServiceNote } from './extra';

type Provider = 'trakt' | 'anilist' | 'simkl';
type Action = 'watched' | 'rating' | 'progress';
type Change = {
  action: Action;
  value: number | boolean;
  episode?: { season: number; episode: number };
};
type TrackingItem = MappingCandidate & {
  sourceId?: string;
  status?: string;
  rating?: number;
  progress?: number;
  totalEpisodes?: number;
};
const base = '/integrations/discovery/tracking';

function actionId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

export default function LibraryTracking({
  item,
  provider,
  updated,
}: {
  item: TrackingItem;
  provider: Provider;
  updated: () => void;
}) {
  const aniList = provider === 'anilist';
  const aniListId = Number(item.sourceId);
  const target = aniList
    ? Number.isSafeInteger(aniListId) && aniListId > 0
      ? { anilistId: aniListId }
      : null
    : videoHref(item)
      ? { tmdbId: item.tmdbId, mediaType: item.mediaType }
      : null;
  const [open, setOpen] = useState(false);
  const [episodeOpen, setEpisodeOpen] = useState(false);
  const [chosenSeason, setChosenSeason] = useState<number>();
  const [chosenEpisode, setChosenEpisode] = useState<number>();
  const episodeTracking =
    !aniList && item.mediaType === 'tv' && !!target && !!item.sourceId;
  const showEpisodes = open && episodeOpen && episodeTracking;
  const tv = useApi<TvDetails>(showEpisodes ? `/tv/${item.tmdbId}` : null, {
    currentPathOnly: true,
  });
  const seasons = Array.isArray(tv.data?.seasons)
    ? tv.data.seasons.filter(
        (entry) =>
          Number.isSafeInteger(entry?.seasonNumber) &&
          entry.seasonNumber >= 0 &&
          entry.episodeCount > 0
      )
    : [];
  const tvError =
    tv.error ||
    (tv.data && !Array.isArray(tv.data.seasons)
      ? 'Invalid seasons response.'
      : null);
  const season =
    seasons.find(({ seasonNumber }) => seasonNumber === chosenSeason)
      ?.seasonNumber ??
    (seasons.find(({ seasonNumber }) => seasonNumber > 0) ?? seasons[0])
      ?.seasonNumber;
  const seasonDetails = useApi<{
    episodes: { episodeNumber: number; name: string }[];
  }>(
    showEpisodes && season !== undefined
      ? `/tv/${item.tmdbId}/season/${season}`
      : null,
    { currentPathOnly: true }
  );
  const episodes = Array.isArray(seasonDetails.data?.episodes)
    ? seasonDetails.data.episodes.filter(
        (entry) =>
          Number.isSafeInteger(entry?.episodeNumber) && entry.episodeNumber > 0
      )
    : [];
  const episodesError =
    seasonDetails.error ||
    (seasonDetails.data && !Array.isArray(seasonDetails.data.episodes)
      ? 'Invalid episodes response.'
      : null);
  const episode =
    episodes.find(({ episodeNumber }) => episodeNumber === chosenEpisode)
      ?.episodeNumber ?? episodes[0]?.episodeNumber;
  const watch = useApi<{
    available: boolean;
    episodes: { episode: number; watched: boolean }[];
  }>(
    showEpisodes && season !== undefined && episodes.length
      ? `${base}/${provider}/episodes?${new URLSearchParams({
          sourceId: item.sourceId!,
          tmdbId: String(item.tmdbId),
          season: String(season),
        })}`
      : null,
    { currentPathOnly: true }
  );
  const watchError =
    watch.error ||
    (watch.data &&
    (!Array.isArray(watch.data.episodes) ||
      typeof watch.data.available !== 'boolean')
      ? 'Invalid provider watch status response.'
      : null);
  const episodeWatched =
    !watchError && watch.data?.available
      ? watch.data.episodes.find(
          (entry) =>
            entry &&
            entry.episode === episode &&
            typeof entry.watched === 'boolean'
        )?.watched
      : undefined;
  const [rating, setRating] = useState('');
  const [progress, setProgress] = useState('');
  const [confirm, setConfirm] = useState<Change>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const active = useRef(false);
  const attempts = useRef(new Map<string, string>());
  const watched = item.status === 'watched' || item.status === 'completed';
  const limit = Math.min(item.totalEpisodes ?? 100_000, 100_000);

  async function apply(change: Change) {
    if (active.current || !target) return;
    const generation = sessionGeneration();
    active.current = true;
    setBusy(true);
    setFailure('');
    setNotice('');
    setConfirm(undefined);
    const signature = JSON.stringify({ ...target, ...change });
    const requestId = attempts.current.get(signature) ?? actionId();
    attempts.current.set(signature, requestId);
    try {
      let result: { state: string };
      try {
        result = await api(base + '/' + provider, {
          method: 'POST',
          body: JSON.stringify({ requestId, ...target, ...change }),
        });
      } catch {
        if (generation !== sessionGeneration()) return;
        result = await api(base + '/actions/' + requestId);
      }
      if (generation !== sessionGeneration()) return;
      if (result.state === 'succeeded') {
        attempts.current.delete(signature);
        setNotice('Provider tracking updated.');
        if (change.episode) watch.reload();
        updated();
      } else {
        setFailure(
          'The provider did not confirm the update. Check your account before retrying.'
        );
      }
    } catch {
      if (generation === sessionGeneration())
        setFailure(
          'Could not confirm the tracking update. Check your account before retrying.'
        );
    } finally {
      active.current = false;
      if (generation === sessionGeneration()) setBusy(false);
    }
  }

  if (!target) return null;
  const validRating =
    rating !== '' &&
    Number(rating) >= 0 &&
    Number(rating) <= 10 &&
    Number.isInteger(Number(rating) * (aniList ? 10 : 1));
  const validProgress =
    progress !== '' &&
    Number.isInteger(Number(progress)) &&
    Number(progress) >= 0 &&
    Number(progress) <= limit;
  return (
    <div>
      <button
        className="btn btn-quiet btn-sm"
        type="button"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen(!open)}
      >
        Update Tracking
      </button>
      {open && (
        <div className="toolbar">
          <button
            className="btn btn-tonal btn-sm"
            type="button"
            disabled={busy}
            onClick={() => {
              const change = { action: 'watched', value: !watched } as const;
              if (watched || item.mediaType === 'tv') setConfirm(change);
              else void apply(change);
            }}
          >
            {watched ? 'Mark Unwatched' : 'Mark Watched'}
          </button>
          <label className="sel">
            <span className="lbl">Rating (0–10)</span>
            <input
              type="number"
              min={0}
              max={10}
              step={aniList ? 0.1 : 1}
              value={rating}
              onChange={(event) => setRating(event.target.value)}
              disabled={busy}
            />
          </label>
          <button
            className="btn btn-tonal btn-sm"
            type="button"
            disabled={busy || !validRating}
            onClick={() =>
              void apply({ action: 'rating', value: Number(rating) })
            }
          >
            Save Rating
          </button>
          {aniList && (
            <>
              <label className="sel">
                <span className="lbl">Episodes Watched</span>
                <input
                  type="number"
                  min={0}
                  max={limit}
                  value={progress}
                  onChange={(event) => setProgress(event.target.value)}
                  disabled={busy}
                />
              </label>
              <button
                className="btn btn-tonal btn-sm"
                type="button"
                disabled={busy || !validProgress}
                onClick={() =>
                  void apply({ action: 'progress', value: Number(progress) })
                }
              >
                Save Progress
              </button>
            </>
          )}
          {episodeTracking && (
            <button
              className="btn btn-quiet btn-sm"
              type="button"
              disabled={busy}
              aria-expanded={episodeOpen}
              onClick={() => setEpisodeOpen(!episodeOpen)}
            >
              Track Individual Episodes
            </button>
          )}
        </div>
      )}
      {showEpisodes && (
        <>
          <ServiceNote
            error={tvError}
            what="series seasons"
            retry={tv.reload}
          />
          <ServiceNote
            error={episodesError}
            what="season episodes"
            retry={seasonDetails.reload}
          />
          <ServiceNote
            error={watchError}
            what="provider episode status"
            retry={watch.reload}
          />
          {!tv.data && !tvError && (
            <p className="note" role="status">
              Loading seasons…
            </p>
          )}
          {tv.data && !tvError && !seasons.length && (
            <p className="note">No seasons are available.</p>
          )}
          {season !== undefined && !seasonDetails.data && !episodesError && (
            <p className="note" role="status">
              Loading episodes…
            </p>
          )}
          {seasonDetails.data && !episodesError && !episodes.length && (
            <p className="note">No episodes are available.</p>
          )}
          <div className="toolbar">
            {season !== undefined && (
              <label className="sel">
                <span className="lbl">Tracking Season</span>
                <select
                  value={season}
                  disabled={busy}
                  onChange={(event) => {
                    setChosenSeason(Number(event.target.value));
                    setChosenEpisode(undefined);
                  }}
                >
                  {seasons.map(({ seasonNumber, name }) => (
                    <option key={seasonNumber} value={seasonNumber}>
                      {name || `Season ${seasonNumber}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {episode !== undefined && (
              <label className="sel">
                <span className="lbl">Tracking Episode</span>
                <select
                  value={episode}
                  disabled={busy}
                  onChange={(event) =>
                    setChosenEpisode(Number(event.target.value))
                  }
                >
                  {episodes.map(({ episodeNumber, name }) => (
                    <option key={episodeNumber} value={episodeNumber}>
                      {episodeNumber}. {name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {season !== undefined &&
              episode !== undefined &&
              (watch.data || watch.error) && (
                <>
                  {episodeWatched !== true && (
                    <button
                      className="btn btn-tonal btn-sm"
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void apply({
                          action: 'watched',
                          value: true,
                          episode: { season, episode },
                        })
                      }
                    >
                      Mark Episode Watched
                    </button>
                  )}
                  {episodeWatched !== false && (
                    <button
                      className="btn btn-quiet btn-sm"
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setConfirm({
                          action: 'watched',
                          value: false,
                          episode: { season, episode },
                        })
                      }
                    >
                      Mark Episode Unwatched
                    </button>
                  )}
                </>
              )}
          </div>
          {episode !== undefined && (
            <p className="note" role="status">
              {episodeWatched === true
                ? 'Watched on provider.'
                : episodeWatched === false
                  ? 'Unwatched on provider.'
                  : watch.data || watch.error
                    ? 'Watch status unavailable.'
                    : 'Loading provider episode status…'}
            </p>
          )}
        </>
      )}
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      {failure && (
        <p className="note" role="alert">
          {failure}
        </p>
      )}
      {confirm && (
        <ConfirmSheet
          title={
            confirm.episode
              ? 'Mark Episode Unwatched?'
              : confirm.value
                ? 'Mark Watched?'
                : 'Mark Unwatched?'
          }
          body={
            confirm.episode
              ? `Remove watched status for ${item.title}, season ${confirm.episode.season}, episode ${confirm.episode.episode}?`
              : `Update watched status for ${item.title} on your tracking account?`
          }
          confirm={confirm.value ? 'Mark Watched' : 'Mark Unwatched'}
          cancel="Cancel"
          onConfirm={() => void apply(confirm)}
          onClose={() => setConfirm(undefined)}
        />
      )}
    </div>
  );
}
