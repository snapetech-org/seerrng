import Alert from '@app/components/Common/Alert';
import Button from '@app/components/Common/Button';
import Header from '@app/components/Common/Header';
import PageTitle from '@app/components/Common/PageTitle';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import type {
  KaraokeAvailability,
  KaraokeFiltersResponse,
  KaraokeLyricLineResponse,
  KaraokePlayerStatusResponse,
  KaraokeQueueItemResponse,
  KaraokeSearchOrder,
  KaraokeSearchResponse,
  KaraokeSessionResponse,
  KaraokeSongResponse,
} from '@server/interfaces/api/karaokeInterfaces';
import {
  ForwardIcon,
  MagnifyingGlassIcon,
  PauseIcon,
  PlayIcon,
} from '@heroicons/react/24/outline';
import axios from 'axios';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

interface KaraokeStatus {
  configured: boolean;
  playerUrl?: string;
}

interface KaraokeSessionEnvelope {
  session: KaraokeSessionResponse | null;
}

type KaraokePlayerCommand =
  | 'play'
  | 'pause'
  | 'skip'
  | 'prev'
  | 'stopAfter'
  | 'mute'
  | 'unmute'
  | 'showSubs'
  | 'hideSubs'
  | 'seek'
  | 'setVolume';

const messages = defineMessages('components.Karaoke', {
  title: 'Karaoke',
  intro: 'Search the connected karaoke songbook and request songs for the shared session.',
  setupTitle: 'Connect Karaoke Mugen',
  setupBody:
    'Ask your SeerrNG administrator to configure the Karaoke Mugen connection in the server environment.',
  serviceUnavailable: 'The karaoke connection could not be checked.',
  searchLabel: 'Search songs or singers',
  searchPlaceholder: 'Enter a song title or singer',
  searchAction: 'Search',
  typeToSearch: 'Enter at least two characters to search the songbook.',
  searchFailed: 'The karaoke songbook could not be searched.',
  noResults: 'No karaoke songs matched this search.',
  resultsHeading: 'Songbook results',
  orderLabel: 'Sort songs',
  languageFilter: 'Language',
  allLanguages: 'Any language',
  songTypeFilter: 'Song type',
  allSongTypes: 'Any song type',
  filterFailed: 'The songbook filters could not be loaded.',
  orderRequested: 'Most requested',
  orderRecent: 'Recently added',
  orderPlayed: 'Most played',
  orderHistory: 'Recently played',
  previousPage: 'Previous page',
  nextPage: 'Next page',
  pageStatus: 'Showing {start}–{end} of {total} songs',
  pageStatusUnknown: 'Showing {start}–{end} songs',
  request: 'Request song',
  requesting: 'Sending request…',
  requestSuccess: 'Song request sent for host review.',
  requestPosition: 'Song request sent for host review at queue position {position}.',
  requestFailed: 'The song request could not be added to the shared queue.',
  requestPermission: 'You do not have permission to request music.',
  ready: 'Ready on karaoke server',
  downloading: 'Downloading on karaoke server',
  remote: 'Remote source',
  unknownAvailability: 'Availability unknown',
  warning: 'Content warning',
  sessionHeading: 'Tonight’s session',
  sessionUnavailable: 'No public karaoke request queue is available.',
  sessionFailed: 'The karaoke session could not be loaded.',
  currentSong: 'Now singing',
  waitingHeading: 'Pending requests',
  emptyQueue: 'No requests are waiting for review.',
  accept: 'Accept',
  accepting: 'Accepting…',
  reject: 'Reject',
  rejecting: 'Rejecting…',
  requestAccepted: 'Request accepted and added to the playback queue.',
  requestRejected: 'Request rejected.',
  reviewFailed: 'The karaoke request could not be reviewed.',
  cancelRequest: 'Cancel my request',
  cancelling: 'Cancelling…',
  requestCancelled: 'Your karaoke request was cancelled.',
  cancelFailed: 'The karaoke request could not be cancelled.',
  moveUp: 'Move up',
  moveDown: 'Move down',
  queueReordered: 'The playback queue was reordered.',
  reorderFailed: 'The playback queue could not be reordered.',
  upcomingHeading: 'Up next',
  emptyUpcoming: 'No approved songs are queued to play.',
  hostControls: 'Host controls',
  play: 'Play',
  pause: 'Pause',
  skip: 'Skip',
  controlFailed: 'The player command could not be sent.',
  player: 'Open karaoke display',
  playerPlaying: 'Playing',
  playerPaused: 'Paused',
  playerStopped: 'Stopped',
  playerUnknown: 'Player status unavailable',
  playerProgress: 'Song progress',
  playerLyrics: 'Current song lyrics',
  lyricWaiting: 'Lyrics are waiting to begin.',
  noLyrics: 'Timed lyrics are not available for this song. Use the Karaoke Mugen display.',
  openStageView: 'Open stage view',
  closeStageView: 'Close stage view',
  stageComingUp: 'Coming up',
  previous: 'Previous song',
  stopAfter: 'Stop after this song',
  mute: 'Mute',
  unmute: 'Unmute',
  showLyrics: 'Show lyrics on display',
  hideLyrics: 'Hide lyrics on display',
  seekBack: 'Back 10 seconds',
  seekForward: 'Forward 10 seconds',
  advancedControls: 'More playback controls',
  volume: 'Player volume',
  applyVolume: 'Set volume',
  controlling: 'Sending command…',
  language: 'Language',
  songType: 'Type',
  duration: 'Duration',
  minutes: '{minutes}:{seconds}',
  unnamed: 'Unknown singer',
});

