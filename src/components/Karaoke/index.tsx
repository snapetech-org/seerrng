import Alert from '@app/components/Common/Alert';
import Button from '@app/components/Common/Button';
import Header from '@app/components/Common/Header';
import PageTitle from '@app/components/Common/PageTitle';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import type {
  KaraokeAvailability,
  KaraokeQueueItemResponse,
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
import { useEffect, useState } from 'react';
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

interface KaraokeSearchEnvelope {
  results: KaraokeSongResponse[];
}

const messages = defineMessages('components.Karaoke', {
  title: 'Karaoke',
  intro: 'Search the connected karaoke songbook and add a song to the shared session.',
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
  request: 'Add to session',
  requesting: 'Adding…',
  requestSuccess: 'Song added to the shared session.',
  requestPosition: 'Song added at position {position}.',
  requestFailed: 'The song could not be added to the shared session.',
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
  waitingHeading: 'Coming up',
  emptyQueue: 'No songs are waiting.',
  hostControls: 'Host controls',
  play: 'Play',
  pause: 'Pause',
  skip: 'Skip',
  controlFailed: 'The player command could not be sent.',
  player: 'Open karaoke display',
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
  (await axios.get<KaraokeSearchEnvelope>(url)).data;

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

const QueueItem = ({ item }: { item: KaraokeQueueItemResponse }) => (
  <li>
    <article>
      <h3>{item.title}</h3>
      {item.artists.length > 0 && <p>{item.artists.join(', ')}</p>}
      {item.requester && <p>{item.requester}</p>}
    </article>
  </li>
);

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
  const [requestingId, setRequestingId] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [operationFailed, setOperationFailed] = useState<
    'request' | 'control' | undefined
  >();

  const { data: status, error: statusError } = useSWR<KaraokeStatus>(
    '/api/v1/karaoke/status',
    fetchStatus
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const searchKey =
    status?.configured && searchQuery.length >= 2
      ? '/api/v1/karaoke/search?query=' +
        encodeURIComponent(searchQuery) +
        '&limit=25'
      : null;
  const { data: searchResult, error: searchError } =
    useSWR<KaraokeSearchEnvelope>(searchKey, fetchResults);

  const sessionKey = status?.configured ? '/api/v1/karaoke/session' : null;
  const {
    data: sessionResult,
    error: sessionError,
    mutate: refreshSession,
  } = useSWR<KaraokeSessionEnvelope>(sessionKey, fetchSession, {
    refreshInterval: 10000,
    revalidateOnFocus: true,
  });

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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

  const sendControl = async (command: 'play' | 'pause' | 'skip') => {
    setNotice(undefined);
    setOperationFailed(undefined);
    try {
      await axios.post('/api/v1/karaoke/control', { command });
      void refreshSession();
    } catch (error) {
      const message = responseMessage(error);
      if (message) {
        setNotice(message);
      } else {
        setOperationFailed('control');
      }
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
                      <QueueItem item={session.current} />
                    </div>
                  )}
                  <h3>{intl.formatMessage(messages.waitingHeading)}</h3>
                  {session.waiting.length === 0 ? (
                    <p>{intl.formatMessage(messages.emptyQueue)}</p>
                  ) : (
                    <ol>
                      {session.waiting.map((item) => (
                        <QueueItem key={item.id} item={item} />
                      ))}
                    </ol>
                  )}
                </>
              )}
              {canHost && (
                <div>
                  <h3>{intl.formatMessage(messages.hostControls)}</h3>
                  <Button
                    buttonType="playback"
                    buttonSize="sm"
                    onClick={() => void sendControl('play')}
                  >
                    <PlayIcon aria-hidden="true" />
                    {intl.formatMessage(messages.play)}
                  </Button>
                  <Button
                    buttonType="playback"
                    buttonSize="sm"
                    onClick={() => void sendControl('pause')}
                  >
                    <PauseIcon aria-hidden="true" />
                    {intl.formatMessage(messages.pause)}
                  </Button>
                  <Button
                    buttonType="playback"
                    buttonSize="sm"
                    onClick={() => void sendControl('skip')}
                  >
                    <ForwardIcon aria-hidden="true" />
                    {intl.formatMessage(messages.skip)}
                  </Button>
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
              operationFailed === 'request' ? messages.requestFailed : messages.controlFailed
            )}
            type="warning"
          />
        )}
      </div>
    </>
  );
};

export default Karaoke;
