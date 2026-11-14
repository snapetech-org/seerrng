import PageErrorMessage from '@app/components/Common/PageErrorMessage';
import SeasonEpisodeTree, {
  formatTreeNumber,
} from '@app/components/MediaDetails/SeasonEpisodeTree';
import persiusMessages from '@app/components/Persius/messages';
import { OptionalDisclosure } from '@app/components/Persius/Primitives';
import SeasonPicker from '@app/components/Persius/SeasonPicker';
import { usePersius } from '@app/components/Persius/usePersius';
import UpstreamSeasonPicker from '@app/components/RequestModal/UpstreamSeasonPicker';
import useUpstreamTheme from '@app/hooks/useUpstreamTheme';
import defineMessages from '@app/utils/defineMessages';
import {
  REQUEST_SEASON_BATCH_SIZE,
  type SeasonEpisodeSelection,
} from '@server/interfaces/api/seasonInterfaces';
import type { SeasonWithEpisodes, TvDetails } from '@server/models/Tv';
import axios from 'axios';
import { useEffect, useMemo, type ReactNode } from 'react';
import { useIntl } from 'react-intl';
import useSWR, { unstable_serialize, useSWRConfig } from 'swr';
import {
  buildRequestTreeData,
  firstSelectableRequestEpisodeId,
  hasCompleteRequestMetadata,
  requestSelectionToTreeIds,
  treeSelectionToRequests,
} from './requestTreeData';

const messages = defineMessages('components.RequestModal.RequestTree', {
  specials: 'Specials',
  seasonNumber: 'Season {number}',
  untitled: 'Untitled',
  loading: 'Loading Episodes',
  noSeasons: 'No Seasons Available',
  loadError: 'Episodes Could Not Be Loaded',
  loadErrorHint:
    'Your request selection is preserved. Load all season information before changing it.',
  partialQueueHint:
    'Choose a starting episode from a loaded season, or retry the seasons that failed to load.',
  retryTooltip:
    'Fetch the seasons and episodes again without changing your request selection.',
});

export interface RequestSeasonEpisodeTreeProps {
  tvId: number;
  viewerId?: number;
  metadataLocale?: string | null;
  seasons: TvDetails['seasons'];
  selections: SeasonEpisodeSelection[];
  onSelectionsChange: (selections: SeasonEpisodeSelection[]) => void;
  disabledSeasons?: number[];
  disabledEpisodes?: Record<number, number[]>;
  availableEpisodesBySeason?: Record<number, number[]>;
  selectionMode?: 'multiple' | 'single-episode';
  onLoadingChange?: (loading: boolean) => void;
  onReadyChange?: (ready: boolean) => void;
  afterSeasonSelection?: ReactNode;
}

