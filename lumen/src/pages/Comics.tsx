import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { MoreOnScroll, shortDate } from '../components/cards';
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
  plainText,
  requestExtra,
  type Comic,
  type ComicIssue,
  type Magazine,
} from '../extras';
import { useApi, usePaged } from '../hooks';

// the search box writes ?q= after a pause, so typing doesn't fire a request per letter
function useQueryParam() {
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
  return { q, setQ, query, p, setP };
}

// ---- comics: ComicVine volumes, requested through Mylar or Kapowarr ----
export function Comics() {
  const { q, setQ, query } = useQueryParam();
  const list = usePaged<Comic>(
    `/discover/comics${query ? `?query=${encodeURIComponent(query)}` : ''}`
  );
  // SeerrNG answers with an empty list and comicVineConfigured: false when there's no key
  const noKey =
    useApi<{ comicVineConfigured?: boolean }>('/discover/comics').data
      ?.comicVineConfigured === false;
  return (
    <ExtraGate k="comic">
      <ExtraHeader
        title="Comics"
        sub="Request a series and new issues arrive as they come out."
      >
        <ExtraSearch
          value={q}
          onChange={setQ}
          placeholder="Search comic series…"
        />
      </ExtraHeader>
      {noKey ? (
        <div className="empty">
          <b>Comics need a ComicVine key</b>An admin can add one in SeerrNG
          under Settings › General.
        </div>
      ) : (
        <>
          <ServiceNote error={list.error} what="comics" />
          {!list.error && !list.items.length && !list.loading && (
            <div className="empty">
              <b>No comics found</b>Try a series name or a publisher.
            </div>
          )}
          <div className="grid">
            {list.items.map((c) => (
              <ExtraCard
                key={c.id}
                href={`/comic/${c.id}`}
                img={c.posterPath}
                title={c.title}
                shape="book"
                icon="comic"
                stat={extraStat(c.mediaInfo)}
                meta={[
                  c.publisher,
                  c.startYear,
                  c.issueCount ? `${c.issueCount} issues` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              />
            ))}
          </div>
          <MoreOnScroll
            done={list.done}
            loading={list.loading}
            more={list.more}
          />
        </>
      )}
    </ExtraGate>
  );
}

export function ComicDetail() {
  const { id } = useParams();
  const { data: c, error } = useApi<Comic>(`/comic/${id}`);
  const issues = usePaged<ComicIssue>(`/comic/${id}/issues`);
  if (error)
    return (
      <ExtraGate k="comic">
        <div className="empty">
          <b>Couldn’t load this comic</b>
          {error}
        </div>
      </ExtraGate>
    );
  if (!c) return <div className="detail-loading" aria-busy="true" />;
  const s = extraStat(c.mediaInfo);
  const about = plainText(c.description);
  const main = (
    <RequestButton
      stat={s}
      label="Request series"
      request={() => requestExtra('comic', Number(c.id))}
    />
  );
  return (
    <ExtraGate k="comic">
      <article className="detail">
        <DetailTop
          poster={c.posterPath}
          title={c.title}
          line={[
            c.startYear,
            c.publisher,
            c.issueCount ? `${c.issueCount} issues` : '',
          ]}
        />
        <div className="dbody">
          <div className="dstatus">
            <StatPill s={s} />
          </div>
          <div className="dacts pc">{main}</div>
          <div className="dcols">
            <div style={{ display: 'grid', gap: 22 }}>
              {c.deck && <p className="tagline">{c.deck}</p>}
              {about.slice(0, 4).map((t, i) => (
                <p key={i} className="ov">
                  {t}
                </p>
              ))}
              {!!issues.items.length && (
                <div>
                  <div className="h2">Issues</div>
                  <ol className="slist tlist">
                    {issues.items.map((i) => (
                      <li key={i.id} className="trow">
                        <span className="tn">#{i.issueNumber || '?'}</span>
                        <span>
                          <b>{i.name || `Issue #${i.issueNumber}`}</b>
                          {i.coverDate && (
                            <small>
                              {shortDate(i.coverDate)},{' '}
                              {i.coverDate.slice(0, 4)}
                            </small>
                          )}
                        </span>
                        <span />
                      </li>
                    ))}
                  </ol>
                  <MoreOnScroll
                    done={issues.done}
                    loading={issues.loading}
                    more={issues.more}
                  />
                </div>
              )}
            </div>
            <aside>
              <Facts
                rows={[
                  ['Publisher', c.publisher],
                  ['Started', c.startYear],
                  ['Issues', c.issueCount ? String(c.issueCount) : ''],
                ]}
              />
            </aside>
          </div>
        </div>
        <div className="actionbar">
          <span className="ab-meta">
            <b>{c.title}</b>
            {c.publisher}
          </span>
          {main}
        </div>
      </article>
    </ExtraGate>
  );
}

// ---- magazines: the tracked list from LazyLibrarian, or a Google Books search ----
export function Magazines() {
  const { q, setQ, query } = useQueryParam();
  // tracked titles are listed by default; a search looks further afield
  const list = usePaged<Magazine>(
    query
      ? `/discover/magazines?catalog=public&query=${encodeURIComponent(query)}`
      : '/discover/magazines?catalog=tracked'
  );
  return (
    <ExtraGate k="magazine">
      <ExtraHeader
        title="Magazines"
        sub={
          query
            ? 'Search results. Request a title to start getting new issues.'
            : 'Titles the library follows. Search to find more.'
        }
      >
        <ExtraSearch
          value={q}
          onChange={setQ}
          placeholder="Search magazines…"
        />
      </ExtraHeader>
      <ServiceNote error={list.error} what="magazines" />
      {!list.error && !list.items.length && !list.loading && (
        <div className="empty">
          <b>{query ? 'No magazines found' : 'No magazines yet'}</b>
          {query
            ? 'Try the magazine’s full title.'
            : 'Search for a title to request it.'}
        </div>
      )}
      <div className="grid">
        {list.items.map((m) => (
          <ExtraCard
            key={m.id}
            href={`/magazine/${encodeURIComponent(m.title)}`}
            img={m.posterPath}
            title={m.title}
            shape="book"
            icon="magazine"
            stat={extraStat(m.mediaInfo)}
            meta={[
              m.publisher,
              m.latestIssue ? `Latest ${m.latestIssue}` : m.firstPublishYear,
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        ))}
      </div>
      <MoreOnScroll done={list.done} loading={list.loading} more={list.more} />
    </ExtraGate>
  );
}

export function MagazineDetail() {
  const { title = '' } = useParams();
  const { data: m, error } = useApi<Magazine>(
    `/magazine/${encodeURIComponent(title)}`
  );
  if (error)
    return (
      <ExtraGate k="magazine">
        <div className="empty">
          <b>Couldn’t load this magazine</b>
          {error}
        </div>
      </ExtraGate>
    );
  if (!m) return <div className="detail-loading" aria-busy="true" />;
  const s = extraStat(m.mediaInfo);
  const have = (m.issues || []).filter((i) => i.available).length;
  const main =
    m.requestable === false ? null : (
      <RequestButton
        stat={s}
        label="Request magazine"
        request={() => requestExtra('magazine', m.title)}
      />
    );
  return (
    <ExtraGate k="magazine">
      <article className="detail">
        <DetailTop
          poster={m.posterPath}
          title={m.title}
          line={[
            m.publisher,
            m.firstPublishYear,
            m.issueCount ? `${m.issueCount} issues` : '',
          ]}
        />
        <div className="dbody">
          <div className="dstatus">
            <StatPill s={s} />
            {have > 0 && (
              <Pill k="ok" icon="check">
                {have} issue{have === 1 ? '' : 's'} in library
              </Pill>
            )}
          </div>
          <div className="dacts pc">{main}</div>
          <div className="dcols">
            <div>
              {!!m.issues?.length && (
                <>
                  <div className="h2">Issues</div>
                  <ol className="slist tlist">
                    {m.issues.map((i) => (
                      <li key={i.id} className="trow">
                        <span className="tn" />
                        <span>
                          <b>{i.date || i.id}</b>
                        </span>
                        {i.available ? (
                          <Pill k="ok" icon="check">
                            In library
                          </Pill>
                        ) : (
                          <span className="tl">Not yet</span>
                        )}
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </div>
            <aside>
              <Facts
                rows={[
                  ['Publisher', m.publisher],
                  ['Latest issue', m.latestIssue],
                  ['Status', m.status],
                  [
                    'Source',
                    m.provider === 'googlebooks'
                      ? 'Google Books'
                      : 'LazyLibrarian',
                  ],
                ]}
              />
            </aside>
          </div>
        </div>
        {main && (
          <div className="actionbar">
            <span className="ab-meta">
              <b>{m.title}</b>
              {m.publisher}
            </span>
            {main}
          </div>
        )}
      </article>
    </ExtraGate>
  );
}
