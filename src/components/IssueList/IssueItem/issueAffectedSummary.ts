import defineMessages from '@app/utils/defineMessages';
import type { SeasonEpisodeSelection } from '@server/interfaces/api/seasonInterfaces';

export const issueAffectedSummaryMessages = defineMessages(
  'components.IssueList.IssueItem.affectedSummary',
  {
    allSeasons: 'All Seasons',
    noneSelected: 'None Selected',
    season: 'Season {seasonNumber}',
    specials: 'Specials',
    seasonCount: '{count, plural, one {# Season} other {# Seasons}}',
  }
);

type MessageKey = keyof typeof issueAffectedSummaryMessages;
type MessageValues = { count?: number; seasonNumber?: number };
type FormatSummaryMessage = (key: MessageKey, values?: MessageValues) => string;

type IssueSelectionState = {
  problemSeason: number;
  problemEpisode: number;
  problemEpisodes?: number[];
  problemEpisodeSelections?: SeasonEpisodeSelection[] | null;
};

const getSeasonLabel = (
  seasonNumber: number,
  formatMessage?: FormatSummaryMessage
): string => {
  if (seasonNumber === 0) {
    return formatMessage?.('specials') ?? 'Specials';
  }
  return (
    formatMessage?.('season', { seasonNumber }) ?? `Season ${seasonNumber}`
  );
};

export const getIssueAffectedSummary = (
  issue: IssueSelectionState,
  availableSeasonNumbers: number[],
  formatMessage?: FormatSummaryMessage
): string => {
  const selectedSeasonNumbers = [
    ...new Set(
      (issue.problemEpisodeSelections ?? []).map(
        (selection) => selection.seasonNumber
      )
    ),
  ];

  if (selectedSeasonNumbers.length > 0) {
    const available = new Set(availableSeasonNumbers);
    const allSeasonsSelected =
      available.size > 0 &&
      available.size === selectedSeasonNumbers.length &&
      selectedSeasonNumbers.every((seasonNumber) =>
        available.has(seasonNumber)
      );

    if (allSeasonsSelected) {
      return formatMessage?.('allSeasons') ?? 'All Seasons';
    }
    if (selectedSeasonNumbers.length === 1) {
      return getSeasonLabel(selectedSeasonNumbers[0], formatMessage);
    }
    return (
      formatMessage?.('seasonCount', { count: selectedSeasonNumbers.length }) ??
      `${selectedSeasonNumbers.length} Seasons`
    );
  }

  if (issue.problemSeason > 0 || issue.problemEpisodes?.length) {
    return getSeasonLabel(issue.problemSeason, formatMessage);
  }

  const legacyEntireSeriesIssue =
    issue.problemSeason === 0 &&
    issue.problemEpisode === 0 &&
    !issue.problemEpisodes?.length &&
    issue.problemEpisodeSelections == null;

  return legacyEntireSeriesIssue
    ? (formatMessage?.('allSeasons') ?? 'All Seasons')
    : (formatMessage?.('noneSelected') ?? 'None Selected');
};
