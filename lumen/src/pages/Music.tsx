import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { MoreOnScroll, Section } from '../components/cards';
import { DetailTop, Facts, Pill } from '../components/detail';
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
import {
  artistOf,
  fmtTrack,
  requestExtra,
  type Album,
  type AlbumDetails,
  type ArtistDetails,
} from '../extras';
import { useApi, usePaged } from '../hooks';
import { Icon } from '../icons';

const SORTS = [
  ['ranked', 'Recommended'],
  ['popular.week', 'This week'],
  ['popular.month', 'This month'],
  ['listen_count.desc', 'Most played'],
  ['release_date.desc', 'Newest'],
] as const;
const TYPES = [
  ['', 'Any'],
  ['album', 'Albums'],
  ['ep', 'EPs'],
  ['single', 'Singles'],
] as const;
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
    icon="music"
    stat={extraStat(a.mediaInfo)}
    meta={[artistOf(a), (a['first-release-date'] || '').slice(0, 4)]
      .filter(Boolean)
      .join(' · ')}
  />
);

// Music: albums from MusicBrainz and ListenBrainz charts; requests go to Lidarr
export function Music() {
  const [p, setP] = useSearchParams();
  const [q, setQ] = useState(p.get('q') || '');
  const sort = p.get('sort') || 'ranked';
  const type = p.get('type') || '';
  const query = p.get('q') || '';
  // searching ignores the chart sorts, which only rank the curated feed
  const qs = new URLSearchParams({
    sortBy: query ? 'ranked' : sort,
    ...(query ? { query } : {}),
    ...(type ? { releaseType: type } : {}),
  });
  const list = usePaged<Album>(`/discover/music?${qs}`);
  const upd = (k: string, v: string) => {
    const n = new URLSearchParams(p);
    if (!v || (k === 'sort' && v === 'ranked')) n.delete(k);
    else n.set(k, v);
    setP(n, { replace: true });
  };
  useEffect(() => {
    const t = setTimeout(() => q.trim() !== query && upd('q', q.trim()), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const items = list.items;

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
        {!query && (
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
        )}
        <div className="seg" role="group" aria-label="Release type">
          {TYPES.map(([v, t]) => (
            <button
              key={v}
              aria-pressed={type === v}
              onClick={() => upd('type', v)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <ServiceNote error={list.error} what="music" />
      {!list.error && !items.length && !list.loading && (
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
      <MoreOnScroll done={list.done} loading={list.loading} more={list.more} />
    </ExtraGate>
  );
}

export function AlbumDetail() {
  const { id } = useParams();
  const { data: a, error } = useApi<AlbumDetails>(`/music/${id}`);
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
  const s = extraStat(a.mediaInfo);
  const tags = (
    a.tags?.releaseGroup?.length ? a.tags.releaseGroup : a.tags?.artist || []
  )
    .sort((x, y) => y.count - x.count)
    .slice(0, 4)
    .map((t) => t.tag);
  const total = (a.tracks || []).reduce((n, t) => n + (t.length || 0), 0);
  const main = (
    <RequestButton
      stat={s}
      label="Request album"
      request={() => requestExtra('music', a.id)}
    />
  );
  return (
    <ExtraGate k="music">
      <article className="detail">
        <DetailTop
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
  const { id } = useParams();
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
