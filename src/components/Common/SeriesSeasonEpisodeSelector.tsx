import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import SelectionCircle, {
  selectFromRow,
  selectFromRowKey,
} from '@app/components/Common/SelectionCircle';
import Tooltip from '@app/components/Common/Tooltip';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import {
  CheckCircleIcon,
  ServerStackIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import type { SeasonEpisodeSelection } from '@server/interfaces/api/seasonInterfaces';
import type { SeasonWithEpisodes, TvDetails } from '@server/models/Tv';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages(
  'components.RequestModal.SeasonEpisodeSelector',
  {
    season: 'Season',
    episodes: 'Episodes',
    episode: 'Episode',
    title: 'Title',
    specials: 'Specials',
    seasonNumber: 'Season {number}',
    episodeNumber: 'Episode {number}',
    untitled: 'Untitled',
    selectSeason: 'Select a season to view its episodes.',
    loadError: 'Episodes could not be loaded. Try selecting the season again.',
    availabilityLegend:
      'Bright green check: fully available. Dark green check: partially available. Red X: not available.',
    selectSeasonNumber: 'Select season {number, number}',
    clearSeasonNumber: 'Clear season {number, number}',
    selectSpecials: 'Select specials',
    clearSpecials: 'Clear specials',
    selectEpisodeNumber: 'Select episode {number, number}',
    clearEpisodeNumber: 'Clear episode {number, number}',
    clearAllSeasons: 'Clear all seasons',
    selectAllSeasons: 'Select all seasons',
    clearAllEpisodes: 'Clear all episodes',
    selectAllEpisodes: 'Select all episodes',
  }
);

interface SeriesSeasonEpisodeSelectorProps {
  tvId: number;
  seasons: TvDetails['seasons'];
  selections: SeasonEpisodeSelection[];
  activeSeason: number;
  onActiveSeasonChange: (seasonNumber: number) => void;
  onSelectionsChange: (selections: SeasonEpisodeSelection[]) => void;
  disabledSeasons?: number[];
  disabledEpisodes?: Record<number, number[]>;
  availableEpisodesBySeason?: Record<number, number[]>;
}

const normalizeSelections = (selections: SeasonEpisodeSelection[]) =>
  [...selections]
    .map((selection) => ({
      seasonNumber: selection.seasonNumber,
      ...(selection.episodeNumbers
        ? {
            episodeNumbers: [...new Set(selection.episodeNumbers)].sort(
              (a, b) => a - b
            ),
          }
        : {}),
    }))
    .sort((a, b) => a.seasonNumber - b.seasonNumber);

const SeriesSeasonEpisodeSelector = ({
  tvId,
  seasons,
  selections,
  activeSeason,
  onActiveSeasonChange,
  onSelectionsChange,
  disabledSeasons = [],
  disabledEpisodes = {},
  availableEpisodesBySeason = {},
}: SeriesSeasonEpisodeSelectorProps) => {
  const intl = useIntl();
  const [activeEpisodeKey, setActiveEpisodeKey] = useState<string | null>(null);
  const { data, error } = useSWR<SeasonWithEpisodes>(
    activeSeason >= 0 ? `/api/v1/tv/${tvId}/season/${activeSeason}` : null
  );
  const activeSelection = selections.find(
    (selection) => selection.seasonNumber === activeSeason
  );
  const activeSeasonDisabled = disabledSeasons.includes(activeSeason);
  const blockedEpisodes = activeSeasonDisabled
    ? (data?.episodes ?? []).map((episode) => episode.episodeNumber)
    : (disabledEpisodes[activeSeason] ?? []);
  const episodeNumbers =
    data?.episodes
      .map((episode) => episode.episodeNumber)
      .filter((episodeNumber) => !blockedEpisodes.includes(episodeNumber)) ??
    [];
  const allEpisodesSelected =
    episodeNumbers.length > 0 &&
    !!activeSelection &&
    (activeSelection.episodeNumbers === undefined ||
      episodeNumbers.every((episodeNumber) =>
        activeSelection.episodeNumbers?.includes(episodeNumber)
      ));
  const selectableSeasons = seasons.filter(
    (season) => !disabledSeasons.includes(season.seasonNumber)
  );
  const allSeasonsSelected =
    selectableSeasons.length > 0 &&
    selectableSeasons.every((season) =>
      selections.some(
        (selection) =>
          selection.seasonNumber === season.seasonNumber &&
          selection.episodeNumbers === undefined
      )
    );

  const replaceSelection = (
    seasonNumber: number,
    episodeNumbersForSeason?: number[]
  ) => {
    const remaining = selections.filter(
      (selection) => selection.seasonNumber !== seasonNumber
    );
    onSelectionsChange(
      normalizeSelections([
        ...remaining,
        {
          seasonNumber,
          ...(episodeNumbersForSeason
            ? { episodeNumbers: episodeNumbersForSeason }
            : {}),
        },
      ])
    );
  };

  const toggleSeason = (seasonNumber: number) => {
    onActiveSeasonChange(seasonNumber);
    if (
      selections.some((selection) => selection.seasonNumber === seasonNumber)
    ) {
      onSelectionsChange(
        selections.filter(
          (selection) => selection.seasonNumber !== seasonNumber
        )
      );
    } else {
      replaceSelection(seasonNumber);
    }
  };

  const toggleAllSeasons = () => {
    if (allSeasonsSelected) {
      onSelectionsChange(
        selections.filter((selection) =>
          disabledSeasons.includes(selection.seasonNumber)
        )
      );
      return;
    }

    const disabledSelections = selections.filter((selection) =>
      disabledSeasons.includes(selection.seasonNumber)
    );
    onSelectionsChange(
      normalizeSelections([
        ...disabledSelections,
        ...selectableSeasons.map((season) => ({
          seasonNumber: season.seasonNumber,
        })),
      ])
    );
    if (activeSeason < 0 && selectableSeasons[0]) {
      onActiveSeasonChange(selectableSeasons[0].seasonNumber);
    }
  };

  const toggleEpisode = (episodeNumber: number) => {
    if (blockedEpisodes.includes(episodeNumber)) {
      return;
    }

    setActiveEpisodeKey(`${activeSeason}:${episodeNumber}`);

    if (!activeSelection) {
      replaceSelection(activeSeason, [episodeNumber]);
      return;
    }

    const currentEpisodes = activeSelection.episodeNumbers ?? [
      ...episodeNumbers,
    ];
    const nextEpisodes = currentEpisodes.includes(episodeNumber)
      ? currentEpisodes.filter((number) => number !== episodeNumber)
      : [...currentEpisodes, episodeNumber].sort((a, b) => a - b);

    if (nextEpisodes.length === 0) {
      onSelectionsChange(
        selections.filter(
          (selection) => selection.seasonNumber !== activeSeason
        )
      );
    } else if (
      episodeNumbers.length > 0 &&
      episodeNumbers.every((number) => nextEpisodes.includes(number))
    ) {
      replaceSelection(activeSeason);
    } else {
      replaceSelection(activeSeason, nextEpisodes);
    }
  };

  const toggleAllEpisodes = () => {
    if (allEpisodesSelected) {
      onSelectionsChange(
        selections.filter(
          (selection) => selection.seasonNumber !== activeSeason
        )
      );
    } else {
      replaceSelection(activeSeason);
    }
  };

  const AvailabilityHeading = () => (
    <Tooltip content={intl.formatMessage(messages.availabilityLegend)}>
      <span
        className="media-availability-cell"
        aria-label={intl.formatMessage(messages.availabilityLegend)}
      >
        <ServerStackIcon className="h-4 w-4" />
      </span>
    </Tooltip>
  );
  const AvailabilityIcon = ({
    available,
    partial = false,
  }: {
    available: boolean;
    partial?: boolean;
  }) => {
    const label = intl.formatMessage(
      available
        ? partial
          ? globalMessages.partiallyavailable
          : globalMessages.available
        : globalMessages.notavailable
    );
    return (
      <Tooltip content={label}>
        <span className="media-availability-cell" aria-label={label}>
          {available ? (
            <CheckCircleIcon
              className={`h-4 w-4 ${
                partial ? 'text-emerald-600' : 'text-green-400'
              }`}
              aria-hidden
            />
          ) : (
            <XCircleIcon className="h-4 w-4 text-red-400" aria-hidden />
          )}
        </span>
      </Tooltip>
    );
  };

  return (
    <div className="mt-[5px] grid min-w-0 gap-2 sm:grid-cols-2">
      <section className="app-card-inset refreshed-inset-surface min-w-[12rem] rounded-lg border border-gray-700 p-2">
        <div className="media-inset-table-heading media-scroll-grid-header request-divider-dark request-season-grid grid items-center gap-x-2 border-b ps-1 pb-2">
          <SelectionCircle
            selected={allSeasonsSelected}
            disabled={selectableSeasons.length === 0}
            label={intl.formatMessage(
              allSeasonsSelected
                ? messages.clearAllSeasons
                : messages.selectAllSeasons
            )}
            onClick={toggleAllSeasons}
          />
          <span className="text-start">
            {intl.formatMessage(messages.season)}
          </span>
          <span className="text-center">
            {intl.formatMessage(messages.episodes)}
          </span>
          <AvailabilityHeading />
        </div>
        <div className="scrollable-card -me-2 max-h-[133px] space-y-0.5 overflow-y-auto pe-2 pt-1 pb-1">
          {seasons.map((season) => {
            const seasonSelection = selections.find(
              (selection) => selection.seasonNumber === season.seasonNumber
            );
            const selected =
              !!seasonSelection && seasonSelection.episodeNumbers === undefined;
            const partial = Boolean(seasonSelection?.episodeNumbers?.length);
            const disabled = disabledSeasons.includes(season.seasonNumber);
            const availableEpisodeCount =
              availableEpisodesBySeason[season.seasonNumber]?.length ?? 0;
            const available = availableEpisodeCount > 0;
            const partiallyAvailable =
              availableEpisodeCount > 0 &&
              availableEpisodeCount < season.episodeCount;
            return (
              <div
                key={season.seasonNumber}
                className={`selectable-table-row season-focus-row request-season-grid grid w-full items-center gap-x-2 rounded px-1 py-1 ${
                  activeSeason === season.seasonNumber ? 'bg-indigo-500/15' : ''
                }`}
                data-active={activeSeason === season.seasonNumber}
                data-selectable={!disabled}
                role={!disabled ? 'button' : undefined}
                tabIndex={!disabled ? 0 : undefined}
                aria-label={intl.formatMessage(messages.selectSeasonNumber, {
                  number: season.seasonNumber,
                })}
                onClick={(event) => {
                  selectFromRow(event, () => {
                    if (disabled) {
                      onActiveSeasonChange(season.seasonNumber);
                    } else {
                      toggleSeason(season.seasonNumber);
                    }
                  });
                }}
                onKeyDown={(event) => {
                  if (!disabled) {
                    selectFromRowKey(event, () =>
                      toggleSeason(season.seasonNumber)
                    );
                  }
                }}
              >
                <SelectionCircle
                  selected={selected}
                  partial={partial}
                  disabled={disabled}
                  label={
                    season.seasonNumber === 0
                      ? intl.formatMessage(
                          seasonSelection
                            ? messages.clearSpecials
                            : messages.selectSpecials
                        )
                      : intl.formatMessage(
                          seasonSelection
                            ? messages.clearSeasonNumber
                            : messages.selectSeasonNumber,
                          { number: season.seasonNumber }
                        )
                  }
                  onClick={() => toggleSeason(season.seasonNumber)}
                />
                <span className="truncate text-start text-xs font-medium text-gray-100">
                  {season.seasonNumber === 0
                    ? intl.formatMessage(messages.specials)
                    : intl.formatMessage(messages.seasonNumber, {
                        number: season.seasonNumber,
                      })}
                </span>
                <span className="refreshed-detail-text text-center text-xs">
                  {season.episodeCount}
                </span>
                <AvailabilityIcon
                  available={available}
                  partial={partiallyAvailable}
                />
              </div>
            );
          })}
        </div>
      </section>

      <section className="app-card-inset refreshed-inset-surface min-w-0 rounded-lg border border-gray-700 p-2">
        <div className="media-inset-table-heading media-scroll-grid-header request-divider-dark request-episode-grid grid items-center gap-x-2 border-b ps-1 pb-2">
          <SelectionCircle
            selected={allEpisodesSelected}
            disabled={activeSeason < 0 || episodeNumbers.length === 0}
            label={intl.formatMessage(
              allEpisodesSelected
                ? messages.clearAllEpisodes
                : messages.selectAllEpisodes
            )}
            onClick={toggleAllEpisodes}
          />
          <span className="text-start">
            {intl.formatMessage(messages.episode)}
          </span>
          <span className="text-start">
            {intl.formatMessage(messages.title)}
          </span>
          <AvailabilityHeading />
        </div>
        <div className="scrollable-card -me-2 max-h-[133px] space-y-0.5 overflow-y-auto pe-2 pt-1">
          {!data && !error && activeSeason >= 0 && (
            <div className="flex h-20 items-center justify-center">
              <LoadingSpinner />
            </div>
          )}
          {activeSeason < 0 && (
            <p className="refreshed-detail-text-muted px-1 py-2 text-xs">
              {intl.formatMessage(messages.selectSeason)}
            </p>
          )}
          {error && (
            <p className="px-1 py-2 text-xs text-red-300">
              {intl.formatMessage(messages.loadError)}
            </p>
          )}
          {data?.episodes.map((episode) => {
            const disabled = blockedEpisodes.includes(episode.episodeNumber);
            const available = (
              availableEpisodesBySeason[episode.seasonNumber] ?? []
            ).includes(episode.episodeNumber);
            const selected =
              !disabled &&
              !!activeSelection &&
              (activeSelection.episodeNumbers === undefined ||
                activeSelection.episodeNumbers.includes(episode.episodeNumber));
            return (
              <div
                key={episode.id}
                className={`selectable-table-row episode-focus-row request-episode-grid grid w-full items-center gap-x-2 rounded px-1 py-1 ${
                  activeEpisodeKey ===
                  `${episode.seasonNumber}:${episode.episodeNumber}`
                    ? 'bg-indigo-500/15'
                    : ''
                }`}
                data-active={
                  activeEpisodeKey ===
                  `${episode.seasonNumber}:${episode.episodeNumber}`
                }
                data-selectable={!disabled}
                role={!disabled ? 'button' : undefined}
                tabIndex={!disabled ? 0 : undefined}
                aria-label={intl.formatMessage(messages.selectEpisodeNumber, {
                  number: episode.episodeNumber,
                })}
                onClick={(event) => {
                  if (!disabled) {
                    selectFromRow(event, () =>
                      toggleEpisode(episode.episodeNumber)
                    );
                  }
                }}
                onKeyDown={(event) => {
                  if (!disabled) {
                    selectFromRowKey(event, () =>
                      toggleEpisode(episode.episodeNumber)
                    );
                  }
                }}
              >
                <SelectionCircle
                  selected={selected}
                  disabled={disabled}
                  label={intl.formatMessage(
                    selected
                      ? messages.clearEpisodeNumber
                      : messages.selectEpisodeNumber,
                    { number: episode.episodeNumber }
                  )}
                  onClick={() => toggleEpisode(episode.episodeNumber)}
                />
                <span className="text-xs font-medium text-gray-100">
                  {intl.formatMessage(messages.episodeNumber, {
                    number: episode.episodeNumber,
                  })}
                </span>
                <span className="refreshed-detail-text truncate text-xs">
                  {episode.name || intl.formatMessage(messages.untitled)}
                </span>
                <AvailabilityIcon available={available} />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default SeriesSeasonEpisodeSelector;
