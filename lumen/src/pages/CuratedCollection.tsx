import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, artUrl, MediaStatus, tmdbImg, type MediaInfo } from '../api';
import { isAdministrator, useAuth } from '../auth';
import { Section, TitleCard } from '../components/cards';
import { DetailTop } from '../components/detail';
import {
  ExtraCard,
  ExtraGate,
  extraStat,
  ServiceNote,
} from '../components/extra';
import { friendlyError } from '../errors';
import { useApi, usePublicSettings } from '../hooks';

type Kind = 'tv' | 'music';
interface Collection {
  id: string;
  name: string;
  overview?: string;
  posterPath?: string;
  backdropPath?: string;
  parts: {
    id: string;
    title: string;
    releaseDate?: string;
    posterPath?: string;
    primaryType?: string;
    mediaInfo?: MediaInfo;
    availableQualities?: ('MP3' | 'FLAC')[];
  }[];
}

function Content({ kind, id }: { kind: Kind; id: string }) {
  const [params] = useSearchParams();
  const path = `/collection-catalog/${kind}/${encodeURIComponent(id)}`;
  const collection = useApi<Collection>(path);
  const data = collection.data;
  const music = kind === 'music';
  const { user } = useAuth();
  const settings = usePublicSettings();
  const server = settings?.mediaServerType;
  const supportsSync =
    !(music && params.get('view') === 'discography') &&
    [1, 2, 3].includes(server ?? 0);
  const pending = useRef(false);
  const [latest, setLatest] = useState<Collection['parts']>();
  const [checking, setChecking] = useState(false);
  const [syncError, setSyncError] = useState<string>();
  const lastRead = useRef(0);
  const refreshAvailability = useCallback(async () => {
    if (pending.current || !supportsSync) return;
    pending.current = true;
    lastRead.current = Date.now();
    setChecking(true);
    setSyncError(undefined);
    try {
      const result = await api<{ collection: Collection }>(
        path + '/availability',
        {
          method: 'POST',
          invalidateCache: false,
        }
      );
      if (result.collection.id === id) setLatest(result.collection.parts);
    } catch (failure) {
      setSyncError(
        friendlyError(failure, 'Could not refresh collection availability.')
      );
    } finally {
      pending.current = false;
      setChecking(false);
    }
  }, [path, id, supportsSync]);
  // Use the catalog GET's authorized membership. The availability response
  // from older servers can include series omitted by the viewer's policy.
  const updates = new Map(latest?.map((part) => [part.id, part]));
  const parts = data?.parts ?? [];
  const members = parts.map((part) => {
    const updated = updates.get(part.id);
    return updated
      ? {
          ...part,
          mediaInfo: updated.mediaInfo,
          availableQualities: updated.availableQualities,
        }
      : part;
  });
  const hasMembers = members.length > 0;
  const shouldPoll =
    isAdministrator(user?.permissions) ||
    members.some(
      (part) =>
        part.mediaInfo?.status !== MediaStatus.AVAILABLE ||
        (!music &&
          settings?.series4kEnabled &&
          part.mediaInfo?.status4k !== MediaStatus.AVAILABLE)
    );
  useEffect(() => {
    if (!supportsSync || !hasMembers || !shouldPoll) return;
    const refresh = () => {
      if (
        document.visibilityState === 'visible' &&
        navigator.onLine &&
        Date.now() - lastRead.current >= 60_000
      )
        void refreshAvailability();
    };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [supportsSync, hasMembers, shouldPoll, refreshAvailability]);
  const returnAlbum = params.get('albumId');
  const albumId =
    returnAlbum &&
    /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(returnAlbum)
      ? returnAlbum
      : null;
  if (!data)
    return (
      <>
        <header className="ph">
          <h1>{music ? 'Discography' : 'Series Collection'}</h1>
        </header>
        <ServiceNote
          what="this collection"
          error={collection.error}
          retry={collection.reload}
        />
        {!collection.error && (
          <p className="note" role="status">
            Loading collection…
          </p>
        )}
      </>
    );

  const noun = music ? 'releases' : 'series';
  return (
    <article className="detail">
      <DetailTop
        title={data.name}
        poster={
          music ? artUrl(data.posterPath) : tmdbImg(data.posterPath, 'w500')
        }
        backdrop={
          music
            ? artUrl(data.backdropPath)
            : tmdbImg(data.backdropPath, 'w1280')
        }
        square={music}
        line={[`${members.length} ${noun}`]}
      />
      <div className="dbody">
        {albumId && music && (
          <Link className="btn btn-quiet btn-sm" to={`/music/${albumId}`}>
            Back to Album
          </Link>
        )}
        {supportsSync && hasMembers && (
          <>
            <div className="toolbar">
              <button
                className="btn btn-tonal btn-sm"
                type="button"
                disabled={checking}
                onClick={() => void refreshAvailability()}
              >
                {checking ? 'Checking Availability…' : 'Refresh Availability'}
              </button>
            </div>
            {syncError && (
              <p className="note" role="alert">
                {syncError}
              </p>
            )}
          </>
        )}
        {data.overview && <p className="ov">{data.overview}</p>}
        <Section title={music ? 'Releases' : 'Series in This Collection'}>
          {members.length ? (
            <div className={music ? 'sqg grid' : 'grid'}>
              {members.map((part) =>
                music ? (
                  <ExtraCard
                    key={part.id}
                    title={part.title}
                    href={`/music/${encodeURIComponent(part.id)}`}
                    img={artUrl(part.posterPath)}
                    shape="sq"
                    icon="music"
                    stat={extraStat(part.mediaInfo)}
                    meta={[part.releaseDate?.slice(0, 4), part.primaryType]
                      .filter(Boolean)
                      .join(' · ')}
                    note={part.availableQualities?.join(' · ')}
                  />
                ) : (
                  <TitleCard
                    key={part.id}
                    it={{
                      id: Number(part.id),
                      name: part.title,
                      mediaType: 'tv',
                      firstAirDate: part.releaseDate,
                      posterPath: part.posterPath,
                      mediaInfo: part.mediaInfo,
                    }}
                  />
                )
              )}
            </div>
          ) : (
            <p className="note">No titles are available in this collection.</p>
          )}
        </Section>
      </div>
    </article>
  );
}

export default function CuratedCollection() {
  const { kind, id = '' } = useParams();
  if ((kind !== 'music' && kind !== 'tv') || !/^[a-z0-9_-]{1,128}$/i.test(id))
    return <p className="note">Collection not found.</p>;
  const content = <Content key={`${kind}:${id}`} kind={kind} id={id} />;
  return kind === 'music' ? (
    <ExtraGate k="music">{content}</ExtraGate>
  ) : (
    content
  );
}
