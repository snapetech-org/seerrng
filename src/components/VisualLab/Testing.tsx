import Button from '@app/components/Common/Button';
import { PageStatus } from '@app/components/Common/LoadingSpinner';
import PageErrorMessage from '@app/components/Common/PageErrorMessage';
import PageTitle from '@app/components/Common/PageTitle';
import SeasonEpisodeTree, {
  formatTreeNumber,
} from '@app/components/MediaDetails/SeasonEpisodeTree';
import TvDetails from '@app/components/TvDetails';
import usePlaybackCatalog from '@app/hooks/usePlaybackCatalog';
import useRouteGuard from '@app/hooks/useRouteGuard';
import useSettings from '@app/hooks/useSettings';
import { Permission, useUser } from '@app/hooks/useUser';
import useWatchStatus from '@app/hooks/useWatchStatus';
import defineMessages from '@app/utils/defineMessages';
import type {
  SeasonWithEpisodes,
  TvDetails as TvDetailsType,
} from '@server/models/Tv';
import axios from 'axios';
import Link from 'next/link';
import { useMemo, useState, type SyntheticEvent } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.VisualLab.Testing', {
  pageTitle: 'Series Testing Page',
  loadingDetails: 'Loading Series Details',
  seasonEpisodeLayout: 'Season And Episode Layout',
  showLayout: 'Show season and episode layout {number}.',
  page: 'Page {number}',
  episodesErrorTitle: 'Episodes Could Not Be Loaded',
  episodesErrorDescription:
    'Episode information could not be fetched, please try again.',
  retryEpisodes: 'Fetch the seasons and episodes again.',
  seriesErrorTitle: 'Series Details Could Not Be Loaded',
  seriesErrorDescription:
    'Series details could not be fetched, please try again.',
  retrySeries: 'Fetch the series details again.',
  specials: 'Specials',
  season: 'Season {number}',
  untitled: 'Untitled',
});

const visualLabMessages = defineMessages('components.VisualLab', {
  title: 'Visual Lab',
});

const seriesId = 113962;
const pages = [1, 6] as const;

// Stop ordinary card actions before their handlers or links execute.
// The tree updates local state only; metadata reads retain the real card.
const guardCardAction = (event: SyntheticEvent) => {
  if (
    event.type === 'keydown' &&
    'key' in event &&
    event.key !== 'Enter' &&
    event.key !== ' '
  )
    return;
  const target = event.target;
  if (target instanceof Element && target.closest('[data-selection-tree]'))
    return;
  event.preventDefault();
  event.stopPropagation();
};

