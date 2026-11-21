import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { isAdministrator, useAuth } from '../auth';
import BlocklistButton from '../components/BlocklistButton';
import { MoreOnScroll, Section } from '../components/cards';
import {
  canRequestMusic,
  canUseRequestAccess,
  DetailTop,
  Facts,
  Pill,
} from '../components/detail';
import {
  ExtraCard,
  ExtraGate,
  ExtraHeader,
  ExtraSearch,
  extraStat,
  RequestButton,
  ServiceNote,
  StatPill,
} from '../components/extra';
import { GenrePicker } from '../components/GenrePicker';
import IndexerSearchLink from '../components/IndexerSearchLink';
import ReportIssueButton from '../components/ReportIssueButton';
import WatchlistButton from '../components/WatchlistButton';
import {
  discoveryVisibility,
  showDiscoveryTitle,
} from '../discoveryVisibility';
import {
  artistOf,
  fmtTrack,
  requestExtra,
  type Album,
  type AlbumDetails,
  type ArtistDetails,
} from '../extras';
import { useApi, usePaged, usePublicSettings } from '../hooks';
import { Icon } from '../icons';
import { useLiveMediaProgress } from '../useLiveDownloadProgress';
import { AssociationLink } from './Associations';

const SORTS = [
  ['ranked', 'Recommended'],
  ['popular.week', 'This week'],
  ['popular.month', 'This month'],
  ['popular.year', 'This year'],
  ['listen_count.desc', 'Most played'],
  ['release_date.desc', 'Newest'],
  ['release_date.asc', 'Oldest'],
  ['listen_count.asc', 'Least played'],
  ['ranked.asc', 'Recommended (ascending)'],
  ['popular.week.asc', 'This week (ascending)'],
  ['popular.month.asc', 'This month (ascending)'],
  ['popular.year.asc', 'This year (ascending)'],
] as const;
// Keep these MusicBrainz labels aligned with the server's release type filters.
const RELEASE_TYPES = [
  'Album',
  'Single',
  'EP',
  'Broadcast',
  'Other',
  'Compilation',
  'Soundtrack',
  'Spokenword',
  'Interview',
  'Audiobook',
  'Audio drama',
  'Live',
  'Remix',
  'DJ-mix',
  'Mixtape/Street',
  'Demo',
  'Field recording',
].map((label) => ({ value: label.toLowerCase(), label }));
const MUSIC_FILTERS = [
  { key: 'genre', label: 'Genre', type: 'search' },
  { key: 'artist', label: 'Artist', type: 'search' },
  { key: 'primaryReleaseDateGte', label: 'Released From', type: 'date' },
  { key: 'primaryReleaseDateLte', label: 'Released Through', type: 'date' },
] as const;

