import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';

import {
  requestBodyForCandidate,
  type ShareCandidateIdentity,
  type ShareFormat,
} from '../shareRequest';

interface ResolveCandidate extends ShareCandidateIdentity {
  title: string;
  creator?: string;
  year?: number;
  evidence: string;
  href: string;
}

interface ResolveResponse {
  groups: {
    input: string;
    autoSelected?: number;
    candidates: ResolveCandidate[];
  }[];
}

function candidatePath(candidate: ResolveCandidate, format: ShareFormat) {
  const id = encodeURIComponent(candidate.id);
  switch (candidate.mediaType) {
    case 'book':
      return `/book/${id}?f=${(candidate.formatHint ?? format) === 'audiobook' ? 'audio' : 'book'}`;
    case 'album':
      return `/music/${id}`;
    case 'movie':
    case 'tv':
      return `/${candidate.mediaType}/${id}`;
    case 'game': {
      const gameId = new URLSearchParams(candidate.href.split('?')[1]).get(
        'game'
      );
      return `/game/game/${encodeURIComponent(gameId ?? candidate.id)}`;
    }
    default:
      return `/search?q=${encodeURIComponent(candidate.title)}`;
  }
}

export default function Share() {
  const [params] = useSearchParams();
  const [text, setText] = useState(() =>
    ['title', 'text', 'url']
      .map((key) => params.get(key))
      .filter(Boolean)
      .join('\n')
      .slice(0, 16000)
  );
  const [format, setFormat] = useState<ShareFormat>('ebook');
  const [seasons, setSeasons] = useState<'first' | 'all'>('first');
  const [result, setResult] = useState<ResolveResponse>();
  const [choices, setChoices] = useState<number[]>([]);
  const [submitted, setSubmitted] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const caps = useApi<{ enabled: boolean }>('/resolve/capabilities');
  const selected = (result?.groups ?? []).flatMap((group, index) => {
    const candidate = group.candidates[choices[index]];
    const body =
      candidate &&
      requestBodyForCandidate(candidate, { format, seriesSeasons: seasons });
    return body && !submitted.includes(index)
      ? [{ index, body, title: candidate.title }]
      : [];
  });

  async function find() {
    if (working.current || !text.trim() || !caps.data?.enabled) return;
    working.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await api<ResolveResponse>('/resolve', {
        method: 'POST',
        body: JSON.stringify({ text: text.trim(), formatHint: format }),
      });
      setResult(response);
      setChoices(response.groups.map((group) => group.autoSelected ?? -1));
      setSubmitted([]);
    } catch (failure) {
      setError(friendlyError(failure, 'Could not read the shared input.'));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  async function requestSelected() {
    if (working.current || !selected.length) return;
    working.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    const failures: string[] = [];
    let count = 0;
    try {
      for (const { index, body, title } of selected) {
        try {
          await api('/request', { method: 'POST', body: JSON.stringify(body) });
          setSubmitted((current) => [...current, index]);
          count++;
        } catch (failure) {
          failures.push(friendlyError(failure, `Could not request ${title}.`));
        }
      }
      if (count)
        setNotice(
          `Submitted ${count} ${count === 1 ? 'request' : 'requests'}.`
        );
      if (failures.length) setError(failures.join(' '));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <header className="ph">
        <h1>Share</h1>
      </header>
      <ServiceNote
        error={caps.error}
        what="recognition settings"
        retry={caps.reload}
      />
      {caps.data?.enabled === false && (
        <p className="note">
          Link and list recognition is turned off on this server.
        </p>
      )}
      {caps.data?.enabled && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void find();
          }}
        >
          <label className="sel">
            <span className="lbl">Titles, links, or ISBNs</span>
            <textarea
              className="cfg-json"
              rows={4}
              maxLength={16000}
              value={text}
              disabled={busy}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          <div className="toolbar">
            <label className="sel">
              <span className="lbl">Book Format</span>
              <select
                value={format}
                disabled={busy}
                onChange={(event) =>
                  setFormat(
                    event.target.value === 'audiobook' ? 'audiobook' : 'ebook'
                  )
                }
              >
                <option value="ebook">Ebook</option>
                <option value="audiobook">Audiobook</option>
              </select>
            </label>
            <button className="btn btn-tonal" disabled={busy || !text.trim()}>
              Find Matches
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      {result && (
        <Section title="Matches">
          {!result.groups.length && <p className="note">No matches found.</p>}
          <ul className="setlist">
            {result.groups.map((group, index) => {
              const candidate = group.candidates[choices[index]];
              return (
                <li className="set" key={index}>
                  <div>
                    <b>{group.input}</b>
                    {candidate && <small>{candidate.evidence}</small>}
                    {submitted.includes(index) && (
                      <small>Request submitted</small>
                    )}
                  </div>
                  {group.candidates.length ? (
                    <div className="toolbar">
                      <label className="sel">
                        <span className="lbl">Match for {group.input}</span>
                        <select
                          value={choices[index]}
                          disabled={busy || submitted.includes(index)}
                          onChange={(event) => {
                            const choice = Number(event.target.value);
                            setChoices((current) =>
                              current.map((value, position) =>
                                position === index ? choice : value
                              )
                            );
                          }}
                        >
                          <option value={-1}>Choose a match</option>
                          {group.candidates.map((item, position) => (
                            <option value={position} key={position}>
                              {[item.title, item.creator, item.year]
                                .filter(Boolean)
                                .join(' · ')}
                            </option>
                          ))}
                        </select>
                      </label>
                      {candidate && (
                        <Link
                          className="btn btn-quiet btn-sm"
                          to={candidatePath(candidate, format)}
                        >
                          Open Title
                        </Link>
                      )}
                    </div>
                  ) : (
                    <small>No matches found</small>
                  )}
                </li>
              );
            })}
          </ul>
          {!!selected.length && (
            <div className="toolbar">
              {selected.some(({ body }) => body.mediaType === 'tv') && (
                <label className="sel">
                  <span className="lbl">Series Seasons</span>
                  <select
                    value={seasons}
                    disabled={busy}
                    onChange={(event) =>
                      setSeasons(event.target.value === 'all' ? 'all' : 'first')
                    }
                  >
                    <option value="first">First season</option>
                    <option value="all">All seasons</option>
                  </select>
                </label>
              )}
              <button
                className="btn btn-tonal"
                disabled={busy}
                onClick={() => void requestSelected()}
              >
                Request Selected ({selected.length})
              </button>
            </div>
          )}
        </Section>
      )}
    </>
  );
}
