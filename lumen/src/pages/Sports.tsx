import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { MoreOnScroll, type Stat } from '../components/cards';
import { DetailTop, Facts } from '../components/detail';
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
import { requestExtra, type League, type Scene } from '../extras';
import { useApi, usePaged } from '../hooks';

// Sportarr knows whether a league is followed even before SeerrNG has a request for it
const leagueStat = (l: League): Stat =>
  extraStat(l.mediaInfo) ||
  (l.libraryState === 'monitored'
    ? { k: 'ok', word: 'Followed', ico: 'check' }
    : l.libraryState === 'requested'
      ? { k: 'wait', word: 'Requested', ico: 'clock' }
      : null);

function useSearchBox() {
  const [p, setP] = useSearchParams();
  const query = p.get('q') || '';
  const [q, setQ] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim() === query) return;
      const n = new URLSearchParams(p);
      if (q.trim()) n.set('q', q.trim());
      else n.delete('q');
      setP(n, { replace: true });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  return { q, setQ, query };
}

// ---- sports: Sportarr leagues; requesting one follows the league's events ----
export function Sports() {
  const { q, setQ, query } = useSearchBox();
  // Sportarr has no browse feed: the page starts with a search
  const list = usePaged<League>(
    `/discover/sports${query ? `?query=${encodeURIComponent(query)}` : ''}`
  );
  return (
    <ExtraGate k="sports">
      <ExtraHeader
        title="Sports"
        sub="Find a league or competition and follow it; events are recorded as they happen."
      >
        <ExtraSearch
          value={q}
          onChange={setQ}
          placeholder="Search leagues — Premier League, NFL, F1…"
        />
      </ExtraHeader>
      <ServiceNote error={list.error} what="sports" />
      {!query && !list.error && (
        <div className="empty">
          <b>Search for a league</b>Try a sport, a league or a country.
        </div>
      )}
      {!!query && !list.error && !list.items.length && !list.loading && (
        <div className="empty">
          <b>No leagues found</b>Try the league’s full name.
        </div>
      )}
      <div className="sqg grid">
        {list.items.map((l) => (
          <ExtraCard
            key={l.id}
            href={`/sportarr/${encodeURIComponent(l.id)}`}
            img={l.posterPath}
            title={l.title}
            shape="sq"
            icon="trophy"
            stat={leagueStat(l)}
            meta={[l.sport, l.country].filter(Boolean).join(' · ')}
          />
        ))}
      </div>
      <MoreOnScroll
        done={list.done || !query}
        loading={list.loading}
        more={list.more}
      />
    </ExtraGate>
  );
}

export function LeagueDetail() {
  const { id = '' } = useParams();
  const { data: l, error } = useApi<League>(
    `/sportarr/${encodeURIComponent(id)}`
  );
  if (error)
    return (
      <ExtraGate k="sports">
        <div className="empty">
          <b>Couldn’t load this league</b>
          {error}
        </div>
      </ExtraGate>
    );
  if (!l) return <div className="detail-loading" aria-busy="true" />;
  const s = leagueStat(l);
  const main =
    l.requestable === false && !s ? null : (
      <RequestButton
        stat={s}
        label="Follow league"
        request={() => requestExtra('sports', l.id)}
      />
    );
  return (
    <ExtraGate k="sports">
      <article className="detail">
        <DetailTop
          poster={l.posterPath}
          square
          title={l.title}
          line={[l.sport, l.country, l.year]}
        />
        <div className="dbody">
          <div className="dstatus">
            <StatPill s={s} />
          </div>
          <div className="dacts pc">{main}</div>
          <div className="dcols">
            <div>{l.overview && <p className="ov">{l.overview}</p>}</div>
            <aside>
              <Facts
                rows={[
                  ['Sport', l.sport],
                  ['Country', l.country],
                  ['Events', l.eventsAvailable ? 'Some in library' : ''],
                ]}
              />
            </aside>
          </div>
        </div>
        {main && (
          <div className="actionbar">
            <span className="ab-meta">
              <b>{l.title}</b>
              {l.sport}
            </span>
            {main}
          </div>
        )}
      </article>
    </ExtraGate>
  );
}

// ---- adult: Whisparr scenes. Off unless the admin enables it, and SeerrNG checks each
// person's adult-content permission on every call ----
export function Adult() {
  const { q, setQ, query } = useSearchBox();
  const list = usePaged<Scene>(
    `/adult/search${query ? `?query=${encodeURIComponent(query)}` : ''}`
  );
  return (
    <ExtraGate k="adult">
      <ExtraHeader
        title="Adult"
        sub={
          query
            ? 'Search results.'
            : 'What the library has. Search to find more.'
        }
      >
        <ExtraSearch
          value={q}
          onChange={setQ}
          placeholder="Search scenes, studios, performers…"
        />
      </ExtraHeader>
      <ServiceNote error={list.error} what="this section" />
      {!list.error && !list.items.length && !list.loading && (
        <div className="empty">
          <b>Nothing found</b>Try a studio or performer.
        </div>
      )}
      <div className="wideg grid">
        {list.items.map((x) => (
          <ExtraCard
            key={x.id}
            href={`/adult/${encodeURIComponent(x.id)}`}
            img={x.posterPath}
            title={x.title}
            shape="wide"
            icon="lock"
            stat={extraStat(x.mediaInfo)}
            meta={[x.studio, x.year].filter(Boolean).join(' · ')}
          />
        ))}
      </div>
      <MoreOnScroll done={list.done} loading={list.loading} more={list.more} />
    </ExtraGate>
  );
}

export function SceneDetail() {
  const { id = '' } = useParams();
  const { data: x, error } = useApi<Scene>(`/adult/${encodeURIComponent(id)}`);
  if (error)
    return (
      <ExtraGate k="adult">
        <div className="empty">
          <b>Couldn’t load this</b>
          {error}
        </div>
      </ExtraGate>
    );
  if (!x) return <div className="detail-loading" aria-busy="true" />;
  const s = extraStat(x.mediaInfo);
  const main = (
    <RequestButton stat={s} request={() => requestExtra('adult', x.id)} />
  );
  return (
    <ExtraGate k="adult">
      <article className="detail">
        <DetailTop
          backdrop={x.posterPath}
          title={x.title}
          line={[x.year, x.studio]}
        />
        <div className="dbody">
          <div className="dstatus">
            <StatPill s={s} />
          </div>
          <div className="dacts pc">{main}</div>
          <div className="dcols">
            <div>{x.overview && <p className="ov">{x.overview}</p>}</div>
            <aside>
              <Facts
                rows={[
                  ['Studio', x.studio],
                  ['Year', x.year ? String(x.year) : ''],
                  ['Performers', x.performers.join(', ')],
                ]}
              />
            </aside>
          </div>
        </div>
        <div className="actionbar">
          <span className="ab-meta">
            <b>{x.title}</b>
            {x.studio}
          </span>
          {main}
        </div>
      </article>
    </ExtraGate>
  );
}
