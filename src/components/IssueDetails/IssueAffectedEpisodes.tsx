import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import defineMessages from '@app/utils/defineMessages';
import type Issue from '@server/entity/Issue';
import type { SeasonEpisodeSelection } from '@server/interfaces/api/seasonInterfaces';
import type { SeasonWithEpisodes } from '@server/models/Tv';
import axios from 'axios';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages(
  'components.IssueDetails.IssueAffectedEpisodes',
  {
    heading: 'Affected Episodes',
    season: 'Season',
    episode: 'Episode',
    title: 'Title',
    seasonNumber: 'Season {seasonNumber}',
    episodeNumber: 'Episode {episodeNumber}',
    specials: 'Specials',
    allSeasons: 'All Seasons',
    all: 'All',
    entireSeries: 'Entire Series',
    loadError: 'Affected episodes could not be loaded',
    noneSelected: 'None Selected',
  }
);

interface IssueAffectedEpisodesProps {
  issue: Issue;
  tvId: number;
}

const getSelections = (issue: Issue): SeasonEpisodeSelection[] => {
  if (issue.problemEpisodeSelections?.length) {
    return issue.problemEpisodeSelections;
  }
  if (issue.problemSeason > 0 || issue.problemEpisodes?.length) {
    const episodes =
      issue.problemEpisodes && issue.problemEpisodes.length > 0
        ? issue.problemEpisodes
        : issue.problemEpisode > 0
          ? [issue.problemEpisode]
          : undefined;
    return [
      {
        seasonNumber: issue.problemSeason,
        ...(episodes ? { episodeNumbers: episodes } : {}),
      },
    ];
  }
  return [];
};

const isLegacyEntireSeriesIssue = (issue: Issue) =>
  !issue.problemEpisodeSelections?.length &&
  issue.problemSeason === 0 &&
  issue.problemEpisode === 0 &&
  !issue.problemEpisodes?.length;

const IssueAffectedEpisodes = ({ issue, tvId }: IssueAffectedEpisodesProps) => {
  const intl = useIntl();
  const selections = getSelections(issue);
  const seasonNumbers = selections.map((selection) => selection.seasonNumber);
  const { data, error } = useSWR<SeasonWithEpisodes[]>(
    seasonNumbers.length > 0
      ? `issue-affected-seasons:${tvId}:${seasonNumbers.join(',')}`
      : null,
    async () =>
      Promise.all(
        seasonNumbers.map(async (seasonNumber) => {
          const response = await axios.get<SeasonWithEpisodes>(
            `/api/v1/tv/${tvId}/season/${seasonNumber}`
          );
          return response.data;
        })
      )
  );
  const rows = data
    ? selections.flatMap((selection) => {
        const season = data.find(
          (item) => item.seasonNumber === selection.seasonNumber
        );
        const episodes = selection.episodeNumbers
          ? (season?.episodes.filter((episode) =>
              selection.episodeNumbers?.includes(episode.episodeNumber)
            ) ?? [])
          : (season?.episodes ?? []);
        return episodes.map((episode) => ({
          seasonNumber: selection.seasonNumber,
          episodeNumber: episode.episodeNumber,
          title: episode.name,
        }));
      })
    : [];
  const legacyEntireSeries = isLegacyEntireSeriesIssue(issue);

  return (
    <section className="app-card-inset refreshed-inset-surface card-spacing-before rounded-lg border border-gray-700 p-3">
      <h4 className="mb-2 text-xs font-semibold text-gray-200">
        {intl.formatMessage(messages.heading)}
      </h4>
      <div className="request-divider-dark grid grid-cols-[7rem_7rem_minmax(0,1fr)] gap-x-3 border-b px-1 pb-2 text-xs font-semibold text-gray-200">
        <span>{intl.formatMessage(messages.season)}</span>
        <span>{intl.formatMessage(messages.episode)}</span>
        <span>{intl.formatMessage(messages.title)}</span>
      </div>
      {!data && !error && selections.length > 0 ? (
        <div className="flex h-16 items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="scrollable-card -mr-3 max-h-56 overflow-y-auto pr-3">
          {legacyEntireSeries ? (
            <div className="grid min-h-7 grid-cols-[7rem_7rem_minmax(0,1fr)] items-center gap-x-3 px-1 text-xs">
              <span className="font-medium text-gray-200">
                {intl.formatMessage(messages.allSeasons)}
              </span>
              <span className="refreshed-detail-text">
                {intl.formatMessage(messages.all)}
              </span>
              <span className="refreshed-detail-text">
                {intl.formatMessage(messages.entireSeries)}
              </span>
            </div>
          ) : error ? (
            <div className="px-1 py-2 text-xs text-red-300">
              {intl.formatMessage(messages.loadError)}
            </div>
          ) : rows.length > 0 ? (
            rows.map((row, index) => (
              <div
                key={`${row.seasonNumber}-${row.episodeNumber}-${index}`}
                className="grid min-h-7 grid-cols-[7rem_7rem_minmax(0,1fr)] items-center gap-x-3 px-1 text-xs"
              >
                <span className="font-medium text-gray-200">
                  {row.seasonNumber === 0
                    ? intl.formatMessage(messages.specials)
                    : intl.formatMessage(messages.seasonNumber, {
                        seasonNumber: row.seasonNumber,
                      })}
                </span>
                <span className="refreshed-detail-text">
                  {intl.formatMessage(messages.episodeNumber, {
                    episodeNumber: row.episodeNumber,
                  })}
                </span>
                <span className="refreshed-detail-text truncate">
                  {row.title ||
                    intl.formatMessage(messages.episodeNumber, {
                      episodeNumber: row.episodeNumber,
                    })}
                </span>
              </div>
            ))
          ) : (
            <div className="refreshed-detail-text-muted px-1 py-2 text-xs">
              {intl.formatMessage(messages.noneSelected)}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default IssueAffectedEpisodes;