function MusicArtistFilter({
  artist,
  artistId,
}: {
  artist: string;
  artistId: string;
}) {
  const [name, setName] = useState(artist);
  const [selectedId, setSelectedId] = useState(artistId);
  const [term, setTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTerm(term), 350);
    return () => clearTimeout(timer);
  }, [term]);
  const path =
    term && term === debouncedTerm
      ? '/search?' + new URLSearchParams({ query: term, type: 'artist' })
      : null;
  const lookup = useApi<{
    results: {
      id: string;
      mediaType: string;
      name: string;
      disambiguation?: string;
    }[];
  }>(path, { currentPathOnly: true });
  const matches =
    lookup.data?.results.filter((result) => result.mediaType === 'artist') ??
    [];
  return (
    <>
      <label className="sel">
        <span className="lbl">Artist</span>
        <input
          className="cfg-input"
          type="search"
          name="artist"
          maxLength={256}
          value={name}
          onChange={(event) => {
            setName(event.currentTarget.value);
            setTerm(event.currentTarget.value.trim());
            setSelectedId('');
          }}
        />
      </label>
      <input type="hidden" name="artistId" value={selectedId} />
      {matches.length > 0 && (
        <label className="sel">
          <span className="lbl">Artist Match</span>
          <select
            value={selectedId}
            onChange={(event) => {
              const match = matches.find(
                ({ id }) => id === event.currentTarget.value
              );
              setSelectedId(match?.id ?? '');
              if (match) setName(match.name);
            }}
          >
            <option value="">Use Artist Text</option>
            {matches.map((match) => (
              <option key={match.id} value={match.id}>
                {match.name}
                {match.disambiguation ? ` (${match.disambiguation})` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      {lookup.error && (
        <button
          className="btn btn-quiet btn-sm"
          type="button"
          onClick={lookup.reload}
        >
          Retry Artist Lookup
        </button>
      )}
      {lookup.data && matches.length === 0 && (
        <span className="note" role="status">
          No matching artists.
        </span>
      )}
    </>
  );
}

const big = (n?: number) =>
  !n
    ? ''
    : n >= 1e6
      ? `${(n / 1e6).toFixed(1)}M`
      : n >= 1e3
        ? `${Math.round(n / 1e3)}K`
        : String(n);

export const AlbumCard = ({ a }: { a: Album }) => (
  <ExtraCard
    href={`/music/${a.id}`}
    img={a.posterPath}
    title={a.title}
    shape="sq"
    titleKind="album"
    icon="music"
    stat={extraStat(a.mediaInfo)}
    watchlist={{ mediaType: 'music', id: a.id }}
    meta={[artistOf(a), (a['first-release-date'] || '').slice(0, 4)]
      .filter(Boolean)
      .join(' · ')}
  />
);

// Music: albums from MusicBrainz and ListenBrainz charts; requests go to Lidarr
export function Music() {
  const [p, setP] = useSearchParams();
  const query = p.get('q') || p.get('search') || '';
  const [q, setQ] = useState(query);
  const requestedSort = p.get('sort') || p.get('sortBy');
  const sort =
    SORTS.find(([value]) => value === requestedSort)?.[0] ?? 'ranked';
  const requestedTypes = (p.get('type') || p.get('releaseType') || '')
    .split(',')
    .map((type) => type.trim().toLowerCase());
  const types = [...new Set(requestedTypes)].filter((type) =>
    RELEASE_TYPES.some(({ value }) => type === value)
  );
  const filters = new URLSearchParams();
  for (const name of [
    ...MUSIC_FILTERS.map(({ key }) => key),
    'artistId',
    'availability',
  ]) {
    const value = p.get(name)?.trim();
    if (value) filters.set(name, value);
  }
  const qs = new URLSearchParams(filters);
  qs.set('sortBy', sort);
  if (query) qs.set('query', query);
  if (types.length) qs.set('releaseType', types.join(','));
  const list = usePaged<Album>(`/discover/music?${qs}`);
  const upd = (k: string, v: string) => {
    const n = new URLSearchParams(p);
    if (k === 'sort') n.delete('sortBy');
    if (k === 'type') n.delete('releaseType');
    if (!v || (k === 'sort' && v === 'ranked')) n.delete(k);
    else n.set(k, v);
    setP(n, { replace: true });
  };
  useEffect(() => {
    const value = q.trim();
    if (value === query) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(p);
      next.delete('search');
      if (value) next.set('q', value);
      else next.delete('q');
      setP(next, { replace: true });
    }, 350);
    return () => clearTimeout(timer);
  }, [p, q, query, setP]);
  useEffect(() => {
    setQ((value) => (value.trim() === query ? value : query));
  }, [query]);
  const { user } = useAuth();
  const visibility = discoveryVisibility(
    usePublicSettings(),
    user?.permissions
  );
  if (filters.has('availability')) visibility.hideAvailable = false;
  visibility.hideRequested = false;
  const items = list.items.filter((album) =>
    showDiscoveryTitle(album, visibility)
  );
  const filtered = items.length < list.items.length;

  return (
    <ExtraGate k="music">
      <ExtraHeader
        title="Music"
        sub="Request an album and it lands in your music library."
      >
        <ExtraSearch
          value={q}
          onChange={setQ}
          placeholder="Search albums and artists…"
        />
      </ExtraHeader>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/track-requests">
          Track Requests
        </Link>
        <Link className="btn btn-quiet btn-sm" to="/music/playlist-import">
          Import Playlist
        </Link>
        {canUseRequestAccess(user?.permissions) && (
          <Link className="btn btn-quiet btn-sm" to="/music/collectors">
            Collector Picks
          </Link>
        )}
        <label className="sel">
          <span className="lbl">Sort</span>
          <select value={sort} onChange={(e) => upd('sort', e.target.value)}>
            {SORTS.map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <GenrePicker
          labels={{ title: 'Release Types', all: 'Any Release Type' }}
          options={RELEASE_TYPES}
          picked={types}
          onChange={(value) => upd('type', value.join(','))}
        />
      </div>
      <form
        className="toolbar"
        aria-label="Music Discovery Filters"
        key={filters.toString()}
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const next = new URLSearchParams(p);
          for (const key of [
            ...MUSIC_FILTERS.map((field) => field.key),
            'artistId',
            'availability',
          ]) {
            const value = String(form.get(key) ?? '').trim();
            if (value) next.set(key, value);
            else next.delete(key);
          }
          setP(next, { replace: true });
        }}
      >
        {MUSIC_FILTERS.map(({ key, label, type }) =>
          key === 'artist' ? (
            <MusicArtistFilter
              key={key}
              artist={filters.get(key) ?? ''}
              artistId={filters.get('artistId') ?? ''}
            />
          ) : (
            <label className="sel" key={key}>
              <span className="lbl">{label}</span>
              <input
                className="cfg-input"
                type={type}
                name={key}
                defaultValue={filters.get(key) ?? ''}
                maxLength={type === 'search' ? 256 : undefined}
              />
            </label>
          )
        )}
        <label className="sel">
          <span className="lbl">In Library</span>
          <select
            name="availability"
            defaultValue={filters.get('availability') ?? ''}
          >
            <option value="">Any Quality</option>
            <option value="mp3">MP3</option>
            <option value="flac">FLAC</option>
          </select>
        </label>
        <button className="btn btn-tonal btn-sm" type="submit">
          Apply Music Filters
        </button>
        {filters.has('genre') && (
          <button
            className="chip"
            type="button"
            onClick={() => upd('genre', '')}
          >
            Clear Genre: {filters.get('genre')}
          </button>
        )}
        {filters.has('artistId') && (
          <button
            className="chip"
            type="button"
            onClick={() => upd('artistId', '')}
          >
            Clear Exact Artist
          </button>
        )}
        {filters.size > 0 && (
          <button
            className="chip"
            type="button"
            onClick={() => {
              const next = new URLSearchParams(p);
              for (const key of filters.keys()) next.delete(key);
              setP(next, { replace: true });
            }}
          >
            Clear Music Filters
          </button>
        )}
      </form>
      <ServiceNote error={list.items.length ? null : list.error} what="music" />
      {!list.error && !items.length && !list.loading && list.done && (
        <div className="empty">
          <b>Nothing here</b>
          {query
            ? 'Try fewer words, or just the artist.'
            : 'Try another release type.'}
        </div>
      )}
      <div className="sqg grid">
        {items.map((a) => (
          <AlbumCard key={a.id} a={a} />
        ))}
      </div>
      {filtered && !list.done && !list.error && (
        <div className="more-scroll">
          <button
            className="btn btn-tonal"
            disabled={list.loading}
            onClick={list.more}
          >
            {list.loading ? 'Loading…' : 'Show More Music'}
          </button>
        </div>
      )}
      <MoreOnScroll
        done={list.done || filtered}
        loading={list.loading}
        more={list.more}
        error={list.error}
        retry={list.retry}
      />
    </ExtraGate>
  );
}

export function AlbumDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data: a, error, refresh } = useApi<AlbumDetails>(`/music/${id}`);
  const progressMedia = useLiveMediaProgress(
    a?.mediaInfo,
    isAdministrator(user?.permissions)
  );
  if (error)
    return (
      <ExtraGate k="music">
        <div className="empty">
          <b>Couldn’t load this album</b>
          {error}
        </div>
      </ExtraGate>
    );
  if (!a) return <div className="detail-loading" aria-busy="true" />;
  const s = extraStat(progressMedia);
  const tags = (
    a.tags?.releaseGroup?.length ? a.tags.releaseGroup : a.tags?.artist || []
  )
    .sort((x, y) => y.count - x.count)
    .slice(0, 4)
    .map((t) => t.tag);
  const total = (a.tracks || []).reduce((n, t) => n + (t.length || 0), 0);
  const main = canRequestMusic(user?.permissions) ? (
    <RequestButton
      stat={s}
      label="Request album"
      request={() => requestExtra('music', a.id)}
    />
  ) : null;
  return (
    <ExtraGate k="music">
      <article className="detail">
        <DetailTop
          status={s}
          backdrop={a.artistBackdrop}
          poster={a.posterPath}
          square
          title={a.title}
          by={<Link to={`/artist/${a.artist.id}`}>{a.artist.name}</Link>}
          line={[
            (a.releaseDate || '').slice(0, 4),
            a.type,
            a.tracks?.length ? `${a.tracks.length} tracks` : '',
            total ? fmtTrack(total).replace(/:\d+$/, ' min') : '',
            tags.join(', '),
          ]}
        />
        <div className="dbody">
          <div className="dstatus">
            <StatPill s={s} />
            {!!a.stats?.totalListenCount && (
              <Pill k="neutral" icon="headphones">
                {big(a.stats.totalListenCount)} plays
              </Pill>
            )}
            <Link
              className="btn btn-tonal btn-sm"
              to={`/collections/music/${encodeURIComponent(a.artist.id)}?view=discography&albumId=${encodeURIComponent(a.id)}`}
            >
              View Discography
            </Link>
            <IndexerSearchLink category="music" title={a.title} />
            <AssociationLink mediaType="album" id={id} />
            <BlocklistButton
              mediaType="music"
              id={a.id}
              requestedId={id}
              title={a.title}
              onChange={refresh}
            />
            <ReportIssueButton
              type="music"
              title={a.title}
              media={a.mediaInfo}
            />
            <WatchlistButton mediaType="music" detail={a} requestedId={id} />
          </div>
          <div className="dacts pc">{main}</div>
          <div className="dcols">
            <div>
              {!!a.tracks?.length && (
                <>
                  <div className="h2">Tracks</div>
                  <ol className="slist tlist">
                    {a.tracks.map((t) => (
                      <li key={t.position} className="trow">
                        <span className="tn">{t.position}</span>
                        <span>
                          <b>{t.name}</b>
                          {!!t.totalListenCount && (
                            <small>{big(t.totalListenCount)} plays</small>
                          )}
                        </span>
                        <span className="tl">{fmtTrack(t.length)}</span>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </div>
            <aside>
              <Facts
                rows={[
                  [
                    'Artist',
                    <Link key="a" to={`/artist/${a.artist.id}`}>
                      {a.artist.name}
                    </Link>,
                  ],
                  ['Released', a.releaseDate],
                  ['Label', a.recordLabel],
                  ['From', a.artist.area],
                  ['Type', a.type],
                ]}
              />
            </aside>
          </div>
        </div>
        <div className="actionbar">
          <span className="ab-meta">
            <b>{a.title}</b>
            {a.artist.name}
          </span>
          {main}
        </div>
      </article>
    </ExtraGate>
  );
}

export function Artist() {
  const { id = '' } = useParams();
  const { data: a, error } = useApi<ArtistDetails>(`/artist/${id}`);
  if (error)
    return (
      <ExtraGate k="music">
        <div className="empty">
          <b>Couldn’t load this artist</b>
          {error}
        </div>
      </ExtraGate>
    );
  if (!a) return <div className="detail-loading" aria-busy="true" />;
  const groups = [
    ['Album', 'Albums'],
    ['EP', 'EPs'],
    ['Single', 'Singles'],
  ] as const;
  return (
    <ExtraGate k="music">
      <article className="detail">
        <DetailTop
          backdrop={a.artistBackdrop}
          poster={a.artistThumb}
          square
          title={a.artist.name}
          line={[
            a.artist.type,
            a.artist.area,
            a.artist.beginYear ? `Since ${a.artist.beginYear}` : '',
            `${a.releaseGroups.length} releases`,
          ]}
        />
        <div className="dbody">
          <div className="dstatus">
            <Link
              className="btn btn-tonal btn-sm"
              to={`/collections/music/${encodeURIComponent(id)}?view=discography`}
            >
              View Discography
            </Link>
            <Link
              className="btn btn-tonal btn-sm"
              to={{
                pathname: '/music',
                search: new URLSearchParams({
                  artist: a.artist.name,
                  artistId: id,
                }).toString(),
              }}
            >
              Filter Music by Artist
            </Link>
            <IndexerSearchLink category="music" title={a.artist.name} />
            <AssociationLink mediaType="artist" id={id} />
          </div>
          {a.wikipedia?.extract && <p className="ov">{a.wikipedia.extract}</p>}
          {groups.map(([k, t]) => {
            const list = a.releaseGroups.filter(
              (r) => (r['primary-type'] || 'Album') === k
            );
            return list.length ? (
              <Section key={k} title={t}>
                <div className="sqg grid">
                  {list.map((r) => (
                    <AlbumCard key={r.id} a={r} />
                  ))}
                </div>
              </Section>
            ) : null;
          })}
          {!a.releaseGroups.length && (
            <div className="empty">
              <b>No releases listed</b>
              <Icon name="music" />
            </div>
          )}
        </div>
      </article>
    </ExtraGate>
  );
}
