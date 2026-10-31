import Button from '@app/components/Common/Button';
import { createBrowserActionId } from '@app/utils/browserActionId';
import defineMessages from '@app/utils/defineMessages';
import type { PersonalLibraryItem } from '@server/lib/discoveryIntegrations/library';
import type { TrackingIntent } from '@server/lib/discoveryIntegrations/tracking';
import type { SeasonWithEpisodes, TvDetails } from '@server/models/Tv';
import axios from 'axios';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const EMPTY_EPISODES: SeasonWithEpisodes['episodes'] = [];

const messages = defineMessages('components.TrackingControls', {
  seasonNumber: 'Season {number, number}',
  episodeNumber: 'Episode {number, number}',
  consent: 'Enable tracking updates in Linked Accounts',
  watched: 'Mark watched',
  unwatched: 'Mark unwatched',
  rating: 'Your rating',
  saveRating: 'Save rating',
  clear: 'Remove rating',
  progress: 'Episodes watched',
  saveProgress: 'Save progress',
  choose: 'Choose a rating',
  wholeSeries: 'This updates watched status for the full series.',
  removeWatched:
    'This clears the title’s watched status from your provider account.',
  confirm: 'Confirm',
  cancel: 'Cancel',
  failed:
    'The action could not be confirmed. Check your provider account before trying again.',
  uncertain:
    'The provider outcome is uncertain. Check your account before making this change again; SeerrNG will not repeat it automatically.',
  succeeded: 'Provider tracking updated.',
  unmapped: 'A confirmed catalog match is needed before updating this title.',
  episodeTracking: 'Episode-level tracking',
  chooseSeason: 'Choose a season',
  chooseEpisode: 'Choose an episode',
  markEpisodeWatched: 'Mark episode watched',
  markEpisodeUnwatched: 'Mark episode unwatched',
  clearEpisodeConfirm:
    'Remove watched status for S{season}E{episode} from your provider account?',
  noEpisodes: 'No episodes are available for this season.',
  noSeasons: 'No seasons are available for this series.',
  loadSeasonsFailed: 'Series seasons could not be loaded. Try again.',
  loadingSeasons: 'Loading seasons…',
  loadingEpisodes: 'Loading episodes…',
  loadEpisodesFailed: 'Episode details could not be loaded. Try again.',
  loadingWatchState: 'Loading provider episode status…',
  watchStateUnavailable:
    'Provider episode status could not be loaded. Tracking actions are still available.',
  watchedOnProvider: 'This episode is marked watched on {provider}.',
  unwatchedOnProvider: 'This episode is not marked watched on {provider}.',
  providerWatched: 'Watched',
  providerUnwatched: 'Not watched',
  episodeStateUnknown: 'No provider status is available for this episode.',
});
export default function TrackingControls({
  item,
  allowWrites,
  onUpdated,
}: {
  item: PersonalLibraryItem;
  allowWrites: boolean;
  onUpdated: () => Promise<unknown>;
}) {
  const intl = useIntl();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [rating, setRating] = useState(
    item.rating !== undefined ? String(item.rating) : ''
  );
  const [progress, setProgress] = useState(String(item.progress ?? 0));
  const [confirm, setConfirm] = useState<boolean | null>(null);
  const [episodeTrackingOpen, setEpisodeTrackingOpen] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<number | undefined>();
  const [selectedEpisode, setSelectedEpisode] = useState<number | undefined>();
  const [episodeRemovalConfirm, setEpisodeRemovalConfirm] = useState<{
    season: number;
    episode: number;
  } | null>(null);
  const lastAttempt = useRef<{ signature: string; requestId: string } | null>(
    null
  );
  const target =
    item.source === 'anilist'
      ? { anilistId: Number(item.sourceId) }
      : item.tmdbId && item.mediaType
        ? { tmdbId: item.tmdbId, mediaType: item.mediaType }
        : null;
  const supportsEpisodeTracking =
    item.mediaType === 'tv' &&
    (item.source === 'trakt' || item.source === 'simkl') &&
    Boolean(item.tmdbId);
  const { data: tvDetails, error: tvError } = useSWR<TvDetails>(
    episodeTrackingOpen && supportsEpisodeTracking
      ? `/api/v1/tv/${item.tmdbId}`
      : null
  );
  const seasons = tvDetails?.seasons.filter(
    (season) => season.episodeCount > 0
  );
  useEffect(() => {
    if (!seasons?.length) return;
    if (!seasons.some((season) => season.seasonNumber === selectedSeason)) {
      setSelectedSeason(
        seasons.find((season) => season.seasonNumber > 0)?.seasonNumber ??
          seasons[0].seasonNumber
      );
      setSelectedEpisode(undefined);
    }
  }, [seasons, selectedSeason]);
  const {
    data: seasonDetails,
    error: seasonError,
    isLoading: episodesLoading,
  } = useSWR<SeasonWithEpisodes>(
    episodeTrackingOpen && selectedSeason !== undefined
      ? `/api/v1/tv/${item.tmdbId}/season/${selectedSeason}`
      : null
  );
  const episodes = seasonDetails?.episodes ?? EMPTY_EPISODES;
  const episodeWatchStateKey =
    episodeTrackingOpen &&
    selectedSeason !== undefined &&
    seasonDetails &&
    supportsEpisodeTracking
      ? `/api/v1/integrations/discovery/tracking/${item.source}/episodes?sourceId=${encodeURIComponent(item.sourceId)}&tmdbId=${item.tmdbId}&season=${selectedSeason}`
      : null;
  const {
    data: episodeWatchState,
    error: episodeWatchStateError,
    isLoading: episodeWatchStateLoading,
    mutate: mutateEpisodeWatchState,
  } = useSWR<{
    available: boolean;
    season: number;
    episodes: { episode: number; watched: boolean }[];
  }>(episodeWatchStateKey);
  const selectedEpisodeWatched = episodeWatchState?.episodes.find(
    (episode) => episode.episode === selectedEpisode
  )?.watched;
  useEffect(() => {
    if (!episodes.length) {
      setSelectedEpisode(undefined);
      return;
    }
    if (!episodes.some((episode) => episode.episodeNumber === selectedEpisode))
      setSelectedEpisode(episodes[0].episodeNumber);
  }, [episodes, selectedEpisode]);
  const apply = async (
    action: TrackingIntent['action'],
    value: number | boolean,
    episode?: TrackingIntent['episode']
  ) => {
    if (!target || !allowWrites || busy) return;
    setBusy(true);
    setNotice('');
    const signature = JSON.stringify([
      item.source,
      target,
      action,
      value,
      episode ?? null,
    ]);
    if (lastAttempt.current?.signature !== signature)
      lastAttempt.current = { signature, requestId: createBrowserActionId() };
    const requestId = lastAttempt.current.requestId;
    try {
      const result = await axios.post(
        '/api/v1/integrations/discovery/tracking/' + item.source,
        { requestId, action, value, ...target, ...(episode ? { episode } : {}) }
      );
      if (result.data.state !== 'succeeded')
        throw new Error('Unconfirmed action');
      setNotice(intl.formatMessage(messages.succeeded));
      setConfirm(null);
      setEpisodeRemovalConfirm(null);
      if (episode) await mutateEpisodeWatchState();
      await onUpdated();
    } catch {
      try {
        const { data } = await axios.get(
          `/api/v1/integrations/discovery/tracking/actions/${requestId}`
        );
        if (data.state === 'succeeded') {
          setNotice(intl.formatMessage(messages.succeeded));
          setConfirm(null);
          setEpisodeRemovalConfirm(null);
          if (episode) await mutateEpisodeWatchState();
          await onUpdated();
        } else if (data.state === 'unknown') {
          setNotice(intl.formatMessage(messages.uncertain));
        } else {
          setNotice(intl.formatMessage(messages.failed));
        }
      } catch {
        setNotice(intl.formatMessage(messages.failed));
      }
    } finally {
      setBusy(false);
    }
  };
  const watched = item.status === 'completed' || item.status === 'watched';
  return (
    <div className="space-y-3 p-3">
      {!allowWrites ? (
        <Link
          href="/profile/settings/linked-accounts"
          className="text-sm text-blue-300"
        >
          {intl.formatMessage(messages.consent)}
        </Link>
      ) : !target ? (
        <p className="text-xs text-gray-400">
          {intl.formatMessage(messages.unmapped)}
        </p>
      ) : (
        <>
          <Button
            className="w-full"
            disabled={busy}
            onClick={() => {
              if (item.mediaType === 'tv' || watched) setConfirm(!watched);
              else void apply('watched', !watched);
            }}
          >
            {intl.formatMessage(
              watched ? messages.unwatched : messages.watched
            )}
          </Button>
          {supportsEpisodeTracking && (
            <section className="space-y-2 rounded-md border border-gray-700 p-2">
              <Button
                className="w-full"
                disabled={busy || episodeRemovalConfirm !== null}
                onClick={() => setEpisodeTrackingOpen((value) => !value)}
                aria-expanded={episodeTrackingOpen}
              >
                {intl.formatMessage(messages.episodeTracking)}
              </Button>
              {episodeTrackingOpen && (
                <div className="space-y-2">
                  {!tvDetails && !tvError && (
                    <p className="text-xs text-gray-400">
                      {intl.formatMessage(messages.loadingSeasons)}
                    </p>
                  )}
                  {tvError && (
                    <p role="status" className="text-xs text-red-300">
                      {intl.formatMessage(messages.loadSeasonsFailed)}
                    </p>
                  )}
                  {tvDetails && seasons?.length === 0 && (
                    <p className="text-xs text-gray-400">
                      {intl.formatMessage(messages.noSeasons)}
                    </p>
                  )}
                  {seasons && seasons.length > 0 && (
                    <label className="block text-xs">
                      {intl.formatMessage(messages.chooseSeason)}
                      <select
                        className="mt-1 block w-full"
                        aria-label={intl.formatMessage(messages.chooseSeason)}
                        value={selectedSeason ?? ''}
                        disabled={busy || episodeRemovalConfirm !== null}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          setSelectedSeason(
                            Number.isSafeInteger(value) ? value : undefined
                          );
                          setSelectedEpisode(undefined);
                          setEpisodeRemovalConfirm(null);
                        }}
                      >
                        {seasons.map((season) => (
                          <option key={season.id} value={season.seasonNumber}>
                            {season.name ||
                              intl.formatMessage(messages.seasonNumber, {
                                number: season.seasonNumber,
                              })}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {seasonError && (
                    <p role="status" className="text-xs text-red-300">
                      {intl.formatMessage(messages.loadEpisodesFailed)}
                    </p>
                  )}
                  {episodesLoading && (
                    <p role="status" className="text-xs text-gray-400">
                      {intl.formatMessage(messages.loadingEpisodes)}
                    </p>
                  )}
                  {seasonDetails && episodes.length === 0 && (
                    <p className="text-xs text-gray-400">
                      {intl.formatMessage(messages.noEpisodes)}
                    </p>
                  )}
                  {episodes.length > 0 && (
                    <>
                      {episodeWatchStateLoading && (
                        <p role="status" className="text-xs text-gray-400">
                          {intl.formatMessage(messages.loadingWatchState)}
                        </p>
                      )}
                      {(episodeWatchStateError ||
                        (!episodeWatchStateLoading &&
                          !episodeWatchState?.available)) && (
                        <p role="status" className="text-xs text-yellow-300">
                          {intl.formatMessage(messages.watchStateUnavailable)}
                        </p>
                      )}
                      <label className="block text-xs">
                        {intl.formatMessage(messages.chooseEpisode)}
                        <select
                          className="mt-1 block w-full"
                          aria-label={intl.formatMessage(
                            messages.chooseEpisode
                          )}
                          value={selectedEpisode ?? ''}
                          disabled={busy || episodeRemovalConfirm !== null}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            setSelectedEpisode(
                              Number.isSafeInteger(value) && value > 0
                                ? value
                                : undefined
                            );
                            setEpisodeRemovalConfirm(null);
                          }}
                        >
                          {episodes.map((episode) => {
                            const watched = episodeWatchState?.episodes.find(
                              (state) => state.episode === episode.episodeNumber
                            )?.watched;
                            const stateLabel =
                              watched === true
                                ? intl.formatMessage(messages.providerWatched)
                                : watched === false
                                  ? intl.formatMessage(
                                      messages.providerUnwatched
                                    )
                                  : '';
                            return (
                              <option
                                key={episode.id}
                                value={episode.episodeNumber}
                              >
                                {`E${episode.episodeNumber} — ${episode.name || intl.formatMessage(messages.episodeNumber, { number: episode.episodeNumber })}${stateLabel ? ` (${stateLabel})` : ''}`}
                              </option>
                            );
                          })}
                        </select>
                      </label>
                      {selectedEpisodeWatched !== undefined ? (
                        <p role="status" className="text-xs text-gray-300">
                          {intl.formatMessage(
                            selectedEpisodeWatched
                              ? messages.watchedOnProvider
                              : messages.unwatchedOnProvider,
                            {
                              provider:
                                item.source === 'simkl' ? 'Simkl' : 'Trakt',
                            }
                          )}
                        </p>
                      ) : episodeWatchState?.available &&
                        selectedEpisode !== undefined ? (
                        <p role="status" className="text-xs text-gray-400">
                          {intl.formatMessage(messages.episodeStateUnknown)}
                        </p>
                      ) : null}
                      {episodeRemovalConfirm ? (
                        <div className="space-y-2 rounded-md border border-yellow-700 p-2 text-xs">
                          <p>
                            {intl.formatMessage(messages.clearEpisodeConfirm, {
                              season: episodeRemovalConfirm.season,
                              episode: episodeRemovalConfirm.episode,
                            })}
                          </p>
                          <Button
                            disabled={busy}
                            onClick={() =>
                              void apply(
                                'watched',
                                false,
                                episodeRemovalConfirm
                              )
                            }
                          >
                            {intl.formatMessage(messages.confirm)}
                          </Button>
                          <Button
                            disabled={busy}
                            onClick={() => setEpisodeRemovalConfirm(null)}
                          >
                            {intl.formatMessage(messages.cancel)}
                          </Button>
                        </div>
                      ) : selectedEpisodeWatched === true ? (
                        <Button
                          className="w-full"
                          disabled={
                            busy ||
                            selectedSeason === undefined ||
                            selectedEpisode === undefined
                          }
                          onClick={() =>
                            selectedSeason !== undefined &&
                            selectedEpisode !== undefined &&
                            setEpisodeRemovalConfirm({
                              season: selectedSeason,
                              episode: selectedEpisode,
                            })
                          }
                        >
                          {intl.formatMessage(messages.markEpisodeUnwatched)}
                        </Button>
                      ) : selectedEpisodeWatched === false ? (
                        <Button
                          className="w-full"
                          disabled={
                            busy ||
                            selectedSeason === undefined ||
                            selectedEpisode === undefined
                          }
                          onClick={() =>
                            selectedSeason !== undefined &&
                            selectedEpisode !== undefined &&
                            void apply('watched', true, {
                              season: selectedSeason,
                              episode: selectedEpisode,
                            })
                          }
                        >
                          {intl.formatMessage(messages.markEpisodeWatched)}
                        </Button>
                      ) : (
                        <>
                          <Button
                            className="w-full"
                            disabled={
                              busy ||
                              selectedSeason === undefined ||
                              selectedEpisode === undefined
                            }
                            onClick={() =>
                              selectedSeason !== undefined &&
                              selectedEpisode !== undefined &&
                              void apply('watched', true, {
                                season: selectedSeason,
                                episode: selectedEpisode,
                              })
                            }
                          >
                            {intl.formatMessage(messages.markEpisodeWatched)}
                          </Button>
                          <Button
                            className="w-full"
                            disabled={
                              busy ||
                              selectedSeason === undefined ||
                              selectedEpisode === undefined
                            }
                            onClick={() =>
                              selectedSeason !== undefined &&
                              selectedEpisode !== undefined &&
                              setEpisodeRemovalConfirm({
                                season: selectedSeason,
                                episode: selectedEpisode,
                              })
                            }
                          >
                            {intl.formatMessage(messages.markEpisodeUnwatched)}
                          </Button>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </section>
          )}
          {confirm !== null && (
            <div className="space-y-2 rounded-md border border-yellow-700 p-2 text-xs">
              <p>
                {intl.formatMessage(
                  item.mediaType === 'tv'
                    ? messages.wholeSeries
                    : messages.removeWatched
                )}
              </p>
              <Button
                disabled={busy}
                onClick={() => void apply('watched', confirm)}
              >
                {intl.formatMessage(messages.confirm)}
              </Button>
              <Button disabled={busy} onClick={() => setConfirm(null)}>
                {intl.formatMessage(messages.cancel)}
              </Button>
            </div>
          )}
          <label className="block text-xs">
            {intl.formatMessage(messages.rating)}
            {item.source === 'anilist' ? (
              <input
                className="mt-1 w-full"
                type="number"
                min={0}
                max={10}
                step={0.1}
                aria-label={intl.formatMessage(messages.rating)}
                value={rating}
                disabled={busy}
                onChange={(event) => setRating(event.target.value)}
              />
            ) : (
              <select
                className="mt-1 block w-full"
                aria-label={intl.formatMessage(messages.rating)}
                value={rating}
                disabled={busy}
                onChange={(event) => setRating(event.target.value)}
              >
                <option value="">{intl.formatMessage(messages.choose)}</option>
                <option value="0">{intl.formatMessage(messages.clear)}</option>
                {Array.from({ length: 10 }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {index + 1}/10
                  </option>
                ))}
              </select>
            )}
          </label>
          <Button
            className="w-full"
            disabled={
              busy ||
              rating === '' ||
              !Number.isFinite(Number(rating)) ||
              Number(rating) < 0 ||
              Number(rating) > 10 ||
              (item.source === 'anilist'
                ? !Number.isInteger(Number(rating) * 10)
                : !Number.isSafeInteger(Number(rating)))
            }
            onClick={() => void apply('rating', Number(rating))}
          >
            {intl.formatMessage(messages.saveRating)}
          </Button>
          {item.source === 'anilist' && (
            <>
              <label className="block text-xs">
                {intl.formatMessage(messages.progress)}
                <input
                  className="mt-1 w-full"
                  type="number"
                  min={0}
                  max={item.totalEpisodes ?? 100000}
                  value={progress}
                  disabled={busy}
                  onChange={(event) => setProgress(event.target.value)}
                />
              </label>
              <Button
                className="w-full"
                disabled={
                  busy ||
                  progress === '' ||
                  !Number.isSafeInteger(Number(progress)) ||
                  Number(progress) < 0 ||
                  Number(progress) > (item.totalEpisodes ?? 100000)
                }
                onClick={() => void apply('progress', Number(progress))}
              >
                {intl.formatMessage(messages.saveProgress)}
              </Button>
            </>
          )}
        </>
      )}
      {notice && (
        <p role="status" className="text-xs">
          {notice}
        </p>
      )}
    </div>
  );
}
