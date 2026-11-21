import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Season, SeasonRequestSelection } from '../api';
import { useApi } from '../hooks';
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
  submit: (selection: SeasonRequestSelection) => Promise<void>;
  close: () => void;
}) {
  const { t } = useLumenLocale();
  const [season, selectSeason] = useState(
    () =>
      seasons.find(({ seasonNumber }) => seasonNumber === initialSeason)
        ?.seasonNumber ?? seasons[0].seasonNumber
  );
  const [picked, setPicked] = useState(
    () =>
      new Set(
        season === initialSeason && initialEpisode !== undefined
          ? [initialEpisode]
          : []
      )
  );
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
          <label className="sel">
            <span className="lbl">
              {t('lumen.tvEpisodeRequest.season', 'Season')}
            </span>
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
                      ? t('lumen.tvEpisodeRequest.specials', 'Specials')
                      : t(
                          'lumen.tvEpisodeRequest.seasonNumber',
                          'Season {number}',
                          {
                            number: item.seasonNumber,
                          }
                        ))}
                </option>
              ))}
            </select>
          </label>
          <ServiceNote
            what={t('lumen.tvEpisodeRequest.episodes', 'episodes')}
            title={t(
              'lumen.tvEpisodeRequest.loadFailure',
              'Could not load episodes'
            )}
            retryLabel={t('lumen.account.retry', 'Retry')}
            error={loadError}
            retry={reload}
          />
          {!data && !loadError && (
            <p className="note" role="status">
              {t('lumen.tvEpisodeRequest.loading', 'Loading episodes…')}
            </p>
          )}
          {data && !episodes.length && (
            <p className="note">
              {t('lumen.tvEpisodeRequest.empty', 'No episodes found.')}
            </p>
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