export default function Testing() {
  const intl = useIntl();
  useRouteGuard(Permission.ADMIN);
  const { hasPermission } = useUser();
  const authorized = hasPermission(Permission.ADMIN);
  const settings = useSettings();
  const [page, setPage] = useState<(typeof pages)[number]>(1);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const { data, error, isValidating, mutate } = useSWR<TvDetailsType>(
    authorized ? `/api/v1/tv/${seriesId}` : null,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
  const seasons = useMemo(
    () =>
      data?.seasons.filter(
        (season) =>
          season.episodeCount > 0 &&
          (settings.currentSettings.enableSpecialEpisodes ||
            season.seasonNumber !== 0)
      ) ?? [],
    [data, settings.currentSettings.enableSpecialEpisodes]
  );
  const {
    data: episodeData,
    error: episodeError,
    isValidating: episodesLoading,
    mutate: reloadEpisodes,
  } = useSWR<SeasonWithEpisodes[]>(
    authorized && seasons.length
      ? [
          'series-season-metadata',
          seriesId,
          ...seasons.map((season) => season.seasonNumber),
        ]
      : null,
    async () =>
      Promise.all(
        seasons.map(
          async (season) =>
            (
              await axios.get<SeasonWithEpisodes>(
                `/api/v1/tv/${seriesId}/season/${season.seasonNumber}`
              )
            ).data
        )
      ),
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
  const { data: catalog, isValidating: catalogLoading } = usePlaybackCatalog(
    authorized ? data?.mediaInfo?.id : undefined
  );
  const { data: watched, isValidating: watchedLoading } = useWatchStatus(
    'tv',
    seriesId,
    authorized && Boolean(data?.mediaInfo),
    true
  );
  const treeSeasons = useMemo(
    () =>
      seasons.map((season) => {
        const available = new Set(
          catalog?.groups
            .find((group) => group.index === season.seasonNumber)
            ?.items.map((item) => item.index) ?? []
        );
        const watchedSeason = watched?.seasons?.find(
          (item) => item.seasonNumber === season.seasonNumber
        );
        return {
          seasonNumber: season.seasonNumber,
          name:
            season.seasonNumber === 0
              ? intl.formatMessage(messages.specials)
              : intl.formatMessage(messages.season, {
                  number: formatTreeNumber(season.seasonNumber),
                }),
          episodes: (
            episodeData?.find(
              (item) => item.seasonNumber === season.seasonNumber
            )?.episodes ?? []
          ).map((episode) => ({
            id: episode.id,
            episodeNumber: episode.episodeNumber,
            name: episode.name || intl.formatMessage(messages.untitled),
            releaseDate: episode.airDate || undefined,
            available: available.has(episode.episodeNumber),
            watched: watchedSeason?.episodes.find(
              (item) => item.episodeNumber === episode.episodeNumber
            )?.watched,
          })),
        };
      }),
    [seasons, catalog, watched, episodeData, intl]
  );

  if (!authorized) return null;

  const tree = (
    <div
      className="card-list"
      data-list-layout="stacked"
      data-list-width="two-thirds"
      data-selection-tree
    >
      {episodeError ? (
        <PageErrorMessage
          title={intl.formatMessage(messages.episodesErrorTitle)}
          description={intl.formatMessage(messages.episodesErrorDescription)}
          retry={{
            onClick: () => reloadEpisodes(),
            tooltip: intl.formatMessage(messages.retryEpisodes),
            busy: episodesLoading,
          }}
        />
      ) : episodeData || seasons.length === 0 ? (
        <SeasonEpisodeTree
          layout={page}
          seasons={treeSeasons}
          mediaServerType={watched?.serverType}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
        />
      ) : null}
    </div>
  );

  return (
    <>
      <PageTitle title={intl.formatMessage(messages.pageTitle)} />
      <div className="page-title-row">
        <h1 className="page-title">{intl.formatMessage(messages.pageTitle)}</h1>
        <PageStatus
          active={
            isValidating || episodesLoading || catalogLoading || watchedLoading
          }
          label={intl.formatMessage(messages.loadingDetails)}
        />
      </div>
      <nav
        className="app-filter-row"
        aria-label={intl.formatMessage(messages.seasonEpisodeLayout)}
      >
        <Link
          href="/visual-lab"
          className="app-button app-button-default button-standard"
        >
          {intl.formatMessage(visualLabMessages.title)}
        </Link>
        {pages.map((number) => (
          <Button
            key={number}
            className={`app-filter-button ${page === number ? 'app-filter-button-active' : 'app-filter-button-idle'}`}
            aria-pressed={page === number}
            title={intl.formatMessage(messages.showLayout, { number })}
            onClick={() => setPage(number)}
          >
            {intl.formatMessage(messages.page, { number })}
          </Button>
        ))}
      </nav>
      {error && !data && (
        <PageErrorMessage
          title={intl.formatMessage(messages.seriesErrorTitle)}
          description={intl.formatMessage(messages.seriesErrorDescription)}
          retry={{
            onClick: () => mutate(),
            tooltip: intl.formatMessage(messages.retrySeries),
            busy: isValidating,
          }}
        />
      )}
      {data && (
        <div
          className="card-spacing-before"
          onClickCapture={guardCardAction}
          onAuxClickCapture={guardCardAction}
          onDoubleClickCapture={guardCardAction}
          onKeyDownCapture={guardCardAction}
          onSubmitCapture={guardCardAction}
          onDragStartCapture={guardCardAction}
        >
          <TvDetails
            tv={data}
            seasonBrowser={tree}
            showRelated={false}
            collapseInformation
            showOverview={false}
            showInformationControls={false}
            showPageTitle={false}
            embedded
            additionalLoading={
              episodesLoading || catalogLoading || watchedLoading
            }
          />
        </div>
      )}
    </>
  );
}
