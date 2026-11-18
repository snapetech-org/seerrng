import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { api, ApiError, requestSeries } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { embedded } from '../deployment';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { canDetectBarcodes, detectBarcodes } from '../shareBarcode';
import { takeNativeSharedImage, takeSharedForm } from '../shareInbox';

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
  const { hash, pathname, search } = useLocation();
  const navigate = useNavigate();
  const consumed = useRef('');
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

  const localBarcode = canDetectBarcodes();
  const acceptsImage = caps.data?.enabled && (imageEnabled || localBarcode);

  async function attachImage(file: File, inputText = text) {
    if (working.current || !acceptsImage) return;
    if (!file.type.startsWith('image/') || !file.size) {
      setError('Choose a readable image file.');
      return;
    }
    if (file.size > (caps.data?.maxImageBytes ?? 6 * 1024 * 1024)) {
      setError('This image exceeds the server’s upload limit.');
      return;
    }
    setImage(imageEnabled ? file : undefined);
    setError('');
    setNotice('');
    if (!localBarcode) return;

    working.current = true;
    setBusy(true);
    try {
      const isbn = (await detectBarcodes(file)).find((code) =>
        /^97[89]\d{10}$/.test(code)
      );
      if (isbn) {
        const next = inputText.includes(isbn)
          ? inputText
          : [inputText.trim(), isbn].filter(Boolean).join('\n');
        if (next.length <= 16000) setText(next);
        setNotice(
          next.length <= 16000
            ? `Found ISBN ${isbn}.`
            : `Found ISBN ${isbn}. Shorten the text to add it.`
        );
      } else if (!imageEnabled) {
        setError('No ISBN barcode was found in this image.');
      }
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  const receiveShare = useEffectEvent(async (id: string, native: boolean) => {
    try {
      const form = await (native
        ? takeNativeSharedImage()
        : takeSharedForm(id));
      if (!form) {
        setError(
          'This share could not be opened. Try sharing again or paste it here.'
        );
        return;
      }
      const incoming = [
        ...new Set(['title', 'text', 'url'].map((field) => form.get(field))),
      ]
        .filter(
          (value): value is string => typeof value === 'string' && !!value
        )
        .join('\n');
      if (incoming) setText(incoming);
      const file = form.get('image');
      if (form.has('imageTooLarge'))
        setError('This shared image exceeds the upload limit.');
      if (file instanceof File) {
        if (acceptsImage) await attachImage(file, incoming || text);
        else
          setError(
            'Image recognition is unavailable. You can still use shared text.'
          );
      }
    } catch {
      setError(
        'This share could not be opened. Try sharing again or paste it here.'
      );
    }
  });

  useEffect(() => {
    const shareTarget = hash.startsWith('#share=');
    const native = embedded && params.get('image') === '1';
    const handoff = shareTarget ? hash : native ? search : '';
    if (!handoff || !caps.data || busy || consumed.current === handoff) return;
    consumed.current = handoff;
    const next = new URLSearchParams(params);
    if (native) next.delete('image');
    navigate({ pathname, search: next.toString() }, { replace: true });
    void receiveShare(hash.slice('#share='.length), !shareTarget && native);
  }, [hash, pathname, params, search, navigate, caps.data, busy]);

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
          if (body.mediaType === 'tv')
            await requestSeries(body.mediaId, body.seasons);
          else
            await api('/request', {
              method: 'POST',
              body: JSON.stringify(body),
            });
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
            if (!acceptsImage || !file) return;
            event.preventDefault();
            void attachImage(file);
          }}
          onDragOver={(event) => {
            if (acceptsImage && event.dataTransfer.types.includes('Files'))
              event.preventDefault();
          }}
          onDrop={(event) => {
            const file = event.dataTransfer.files[0];
            if (!acceptsImage || !file) return;
            event.preventDefault();
            void attachImage(file);
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
          {acceptsImage && (
            <div className="toolbar">
              <label>
                Image
                <input
                  type="file"
                  accept="image/*"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void attachImage(file);
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
