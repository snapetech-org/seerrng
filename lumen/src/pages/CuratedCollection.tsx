import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import MusicCollectionRequests from '../components/MusicCollectionRequests';
import TvCollectionRequests from '../components/TvCollectionRequests';
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
    status?: string;
    genreIds?: number[];
    voteAverage?: number;
    originalLanguage?: string;
    posterPath?: string;
    primaryType?: string;
    secondaryTypes?: string[];
    subtitle?: string;
    genres?: string[];
    mediaInfo?: MediaInfo;
    availableQualities?: ('MP3' | 'FLAC')[];
  }[];
}

const emptyMusicFilters = { type: '', genre: '', year: '' };

function releaseTypes(part: Collection['parts'][number]) {
  const fallback = part.subtitle?.split(' · ') ?? [];
  return {
    primary: part.primaryType || fallback[0] || 'Album',
    secondary: part.secondaryTypes ?? fallback.slice(1),
  };
}

function MusicReleases({
  members,
  refresh,
}: {
  members: Collection['parts'];
  refresh: () => void;
}) {
  const [filters, setFilters] = useState({
    ...emptyMusicFilters,
    type: 'album',
  });
  const options = (values: string[]) =>
    [
      ...new Map(
        values.map((name) => [name.trim().toLowerCase(), name.trim()])
      ).entries(),
    ]
      .filter(([key]) => key)
      .sort((left, right) => left[1].localeCompare(right[1]));
  const year = (part: Collection['parts'][number]) =>
    /^\d{4}/.exec(part.releaseDate ?? '')?.[0] ?? 'unknown';
  const types = options([
    'Album',
    ...members.flatMap((part) => {
      const { primary, secondary } = releaseTypes(part);
      return [primary, ...secondary];
    }),
  ]);
  const genres = options(members.flatMap((part) => part.genres ?? []));
  const years = [...new Set(members.map(year))]
    .filter((value) => value !== 'unknown')
    .sort()
    .reverse();
  const controls = [
    ['type', 'Release Type', types],
    ['genre', 'Genre', genres],
    [
      'year',
      'Release Year',
      [
        ...years.map((value) => [value, value]),
        ...(members.some((part) => year(part) === 'unknown')
          ? [['unknown', 'Unknown']]
          : []),
      ],
    ],
  ] as const;

  const visible = members.filter((part) => {
    const { primary, secondary } = releaseTypes(part);
    const matchesType =
      filters.type === 'album'
        ? primary.toLowerCase() === 'album' && !secondary.length
        : [primary, ...secondary].some(
            (type) => type.toLowerCase() === filters.type
          );
    return (
      (!filters.type || matchesType) &&
      (!filters.genre ||
        part.genres?.some(
          (genre) => genre.trim().toLowerCase() === filters.genre
        )) &&
      (!filters.year || year(part) === filters.year)
    );
  });
  return (
    <Section title="Releases">
      {!!members.length && (
        <div className="toolbar" role="group" aria-label="Collection Filters">
          {controls.map(([key, label, choices]) => (
            <label className="sel" key={key}>
              <span className="lbl">{label}</span>
              <select
                value={filters[key]}
                onChange={(event) => {
                  const value = event.target.value;
                  setFilters((previous) => ({ ...previous, [key]: value }));
                }}
              >
                <option value="">Any</option>
                {choices.map(([value, name]) => (
                  <option key={value} value={value}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <MusicCollectionRequests releases={visible} refresh={refresh} />
          {Object.values(filters).some(Boolean) && (
            <button
              className="btn btn-quiet btn-sm"
              type="button"
              onClick={() => setFilters(emptyMusicFilters)}
            >
              Clear Filters
            </button>
          )}
        </div>
      )}
      {!visible.length ? (
        <p className="note">
          {members.length
            ? 'No releases match these filters.'
            : 'No releases are available in this collection.'}
        </p>
      ) : (
        <div className="sqg grid">
          {visible.map((part) => {
            const { primary, secondary } = releaseTypes(part);
            const type =
              primary.toLowerCase() === 'album' && secondary.length
                ? secondary.join(' · ')
                : [primary, ...secondary].join(' · ');
            return (
              <ExtraCard
                key={part.id}
                title={part.title}
                href={`/music/${encodeURIComponent(part.id)}`}
                img={artUrl(part.posterPath)}
                shape="sq"
                icon="music"
                stat={extraStat(part.mediaInfo)}
                meta={[part.releaseDate?.slice(0, 4), type]
                  .filter(Boolean)
                  .join(' · ')}
                note={part.availableQualities?.join(' · ')}
              />
            );
          })}
        </div>
      )}
    </Section>
  );
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
  const members = useMemo(() => {
    const updates = new Map(latest?.map((part) => [part.id, part]));
    return (data?.parts ?? []).map((part) => {
      const updated = updates.get(part.id);
      return updated
        ? {
            ...part,
            mediaInfo: updated.mediaInfo,
            availableQualities: updated.availableQualities,
          }
        : part;
    });
  }, [data?.parts, latest]);
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
        {music ? (
          <MusicReleases members={members} refresh={collection.reload} />
        ) : (
          <Section
            title="Series in This Collection"
            action={
              <TvCollectionRequests
                members={members}
                refresh={collection.reload}
              />
            }
          >
            {members.length ? (
              <div className="grid">
                {members.map((part) => (
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
                ))}
              </div>
            ) : (
              <p className="note">
                No titles are available in this collection.
              </p>
            )}
          </Section>
        )}
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
