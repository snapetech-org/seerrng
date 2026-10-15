import Button from '@app/components/Common/Button';
import MediaServerIcon, {
  getMediaServerName,
} from '@app/components/Common/MediaServerIcon';
import SelectionCircle, {
  SelectionCircleIndicator,
} from '@app/components/Common/SelectionCircle';
import Tooltip from '@app/components/Common/Tooltip';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import {
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MinusIcon,
  NoSymbolIcon,
  PlusIcon,
  ServerStackIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { CheckIcon } from '@heroicons/react/24/solid';
import type { WatchStatusResponse } from '@server/models/WatchStatus';
import { useId, useState, type ReactNode } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.MediaDetails.SeasonEpisodeTree', {
  available: 'available',
  requestable: 'requestable',
  select: 'Select',
  deselect: 'Deselect',
  noSeasonEpisodesAvailable:
    'No episodes in this season are available for selection.',
  selectSeasonEpisodes:
    'Select every {selectionDescription} episode in {seasonName}.',
  deselectSeasonEpisodes:
    'Deselect every {selectionDescription} episode in {seasonName}.',
  seasonSelectionLabel:
    '{action} {selectionDescription} episodes in {seasonName}',
  selectionCount: '{selectedCount} of {episodeCount} episodes selected',
  hideSeasonEpisodes: 'Hide the episodes in {seasonName}. {countDescription}.',
  showSeasonEpisodes: 'Show the episodes in {seasonName}. {countDescription}.',
  expandSeason: 'Expand {seasonName}',
  collapseSeason: 'Collapse {seasonName}',
  episodeListLabel: '{seasonName} episodes',
  selectEpisode: 'Select {episodeName}.',
  deselectEpisode: 'Deselect {episodeName}.',
  episodeSelectionLabel: '{action} episode {episodeNumber}: {episodeName}',
  episodeUnavailableForRequest:
    'This episode is already available or requested and cannot be selected.',
  episodeUnavailableForPlayback:
    'This episode is not available in the library and cannot be selected.',
  releaseDateUnavailable: 'The release date is not available for this episode.',
  releaseDateTooltip: 'Release date: {date}.',
  releaseDateLabel: 'Release date: {date}',
  availableInLibrary: 'Available in the library.',
  unavailableInLibrary: 'Not available in the library.',
  watchStatusUnavailable: 'Watch status is not available for this episode.',
  episodeWatched: 'This episode has been watched.',
  episodeNotWatched: 'This episode has not been watched.',
  watchStatusNotAvailable: 'Watch Status Not Available',
  watched: 'Watched',
  unwatched: 'Unwatched',
  noEpisodesAvailable: 'No episodes are available for selection.',
  selectEveryEpisode:
    'Select every {selectionDescription} episode across all seasons, including collapsed seasons.',
  deselectEveryEpisode:
    'Deselect every {selectionDescription} episode across all seasons, including collapsed seasons.',
  selectAllEpisodes: 'Select all {selectionDescription} episodes',
  deselectAllEpisodes: 'Deselect all {selectionDescription} episodes',
  episodeNumberTooltip: 'The episode number within this season.',
  episodeTitleTooltip:
    'The episode title. Hover a shortened title to read it in full.',
  releaseDateColumnTooltip:
    "The episode's original release date, including the abbreviated day of the week. A dash means the date is not available.",
  availabilityTooltip:
    'Episode availability in the media library: a green check means available; a red cross means unavailable.',
  watchStatusTooltip:
    'Watch status on {mediaServer}: a check means watched, a short dash means unwatched, and a question mark means the status is unknown.',
  mediaServer: 'media server',
  episodeNumber: 'Episode Number',
  title: 'Title',
  releaseDate: 'Release Date',
  availability: 'Availability',
  mediaServerWatchStatus: 'Media Server Watch Status',
  chooseStartingEpisode: 'Choose one starting episode',
  seasonsAndEpisodes: 'Seasons and episodes',
  showEverySeason: 'Show the episodes for every season.',
  hideEverySeason:
    'Hide the episodes for every season without changing the selection.',
  clearSelection:
    'Deselect every episode without changing the expanded seasons.',
  expandAll: 'Expand All',
  collapseAll: 'Collapse All',
  clearSelectionAction: 'Clear Selection',
  selected: 'Selected:',
});

