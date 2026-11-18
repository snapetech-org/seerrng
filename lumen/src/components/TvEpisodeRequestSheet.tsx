import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Season, SeasonRequestSelection } from '../api';
import { useApi } from '../hooks';
import { ServiceNote } from './extra';
import { useBackCloses } from './requestSheet';
import { useDialog } from './useDialog';

interface Episode {
  episodeNumber: number;
  name?: string;
  availabilitySources?: { hd: boolean; fourK: boolean }[];
  sonarrAvailability?: { hd: boolean; fourK: boolean };
}

export default function TvEpisodeRequestSheet({
  tvId,
  seasons,
  initialSeason,
  pending,
  is4k,
  approval,
  busy,
  error,
  streamingOverride,
  submit,
  close,
}: {
  tvId: number;
  seasons: Season[];
  initialSeason?: number;
  pending: ReadonlyMap<number, Set<number>>;
  is4k: boolean;
  approval: boolean;
  busy: boolean;
  error?: string;
  streamingOverride?: { message: string; confirm: () => Promise<void> };
  submit: (selection: SeasonRequestSelection) => Promise<void>;
  close: () => void;
}) {
  const [season, selectSeason] = useState(
    () =>
      seasons.find(({ seasonNumber }) => seasonNumber === initialSeason)
        ?.seasonNumber ?? seasons[0].seasonNumber
  );
  const [picked, setPicked] = useState(new Set<number>());
  const box = useRef<HTMLDivElement>(null);
  useDialog(box, close);
  useBackCloses(close);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (streamingOverride) closeButton.current?.focus();
  }, [streamingOverride]);
  const {
    data,
    error: loadError,
    reload,
  } = useApi<{ episodes: Episode[] }>(`/tv/${tvId}/season/${season}`, {
    currentPathOnly: true,
  });
  const quality = is4k ? 'fourK' : 'hd';
  const eligibleSeason = seasons.some((item) => item.seasonNumber === season);
  const episodes = Array.isArray(data?.episodes) ? data.episodes : [];
  const eligible = (episode: Episode) =>
    Number.isSafeInteger(episode.episodeNumber) &&
    episode.episodeNumber > 0 &&
    !pending.get(season)?.has(episode.episodeNumber) &&
    !episode.sonarrAvailability?.[quality] &&
    !episode.availabilitySources?.some((source) => source[quality]);
  const episodeNumbers = episodes
    .filter((item) => eligible(item) && picked.has(item.episodeNumber))
    .map((item) => item.episodeNumber);
  return createPortal(
    <div className="sheet-wrap open">
      <div className="sheet-scrim" aria-hidden="true" onClick={close} />
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Request Episodes"
        ref={box}
      >
        <div className="grab" />
        <div className="pk">
          <header>
            <h3>Request Episodes{is4k ? ' in 4K' : ''}</h3>
          </header>
          <label className="sel">
            <span className="lbl">Season</span>
            <select
              value={season}
              disabled={busy || !!streamingOverride}
              onChange={(event) => {
                selectSeason(Number(event.target.value));
                setPicked(new Set());
              }}
            >
              {seasons.map((item) => (
                <option key={item.seasonNumber} value={item.seasonNumber}>
                  {item.name ||
                    (item.seasonNumber === 0
                      ? 'Specials'
                      : `Season ${item.seasonNumber}`)}
                </option>
              ))}
            </select>
          </label>
          <ServiceNote what="episodes" error={loadError} retry={reload} />
          {!data && !loadError && (
            <p className="note" role="status">
              Loading episodes…
            </p>
          )}
          {data && !episodes.length && (
            <p className="note">No episodes found.</p>
          )}
          <div className="setlist">
            {episodes.map((episode) => {
              const number = episode.episodeNumber;
              const available = eligible(episode);
              return (
                <label className="set cfg-row" key={number}>
                  <span>
                    E{number} {episode.name}
                    {!available && (
                      <small>Already available or requested</small>
                    )}
                  </span>
                  <input
                    type="checkbox"
                    disabled={busy || !!streamingOverride || !available}
                    checked={available && picked.has(number)}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setPicked((previous) => {
                        const next = new Set(previous);
                        if (checked) next.add(number);
                        else next.delete(number);
                        return next;
                      });
                    }}
                  />
                </label>
              );
            })}
          </div>
          {streamingOverride && (
            <p className="note" role="alert">
              {streamingOverride.message}
            </p>
          )}
          {error && (
            <p className="note" role="alert">
              {error}
            </p>
          )}
          <div className="pk-foot">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !eligibleSeason || !episodeNumbers.length}
              onClick={() =>
                streamingOverride
                  ? void streamingOverride.confirm()
                  : void submit({ seasonNumber: season, episodeNumbers })
              }
            >
              {busy
                ? 'Requesting…'
                : streamingOverride
                  ? approval
                    ? 'Request Approval Anyway'
                    : 'Request Anyway'
                  : approval
                    ? 'Request Approval'
                    : 'Request Selected Episodes'}
            </button>
            <button
              type="button"
              ref={closeButton}
              className="btn btn-quiet"
              disabled={busy}
              onClick={close}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