const RequestSeasonEpisodeTree = ({
  tvId,
  viewerId,
  metadataLocale,
  seasons,
  selections,
  onSelectionsChange,
  disabledSeasons = [],
  disabledEpisodes = {},
  availableEpisodesBySeason = {},
  selectionMode = 'multiple',
  onLoadingChange,
  onReadyChange,
  afterSeasonSelection,
}: RequestSeasonEpisodeTreeProps) => {
  const intl = useIntl();
  const persius = usePersius();
  const upstream = useUpstreamTheme();
  const { cache } = useSWRConfig();
  const seasonNumbers = seasons.map((season) => season.seasonNumber);
  const key = seasons.length
    ? [
        'request-season-metadata',
        tvId,
        viewerId,
        metadataLocale,
        seasons.map(({ seasonNumber, episodeCount }) => [
          seasonNumber,
          episodeCount,
        ]),
      ]
    : null;
  const { data, error, isValidating, mutate } = useSWR<SeasonWithEpisodes[]>(
    key,
    async () => {
      const loaded: SeasonWithEpisodes[] = [
        ...(cache.get(unstable_serialize(key))?.data ?? []),
      ];
      const missing = seasonNumbers.filter(
        (number) => !loaded.some((season) => season.seasonNumber === number)
      );
      for (
        let start = 0;
        start < missing.length;
        start += REQUEST_SEASON_BATCH_SIZE
      ) {
        const batch = missing.slice(start, start + REQUEST_SEASON_BATCH_SIZE);
        try {
          const response = await axios.get<SeasonWithEpisodes[]>(
            `/api/v1/tv/${tvId}/seasons`,
            { params: { seasonNumbers: batch.join(',') } }
          );
          loaded.push(
            ...response.data.filter(
              (season) =>
                batch.includes(season.seasonNumber) &&
                Array.isArray(season.episodes) &&
                season.episodes.length > 0
            )
          );
        } catch {
          // Keep seasons from earlier batches and surface a retry on incomplete data.
          break;
        }
      }
      return loaded;
    },
    {
      revalidateOnFocus: false,
      revalidateIfStale: false,
      shouldRetryOnError: false,
      keepPreviousData: false,
    }
  );
  const complete = hasCompleteRequestMetadata(seasons, data) && !error;
  const treeData = useMemo(
    () =>
      buildRequestTreeData(
        seasons,
        data ?? [],
        disabledSeasons,
        disabledEpisodes,
        availableEpisodesBySeason,
        (number) =>
          number === 0
            ? intl.formatMessage(messages.specials)
            : intl.formatMessage(messages.seasonNumber, {
                number: upstream ? String(number) : formatTreeNumber(number),
              }),
        intl.formatMessage(messages.untitled)
      ),
    [
      seasons,
      data,
      disabledSeasons,
      disabledEpisodes,
      availableEpisodesBySeason,
      intl,
      upstream,
    ]
  );
  const selectedIds = requestSelectionToTreeIds(treeData, selections);
  const singleEpisodeId =
    selectionMode === 'single-episode'
      ? firstSelectableRequestEpisodeId(treeData, selectedIds)
      : undefined;
  const canChoose = complete || singleEpisodeId !== undefined;
  const hasSelectedStart =
    singleEpisodeId !== undefined &&
    selectedIds.includes(singleEpisodeId) &&
    selections.length === 1 &&
    selections[0].episodeNumbers?.length === 1;
  const ready = complete || hasSelectedStart;
  useEffect(() => {
    onLoadingChange?.(isValidating);
  }, [isValidating, onLoadingChange]);
  useEffect(() => {
    onReadyChange?.(ready);
  }, [ready, tvId, onReadyChange]);
  useEffect(
    () => () => {
      onLoadingChange?.(false);
      onReadyChange?.(false);
    },
    [onLoadingChange, onReadyChange]
  );
  const feedback =
    seasons.length === 0 ? (
      <PageErrorMessage
        title={intl.formatMessage(messages.noSeasons)}
        severity="empty"
      />
    ) : error || (!complete && data !== undefined && !isValidating) ? (
      <PageErrorMessage
        title={intl.formatMessage(messages.loadError)}
        description={intl.formatMessage(
          canChoose ? messages.partialQueueHint : messages.loadErrorHint
        )}
        retry={{
          onClick: () => mutate(),
          tooltip: intl.formatMessage(messages.retryTooltip),
          busy: isValidating,
        }}
      />
    ) : !complete ? (
      <PageErrorMessage
        title={intl.formatMessage(messages.loading)}
        severity="info"
      />
    ) : null;
  const renderedSelectedIds =
    selectionMode === 'multiple'
      ? selectedIds
      : singleEpisodeId !== undefined && ready
        ? [singleEpisodeId]
        : [];
  useEffect(() => {
    if (selectionMode !== 'single-episode' || !complete) return;

    const startingSelection =
      singleEpisodeId === undefined
        ? []
        : treeSelectionToRequests(treeData, [singleEpisodeId], [], true);
    if (JSON.stringify(selections) !== JSON.stringify(startingSelection)) {
      onSelectionsChange(startingSelection);
    }
  }, [
    onSelectionsChange,
    complete,
    selectionMode,
    selections,
    singleEpisodeId,
    treeData,
  ]);

  return (
    <div
      className="card-list"
      data-list-width="remaining"
      data-selection-tree
      aria-busy={isValidating}
    >
      {(persius || upstream) && selectionMode === 'multiple' && (
        <>
          {upstream ? (
            <UpstreamSeasonPicker
              seasons={treeData}
              selectedIds={renderedSelectedIds}
              disabled={!ready}
              disabledSeasons={disabledSeasons ?? []}
              onChange={(ids) => {
                if (ready)
                  onSelectionsChange(
                    treeSelectionToRequests(treeData, ids, selections)
                  );
              }}
            />
          ) : (
            <SeasonPicker
              seasons={treeData}
              selectedIds={renderedSelectedIds}
              disabled={!ready}
              onChange={(ids) => {
                if (ready)
                  onSelectionsChange(
                    treeSelectionToRequests(treeData, ids, selections)
                  );
              }}
            />
          )}
          {feedback}
          {afterSeasonSelection}
        </>
      )}
      {(!(persius || upstream) || selectionMode !== 'multiple') && feedback}
      <OptionalDisclosure
        enabled={(persius || upstream) && selectionMode === 'multiple'}
        label={intl.formatMessage(persiusMessages.episodeChoices)}
      >
        <SeasonEpisodeTree
          key={tvId}
          layout={1}
          selectionPurpose="request"
          disabled={!canChoose}
          seasons={treeData}
          selectedIds={renderedSelectedIds}
          selectionMode={selectionMode}
          onSelectionChange={(ids) => {
            if (canChoose) {
              onSelectionsChange(
                treeSelectionToRequests(
                  treeData,
                  ids,
                  selections,
                  selectionMode === 'single-episode'
                )
              );
            }
          }}
        />
      </OptionalDisclosure>
      {(!(persius || upstream) || selectionMode !== 'multiple') &&
        afterSeasonSelection}
    </div>
  );
};

export default RequestSeasonEpisodeTree;
