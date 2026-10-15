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
  noSeries: 'No matching Sonarr series was found for this request destination.',
  lookupFailed: 'Unable to load Sonarr series for this request destination.',
  seasonLoading: 'Loading official TVDB seasons…',
  seasonLoadFailed: 'Unable to verify the official TVDB season list.',
  season: 'TMDB season {season}',
  selectSeason: 'Choose a TVDB season',
  specials: 'Season 0 (Specials)',
  numberedSeason: 'Season {season}',
  seasonYear: '{season} ({year})',
  mapAndRetry: 'Map seasons and retry',
  failed: 'Unable to save the season mapping or retry the request.',
  description:
    'Map every requested season. SeerrNG verifies your choices against the official TVDB season list before retrying.',
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
    return `/api/v1/service/sonarr/lookup/${request.media.tmdbId}?${params.toString()}`;
  }, [request.is4k, request.media.tmdbId, request.serverId]);
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
              setSeasonSelections({});
            }}
          />
        )}

        {selectedSeries && (
          <>
            <p className="request-tvdb-mapping__description">
              {intl.formatMessage(messages.description)}
            </p>
            {seasonError ? (
              <Alert
                type="error"
                title={intl.formatMessage(messages.seasonLoadFailed)}
              />
            ) : officialSeasons && uniqueOfficialSeasons.length === 0 ? (
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
                  const options = uniqueOfficialSeasons
                    .filter(
                      (season) =>
                        !selectedByOtherSeason.has(season.seasonNumber) ||
                        seasonSelections[seasonNumber] === season.seasonNumber
                    )
                    .map((season) => ({
                      value: season.seasonNumber,
                      label: seasonLabel(season),
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
                          : messages.selectSeason
                      )}
                      disabled={!officialSeasons || isLoadingSeasons}
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
