import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, tmdbImg, type Season, type SeasonRequestSelection } from '../api';
import { useLumenLocale } from '../i18n';
import { Icon } from '../icons';
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
const SEASON_BATCH_ATTEMPTS = 2;

export default function TvEpisodeRequestSheet({
  tvId,
  title,
  posterPath,
  year,
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
  title: string;
  posterPath?: string;
  year?: string;
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
  const regularSeasonCount = seasons.filter(
    ({ seasonNumber }) => seasonNumber > 0
  ).length;
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
        let pending = missing.slice(index, index + SEASON_BATCH_SIZE);
        for (
          let attempt = 0;
          attempt < SEASON_BATCH_ATTEMPTS && pending.length > 0;
          attempt += 1
        ) {
          try {
            const query = new URLSearchParams({
              seasonNumbers: pending.join(','),
            });
            const values = await api<SeasonEpisodes[]>(
              `/tv/${tvId}/seasons?${query}`
            );
            const returned = new Map(
              (Array.isArray(values) ? values : []).map((season) => [
                season.seasonNumber,
                season.episodes,
              ])
            );
            for (const number of pending) {
              const episodes = returned.get(number);
              if (!Array.isArray(episodes)) continue;
              episodesRef.current = new Map(episodesRef.current).set(
                number,
                episodes
              );
            }
            pending = pending.filter(
              (number) => !episodesRef.current.has(number)
            );
            if (active) setEpisodesBySeason(new Map(episodesRef.current));
          } catch {
            // Retry this batch once, then continue with later seasons.
          }
          if (pending.length > 0 && attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
        }
        failed.push(...pending);
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
  const selectableEpisodeNumbers = (seasonNumber: number) =>
    (episodesBySeason.get(seasonNumber) ?? [])
      .filter((episode) => eligible(seasonNumber, episode))
      .map((episode) => episode.episodeNumber);
  const allSelectableEpisodes = seasons.flatMap(({ seasonNumber }) =>
    selectableEpisodeNumbers(seasonNumber).map((episodeNumber) => ({
      seasonNumber,
      episodeNumber,
    }))
  );
  const latestSelectableSeasonNumber = seasons.reduce(
    (latest, { seasonNumber }) =>
      seasonNumber > latest && selectableEpisodeNumbers(seasonNumber).length
        ? seasonNumber
        : latest,
    0
  );
  const selectedSelectableCount = allSelectableEpisodes.filter(
    ({ seasonNumber, episodeNumber }) =>
      picked.get(seasonNumber)?.has(episodeNumber)
  ).length;
  const allSelectable =
    allSelectableEpisodes.length > 0 &&
    selectedSelectableCount === allSelectableEpisodes.length;
  const selectAll = () => {
    if (allSelectable) {
      setPicked(new Map());
      return;
    }
    setPicked((previous) => {
      const next = new Map(
        [...previous].filter(
          ([seasonNumber]) => !episodesBySeason.has(seasonNumber)
        )
      );
      for (const { seasonNumber } of seasons) {
        const episodeNumbers = selectableEpisodeNumbers(seasonNumber);
        if (episodeNumbers.length)
          next.set(seasonNumber, new Set(episodeNumbers));
      }
      return next;
    });
  };
  const selectLatestSeason = () => {
    if (latestSelectableSeasonNumber <= 0) return;
    const episodeNumbers = selectableEpisodeNumbers(
      latestSelectableSeasonNumber
    );
    if (episodeNumbers.length)
      setPicked(
        new Map([[latestSelectableSeasonNumber, new Set(episodeNumbers)]])
      );
  };
  const toggleSeasonSelection = (seasonNumber: number) => {
    const episodeNumbers = selectableEpisodeNumbers(seasonNumber);
    const selected = picked.get(seasonNumber);
    const allSelected =
      episodeNumbers.length > 0 &&
      episodeNumbers.every((episodeNumber) => selected?.has(episodeNumber));
    setPicked((previous) => {
      const next = new Map(previous);
      if (allSelected || !episodeNumbers.length) next.delete(seasonNumber);
      else next.set(seasonNumber, new Set(episodeNumbers));
      return next;
    });
  };
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
          <header className="pk-head">
            {posterPath && tmdbImg(posterPath) && (
              <div className="p">
                <img src={tmdbImg(posterPath)} alt="" />
              </div>
            )}
            <div>
              <h3>
                {title || t('components.Layout.Sidebar.browsetv', 'Series')}
              </h3>
              <p className="meta">
                {year}
                {regularSeasonCount > 0 &&
                  `${year ? ' · ' : ''}${t(
                    'lumen.tv.seasonCount',
                    '{count} seasons',
                    { count: regularSeasonCount }
                  )}`}
              </p>
            </div>
          </header>
          <div className="toolbar">
            <button
              className={`btn btn-sm ${allSelectable ? 'btn-primary' : 'btn-tonal'}`}
              data-testid="select-all-requestable-episodes"
              type="button"
              role="checkbox"
              aria-checked={allSelectable}
              aria-label={t(
                allSelectable
                  ? 'lumen.tvEpisodeRequest.deselectAll'
                  : 'lumen.tvEpisodeRequest.selectAll',
                allSelectable
                  ? 'Deselect all requestable episodes'
                  : 'Select all requestable episodes'
              )}
              disabled={
                !allSelectableEpisodes.length || busy || !!streamingOverride
              }
              onClick={selectAll}
            >
              <Icon name={allSelectable ? 'check' : 'plus'} />
              {t('lumen.tvEpisodeRequest.selectAllShort', 'Select All')}
            </button>
            <button
              className="btn btn-tonal btn-sm"
              type="button"
              data-testid="select-latest-requestable-season"
              aria-label={t(
                'lumen.tvEpisodeRequest.selectLatestSeason',
                'Select all requestable episodes in the latest season'
              )}
              disabled={
                latestSelectableSeasonNumber <= 0 ||
                loading ||
                loadError ||
                busy ||
                !!streamingOverride
              }
              onClick={selectLatestSeason}
            >
              {t('lumen.tvEpisodeRequest.latestSeason', 'Latest Season')}
            </button>
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
              const selectableNumbers = selectableEpisodeNumbers(seasonNumber);
              const selectedCount = selectableNumbers.filter((number) =>
                picked.get(seasonNumber)?.has(number)
              ).length;
              const allSelected =
                selectableNumbers.length > 0 &&
                selectedCount === selectableNumbers.length;
              const partiallySelected = selectedCount > 0 && !allSelected;
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
                    <button
                      className={`btn btn-sm ${allSelected ? 'btn-primary' : 'btn-tonal'}`}
                      type="button"
                      role="checkbox"
                      aria-checked={
                        allSelected ? true : partiallySelected ? 'mixed' : false
                      }
                      aria-label={t(
                        allSelected
                          ? 'lumen.tvEpisodeRequest.deselectSeason'
                          : 'lumen.tvEpisodeRequest.selectSeason',
                        allSelected
                          ? 'Deselect all requestable episodes in {season}'
                          : 'Select all requestable episodes in {season}',
                        { season: label }
                      )}
                      disabled={
                        !selectableNumbers.length || busy || !!streamingOverride
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleSeasonSelection(seasonNumber);
                      }}
                    >
                      <Icon
                        name={
                          allSelected
                            ? 'check'
                            : partiallySelected
                              ? 'minus'
                              : 'plus'
                        }
                      />
                    </button>
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
