import Alert from '@app/components/Common/Alert';
import Modal from '@app/components/Common/Modal';
import { RequestListboxControl } from '@app/components/RequestModal/AdvancedRequester';
import useToasts from '@app/hooks/useToasts';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { isActiveSeasonRequest } from '@app/utils/tvRequestSelection';
import type { SonarrSeries } from '@server/api/servarr/sonarr';
import type { TvdbOfficialSeason } from '@server/api/tvdb/interfaces';
import type { MediaRequest } from '@server/entity/MediaRequest';
import type { NonFunctionProperties } from '@server/interfaces/api/common';
import axios from 'axios';
import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.RequestCard.TvSeasonMappingModal', {
  title: 'Map TV seasons',
  explanation:
    'Season numbering can differ between TMDB and TVDB. SeerrNG will use only the mappings you select here.',
  series: 'Sonarr series',
  selectSeries: 'Choose a Sonarr series',
  order: 'Sonarr series order',
  sonarrSeason: 'Sonarr season {season}',
  seriesProgress: '{files} of {total} episodes downloaded ({percent}%)',
  originalCountry: 'Original country: {country}',
  animeIdentifiers: 'Anime IDs: MAL {malIds}; AniList {aniListIds}',
  recentHistory: 'Recent Sonarr activity',
  noHistory: 'No recent Sonarr activity was returned.',
  historyItem: '{event} · {date}',
  noSeries: 'No matching Sonarr series was found for this request destination.',
  lookupFailed: 'Unable to load Sonarr series for this request destination.',
  seasonLoading: 'Loading official TVDB seasons…',
  seasonLoadFailed: 'Unable to verify the official TVDB season list.',
  season: 'TMDB season {season}',
  selectSeason: 'Choose a TVDB season',
  selectSonarrSeason: 'Choose a Sonarr season',
  specials: 'Season 0 (Specials)',
  numberedSeason: 'Season {season}',
  seasonYear: '{season} ({year})',
  mapAndRetry: 'Map seasons and retry',
  failed: 'Unable to save the season mapping or retry the request.',
  description:
    'Map every requested season. SeerrNG checks standard-order choices against TVDB and alternate-order choices against the selected Sonarr series.',
});

type MappingSelection = number | '';

interface TvSeasonMappingModalProps {
  request: NonFunctionProperties<MediaRequest>;
  onCancel: () => void;
  onComplete: () => void | Promise<void>;
}