const fetchStatus = async (url: string) =>
  (await axios.get<KaraokeStatus>(url)).data;

const fetchSession = async (url: string) =>
  (await axios.get<KaraokeSessionEnvelope>(url)).data;

const fetchResults = async (url: string) =>
  (await axios.get<KaraokeSearchResponse>(url)).data;

const fetchFilters = async (url: string) =>
  (await axios.get<KaraokeFiltersResponse>(url)).data;

const responseMessage = (error: unknown): string | undefined => {
  if (!axios.isAxiosError<{ message?: unknown }>(error)) return undefined;
  const message = error.response?.data?.message;
  return typeof message === 'string' ? message : undefined;
};

const availabilityMessage = (
  availability: KaraokeAvailability,
  intl: ReturnType<typeof useIntl>
) => {
  switch (availability) {
    case 'ready':
      return intl.formatMessage(messages.ready);
    case 'downloading':
      return intl.formatMessage(messages.downloading);
    case 'remote':
      return intl.formatMessage(messages.remote);
    default:
      return intl.formatMessage(messages.unknownAvailability);
  }
};

const formatDuration = (
  value: number | undefined,
  intl: ReturnType<typeof useIntl>
) => {
  if (value === undefined || !Number.isFinite(value) || value < 0) return undefined;
  const minutes = Math.floor(value / 60);
  const seconds = String(Math.floor(value % 60)).padStart(2, '0');
  return intl.formatMessage(messages.minutes, { minutes, seconds });
};

const SongRow = ({
  song,
  canRequest,
  requesting,
  onRequest,
  intl,
}: {
  song: KaraokeSongResponse;
  canRequest: boolean;
  requesting: boolean;
  onRequest: () => void;
  intl: ReturnType<typeof useIntl>;
}) => {
  const duration = formatDuration(song.durationSeconds, intl);

  return (
    <li>
      <article>
        <h3>{song.title}</h3>
        <p>
          {song.artists.length
            ? song.artists.join(', ')
            : intl.formatMessage(messages.unnamed)}
        </p>
        <p>{availabilityMessage(song.availability, intl)}</p>
        {(song.language || song.categories.length > 0 || duration) && (
          <dl>
            {song.language && (
              <>
                <dt>{intl.formatMessage(messages.language)}</dt>
                <dd>{song.language}</dd>
              </>
            )}
            {song.categories.length > 0 && (
              <>
                <dt>{intl.formatMessage(messages.songType)}</dt>
                <dd>{song.categories.join(', ')}</dd>
              </>
            )}
            {duration && (
              <>
                <dt>{intl.formatMessage(messages.duration)}</dt>
                <dd>{duration}</dd>
              </>
            )}
          </dl>
        )}
        {song.hasWarnings && (
          <p role="note">{intl.formatMessage(messages.warning)}</p>
        )}
        <Button
          buttonType="primary"
          buttonSize="sm"
          disabled={!canRequest || requesting || song.availability === 'downloading'}
          disabledReason={
            !canRequest
              ? intl.formatMessage(messages.requestPermission)
              : undefined
          }
          onClick={onRequest}
        >
          {requesting
            ? intl.formatMessage(messages.requesting)
            : intl.formatMessage(messages.request)}
        </Button>
      </article>
    </li>
  );
};

