import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, type Season, type SeasonRequestSelection } from '../api';
import { useLumenLocale } from '../i18n';
import { ServiceNote } from './extra';
import { useBackCloses } from './requestSheet';
import { useDialog } from './useDialog';

interface Episode {
  episodeNumber: number;
  name?: string;
  availabilitySources?: { hd: boolean; fourK: boolean }[];
  sonarrAvailability?: { hd: boolean; fourK: boolean };
}

interface SeasonEpisodes {
  seasonNumber: number;
  episodes: Episode[];
}

// The server fetches provider metadata with concurrency three. Keep client
// batches small so one slow upstream season cannot hold a long series behind
// a single proxy request; failed seasons are retried independently.
const SEASON_BATCH_SIZE = 5;

export default function TvEpisodeRequestSheet({
  tvId,
  seasons,
  initialSeason,
  initialEpisode,
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
  initialEpisode?: number;
  pending: ReadonlyMap<number, Set<number>>;
  is4k: boolean;
  approval: boolean;
  busy: boolean;
  error?: string;
  streamingOverride?: { message: string; confirm: () => Promise<void> };
  submit: (selections: SeasonRequestSelection[]) => Promise<void>;
  close: () => void;
}) {
  const { t } = useLumenLocale();
  const [episodesBySeason, setEpisodesBySeason] = useState(
    new Map<number, Episode[]>()
  );
  const episodesRef = useRef(episodesBySeason);
  episodesRef.current = episodesBySeason;
  const [picked, setPicked] = useState(
    () =>
      new Map<number, Set<number>>(
        initialSeason !== undefined && initialEpisode !== undefined
          ? [[initialSeason, new Set([initialEpisode])]]
          : []
      )
  );
  const [openSeasons, setOpenSeasons] = useState(
    () => new Set(initialSeason === undefined ? [] : [initialSeason])
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useDialog(box, close);
  useBackCloses(close);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (streamingOverride) closeButton.current?.focus();
  }, [streamingOverride]);
  const seasonKey = seasons.map(({ seasonNumber }) => seasonNumber).join(',');
  const seasonNumbers = useMemo(
    () => (seasonKey ? seasonKey.split(',').map(Number) : []),
    [seasonKey]
  );
  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setLoadError(false);
      const requested = seasonNumbers;
      const missing = requested.filter(
        (number) => !episodesRef.current.has(number)
      );
      const failed: number[] = [];
      for (let index = 0; index < missing.length; index += SEASON_BATCH_SIZE) {
        const batch = missing.slice(index, index + SEASON_BATCH_SIZE);
        const query = new URLSearchParams({
          seasonNumbers: batch.join(','),
        });
        try {
          const values = await api<SeasonEpisodes[]>(
            `/tv/${tvId}/seasons?${query}`
          );
          const returned = new Map(
            (Array.isArray(values) ? values : []).map((season) => [
              season.seasonNumber,
              season.episodes,
            ])
          );
          for (const number of batch) {
            const episodes = returned.get(number);
            if (!Array.isArray(episodes)) {
              failed.push(number);
              continue;
            }
            episodesRef.current = new Map(episodesRef.current).set(
              number,
              episodes
            );
          }
          if (active) setEpisodesBySeason(new Map(episodesRef.current));
        } catch {
          failed.push(...batch);
        }
      }
      if (active) {
        setLoadError(failed.length > 0);
        setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [retryCount, seasonKey, seasonNumbers, tvId]);
  const quality = is4k ? 'fourK' : 'hd';
  const hasLoadedSeasons = seasons.some(({ seasonNumber }) =>
    episodesBySeason.has(seasonNumber)
  );
  const canSelectLoadedEpisodes = hasLoadedSeasons;
  const eligible = (seasonNumber: number, episode: Episode) =>
    Number.isSafeInteger(episode.episodeNumber) &&
    episode.episodeNumber > 0 &&
    !pending.get(seasonNumber)?.has(episode.episodeNumber) &&
    !episode.sonarrAvailability?.[quality] &&
    !episode.availabilitySources?.some((source) => source[quality]);
  const selections = seasons.flatMap(({ seasonNumber }) => {
    const episodeNumbers = (episodesBySeason.get(seasonNumber) ?? [])
      .filter(
        (episode) =>
          eligible(seasonNumber, episode) &&
          picked.get(seasonNumber)?.has(episode.episodeNumber)
      )
      .map(({ episodeNumber }) => episodeNumber);
    return episodeNumbers.length ? [{ seasonNumber, episodeNumbers }] : [];
  });
  return createPortal(
    <div className="sheet-wrap open">
      <div className="sheet-scrim" aria-hidden="true" onClick={close} />
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('lumen.tvEpisodeRequest.title', 'Request Episodes')}
        ref={box}
      >
        <div className="grab" />
        <div className="pk">
          <header>
            <h3>
              {is4k
                ? t('lumen.tvEpisodeRequest.title4k', 'Request Episodes in 4K')
                : t('lumen.tvEpisodeRequest.title', 'Request Episodes')}
            </h3>
          </header>
          <div className="toolbar">
            <button
              className="btn btn-tonal btn-sm"
              type="button"
              disabled={!canSelectLoadedEpisodes || busy || !!streamingOverride}
              onClick={() =>
                setOpenSeasons(
                  new Set(seasons.map(({ seasonNumber }) => seasonNumber))
                )
              }
            >
              {t('lumen.tvEpisodeRequest.expandAll', 'Expand All')}
            </button>
            <button
              className="btn btn-tonal btn-sm"
              type="button"
              onClick={() => setOpenSeasons(new Set())}
            >
              {t('lumen.tvEpisodeRequest.collapseAll', 'Collapse All')}
            </button>
            <button
              className="btn btn-quiet btn-sm"
              type="button"
              disabled={busy || !picked.size}
              onClick={() => setPicked(new Map())}
            >
              {t('lumen.tvEpisodeRequest.clearSelection', 'Clear Selection')}
            </button>
            <span role="status">
              {t('lumen.tvEpisodeRequest.selected', 'Selected: {count}', {
                count: selections.reduce(
                  (total, item) => total + (item.episodeNumbers?.length ?? 0),
                  0
                ),
              })}
            </span>
          </div>
          <ServiceNote
            what={t('lumen.tvEpisodeRequest.episodes', 'episodes')}
            title={t(
              'lumen.tvEpisodeRequest.loadFailure',
              'Could not load episodes'
            )}
            retryLabel={t('lumen.account.retry', 'Retry')}
            error={
              loadError
                ? hasLoadedSeasons
                  ? t(
                      'lumen.tvEpisodeRequest.loadFailurePartialBody',
                      'Some season details remain unavailable. Episodes from loaded seasons are still shown; retry to load the missing details.'
                    )
                  : t(
                      'lumen.tvEpisodeRequest.loadFailureBody',
                      'Some season details could not be loaded.'
                    )
                : null
            }
            retry={() => setRetryCount((count) => count + 1)}
          />
          {loading && (
            <p className="note" role="status">
              {t('lumen.tvEpisodeRequest.loading', 'Loading episodes…')}
            </p>
          )}
          <div className="setlist">
            {seasons.map((item) => {
              const seasonNumber = item.seasonNumber;
              const episodes = episodesBySeason.get(seasonNumber) ?? [];
              const label =
                item.name ||
                (seasonNumber === 0
                  ? t('lumen.tvEpisodeRequest.specials', 'Specials')
                  : t(
                      'lumen.tvEpisodeRequest.seasonNumber',
                      'Season {number}',
                      {
                        number: seasonNumber,
                      }
                    ));
              const selectedCount = picked.get(seasonNumber)?.size ?? 0;
              return (
                <details
                  key={seasonNumber}
                  open={openSeasons.has(seasonNumber)}
                  onToggle={(event) => {
                    const open = event.currentTarget.open;
                    setOpenSeasons((previous) => {
                      const next = new Set(previous);
                      if (open) next.add(seasonNumber);
                      else next.delete(seasonNumber);
                      return next;
                    });
                  }}
                >
                  <summary className="set">
                    <span>{label}</span>
                    <small>
                      {selectedCount
                        ? t(
                            'lumen.tvEpisodeRequest.seasonSelected',
                            '{count} selected',
                            { count: selectedCount }
                          )
                        : t(
                            'lumen.tvEpisodeRequest.episodeCount',
                            '{count} episodes',
                            { count: item.episodeCount }
                          )}
                    </small>
                  </summary>
                  {episodes.length ? (
                    <div className="setlist">
                      {episodes.map((episode) => {
                        const number = episode.episodeNumber;
                        const available = eligible(seasonNumber, episode);
                        return (
                          <label className="set cfg-row" key={number}>
                            <span>
                              E{number} {episode.name}
                              {!available && (
                                <small>
                                  {t(
                                    'lumen.tvEpisodeRequest.alreadyAvailable',
                                    'Already available or requested'
                                  )}
                                </small>
                              )}
                            </span>
                            <input
                              type="checkbox"
                              disabled={
                                busy || !!streamingOverride || !available
                              }
                              checked={
                                available &&
                                !!picked.get(seasonNumber)?.has(number)
                              }
                              onChange={(event) => {
                                const next = new Map(picked);
                                const seasonPicks = new Set(
                                  next.get(seasonNumber)
                                );
                                if (event.target.checked)
                                  seasonPicks.add(number);
                                else seasonPicks.delete(number);
                                if (seasonPicks.size)
                                  next.set(seasonNumber, seasonPicks);
                                else next.delete(seasonNumber);
                                setPicked(next);
                              }}
                            />
                          </label>
                        );
                      })}
                    </div>
                  ) : episodesBySeason.has(seasonNumber) ? (
                    <p className="note">
                      {t('lumen.tvEpisodeRequest.empty', 'No episodes found.')}
                    </p>
                  ) : null}
                </details>
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
              disabled={busy || loading || !selections.length}
              onClick={() =>
                streamingOverride
                  ? void streamingOverride.confirm()
                  : void submit(selections)
              }
            >
              {busy
                ? t('lumen.tvEpisodeRequest.requesting', 'Requesting…')
                : streamingOverride
                  ? approval
                    ? t(
                        'lumen.tvEpisodeRequest.approvalAnyway',
                        'Request Approval Anyway'
                      )
                    : t(
                        'lumen.tvEpisodeRequest.requestAnyway',
                        'Request Anyway'
                      )
                  : approval
                    ? t(
                        'lumen.tvEpisodeRequest.requestApproval',
                        'Request Approval'
                      )
                    : t(
                        'lumen.tvEpisodeRequest.submit',
                        'Request Selected Episodes'
                      )}
            </button>
            <button
              type="button"
              ref={closeButton}
              className="btn btn-quiet"
              disabled={busy}
              onClick={close}
            >
              {t('lumen.tvEpisodeRequest.close', 'Close')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
