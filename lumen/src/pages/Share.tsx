import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
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
  const [image, setImage] = useState<File>();
  const [format, setFormat] = useState<ShareFormat>('ebook');
  const [seasons, setSeasons] = useState<'first' | 'all'>('first');
  const [result, setResult] = useState<ResolveResponse>();
  const [choices, setChoices] = useState<number[]>([]);
  const [submitted, setSubmitted] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const caps = useApi<{
    enabled: boolean;
    image?: boolean;
    maxImageBytes?: number;
  }>('/resolve/capabilities');
  const imageEnabled = caps.data?.enabled && caps.data.image;

  function attachImage(file: File) {
    if (busy || !imageEnabled) return;
    if (!file.type.startsWith('image/') || !file.size) {
      setError('Choose a readable image file.');
      return;
    }
    if (file.size > (caps.data?.maxImageBytes ?? 6 * 1024 * 1024)) {
      setError('This image exceeds the server’s upload limit.');
      return;
    }
    setImage(file);
    setError('');
  }

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
    const input = text.trim();
    const attachment = imageEnabled ? image : undefined;
    if (working.current || (!input && !attachment) || !caps.data?.enabled)
      return;
    working.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const groups: ResolveResponse['groups'] = [];
      if (attachment) {
        try {
          const response = await api<ResolveResponse>(
            `/resolve/image?formatHint=${format}`,
            {
              method: 'POST',
              headers: { 'Content-Type': attachment.type },
              body: attachment,
            }
          );
          groups.push(...response.groups);
        } catch (failure) {
          if (
            !input ||
            !(failure instanceof ApiError) ||
            failure.status !== 422
          )
            throw failure;
          setNotice(
            'The image could not be read. Showing matches from the text.'
          );
        }
      }
      if (input) {
        const response = await api<ResolveResponse>('/resolve', {
          method: 'POST',
          body: JSON.stringify({ text: input, formatHint: format }),
        });
        groups.unshift(...response.groups);
      }
      const response = { groups };
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
          onPaste={(event) => {
            const file = Array.from(event.clipboardData.files).find((item) =>
              item.type.startsWith('image/')
            );
            if (!imageEnabled || !file) return;
            event.preventDefault();
            attachImage(file);
          }}
          onDragOver={(event) => {
            if (imageEnabled && event.dataTransfer.types.includes('Files'))
              event.preventDefault();
          }}
          onDrop={(event) => {
            const file = event.dataTransfer.files[0];
            if (!imageEnabled || !file) return;
            event.preventDefault();
            attachImage(file);
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
          {imageEnabled && (
            <div className="toolbar">
              <label>
                Image
                <input
                  type="file"
                  accept="image/*"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) attachImage(file);
                    event.currentTarget.value = '';
                  }}
                />
              </label>
              {image && (
                <>
                  <span>{image.name}</span>
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    disabled={busy}
                    onClick={() => setImage(undefined)}
                  >
                    Remove Image
                  </button>
                </>
              )}
            </div>
          )}
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
            <button
              className="btn btn-tonal"
              disabled={busy || (!text.trim() && !(imageEnabled && image))}
            >
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