const QueueItem = ({
  item,
  intl,
  canModerate = false,
  moderating = false,
  moderationBusy = false,
  moderatingDecision,
  canCancel = false,
  cancelling = false,
  canMoveUp = false,
  canMoveDown = false,
  queueBusy = false,
  onModerate,
  onCancel,
  onMove,
}: {
  item: KaraokeQueueItemResponse;
  intl: ReturnType<typeof useIntl>;
  canModerate?: boolean;
  moderating?: boolean;
  moderationBusy?: boolean;
  moderatingDecision?: 'accept' | 'reject';
  canCancel?: boolean;
  cancelling?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  queueBusy?: boolean;
  onModerate?: (playlistContentId: number, decision: 'accept' | 'reject') => void;
  onCancel?: (playlistContentId: number) => void;
  onMove?: (playlistContentId: number, direction: 'up' | 'down') => void;
}) => (
  <li>
    <article>
      <h3>{item.title}</h3>
      {item.artists.length > 0 && <p>{item.artists.join(', ')}</p>}
      {item.requester && <p>{item.requester}</p>}
      {canModerate &&
        item.needsReview &&
        item.playlistContentId !== undefined &&
        onModerate && (
          <div>
            <Button
              buttonType="primary"
              buttonSize="sm"
              disabled={moderationBusy}
              onClick={() => onModerate(item.playlistContentId!, 'accept')}
            >
              {moderating && moderatingDecision === 'accept'
                ? intl.formatMessage(messages.accepting)
                : intl.formatMessage(messages.accept)}
            </Button>
            <Button
              buttonType="default"
              buttonSize="sm"
              disabled={moderationBusy}
              onClick={() => onModerate(item.playlistContentId!, 'reject')}
            >
              {moderating && moderatingDecision === 'reject'
                ? intl.formatMessage(messages.rejecting)
                : intl.formatMessage(messages.reject)}
            </Button>
          </div>
        )}
      {canCancel &&
        item.canCancel &&
        item.playlistContentId !== undefined &&
        onCancel && (
          <div className="mt-2">
            <Button
              buttonType="default"
              buttonSize="sm"
              disabled={queueBusy}
              onClick={() => onCancel(item.playlistContentId!)}
            >
              {cancelling
                ? intl.formatMessage(messages.cancelling)
                : intl.formatMessage(messages.cancelRequest)}
            </Button>
          </div>
        )}
      {(canMoveUp || canMoveDown) &&
        item.playlistContentId !== undefined &&
        onMove && (
          <div className="mt-2 flex gap-2">
            {canMoveUp && (
              <Button
                buttonType="default"
                buttonSize="sm"
                disabled={queueBusy}
                onClick={() => onMove(item.playlistContentId!, 'up')}
              >
                {intl.formatMessage(messages.moveUp)}
              </Button>
            )}
            {canMoveDown && (
              <Button
                buttonType="default"
                buttonSize="sm"
                disabled={queueBusy}
                onClick={() => onMove(item.playlistContentId!, 'down')}
              >
                {intl.formatMessage(messages.moveDown)}
              </Button>
            )}
          </div>
        )}
    </article>
  </li>
);