const TvSeasonMappingModal = ({
  request,
  onCancel,
  onComplete,
}: TvSeasonMappingModalProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [tvdbId, setTvdbId] = useState<number | null>(null);
  const [seasonType, setSeasonType] = useState('');
  const [seasonSelections, setSeasonSelections] = useState<
    Record<number, MappingSelection>
  >({});
  const [isSaving, setSaving] = useState(false);

  const activeSeasons = useMemo(
    () =>
      [
        ...new Set(
          (request.seasons ?? [])
            .filter(isActiveSeasonRequest)
            .map((item) => item.seasonNumber)
        ),
      ].sort((left, right) => left - right),
    [request.seasons]
  );
  const lookupUrl = useMemo(() => {
    const params = new URLSearchParams({ is4k: String(request.is4k) });
    if (
      request.serverId != null &&
      Number.isSafeInteger(request.serverId) &&
      request.serverId >= 0
    ) {
      params.set('serverId', String(request.serverId));
    }
    if (request.metadataLanguageId != null) {
      params.set('language', String(request.metadataLanguageId));
    }
    return `/api/v1/service/sonarr/lookup/${request.media.tmdbId}?${params.toString()}`;
  }, [
    request.is4k,
    request.media.tmdbId,
    request.metadataLanguageId,
    request.serverId,
  ]);
  const {
    data: seriesResults,
    error: seriesError,
    isLoading: isLoadingSeries,
  } = useSWR<SonarrSeries[]>(lookupUrl);
  const series = useMemo(
    () => [
      ...new Map(
        (seriesResults ?? [])
          .filter(
            (item) => Number.isSafeInteger(item.tvdbId) && item.tvdbId > 0
          )
          .map((item) => [item.tvdbId, item])
      ).values(),
    ],
    [seriesResults]
  );
  const selectedSeries = series.find((item) => item.tvdbId === tvdbId);
  const activeSeasonType =
    seasonType || selectedSeries?.seasonType || 'standard';
  const selectedSeasonOrder = selectedSeries?.seasonTypes?.find(
    (item) => item.type === activeSeasonType
  );
  const useSonarrSeasonNumbers =
    activeSeasonType !== 'standard' &&
    (selectedSeasonOrder?.seasonNumbers.length ?? 0) > 0;
  const selectedSeriesHistoryUrl =
    selectedSeries &&
    selectedSeries.tvdbId > 0 &&
    selectedSeries.sonarrServerId !== undefined
      ? `/api/v1/service/sonarr/${selectedSeries.sonarrServerId}/series/by-tvdb/${selectedSeries.tvdbId}/history`
      : null;
  const { data: seriesHistory } = useSWR<{
    statistics?: SonarrSeries['statistics'];
    history?: {
      id: number;
      date: string;
      eventType: string;
      sourceTitle: string;
    }[];
  }>(selectedSeriesHistoryUrl);
  const seriesStatistics =
    seriesHistory?.statistics ?? selectedSeries?.statistics;
  const {
    data: officialSeasons,
    error: seasonError,
    isLoading: isLoadingSeasons,
  } = useSWR<TvdbOfficialSeason[]>(
    tvdbId ? `/api/v1/service/tvdb/seasons/${tvdbId}` : null
  );
  const uniqueOfficialSeasons = useMemo(
    () => [
      ...new Map(
        (officialSeasons ?? []).map((season) => [season.seasonNumber, season])
      ).values(),
    ],
    [officialSeasons]
  );

  const selectedSeasonNumbers = activeSeasons.map(
    (seasonNumber) => seasonSelections[seasonNumber]
  );
  const selectedTvdbSeasons = selectedSeasonNumbers.filter(
    (seasonNumber): seasonNumber is number => typeof seasonNumber === 'number'
  );
  const allSeasonsMapped =
    activeSeasons.length > 0 &&
    selectedTvdbSeasons.length === activeSeasons.length &&
    new Set(selectedTvdbSeasons).size === activeSeasons.length;

  const seasonLabel = (season: TvdbOfficialSeason): string => {
    if (season.seasonNumber === 0) {
      return intl.formatMessage(messages.specials);
    }

    return season.year
      ? intl.formatMessage(messages.seasonYear, {
          season: intl.formatMessage(messages.numberedSeason, {
            season: season.seasonNumber,
          }),
          year: season.year,
        })
      : intl.formatMessage(messages.numberedSeason, {
          season: season.seasonNumber,
        });
  };

  const submitMapping = async () => {
    if (!selectedSeries || !allSeasonsMapped || isSaving) return;
    setSaving(true);
    try {
      await axios.post(`/api/v1/request/${request.id}/retry`, {
        tvdbId: selectedSeries.tvdbId,
        seasonType: activeSeasonType,
        seasonMappings: activeSeasons.map((seasonNumber) => ({
          seasonNumber,
          externalSeasonNumber: seasonSelections[seasonNumber],
        })),
      });
      await onComplete();
    } catch {
      addToast(intl.formatMessage(messages.failed), {
        autoDismiss: true,
        appearance: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const loading =
    isSaving ||
    isLoadingSeries ||
    (!!tvdbId && isLoadingSeasons && !officialSeasons && !seasonError);

  return (
    <Modal
      title={intl.formatMessage(messages.title)}
      onCancel={onCancel}
      onOk={() => void submitMapping()}
      cancelText={intl.formatMessage(globalMessages.cancel)}
      okText={intl.formatMessage(messages.mapAndRetry)}
      okDisabled={loading || !selectedSeries || !allSeasonsMapped}
      okButtonType="primary"
      backgroundClickable={false}
      loading={loading}
      dialogClass="request-modal-site-surface request-tvdb-mapping-dialog"
    >
      <div className="request-tvdb-mapping">
        <p className="request-tvdb-mapping__description">
          {intl.formatMessage(messages.explanation)}
        </p>

        {seriesError ? (
          <Alert
            type="error"
            title={intl.formatMessage(messages.lookupFailed)}
          />
        ) : series.length === 0 && seriesResults ? (
          <Alert type="info" title={intl.formatMessage(messages.noSeries)} />
        ) : (
          <RequestListboxControl<number | ''>
            id={`tvdb-series-${request.id}`}
            label={intl.formatMessage(messages.series)}
            value={tvdbId ?? ''}
            options={[
              { value: '', label: intl.formatMessage(messages.selectSeries) },
              ...series.map((item) => ({
                value: item.tvdbId,
                label: `${item.title}${item.year ? ` (${item.year})` : ''}`,
              })),
            ]}
            loadingLabel={intl.formatMessage(messages.selectSeries)}
            onChange={(value) => {
              const nextId = typeof value === 'number' ? value : null;
              setTvdbId(nextId);
              setSeasonType('');
              setSeasonSelections({});
            }}
          />
        )}

        {selectedSeries && (
          <>
            {(selectedSeries.seasonTypes?.length ?? 0) > 1 && (
              <RequestListboxControl<string>
                id={`sonarr-order-${request.id}`}
                label={intl.formatMessage(messages.order)}
                value={activeSeasonType}
                options={(selectedSeries.seasonTypes ?? []).map((item) => ({
                  value: item.type,
                  label:
                    item.name === item.type
                      ? item.name
                      : `${item.name} (${item.type})`,
                }))}
                loadingLabel={intl.formatMessage(messages.order)}
                onChange={(value) => {
                  setSeasonType(value);
                  setSeasonSelections({});
                }}
              />
            )}
            {selectedSeries.originalCountry && (
              <p className="request-tvdb-mapping__description">
                {intl.formatMessage(messages.originalCountry, {
                  country: selectedSeries.originalCountry,
                })}
              </p>
            )}
            {((selectedSeries.malIds?.length ?? 0) > 0 ||
              (selectedSeries.aniListIds?.length ?? 0) > 0) && (
              <p className="request-tvdb-mapping__description">
                {intl.formatMessage(messages.animeIdentifiers, {
                  malIds: (selectedSeries.malIds ?? []).join(', ') || '—',
                  aniListIds:
                    (selectedSeries.aniListIds ?? []).join(', ') || '—',
                })}
              </p>
            )}
            {seriesStatistics && seriesStatistics.totalEpisodeCount > 0 && (
              <p className="request-tvdb-mapping__description">
                {intl.formatMessage(messages.seriesProgress, {
                  files: seriesStatistics.episodeFileCount,
                  total: seriesStatistics.totalEpisodeCount,
                  percent: seriesStatistics.percentOfEpisodes,
                })}
              </p>
            )}
            {seriesHistory?.history && (
              <div>
                <h4 className="request-tvdb-mapping__description">
                  {intl.formatMessage(messages.recentHistory)}
                </h4>
                {(seriesHistory.history ?? []).length > 0 ? (
                  <ul className="request-tvdb-mapping__description">
                    {seriesHistory.history.slice(0, 5).map((event) => (
                      <li key={event.id}>
                        {intl.formatMessage(messages.historyItem, {
                          event: event.sourceTitle || event.eventType,
                          date: intl.formatDate(new Date(event.date), {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }),
                        })}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="request-tvdb-mapping__description">
                    {intl.formatMessage(messages.noHistory)}
                  </p>
                )}
              </div>
            )}
            <p className="request-tvdb-mapping__description">
              {intl.formatMessage(messages.description)}
            </p>
            {seasonError && !useSonarrSeasonNumbers ? (
              <Alert
                type="error"
                title={intl.formatMessage(messages.seasonLoadFailed)}
              />
            ) : !useSonarrSeasonNumbers &&
              officialSeasons &&
              uniqueOfficialSeasons.length === 0 ? (
              <Alert
                type="error"
                title={intl.formatMessage(messages.seasonLoadFailed)}
              />
            ) : (
              <div className="request-tvdb-mapping__seasons">
                {activeSeasons.map((seasonNumber) => {
                  const selectedByOtherSeason = new Set(
                    activeSeasons
                      .filter((item) => item !== seasonNumber)
                      .map((item) => seasonSelections[item])
                      .filter(
                        (item): item is number => typeof item === 'number'
                      )
                  );
                  const candidateSeasons = useSonarrSeasonNumbers
                    ? (selectedSeasonOrder?.seasonNumbers ?? []).map(
                        (number) => ({ seasonNumber: number, year: null })
                      )
                    : uniqueOfficialSeasons;
                  const options = candidateSeasons
                    .filter(
                      (season) =>
                        !selectedByOtherSeason.has(season.seasonNumber) ||
                        seasonSelections[seasonNumber] === season.seasonNumber
                    )
                    .map((season) => ({
                      value: season.seasonNumber,
                      label: useSonarrSeasonNumbers
                        ? intl.formatMessage(messages.sonarrSeason, {
                            season: season.seasonNumber,
                          })
                        : seasonLabel(season),
                    }));

                  return (
                    <RequestListboxControl<number | ''>
                      key={seasonNumber}
                      id={`tvdb-season-${request.id}-${seasonNumber}`}
                      label={intl.formatMessage(messages.season, {
                        season: seasonNumber,
                      })}
                      value={seasonSelections[seasonNumber] ?? ''}
                      options={[
                        {
                          value: '',
                          label: intl.formatMessage(messages.selectSeason),
                        },
                        ...options,
                      ]}
                      loadingLabel={intl.formatMessage(
                        isLoadingSeasons
                          ? messages.seasonLoading
                          : useSonarrSeasonNumbers
                            ? messages.selectSonarrSeason
                            : messages.selectSeason
                      )}
                      disabled={
                        useSonarrSeasonNumbers
                          ? !selectedSeasonOrder
                          : !officialSeasons || isLoadingSeasons
                      }
                      onChange={(value) =>
                        setSeasonSelections((current) => ({
                          ...current,
                          [seasonNumber]: value,
                        }))
                      }
                    />
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};

export default TvSeasonMappingModal;
