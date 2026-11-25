import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  api,
  MediaStatus,
  tmdbImg,
  youtubeTrailerUrl,
  type MovieDetails,
} from '../api';
import { isAdministrator, useAuth } from '../auth';
import { canManageBlocklist, notifyBlocklistChanged } from '../blocklist';
import { Section, TitleCard } from '../components/cards';
import { CollectionMetadataDisclosures } from '../components/CollectionMetadataDisclosures';
import CollectionPlaybackSheet, {
  collectionPlaybackQualities,
} from '../components/CollectionPlaybackSheet';
import CollectionQueueSheet from '../components/CollectionQueueSheet';
import CollectionRequestSheet, {
  type MovieCollection,
} from '../components/CollectionRequestSheet';
import CollectionServerActions, {
  type CollectionSync,
} from '../components/CollectionServerSheet';
import { ConfirmSheet } from '../components/ConfirmSheet';
import {
  canRequest4k,
  canRequestMovies,
  DetailTop,
} from '../components/detail';
import { ServiceNote } from '../components/extra';
import { useToast } from '../components/toast';
import { friendlyError } from '../errors';
import { useApi, usePublicSettings } from '../hooks';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';
import { CollectionAssociations } from './Associations';

function CollectionContent({ id }: { id: number }) {
  const { t } = useLumenLocale();
  const { user } = useAuth();
  const toast = useToast();
  const { data, error, reload, refresh } = useApi<MovieCollection>(
    `/collection/${id}`
  );
  const firstMovie = data?.id === id ? data.parts[0] : undefined;
  const firstMovieDetails = useApi<MovieDetails>(
    firstMovie &&
      Number.isSafeInteger(firstMovie.id) &&
      firstMovie.id > 0 &&
      firstMovie.id <= 1_000_000_000
      ? `/movie/${firstMovie.id}`
      : null,
    { currentPathOnly: true }
  );
  const [confirm, setConfirm] = useState<'add' | 'remove'>();
  const [confirmFailure, setConfirmFailure] = useState(false);
  const settings = usePublicSettings();
  const trailer = youtubeTrailerUrl(
    firstMovieDetails.data?.relatedVideos,
    settings?.youtubeUrl
  );
  const [requestOpen, setRequestOpen] = useState(false);
  const [playOpen, setPlayOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const checkingServer = useRef(false);
  const [serverBusy, setServerBusy] = useState(false);
  const [serverSync, setServerSync] = useState<CollectionSync>();
  const [serverError, setServerError] = useState('');
  const canSync =
    isAdministrator(user?.permissions) &&
    [1, 2, 3].includes(settings?.mediaServerType ?? 0);

  async function checkServer() {
    if (!canSync || checkingServer.current) return;
    checkingServer.current = true;
    setServerBusy(true);
    setServerError('');
    const generation = sessionGeneration();
    try {
      const result = await api<{
        collection: MovieCollection;
        sync: CollectionSync;
      }>(`/collection/${id}/availability`, {
        method: 'POST',
        invalidateCache: false,
      });
      if (generation !== sessionGeneration()) return;
      if (result.collection?.id !== id || !result.sync)
        throw new Error(
          t(
            'lumen.collectionDetail.verifyFailure',
            'Could not verify this collection on the media server.'
          )
        );
      setServerSync(result.sync);
    } catch (error) {
      if (generation === sessionGeneration()) {
        setServerSync(undefined);
        setServerError(
          friendlyError(
            error,
            t(
              'lumen.collectionDetail.checkFailure',
              'Could not check the media server.'
            )
          )
        );
      }
    } finally {
      checkingServer.current = false;
      if (generation === sessionGeneration()) setServerBusy(false);
    }
  }
  const qualities: ('hd' | '4k')[] = [];
  if (canRequestMovies(user?.permissions)) qualities.push('hd');
  if (settings?.movie4kEnabled && canRequest4k(user?.permissions, 'movie'))
    qualities.push('4k');
  const manager = canManageBlocklist(user?.permissions);
  const blocked =
    data?.parts.filter(
      (part) => part.mediaInfo?.status === MediaStatus.BLOCKLISTED
    ).length ?? 0;
  const action = blocked ? 'remove' : 'add';

  async function apply() {
    if (
      !manager ||
      !data?.parts.length ||
      data.id !== id ||
      confirm !== action ||
      working.current
    )
      return;
    working.current = true;
    setBusy(true);
    let succeeded = false;
    try {
      await api<void>(
        `/blocklist/collection/${id}`,
        { method: action === 'add' ? 'POST' : 'DELETE' },
        'empty'
      );
      succeeded = true;
      refresh();
      toast(
        action === 'add'
          ? t(
              'lumen.collectionDetail.added',
              'Collection added to the Blocklist.'
            )
          : t(
              'lumen.collectionDetail.removed',
              'Collection removed from the Blocklist.'
            )
      );
    } catch {
      try {
        const latest = await api<MovieCollection>(`/collection/${id}`, {
          method: 'GET',
          cache: 'no-store',
        });
        const blockedCount = latest.parts.filter(
          (part) => part.mediaInfo?.status === MediaStatus.BLOCKLISTED
        ).length;
        succeeded =
          latest.id === id &&
          latest.parts.length > 0 &&
          (action === 'add'
            ? blockedCount === latest.parts.length
            : blockedCount === 0);
      } catch {
        succeeded = false;
      }
      if (succeeded) {
        refresh();
        toast(
          action === 'add'
            ? t(
                'lumen.collectionDetail.added',
                'Collection added to the Blocklist.'
              )
            : t(
                'lumen.collectionDetail.removed',
                'Collection removed from the Blocklist.'
              )
        );
      } else {
        setConfirmFailure(true);
      }
    } finally {
      if (succeeded) {
        notifyBlocklistChanged();
        setConfirm(undefined);
      }
      working.current = false;
      setBusy(false);
    }
  }

  if (error)
    return (
      <ServiceNote
        error={error}
        what={t('lumen.collectionDetail.item', 'this collection')}
        title={t(
          'lumen.collectionDetail.loadFailure',
          'Could not load this collection'
        )}
        retryLabel={t('lumen.collectionDetail.retry', 'Retry')}
        retry={reload}
      />
    );
  if (!data)
    return (
      <p className="note" role="status">
        {t('lumen.collectionDetail.loading', 'Loading collection…')}
      </p>
    );
  if (data.id !== id)
    return (
      <p className="note">
        {t('lumen.collectionDetail.notFound', 'Collection not found.')}
      </p>
    );
  const playableQualities = canRequestMovies(user?.permissions)
    ? collectionPlaybackQualities(
        data.parts,
        !!settings?.movie4kEnabled && canRequest4k(user?.permissions, 'movie'),
        settings?.otherUsersAvailability
      )
    : [];
  const title =
    action === 'add'
      ? t('lumen.collectionDetail.blocklist', 'Blocklist Collection')
      : t('lumen.collectionDetail.unblock', 'Unblock Collection');

  return (
    <article className="detail">
      <DetailTop
        title={data.name}
        poster={tmdbImg(data.posterPath, 'w500')}
        backdrop={tmdbImg(data.backdropPath, 'w1280')}
        line={[
          t(
            data.parts.length === 1
              ? 'lumen.collectionDetail.oneMovie'
              : 'lumen.collectionDetail.movieCount',
            data.parts.length === 1 ? '{count} movie' : '{count} movies',
            { count: data.parts.length }
          ),
        ]}
      />
      <div className="dbody">
        {canSync && data.parts.length > 0 && (
          <details
            className="adv"
            onToggle={(event) => {
              if (event.currentTarget.open && !serverSync) void checkServer();
            }}
          >
            <summary>
              {t(
                'lumen.collectionDetail.mediaServerCollection',
                'Media Server Collection'
              )}
            </summary>
            {serverBusy && (
              <p className="note" role="status">
                {t(
                  'lumen.collectionDetail.checkingLibraries',
                  'Checking media-server libraries…'
                )}
              </p>
            )}
            <ServiceNote
              what={t(
                'lumen.collectionDetail.mediaServerLibraries',
                'media-server libraries'
              )}
              error={serverError || null}
              title={t(
                'lumen.collectionDetail.checkFailure',
                'Could not check the media server.'
              )}
              retryLabel={t('lumen.collectionDetail.retry', 'Retry')}
              retry={() => void checkServer()}
            />
            {serverSync && !serverSync.supported && (
              <p className="note">
                {t(
                  'lumen.collectionDetail.serverUnsupported',
                  'This media server does not support collection changes.'
                )}
              </p>
            )}
            <CollectionServerActions
              endpoint={`/collection/${id}/server`}
              sync={serverBusy ? undefined : serverSync}
              visibleIds={data.parts.map(({ id }) => String(id))}
              onComplete={() => void checkServer()}
            />
          </details>
        )}
        <CollectionAssociations
          key={data.parts.map(({ id }) => id).join(',')}
          mediaType="movie"
          parts={data.parts}
        />
        {data.parts.length > 0 && (
          <div className="dstatus">
            {trailer && (
              <a
                className="btn btn-quiet btn-sm"
                href={trailer}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('lumen.collectionDetail.watchTrailer', 'Watch Trailer')}
              </a>
            )}
            {playableQualities.length > 0 && (
              <button
                className="btn btn-tonal btn-sm"
                onClick={() => setPlayOpen(true)}
              >
                {t('lumen.collectionPlayback.title', 'Play Collection')}
              </button>
            )}
            {qualities.length > 0 && (
              <button
                className="btn btn-tonal btn-sm"
                onClick={() => setRequestOpen(true)}
              >
                {t('lumen.collectionRequest.title', 'Request Collection')}
              </button>
            )}
            <button
              className="btn btn-quiet btn-sm"
              onClick={() => setQueueOpen(true)}
            >
              {t('lumen.collectionQueue.title', 'Queue Collection')}
            </button>
            {blocked > 0 && (
              <span className="dnote">
                {t(
                  'lumen.collectionDetail.blockedCount',
                  '{blocked} of {total} blocklisted',
                  { blocked, total: data.parts.length }
                )}
              </span>
            )}
            {manager && (
              <button
                className="btn btn-quiet btn-sm"
                disabled={busy}
                onClick={() => {
                  setConfirmFailure(false);
                  setConfirm(action);
                }}
              >
                {title}
              </button>
            )}
          </div>
        )}
        {data.overview && <p className="ov">{data.overview}</p>}
        <CollectionMetadataDisclosures parts={data.parts} />
        <Section title={t('lumen.collectionDetail.movies', 'Movies')}>
          {data.parts.length ? (
            <div className="grid">
              {data.parts.map((part) => (
                <TitleCard key={part.id} it={part} />
              ))}
            </div>
          ) : (
            <p className="note">
              {t('lumen.collectionDetail.noMovies', 'No movies listed.')}
            </p>
          )}
        </Section>
      </div>
      {requestOpen && (
        <CollectionRequestSheet
          collection={data}
          qualities={qualities}
          permissions={user?.permissions}
          close={(submitted) => {
            setRequestOpen(false);
            if (submitted) reload();
          }}
        />
      )}
      {playOpen && playableQualities.length > 0 && (
        <CollectionPlaybackSheet
          title={data.name}
          parts={data.parts}
          qualities={playableQualities}
          visibility={settings?.otherUsersAvailability}
          close={() => setPlayOpen(false)}
        />
      )}
      {queueOpen && (
        <CollectionQueueSheet
          id={id}
          title={data.name}
          close={() => {
            setQueueOpen(false);
            reload();
          }}
        />
      )}
      {confirm && (
        <ConfirmSheet
          title={
            confirm === 'add'
              ? t(
                  'lumen.collectionDetail.confirmBlocklist',
                  'Blocklist this collection?'
                )
              : t(
                  'lumen.collectionDetail.confirmUnblock',
                  'Unblock this collection?'
                )
          }
          body={
            confirm === 'add'
              ? t(
                  'lumen.collectionDetail.blocklistExplanation',
                  'New requests for all movies in this collection will be blocked.'
                )
              : t(
                  'lumen.collectionDetail.unblockExplanation',
                  'This removes Blocklist entries for all movies in this collection, including individually blocked movies.'
                )
          }
          confirm={title}
          cancel={t('lumen.tvRequests.cancel', 'Cancel')}
          busy={busy}
          onConfirm={() => void apply()}
          onClose={() => {
            if (!working.current) {
              setConfirm(undefined);
              setConfirmFailure(false);
            }
          }}
        >
          {confirmFailure && (
            <p className="note" role="alert">
              {t(
                'lumen.collectionDetail.changeUnconfirmed',
                'Could not confirm the change. Check the collection before trying again.'
              )}
            </p>
          )}
        </ConfirmSheet>
      )}
    </article>
  );
}

export default function CollectionDetail() {
  const { t } = useLumenLocale();
  const { id = '' } = useParams();
  const number = /^\d+$/.test(id) ? Number(id) : 0;
  return Number.isSafeInteger(number) &&
    number > 0 &&
    number <= 1_000_000_000 ? (
    <CollectionContent key={number} id={number} />
  ) : (
    <p className="note">
      {t('lumen.collectionDetail.notFound', 'Collection not found.')}
    </p>
  );
}