export interface TreeEpisode {
  id: number;
  episodeNumber: number;
  name: string;
  available: boolean;
  // Request selection is independent of library availability.
  selectable?: boolean;
  watched?: boolean;
  releaseDate?: string;
}

export interface TreeSeason {
  seasonNumber: number;
  name: string;
  episodeCount?: number;
  episodes: TreeEpisode[];
}

export interface SeasonEpisodeTreeProps {
  layout: 1 | 6;
  seasons: TreeSeason[];
  selectedIds: number[];
  onSelectionChange: (ids: number[]) => void;
  mediaServerType?: WatchStatusResponse['serverType'];
  feedback?: ReactNode;
  selectionPurpose?: 'playback' | 'request';
  selectionMode?: 'multiple' | 'single-episode';
  disabled?: boolean;
}

export const isTreeEpisodeSelectable = (episode: TreeEpisode) =>
  episode.selectable ?? episode.available;

export const formatTreeNumber = (number: number) =>
  String(number).padStart(2, '0');

export const seasonSelection = (season: TreeSeason, selectedIds: number[]) => {
  const available = season.episodes.filter(isTreeEpisodeSelectable);
  const selected = available.filter((episode) =>
    selectedIds.includes(episode.id)
  );
  return {
    disabled: available.length === 0,
    selected: available.length > 0 && selected.length === available.length,
    partial: selected.length > 0 && selected.length < available.length,
    count: selected.length,
  };
};

export const toggleSeasonSelection = (
  season: TreeSeason,
  selectedIds: number[]
) => {
  const ids = season.episodes
    .filter(isTreeEpisodeSelectable)
    .map((episode) => episode.id);
  const allSelected =
    ids.length > 0 && ids.every((id) => selectedIds.includes(id));
  return allSelected
    ? selectedIds.filter((id) => !ids.includes(id))
    : [...new Set([...selectedIds, ...ids])];
};

const layouts = {
  1: 'outline',
  6: 'amber-tree',
} as const;