const KaraokePlayerPanel = ({
  item,
  player,
  lyrics,
  intl,
  canControl,
  controlsBusy,
  playerUrl,
  onControl,
}: {
  item: KaraokeQueueItemResponse;
  player: KaraokePlayerStatusResponse;
  lyrics: KaraokeLyricLineResponse[];
  intl: ReturnType<typeof useIntl>;
  canControl: boolean;
  controlsBusy: boolean;
  playerUrl?: string;
  onControl: (command: 'play' | 'pause' | 'skip') => void;
}) => {
  const [now, setNow] = useState(0);
  const [clock, setClock] = useState({ positionSeconds: 0, capturedAt: 0 });
  const [stageOpen, setStageOpen] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const openStageButtonRef = useRef<HTMLButtonElement>(null);
  const closeStageButtonRef = useRef<HTMLButtonElement>(null);
  const wasStageOpenRef = useRef(false);
  const activeLineRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    setClock({
      positionSeconds: player.timeSeconds ?? 0,
      capturedAt: Date.now(),
    });
  }, [item.id, player.timeSeconds]);

  useEffect(() => {
    if (!player.playing) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [player.playing]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (document.fullscreenElement !== stageRef.current) {
        setStageOpen(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () =>
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (stageOpen) {
      closeStageButtonRef.current?.focus();
    } else if (wasStageOpenRef.current) {
      openStageButtonRef.current?.focus();
    }
    wasStageOpenRef.current = stageOpen;
  }, [stageOpen]);

  useEffect(() => {
    if (!stageOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setStageOpen(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [stageOpen]);

  const positionSeconds = player.playing
    ? clock.positionSeconds + Math.max(0, now - clock.capturedAt) / 1000
    : player.timeSeconds ?? clock.positionSeconds;
  const activeLineIndex = lyrics.findIndex(
    (line) =>
      positionSeconds >= line.startSeconds &&
      positionSeconds < line.endSeconds
  );
  const upcomingLineIndex = lyrics.findIndex(
    (line) => line.startSeconds > positionSeconds
  );
  const stageLineIndex =
    activeLineIndex >= 0 ? activeLineIndex : upcomingLineIndex;

  useEffect(() => {
    if (activeLineIndex >= 0 && !stageOpen) {
      activeLineRef.current?.scrollIntoView({
        block: 'center',
        behavior: 'smooth',
      });
    }
  }, [activeLineIndex, stageOpen]);

  const playerMessage =
    player.status === 'play'
      ? messages.playerPlaying
      : player.status === 'pause'
        ? messages.playerPaused
        : player.status === 'stop'
          ? messages.playerStopped
          : messages.playerUnknown;
  const duration = formatDuration(item.durationSeconds, intl);
  const currentTime = formatDuration(positionSeconds, intl);

  const openStage = () => {
    setStageOpen(true);
    const stage = stageRef.current;
    if (document.fullscreenEnabled && stage?.requestFullscreen) {
      void stage.requestFullscreen().catch(() => undefined);
    }
  };

  const closeStage = () => {
    setStageOpen(false);
    if (document.fullscreenElement === stageRef.current) {
      void document.exitFullscreen().catch(() => undefined);
    }
  };

  return (
    <div
      ref={stageRef}
      className={
        stageOpen
          ? 'fixed inset-0 z-50 overflow-y-auto bg-black text-white'
          : 'app-filter-section-gap'
      }
    >
      {stageOpen ? (
        <section
          aria-label={intl.formatMessage(messages.playerLyrics)}
          className="flex min-h-full flex-col justify-between gap-8 p-5 md:p-10 xl:p-14"
        >
          <header className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-wider opacity-70">
                  {intl.formatMessage(messages.currentSong)}
                </p>
                <h2 className="text-2xl font-bold md:text-4xl">{item.title}</h2>
                {item.artists.length > 0 && (
                  <p className="text-lg opacity-80 md:text-2xl">
                    {item.artists.join(', ')}
                  </p>
                )}
              </div>
              <Button
                ref={closeStageButtonRef}
                buttonType="default"
                buttonSize="sm"
                onClick={closeStage}
              >
                {intl.formatMessage(messages.closeStageView)}
              </Button>
            </div>
            {duration && currentTime && item.durationSeconds !== undefined && (
              <div>
                <label htmlFor="karaoke-progress">
                  {intl.formatMessage(messages.playerProgress)}
                </label>
                <progress
                  id="karaoke-progress"
                  value={Math.min(positionSeconds, item.durationSeconds)}
                  max={item.durationSeconds}
                  className="block w-full"
                />
                <p>
                  {currentTime} / {duration}
                </p>
              </div>
            )}
          </header>

          <div className="flex flex-1 flex-col items-center justify-center gap-7 py-8">
            {lyrics.length > 0 ? (
              <>
                {stageLineIndex > 0 && (
                  <p
                    aria-hidden="true"
                    className="max-w-6xl text-center text-xl opacity-45 md:text-3xl"
                  >
                    {lyrics[stageLineIndex - 1].text}
                  </p>
                )}
                <div className="max-w-6xl text-center">
                  {activeLineIndex < 0 && stageLineIndex >= 0 && (
                    <p className="mb-3 text-sm uppercase tracking-wider opacity-70">
                      {intl.formatMessage(messages.stageComingUp)}
                    </p>
                  )}
                  <p
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                    className="text-4xl font-semibold leading-tight md:text-6xl xl:text-8xl"
                  >
                    {stageLineIndex >= 0
                      ? lyrics[stageLineIndex].text
                      : intl.formatMessage(messages.lyricWaiting)}
                  </p>
                </div>
                {stageLineIndex >= 0 &&
                  stageLineIndex < lyrics.length - 1 && (
                    <p
                      aria-hidden="true"
                      className="max-w-6xl text-center text-xl opacity-45 md:text-3xl"
                    >
                      {lyrics[stageLineIndex + 1].text}
                    </p>
                  )}
              </>
            ) : (
              <p role="note" className="max-w-4xl text-center text-2xl md:text-4xl">
                {intl.formatMessage(messages.noLyrics)}
              </p>
            )}
          </div>

          <div className="flex flex-col items-center gap-4">
            <div className="flex flex-wrap justify-center gap-3">
              {playerUrl && (
                <Button
                  as="a"
                  href={playerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  buttonType="default"
                  buttonSize="sm"
                >
                  {intl.formatMessage(messages.player)}
                </Button>
              )}
              {canControl && (
                <>
                  <Button
                    buttonType="playback"
                    buttonSize="sm"
                    disabled={controlsBusy || player.isOperating}
                    onClick={() => onControl('play')}
                  >
                    <PlayIcon aria-hidden="true" />
                    {intl.formatMessage(messages.play)}
                  </Button>
                  <Button
                    buttonType="playback"
                    buttonSize="sm"
                    disabled={controlsBusy || player.isOperating}
                    onClick={() => onControl('pause')}
                  >
                    <PauseIcon aria-hidden="true" />
                    {intl.formatMessage(messages.pause)}
                  </Button>
                  <Button
                    buttonType="playback"
                    buttonSize="sm"
                    disabled={controlsBusy || player.isOperating}
                    onClick={() => onControl('skip')}
                  >
                    <ForwardIcon aria-hidden="true" />
                    {intl.formatMessage(messages.skip)}
                  </Button>
                </>
              )}
            </div>
            <p role="status" className="text-center text-sm opacity-70">
              {intl.formatMessage(playerMessage)}
            </p>
          </div>
        </section>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <p role="status">{intl.formatMessage(playerMessage)}</p>
            <Button
              ref={openStageButtonRef}
              buttonType="default"
              buttonSize="sm"
              onClick={openStage}
            >
              {intl.formatMessage(messages.openStageView)}
            </Button>
          </div>
          {duration && currentTime && item.durationSeconds !== undefined && (
            <div>
              <label htmlFor="karaoke-progress">
                {intl.formatMessage(messages.playerProgress)}
              </label>
              <progress
                id="karaoke-progress"
                value={Math.min(positionSeconds, item.durationSeconds)}
                max={item.durationSeconds}
                className="block w-full"
              />
              <p>
                {currentTime} / {duration}
              </p>
            </div>
          )}
          {lyrics.length > 0 ? (
            <>
              <p role="status" aria-live="polite" aria-atomic="true">
                {activeLineIndex >= 0
                  ? lyrics[activeLineIndex].text
                  : intl.formatMessage(messages.lyricWaiting)}
              </p>
              <ol
                tabIndex={0}
                aria-label={intl.formatMessage(messages.playerLyrics)}
                className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-white/10 p-4"
              >
                {lyrics.map((line, index) => (
                  <li
                    key={line.startSeconds + ':' + index}
                    ref={index === activeLineIndex ? activeLineRef : undefined}
                    aria-current={index === activeLineIndex ? 'time' : undefined}
                    className={
                      index === activeLineIndex
                        ? 'rounded bg-white/10 p-2 font-semibold'
                        : 'p-2 opacity-70'
                    }
                  >
                    {line.text}
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p role="note">{intl.formatMessage(messages.noLyrics)}</p>
          )}
        </>
      )}
    </div>
  );
};

const Karaoke = () => {
  const intl = useIntl();
  const { hasPermission } = useUser();
  const canRequest = hasPermission(Permission.REQUEST_MUSIC);
  const canHost = hasPermission(
    [Permission.MANAGE_REQUESTS, Permission.ADMIN],
    { type: 'or' }
  );
  const [query, setQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOrder, setSearchOrder] =
    useState<KaraokeSearchOrder>('requested');
  const [languageFilter, setLanguageFilter] = useState('');
  const [songTypeFilter, setSongTypeFilter] = useState('');
  const [searchPage, setSearchPage] = useState(0);
  const [requestingId, setRequestingId] = useState<string>();
  const [moderatingRequest, setModeratingRequest] = useState<{
    playlistContentId: number;
    decision: 'accept' | 'reject';
  }>();
  const [cancellingId, setCancellingId] = useState<number>();
  const [reorderingId, setReorderingId] = useState<number>();
  const [controlBusy, setControlBusy] = useState(false);
  const [volume, setVolume] = useState(100);
  const [notice, setNotice] = useState<string>();
  const [operationFailed, setOperationFailed] = useState<
    'request' | 'control' | 'review' | 'cancel' | 'reorder' | undefined
  >();

  const { data: status, error: statusError } = useSWR<KaraokeStatus>(
    '/api/v1/karaoke/status',
    fetchStatus
  );
  const { data: filterOptions, error: filterError } =
    useSWR<KaraokeFiltersResponse>(
      status?.configured ? '/api/v1/karaoke/filters' : null,
      fetchFilters
    );

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setSearchPage(0);
  }, [searchQuery, searchOrder, languageFilter, songTypeFilter]);

  const searchKey =
    status?.configured && searchQuery.length >= 2
      ? '/api/v1/karaoke/search?query=' +
        encodeURIComponent(searchQuery) +
        '&limit=25' +
        '&from=' +
        String(searchPage * 25) +
        '&order=' +
        searchOrder +
        (languageFilter
          ? '&languageId=' + encodeURIComponent(languageFilter)
          : '') +
        (songTypeFilter
          ? '&songTypeId=' + encodeURIComponent(songTypeFilter)
          : '')
      : null;
  const { data: searchResult, error: searchError } =
    useSWR<KaraokeSearchResponse>(searchKey, fetchResults);

  const sessionKey = status?.configured ? '/api/v1/karaoke/session' : null;
  const {
    data: sessionResult,
    error: sessionError,
    mutate: refreshSession,
  } = useSWR<KaraokeSessionEnvelope>(sessionKey, fetchSession, {
    refreshInterval: 5000,
    revalidateOnFocus: true,
  });

  useEffect(() => {
    const currentVolume = sessionResult?.session?.player?.volume;
    if (currentVolume !== undefined) setVolume(currentVolume);
  }, [sessionResult?.session?.player?.volume]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchPage(0);
    setSearchQuery(query.trim());
  };

  const requestSong = async (songId: string) => {
    setRequestingId(songId);
    setNotice(undefined);
    setOperationFailed(undefined);
    try {
      const response = await axios.post<{ position?: number }>(
        '/api/v1/karaoke/request',
        { songId }
      );
      setNotice(
        response.data.position === undefined
          ? intl.formatMessage(messages.requestSuccess)
          : intl.formatMessage(messages.requestPosition, {
              position: response.data.position,
            })
      );
      void refreshSession();
    } catch (error) {
      const message = responseMessage(error);
      if (message) {
        setNotice(message);
      } else {
        setOperationFailed('request');
      }
    } finally {
      setRequestingId(undefined);
    }
  };

  const sendControl = async (
    command: KaraokePlayerCommand,
    options?: number
  ) => {
    setControlBusy(true);
    setNotice(undefined);
    setOperationFailed(undefined);
    try {
      await axios.post('/api/v1/karaoke/control', { command, options });
      void refreshSession();
    } catch (error) {
      const message = responseMessage(error);
      if (message) {
        setNotice(message);
      } else {
        setOperationFailed('control');
      }
    } finally {
      setControlBusy(false);
    }
  };

  const cancelRequest = async (playlistContentId: number) => {
    setCancellingId(playlistContentId);
    setNotice(undefined);
    setOperationFailed(undefined);
    try {
      await axios.post('/api/v1/karaoke/cancel', { playlistContentId });
      setNotice(intl.formatMessage(messages.requestCancelled));
      void refreshSession();
    } catch (error) {
      const message = responseMessage(error);
      if (message) {
        setNotice(message);
      } else {
        setOperationFailed('cancel');
      }
    } finally {
      setCancellingId(undefined);
    }
  };

  const moveQueuedSong = async (
    playlistContentId: number,
    direction: 'up' | 'down'
  ) => {
    setReorderingId(playlistContentId);
    setNotice(undefined);
    setOperationFailed(undefined);
    try {
      await axios.post('/api/v1/karaoke/reorder', {
        playlistContentId,
        direction,
      });
      setNotice(intl.formatMessage(messages.queueReordered));
      void refreshSession();
    } catch (error) {
      const message = responseMessage(error);
      if (message) {
        setNotice(message);
      } else {
        setOperationFailed('reorder');
      }
    } finally {
      setReorderingId(undefined);
    }
  };

  const moderateRequest = async (
    playlistContentId: number,
    decision: 'accept' | 'reject'
  ) => {
    setModeratingRequest({ playlistContentId, decision });
    setNotice(undefined);
    setOperationFailed(undefined);
    try {
      await axios.post('/api/v1/karaoke/moderate', {
        playlistContentId,
        decision,
      });
      setNotice(
        intl.formatMessage(
          decision === 'accept' ? messages.requestAccepted : messages.requestRejected
        )
      );
      void refreshSession();
    } catch (error) {
      const message = responseMessage(error);
      if (message) {
        setNotice(message);
      } else {
        setOperationFailed('review');
      }
    } finally {
      setModeratingRequest(undefined);
    }
  };

  const session = sessionResult?.session ?? undefined;
  const title = intl.formatMessage(messages.title);

  return (
    <>
      <PageTitle title={title} />
      <div className="app-filter-section-gap">
        <Header>{title}</Header>
        <p>{intl.formatMessage(messages.intro)}</p>

        {statusError && (
          <Alert
            title={intl.formatMessage(messages.serviceUnavailable)}
            type="warning"
          />
        )}

        {status && !status.configured && (
          <Alert
            title={intl.formatMessage(messages.setupTitle)}
            type="warning"
          >
            {intl.formatMessage(messages.setupBody)}
          </Alert>
        )}

        {status?.configured && (
          <>
            <section aria-labelledby="karaoke-search-heading">
              <h2 id="karaoke-search-heading">
                {intl.formatMessage(messages.resultsHeading)}
              </h2>
              <form onSubmit={submitSearch} className="app-filter-section-gap">
                <label htmlFor="karaoke-search">
                  {intl.formatMessage(messages.searchLabel)}
                </label>
                <input
                  id="karaoke-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={intl.formatMessage(messages.searchPlaceholder)}
                  className="app-filter-search-input"
                />
                <label htmlFor="karaoke-language-filter">
                  {intl.formatMessage(messages.languageFilter)}
                </label>
                <select
                  id="karaoke-language-filter"
                  value={languageFilter}
                  onChange={(event) => {
                    setSearchPage(0);
                    setLanguageFilter(event.target.value);
                  }}
                  className="app-filter-search-input"
                >
                  <option value="">
                    {intl.formatMessage(messages.allLanguages)}
                  </option>
                  {filterOptions?.languages.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <label htmlFor="karaoke-song-type-filter">
                  {intl.formatMessage(messages.songTypeFilter)}
                </label>
                <select
                  id="karaoke-song-type-filter"
                  value={songTypeFilter}
                  onChange={(event) => {
                    setSearchPage(0);
                    setSongTypeFilter(event.target.value);
                  }}
                  className="app-filter-search-input"
                >
                  <option value="">
                    {intl.formatMessage(messages.allSongTypes)}
                  </option>
                  {filterOptions?.songTypes.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <label htmlFor="karaoke-order">
                  {intl.formatMessage(messages.orderLabel)}
                </label>
                <select
                  id="karaoke-order"
                  value={searchOrder}
                  onChange={(event) => {
                    setSearchPage(0);
                    setSearchOrder(event.target.value as KaraokeSearchOrder);
                  }}
                  className="app-filter-search-input"
                >
                  <option value="requested">
                    {intl.formatMessage(messages.orderRequested)}
                  </option>
                  <option value="recent">
                    {intl.formatMessage(messages.orderRecent)}
                  </option>
                  <option value="played">
                    {intl.formatMessage(messages.orderPlayed)}
                  </option>
                  <option value="history">
                    {intl.formatMessage(messages.orderHistory)}
                  </option>
                </select>
                <Button
                  buttonType="primary"
                  buttonSize="sm"
                  type="submit"
                >
                  <MagnifyingGlassIcon aria-hidden="true" />
                  {intl.formatMessage(messages.searchAction)}
                </Button>
              </form>

              {searchQuery.length < 2 && (
                <p>{intl.formatMessage(messages.typeToSearch)}</p>
              )}
              {filterError && (
                <Alert
                  title={intl.formatMessage(messages.filterFailed)}
                  type="warning"
                />
              )}
              {searchError && (
                <Alert
                  title={intl.formatMessage(messages.searchFailed)}
                  type="warning"
                />
              )}
              {searchResult?.results.length === 0 && searchQuery.length >= 2 && (
                <p>{intl.formatMessage(messages.noResults)}</p>
              )}
              {searchResult && searchResult.results.length > 0 && (
                <>
                  <p>
                    {searchResult.total !== undefined
                      ? intl.formatMessage(messages.pageStatus, {
                          start: searchPage * 25 + 1,
                          end: searchPage * 25 + searchResult.results.length,
                          total: searchResult.total,
                        })
                      : intl.formatMessage(messages.pageStatusUnknown, {
                          start: searchPage * 25 + 1,
                          end: searchPage * 25 + searchResult.results.length,
                        })}
                  </p>
                  <ul
                    className="app-filter-section-gap"
                    aria-label={intl.formatMessage(messages.resultsHeading)}
                  >
                    {searchResult.results.map((song) => (
                      <SongRow
                        key={song.id}
                        song={song}
                        canRequest={canRequest}
                        requesting={requestingId === song.id}
                        onRequest={() => void requestSong(song.id)}
                        intl={intl}
                      />
                    ))}
                  </ul>
                  <div className="flex gap-2">
                    <Button
                      buttonType="default"
                      buttonSize="sm"
                      disabled={searchPage === 0}
                      onClick={() => setSearchPage((page) => Math.max(0, page - 1))}
                    >
                      {intl.formatMessage(messages.previousPage)}
                    </Button>
                    <Button
                      buttonType="default"
                      buttonSize="sm"
                      disabled={!searchResult.hasMore}
                      onClick={() => setSearchPage((page) => page + 1)}
                    >
                      {intl.formatMessage(messages.nextPage)}
                    </Button>
                  </div>
                </>
              )}
            </section>

            <section
              aria-labelledby="karaoke-session-heading"
              className="app-filter-section-gap"
            >
              <Header>{intl.formatMessage(messages.sessionHeading)}</Header>
              {sessionError && (
                <Alert
                  title={intl.formatMessage(messages.sessionFailed)}
                  type="warning"
                />
              )}
              {!sessionError && !session && (
                <p>{intl.formatMessage(messages.sessionUnavailable)}</p>
              )}
              {session && (
                <>
                  <p>{session.name}</p>
                  {session.current && (
                    <div>
                      <h3>{intl.formatMessage(messages.currentSong)}</h3>
                      <QueueItem item={session.current} intl={intl} />
                      {session.player && (
                        <KaraokePlayerPanel
                          item={session.current}
                          player={session.player}
                          lyrics={session.lyrics}
                          intl={intl}
                          canControl={canHost}
                          controlsBusy={controlBusy}
                          playerUrl={status.playerUrl}
                          onControl={(command) => void sendControl(command)}
                        />
                      )}
                    </div>
                  )}
                  <h3>{intl.formatMessage(messages.waitingHeading)}</h3>
                  {session.waiting.length === 0 ? (
                    <p>{intl.formatMessage(messages.emptyQueue)}</p>
                  ) : (
                    <ol>
                      {session.waiting.map((item) => (
                        <QueueItem
                          key={item.playlistContentId ?? item.id}
                          item={item}
                          intl={intl}
                          canModerate={canHost}
                          moderating={
                            moderatingRequest?.playlistContentId ===
                            item.playlistContentId
                          }
                          moderationBusy={moderatingRequest !== undefined}
                          moderatingDecision={
                            moderatingRequest?.playlistContentId ===
                            item.playlistContentId
                              ? moderatingRequest.decision
                              : undefined
                          }
                          canCancel
                          cancelling={cancellingId === item.playlistContentId}
                          queueBusy={
                            cancellingId !== undefined ||
                            reorderingId !== undefined ||
                            moderatingRequest !== undefined
                          }
                          onCancel={(playlistContentId) =>
                            void cancelRequest(playlistContentId)
                          }
                          onModerate={(playlistContentId, decision) =>
                            void moderateRequest(playlistContentId, decision)
                          }
                        />
                      ))}
                    </ol>
                  )}
                  <h3>{intl.formatMessage(messages.upcomingHeading)}</h3>
                  {session.upcoming.length === 0 ? (
                    <p>{intl.formatMessage(messages.emptyUpcoming)}</p>
                  ) : (
                    <ol>
                      {session.upcoming.map((item, index) => (
                        <QueueItem
                          key={item.playlistContentId ?? item.id}
                          item={item}
                          intl={intl}
                          canMoveUp={canHost && index > 0}
                          canMoveDown={
                            canHost && index < session.upcoming.length - 1
                          }
                          queueBusy={
                            cancellingId !== undefined ||
                            reorderingId !== undefined ||
                            moderatingRequest !== undefined
                          }
                          onMove={(playlistContentId, direction) =>
                            void moveQueuedSong(playlistContentId, direction)
                          }
                        />
                      ))}
                    </ol>
                  )}
                </>
              )}
              {canHost && (
                <div>
                  <h3>{intl.formatMessage(messages.hostControls)}</h3>
                  {controlBusy && (
                    <p role="status">{intl.formatMessage(messages.controlling)}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      buttonType="playback"
                      buttonSize="sm"
                      disabled={controlBusy || session?.player?.isOperating}
                      onClick={() => void sendControl('play')}
                    >
                      <PlayIcon aria-hidden="true" />
                      {intl.formatMessage(messages.play)}
                    </Button>
                    <Button
                      buttonType="playback"
                      buttonSize="sm"
                      disabled={controlBusy || session?.player?.isOperating}
                      onClick={() => void sendControl('pause')}
                    >
                      <PauseIcon aria-hidden="true" />
                      {intl.formatMessage(messages.pause)}
                    </Button>
                    <Button
                      buttonType="playback"
                      buttonSize="sm"
                      disabled={controlBusy || session?.player?.isOperating}
                      onClick={() => void sendControl('skip')}
                    >
                      <ForwardIcon aria-hidden="true" />
                      {intl.formatMessage(messages.skip)}
                    </Button>
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer">
                      {intl.formatMessage(messages.advancedControls)}
                    </summary>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        buttonType="default"
                        buttonSize="sm"
                        disabled={controlBusy || session?.player?.isOperating}
                        onClick={() => void sendControl('prev')}
                      >
                        {intl.formatMessage(messages.previous)}
                      </Button>
                      <Button
                        buttonType="default"
                        buttonSize="sm"
                        disabled={controlBusy || session?.player?.isOperating}
                        onClick={() => void sendControl('stopAfter')}
                      >
                        {intl.formatMessage(messages.stopAfter)}
                      </Button>
                      <Button
                        buttonType="default"
                        buttonSize="sm"
                        disabled={controlBusy || session?.player?.isOperating}
                        onClick={() => void sendControl('showSubs')}
                      >
                        {intl.formatMessage(messages.showLyrics)}
                      </Button>
                      <Button
                        buttonType="default"
                        buttonSize="sm"
                        disabled={controlBusy || session?.player?.isOperating}
                        onClick={() => void sendControl('hideSubs')}
                      >
                        {intl.formatMessage(messages.hideLyrics)}
                      </Button>
                      <Button
                        buttonType="default"
                        buttonSize="sm"
                        disabled={controlBusy || session?.player?.isOperating}
                        onClick={() => void sendControl('mute')}
                      >
                        {intl.formatMessage(messages.mute)}
                      </Button>
                      <Button
                        buttonType="default"
                        buttonSize="sm"
                        disabled={controlBusy || session?.player?.isOperating}
                        onClick={() => void sendControl('unmute')}
                      >
                        {intl.formatMessage(messages.unmute)}
                      </Button>
                      <Button
                        buttonType="default"
                        buttonSize="sm"
                        disabled={controlBusy || session?.player?.isOperating}
                        onClick={() => void sendControl('seek', -10)}
                      >
                        {intl.formatMessage(messages.seekBack)}
                      </Button>
                      <Button
                        buttonType="default"
                        buttonSize="sm"
                        disabled={controlBusy || session?.player?.isOperating}
                        onClick={() => void sendControl('seek', 10)}
                      >
                        {intl.formatMessage(messages.seekForward)}
                      </Button>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <label htmlFor="karaoke-volume">
                        {intl.formatMessage(messages.volume)}: {volume}
                      </label>
                      <input
                        id="karaoke-volume"
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={volume}
                        onChange={(event) => setVolume(Number(event.target.value))}
                        disabled={controlBusy || session?.player?.isOperating}
                      />
                      <Button
                        buttonType="default"
                        buttonSize="sm"
                        disabled={controlBusy || session?.player?.isOperating}
                        onClick={() => void sendControl('setVolume', volume)}
                      >
                        {intl.formatMessage(messages.applyVolume)}
                      </Button>
                    </div>
                  </details>
                </div>
              )}
              {status.playerUrl && (
                <p>
                  <Button
                    as="a"
                    href={status.playerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    buttonType="default"
                    buttonSize="sm"
                  >
                    {intl.formatMessage(messages.player)}
                  </Button>
                </p>
              )}
            </section>
          </>
        )}

        {notice && (
          <p role="status" aria-live="polite">
            {notice}
          </p>
        )}
        {operationFailed && (
          <Alert
            title={intl.formatMessage(
              operationFailed === 'request'
                ? messages.requestFailed
                : operationFailed === 'review'
                  ? messages.reviewFailed
                  : operationFailed === 'cancel'
                    ? messages.cancelFailed
                    : operationFailed === 'reorder'
                      ? messages.reorderFailed
                      : messages.controlFailed
            )}
            type="warning"
          />
        )}
      </div>
    </>
  );
};

export default Karaoke;
