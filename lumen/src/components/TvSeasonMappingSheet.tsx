import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError, type RequestItem } from '../api';
import { useLumenLocale } from '../i18n';
import { useDialog } from './useDialog';

interface SonarrSeries {
  title: string;
  year?: number;
  tvdbId: number;
  seasonType?: string;
  seasonTypes?: { name: string; type: string; seasonNumbers: number[] }[];
}
interface OfficialSeason {
  seasonNumber: number;
  year: number | null;
}

export function canMapTvSeasons(request: RequestItem) {
  return (
    request.type === 'tv' &&
    request.status === 4 &&
    ['tvdb_id_unresolved', 'tvdb_season_mismatch'].includes(
      request.failureReason ?? ''
    )
  );
}

export default function TvSeasonMappingSheet({
  request,
  title,
  close,
  saved,
}: {
  request: RequestItem;
  title: string;
  close: () => void;
  saved: () => void;
}) {
  const { t } = useLumenLocale();
  const box = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const [series, setSeries] = useState<SonarrSeries[]>([]);
  const [seriesId, setSeriesId] = useState<number | ''>('');
  const [order, setOrder] = useState('');
  const [official, setOfficial] = useState<OfficialSeason[] | null>(null);
  const [selection, setSelection] = useState<Record<number, number | ''>>({});
  const [busy, setBusy] = useState(true);
  const [failure, setFailure] = useState('');
  const dismiss = () => {
    if (!pending.current) close();
  };
  useDialog(box, dismiss);
  const activeSeasons = useMemo(
    () =>
      [
        ...new Set(
          (request.seasons ?? [])
            .filter((season) => season.status !== 3)
            .map((season) => season.seasonNumber)
        ),
      ].sort((a, b) => a - b),
    [request.seasons]
  );
  const selected = series.find((item) => item.tvdbId === seriesId);
  const seasonType = order || selected?.seasonType || 'standard';
  const alternate = selected?.seasonTypes?.find(
    (item) => item.type === seasonType
  );
  const numbers =
    seasonType !== 'standard' && alternate?.seasonNumbers.length
      ? alternate.seasonNumbers
      : (official?.map(({ seasonNumber }) => seasonNumber) ?? []);
  const values = activeSeasons.map((number) => selection[number]);
  const complete =
    activeSeasons.length > 0 &&
    values.every((value) => typeof value === 'number') &&
    new Set(values).size === activeSeasons.length;

  useEffect(() => {
    let live = true;
    const params = new URLSearchParams({ is4k: String(request.is4k) });
    if (request.serverId != null)
      params.set('serverId', String(request.serverId));
    if (request.metadataLanguageId != null)
      params.set('language', String(request.metadataLanguageId));
    setBusy(true);
    api<SonarrSeries[]>(
      `/service/sonarr/lookup/${request.media.tmdbId}?${params}`
    )
      .then((result) => {
        if (live)
          setSeries(
            result.filter(
              (item) => Number.isSafeInteger(item.tvdbId) && item.tvdbId > 0
            )
          );
      })
      .catch(() => {
        if (live)
          setFailure(
            t(
              'lumen.requestMapping.lookupFailed',
              'Could not load matching Sonarr series.'
            )
          );
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [
    request.is4k,
    request.serverId,
    request.metadataLanguageId,
    request.media.tmdbId,
    t,
  ]);

  useEffect(() => {
    let live = true;
    if (!seriesId) {
      setOfficial(null);
      return () => {
        live = false;
      };
    }
    const type = order || selected?.seasonType || 'standard';
    if (
      type !== 'standard' &&
      selected?.seasonTypes?.some(
        (item) => item.type === type && item.seasonNumbers.length
      )
    ) {
      setOfficial(null);
      return () => {
        live = false;
      };
    }
    setOfficial(null);
    api<OfficialSeason[]>(`/service/tvdb/seasons/${seriesId}`)
      .then((result) => {
        if (live) setOfficial(result);
      })
      .catch(() => {
        if (live)
          setFailure(
            t(
              'lumen.requestMapping.seasonsFailed',
              'Could not verify the TVDB season list.'
            )
          );
      });
    return () => {
      live = false;
    };
  }, [seriesId, order, selected, t]);

  async function submit() {
    if (!selected || !complete || pending.current) return;
    pending.current = true;
    setBusy(true);
    setFailure('');
    try {
      await api(`/request/${request.id}/retry`, {
        method: 'POST',
        body: JSON.stringify({
          tvdbId: selected.tvdbId,
          seasonType,
          seasonMappings: activeSeasons.map((seasonNumber) => ({
            seasonNumber,
            externalSeasonNumber: selection[seasonNumber],
          })),
        }),
      });
      saved();
    } catch (error) {
      setFailure(
        error instanceof ApiError
          ? error.message
          : t(
              'lumen.requestMapping.saveFailed',
              'Could not save the mapping or retry the request.'
            )
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return createPortal(
    <div className="sheet-wrap open">
      <div className="sheet-scrim" aria-hidden="true" onClick={dismiss} />
      <div
        className="sheet"
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={t('lumen.requestMapping.title', 'Map TV Seasons')}
      >
        <div className="grab" />
        <div className="pk">
          <header>
            <h2>{t('lumen.requestMapping.title', 'Map TV Seasons')}</h2>
            <p className="note">{title}</p>
          </header>
          <p className="note">
            {t(
              'lumen.requestMapping.explanation',
              'Match every requested TMDB season to the corresponding season in TVDB or the selected Sonarr order.'
            )}
          </p>
          {failure && (
            <p className="note" role="alert">
              {failure}
            </p>
          )}
          {!busy && !failure && series.length === 0 && (
            <p className="note" role="status">
              {t(
                'lumen.requestMapping.noSeries',
                'No matching Sonarr series was found for this request.'
              )}
            </p>
          )}
          <label className="sel">
            <span className="lbl">
              {t('lumen.requestMapping.series', 'Sonarr Series')}
            </span>
            <select
              aria-label={t('lumen.requestMapping.series', 'Sonarr Series')}
              value={seriesId}
              disabled={busy}
              onChange={(event) => {
                setSeriesId(
                  event.target.value ? Number(event.target.value) : ''
                );
                setOrder('');
                setSelection({});
                setFailure('');
              }}
            >
              <option value="">
                {t(
                  'lumen.requestMapping.chooseSeries',
                  'Choose a Sonarr series'
                )}
              </option>
              {series.map((item) => (
                <option key={item.tvdbId} value={item.tvdbId}>
                  {item.title}
                  {item.year ? ` (${item.year})` : ''}
                </option>
              ))}
            </select>
          </label>
          {selected && (selected.seasonTypes?.length ?? 0) > 1 && (
            <label className="sel">
              <span className="lbl">
                {t('lumen.requestMapping.order', 'Sonarr Order')}
              </span>
              <select
                aria-label={t('lumen.requestMapping.order', 'Sonarr Order')}
                value={seasonType}
                onChange={(event) => {
                  setOrder(event.target.value);
                  setSelection({});
                }}
              >
                {selected.seasonTypes?.map((item) => (
                  <option key={item.type} value={item.type}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {selected &&
            activeSeasons.map((number) => (
              <label className="sel" key={number}>
                <span className="lbl">
                  {t('lumen.requestMapping.tmdbSeason', 'TMDB S{season}', {
                    season: number,
                  })}
                </span>
                <select
                  aria-label={t(
                    'lumen.requestMapping.tmdbSeasonAccessible',
                    'TMDB Season {season}',
                    { season: number }
                  )}
                  value={selection[number] ?? ''}
                  disabled={busy || numbers.length === 0}
                  onChange={(event) =>
                    setSelection((current) => ({
                      ...current,
                      [number]:
                        event.target.value === ''
                          ? ''
                          : Number(event.target.value),
                    }))
                  }
                >
                  <option value="">
                    {t('lumen.requestMapping.chooseSeason', 'Choose Season')}
                  </option>
                  {numbers
                    .filter(
                      (candidate) =>
                        !activeSeasons.some(
                          (other) =>
                            other !== number && selection[other] === candidate
                        )
                    )
                    .map((candidate) => (
                      <option key={candidate} value={candidate}>
                        {candidate === 0
                          ? t(
                              'lumen.requestMapping.specials',
                              'Season 0 (Specials)'
                            )
                          : t(
                              'lumen.requestMapping.numberedSeason',
                              'Season {season}',
                              { season: candidate }
                            )}
                      </option>
                    ))}
                </select>
              </label>
            ))}
          {!busy && selected && numbers.length === 0 && (
            <p className="note" role="alert">
              {t(
                'lumen.requestMapping.seasonsFailed',
                'Could not verify the TVDB season list.'
              )}
            </p>
          )}
          <div className="pk-foot">
            <button className="btn btn-quiet" disabled={busy} onClick={dismiss}>
              {t('lumen.requestMapping.cancel', 'Cancel')}
            </button>
            <button
              className="btn btn-primary"
              disabled={busy || !complete}
              onClick={() => void submit()}
            >
              {t('lumen.requestMapping.submit', 'Map Seasons and Retry')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