const SeasonEpisodeTree = ({
  layout,
  seasons,
  selectedIds,
  onSelectionChange,
  mediaServerType,
  feedback,
  selectionPurpose = 'playback',
  selectionMode = 'multiple',
  disabled = false,
}: SeasonEpisodeTreeProps) => {
  const intl = useIntl();
  const instanceId = useId();
  const [expanded, setExpanded] = useState<number[]>([]);
  const isExpanded = (season: TreeSeason) =>
    expanded.includes(season.seasonNumber);
  const panelId = (season: TreeSeason) =>
    `${instanceId}-season-${season.seasonNumber}`;
  const availableIds = new Set(
    seasons.flatMap((season) =>
      season.episodes
        .filter(isTreeEpisodeSelectable)
        .map((episode) => episode.id)
    )
  );
  const selectedCount = [...availableIds].filter((id) =>
    selectedIds.includes(id)
  ).length;
  const allSelected =
    availableIds.size > 0 && selectedCount === availableIds.size;
  const toggleAll = () =>
    onSelectionChange(
      allSelected
        ? selectedIds.filter((id) => !availableIds.has(id))
        : [...new Set([...selectedIds, ...availableIds])]
    );
  const toggleExpanded = (season: TreeSeason) => {
    setExpanded((current) =>
      current.includes(season.seasonNumber)
        ? current.filter((number) => number !== season.seasonNumber)
        : [...current, season.seasonNumber]
    );
  };
  const toggleEpisode = (episode: TreeEpisode) => {
    if (!isTreeEpisodeSelectable(episode)) return;
    onSelectionChange(
      selectionMode === 'single-episode'
        ? selectedIds.includes(episode.id)
          ? []
          : [episode.id]
        : selectedIds.includes(episode.id)
          ? selectedIds.filter((id) => id !== episode.id)
          : [...selectedIds, episode.id]
    );
  };
  const selectionDescription = intl.formatMessage(
    selectionPurpose === 'request' ? messages.requestable : messages.available
  );
  const formatReleaseDate = (releaseDate?: string) => {
    if (!releaseDate) return '—';
    // Metadata dates are calendar dates, not local-time instants. Keep the day
    // intact while formatting in the user's app locale.
    const date = new Date(`${releaseDate}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) return '—';
    return intl.formatDate(date, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  };

  const seasonControls = (season: TreeSeason) => {
    const state = seasonSelection(season, selectedIds);
    const open = isExpanded(season);
    const selection =
      selectionMode === 'single-episode' ? (
        <span data-tree-part="selection" aria-hidden="true" />
      ) : (
        <Tooltip
          content={
            state.disabled
              ? intl.formatMessage(messages.noSeasonEpisodesAvailable)
              : intl.formatMessage(
                  state.selected
                    ? messages.deselectSeasonEpisodes
                    : messages.selectSeasonEpisodes,
                  { selectionDescription, seasonName: season.name }
                )
          }
        >
          <span data-tree-part="selection">
            <SelectionCircle
              selected={state.selected}
              partial={state.partial}
              disabled={disabled || state.disabled}
              label={intl.formatMessage(messages.seasonSelectionLabel, {
                action: intl.formatMessage(
                  state.selected ? messages.deselect : messages.select
                ),
                selectionDescription,
                seasonName: season.name,
              })}
              onClick={() =>
                onSelectionChange(toggleSeasonSelection(season, selectedIds))
              }
            />
          </span>
        </Tooltip>
      );
    const episodeCount = season.episodeCount ?? season.episodes.length;
    const countDescription = intl.formatMessage(messages.selectionCount, {
      selectedCount: state.count,
      episodeCount,
    });
    const expanderIcon =
      layout === 6 ? null : open ? (
        <ChevronDownIcon aria-hidden />
      ) : (
        <ChevronRightIcon aria-hidden />
      );
    return (
      <>
        {selection}
        <Button
          data-tree-part="disclosure"
          aria-label={intl.formatMessage(
            open ? messages.collapseSeason : messages.expandSeason,
            { seasonName: season.name }
          )}
          aria-description={countDescription}
          aria-expanded={open}
          aria-controls={panelId(season)}
          title={intl.formatMessage(
            open ? messages.hideSeasonEpisodes : messages.showSeasonEpisodes,
            { seasonName: season.name, countDescription }
          )}
          onClick={() => toggleExpanded(season)}
        >
          {expanderIcon}
          <span data-tree-part="season-label">
            <span data-tree-part="name">{season.name}:</span>
            <span data-tree-part="count-separator" aria-hidden="true">
              {'  '}
            </span>
            <span
              data-tree-part="count"
              data-selection-state={
                state.count === 0
                  ? 'none'
                  : state.count === episodeCount
                    ? 'full'
                    : 'partial'
              }
              title={countDescription}
              aria-label={countDescription}
            >
              {formatTreeNumber(state.count)}/{formatTreeNumber(episodeCount)}
            </span>
          </span>
        </Button>
      </>
    );
  };

  const episodeContent = (episode: TreeEpisode) => (
    <>
      <Tooltip
        content={
          isTreeEpisodeSelectable(episode)
            ? intl.formatMessage(
                selectedIds.includes(episode.id)
                  ? messages.deselectEpisode
                  : messages.selectEpisode,
                { episodeName: episode.name }
              )
            : intl.formatMessage(
                selectionPurpose === 'request'
                  ? messages.episodeUnavailableForRequest
                  : messages.episodeUnavailableForPlayback
              )
        }
      >
        <button
          type="button"
          data-tree-part="episode-selection"
          disabled={disabled || !isTreeEpisodeSelectable(episode)}
          aria-label={intl.formatMessage(messages.episodeSelectionLabel, {
            action: intl.formatMessage(
              selectedIds.includes(episode.id)
                ? messages.deselect
                : messages.select
            ),
            episodeNumber: episode.episodeNumber,
            episodeName: episode.name,
          })}
          aria-pressed={
            selectedIds.includes(episode.id) && isTreeEpisodeSelectable(episode)
          }
          onClick={() => toggleEpisode(episode)}
        >
          <span data-tree-part="selection">
            <SelectionCircleIndicator
              selected={
                selectedIds.includes(episode.id) &&
                isTreeEpisodeSelectable(episode)
              }
              disabled={disabled || !isTreeEpisodeSelectable(episode)}
            />
          </span>
          <span data-tree-part="number">
            {formatTreeNumber(episode.episodeNumber)}
          </span>
          <span data-tree-part="name" title={episode.name}>
            {episode.name}
          </span>
        </button>
      </Tooltip>
      <Tooltip
        content={
          formatReleaseDate(episode.releaseDate) === '—'
            ? intl.formatMessage(messages.releaseDateUnavailable)
            : intl.formatMessage(messages.releaseDateTooltip, {
                date: formatReleaseDate(episode.releaseDate),
              })
        }
      >
        <time
          data-tree-part="release-date"
          dateTime={
            formatReleaseDate(episode.releaseDate) === '—'
              ? undefined
              : episode.releaseDate
          }
          aria-label={intl.formatMessage(messages.releaseDateLabel, {
            date: formatReleaseDate(episode.releaseDate),
          })}
        >
          {formatReleaseDate(episode.releaseDate)}
        </time>
      </Tooltip>
      <Tooltip
        content={intl.formatMessage(
          episode.available
            ? messages.availableInLibrary
            : messages.unavailableInLibrary
        )}
      >
        <span
          className="media-availability-cell"
          data-tree-part="availability"
          data-availability={episode.available ? 'full' : 'missing'}
          aria-label={intl.formatMessage(
            episode.available
              ? globalMessages.available
              : globalMessages.notavailable
          )}
        >
          {episode.available ? (
            <CheckCircleIcon className="card-table-icon" aria-hidden />
          ) : (
            <XCircleIcon className="card-table-icon" aria-hidden />
          )}
        </span>
      </Tooltip>
      <Tooltip
        content={intl.formatMessage(
          episode.watched === undefined
            ? messages.watchStatusUnavailable
            : episode.watched
              ? messages.episodeWatched
              : messages.episodeNotWatched
        )}
      >
        <span
          className="watched-status-cell"
          data-tree-part="watched"
          aria-label={intl.formatMessage(
            episode.watched === undefined
              ? messages.watchStatusNotAvailable
              : episode.watched
                ? messages.watched
                : messages.unwatched
          )}
        >
          {episode.watched === undefined ? (
            '?'
          ) : episode.watched ? (
            <CheckIcon className="watched-status-icon" aria-hidden="true" />
          ) : (
            '–'
          )}
        </span>
      </Tooltip>
    </>
  );

  const columnHeadings = () => (
    <div className="card-table" data-tree-part="column-headings">
      {selectionMode === 'single-episode' ? (
        <span data-tree-part="select-all" aria-hidden="true" />
      ) : (
        <Tooltip
          content={
            availableIds.size === 0
              ? intl.formatMessage(messages.noEpisodesAvailable)
              : intl.formatMessage(
                  allSelected
                    ? messages.deselectEveryEpisode
                    : messages.selectEveryEpisode,
                  { selectionDescription }
                )
          }
        >
          <span data-tree-part="select-all">
            <SelectionCircle
              selected={allSelected}
              partial={selectedCount > 0 && !allSelected}
              disabled={disabled || availableIds.size === 0}
              label={intl.formatMessage(
                allSelected
                  ? messages.deselectAllEpisodes
                  : messages.selectAllEpisodes,
                { selectionDescription }
              )}
              onClick={toggleAll}
            />
          </span>
        </Tooltip>
      )}
      <Tooltip content={intl.formatMessage(messages.episodeNumberTooltip)}>
        <span
          className="card-table-heading"
          data-tree-part="number-heading"
          aria-label={intl.formatMessage(messages.episodeNumber)}
        >
          #
        </span>
      </Tooltip>
      <Tooltip content={intl.formatMessage(messages.episodeTitleTooltip)}>
        <span className="card-table-heading">
          {intl.formatMessage(messages.title)}
        </span>
      </Tooltip>
      <Tooltip content={intl.formatMessage(messages.releaseDateColumnTooltip)}>
        <span className="card-table-heading">
          {intl.formatMessage(messages.releaseDate)}
        </span>
      </Tooltip>
      <Tooltip content={intl.formatMessage(messages.availabilityTooltip)}>
        <span
          className="media-availability-cell"
          aria-label={intl.formatMessage(messages.availability)}
        >
          <ServerStackIcon className="card-table-icon" aria-hidden />
        </span>
      </Tooltip>
      <Tooltip
        content={intl.formatMessage(messages.watchStatusTooltip, {
          mediaServer:
            (mediaServerType !== undefined
              ? getMediaServerName(mediaServerType)
              : undefined) ?? intl.formatMessage(messages.mediaServer),
        })}
      >
        <span
          className="watched-status-cell"
          aria-label={intl.formatMessage(messages.mediaServerWatchStatus)}
        >
          {mediaServerType !== undefined ? (
            <MediaServerIcon
              mediaServerType={mediaServerType}
              className="watched-status-logo"
            />
          ) : (
            '—'
          )}
        </span>
      </Tooltip>
    </div>
  );

  const episodes = (season: TreeSeason) => (
    <ul
      id={panelId(season)}
      data-tree-part="episodes"
      hidden={!isExpanded(season)}
      aria-label={intl.formatMessage(messages.episodeListLabel, {
        seasonName: season.name,
      })}
    >
      {season.episodes.map((episode) => (
        <li
          key={episode.id}
          className="card-table episode-focus-row"
          data-tree-part="episode"
          data-selected={
            selectedIds.includes(episode.id) && isTreeEpisodeSelectable(episode)
          }
          data-active={
            selectedIds.includes(episode.id) && isTreeEpisodeSelectable(episode)
          }
        >
          {episodeContent(episode)}
        </li>
      ))}
    </ul>
  );

  return (
    <section
      className="selection-tree card-layout"
      data-tree-layout={layouts[layout]}
      data-selection-mode={selectionMode}
      aria-label={intl.formatMessage(
        selectionMode === 'single-episode'
          ? messages.chooseStartingEpisode
          : messages.seasonsAndEpisodes
      )}
    >
      <div
        className="app-card-inset card-layout refreshed-inset-surface"
        data-tree-part="frame"
        data-card-layout="scroll"
      >
        <div data-tree-part="toolbar">
          <div className="app-action-row" data-tree-part="actions">
            <Button
              buttonType="prowlarr"
              title={intl.formatMessage(messages.showEverySeason)}
              onClick={() =>
                setExpanded(seasons.map((season) => season.seasonNumber))
              }
            >
              <PlusIcon className="app-action-icon" aria-hidden="true" />
              {intl.formatMessage(messages.expandAll)}
            </Button>
            <Button
              buttonType="prowlarr"
              title={intl.formatMessage(messages.hideEverySeason)}
              onClick={() => setExpanded([])}
            >
              <MinusIcon className="app-action-icon" aria-hidden="true" />
              {intl.formatMessage(messages.collapseAll)}
            </Button>
            <Button
              buttonType="prowlarr"
              disabled={disabled || selectedCount === 0}
              title={intl.formatMessage(messages.clearSelection)}
              onClick={() => onSelectionChange([])}
            >
              <NoSymbolIcon className="app-action-icon" aria-hidden="true" />
              {intl.formatMessage(messages.clearSelectionAction)}
            </Button>
          </div>
          <dl className="card-table" data-tree-part="selection-summary">
            <dt className="card-table-heading">
              {intl.formatMessage(messages.selected)}
            </dt>
            <dd className="card-table-value" data-tree-part="selected-total">
              {formatTreeNumber(selectedCount)}
            </dd>
          </dl>
        </div>
        <div data-card-part="body" data-table-layout="selection-table">
          {columnHeadings()}
          {feedback}
          <div
            className="scrollable-card"
            data-tree-part="viewport"
            data-scroll-layout="tree"
          >
            {layout === 1 && (
              <ul data-tree-part="branches">
                {seasons.map((season) => (
                  <li key={season.seasonNumber}>
                    <div className="card-table" data-tree-part="season">
                      {seasonControls(season)}
                    </div>
                    {episodes(season)}
                  </li>
                ))}
              </ul>
            )}
            {layout !== 1 && (
              <>
                <ul data-tree-part="menu">
                  {seasons.map((season) => (
                    <li
                      key={season.seasonNumber}
                      data-tree-part="branch"
                      data-expanded={isExpanded(season)}
                    >
                      <div className="card-table" data-tree-part="season">
                        {seasonControls(season)}
                      </div>
                      {episodes(season)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default SeasonEpisodeTree;
