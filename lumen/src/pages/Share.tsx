import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { api, ApiError, bookDetailPath, requestSeries } from '../api';
import { Section } from '../components/cards';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { ServiceNote } from '../components/extra';
import { streamingOverrideMessage } from '../components/requestSheet';
import { embedded } from '../deployment';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
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

type SelectedRequest = {
  index: number;
  body: NonNullable<ReturnType<typeof requestBodyForCandidate>>;
  title: string;
};

function candidatePath(candidate: ResolveCandidate, format: ShareFormat) {
  const id = encodeURIComponent(candidate.id);
  switch (candidate.mediaType) {
    case 'book':
      return bookDetailPath(
        candidate.id,
        candidate.formatHint ?? format,
        candidate.title
      );
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
  const { t } = useLumenLocale();
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
  const [streamingOverrides, setStreamingOverrides] = useState<
    (SelectedRequest & { message: string })[]
  >([]);
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
      setError(t('lumen.share.readableImage', 'Choose a readable image file.'));
      return;
    }
    if (file.size > (caps.data?.maxImageBytes ?? 6 * 1024 * 1024)) {
      setError(
        t(
          'lumen.share.imageTooLarge',
          'This image exceeds the server’s upload limit.'
        )
      );
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
            ? t('lumen.share.foundIsbn', 'Found ISBN {isbn}.', { isbn })
            : t(
                'lumen.share.foundIsbnTooLong',
                'Found ISBN {isbn}. Shorten the text to add it.',
                { isbn }
              )
        );
      } else if (!imageEnabled) {
        setError(
          t('lumen.share.noIsbn', 'No ISBN barcode was found in this image.')
        );
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
          t(
            'lumen.share.openFailed',
            'This share could not be opened. Try sharing again or paste it here.'
          )
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
        setError(
          t(
            'lumen.share.sharedImageTooLarge',
            'This shared image exceeds the upload limit.'
          )
        );
      if (file instanceof File) {
        if (acceptsImage) await attachImage(file, incoming || text);
        else
          setError(
            t(
              'lumen.share.imageUnavailable',
              'Image recognition is unavailable. You can still use shared text.'
            )
          );
      }
    } catch {
      setError(
        t(
          'lumen.share.openFailed',
          'This share could not be opened. Try sharing again or paste it here.'
        )
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
            t(
              'lumen.share.imageReadFailed',
              'The image could not be read. Showing matches from the text.'
            )
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
      setError(
        friendlyError(
          failure,
          t('lumen.share.readFailed', 'Could not read the shared input.'),
          t
        )
      );
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  async function requestSelected(
    requests: SelectedRequest[] = selected,
    bypassStreamingRequestPolicy = false
  ) {
    if (working.current || !requests.length) return;
    working.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    setStreamingOverrides([]);
    const failures: string[] = [];
    const overrides: typeof streamingOverrides = [];
    const options = bypassStreamingRequestPolicy
      ? { bypassStreamingRequestPolicy: true }
      : {};
    let count = 0;
    try {
      for (const { index, body, title } of requests) {
        try {
          if (body.mediaType === 'tv')
            await requestSeries(body.mediaId, body.seasons, options);
          else
            await api('/request', {
              method: 'POST',
              body: JSON.stringify({ ...body, ...options }),
            });
          setSubmitted((current) => [...current, index]);
          count++;
        } catch (failure) {
          const message = streamingOverrideMessage(failure);
          if (
            !bypassStreamingRequestPolicy &&
            (body.mediaType === 'movie' || body.mediaType === 'tv') &&
            message !== undefined
          )
            overrides.push({ index, body, title, message });
          else
            failures.push(
              friendlyError(
                failure,
                t('lumen.share.requestFailed', 'Could not request {title}.', {
                  title,
                }),
                t
              )
            );
        }
      }
      if (count)
        setNotice(
          count === 1
            ? t('lumen.share.submittedOne', 'Submitted 1 request.')
            : t('lumen.share.submittedMany', 'Submitted {count} requests.', {
                count,
              })
        );
      if (failures.length) setError(failures.join(' '));
      setStreamingOverrides(overrides);
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      {streamingOverrides.length > 0 && (
        <ConfirmSheet
          title={t('lumen.share.streamingPolicy', 'Streaming Request Policy')}
          body={streamingOverrides
            .map(({ title, message }) => `${title}: ${message}`)
            .join(' ')}
          confirm={t('lumen.share.requestAnyway', 'Request Anyway')}
          cancel={t('lumen.share.cancel', 'Cancel')}
          onClose={() => setStreamingOverrides([])}
          onConfirm={() => void requestSelected(streamingOverrides, true)}
        />
      )}
      <header className="ph">
        <h1>{t('lumen.share.title', 'Share')}</h1>
      </header>
      <ServiceNote
        error={caps.error}
        what={t('lumen.share.recognitionSettings', 'recognition settings')}
        retry={caps.reload}
      />
      {caps.data?.enabled === false && (
        <p className="note">
          {t(
            'lumen.share.disabled',
            'Link and list recognition is turned off on this server.'
          )}
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
            <span className="lbl">
              {t('lumen.share.input', 'Titles, links, or ISBNs')}
            </span>
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
                {t('lumen.share.image', 'Image')}
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
                    {t('lumen.share.removeImage', 'Remove Image')}
                  </button>
                </>
              )}
            </div>
          )}
          <div className="toolbar">
            <label className="sel">
              <span className="lbl">
                {t('lumen.share.bookFormat', 'Book Format')}
              </span>
              <select
                value={format}
                disabled={busy}
                onChange={(event) =>
                  setFormat(
                    event.target.value === 'audiobook' ? 'audiobook' : 'ebook'
                  )
                }
              >
                <option value="ebook">{t('lumen.share.ebook', 'Ebook')}</option>
                <option value="audiobook">
                  {t('lumen.share.audiobook', 'Audiobook')}
                </option>
              </select>
            </label>
            <button
              className="btn btn-tonal"
              disabled={busy || (!text.trim() && !(imageEnabled && image))}
            >
              {t('lumen.share.findMatches', 'Find Matches')}
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
        <Section title={t('lumen.share.matches', 'Matches')}>
          {!result.groups.length && (
            <p className="note">
              {t('lumen.share.noMatches', 'No matches found.')}
            </p>
          )}
          <ul className="setlist">
            {result.groups.map((group, index) => {
              const candidate = group.candidates[choices[index]];
              return (
                <li className="set" key={index}>
                  <div>
                    <b>{group.input}</b>
                    {candidate && <small>{candidate.evidence}</small>}
                    {submitted.includes(index) && (
                      <small>
                        {t('lumen.share.requestSubmitted', 'Request submitted')}
                      </small>
                    )}
                  </div>
                  {group.candidates.length ? (
                    <div className="toolbar">
                      <label className="sel">
                        <span className="lbl">
                          {t('lumen.share.matchFor', 'Match for {input}', {
                            input: group.input,
                          })}
                        </span>
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
                          <option value={-1}>
                            {t('lumen.share.chooseMatch', 'Choose a match')}
                          </option>
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
                          {t('lumen.share.openTitle', 'Open Title')}
                        </Link>
                      )}
                    </div>
                  ) : (
                    <small>
                      {t('lumen.share.noMatches', 'No matches found.')}
                    </small>
                  )}
                </li>
              );
            })}
          </ul>
          {!!selected.length && (
            <div className="toolbar">
              {selected.some(({ body }) => body.mediaType === 'tv') && (
                <label className="sel">
                  <span className="lbl">
                    {t('lumen.share.seriesSeasons', 'Series Seasons')}
                  </span>
                  <select
                    value={seasons}
                    disabled={busy}
                    onChange={(event) =>
                      setSeasons(event.target.value === 'all' ? 'all' : 'first')
                    }
                  >
                    <option value="first">
                      {t('lumen.share.firstSeason', 'First season')}
                    </option>
                    <option value="all">
                      {t('lumen.share.allSeasons', 'All seasons')}
                    </option>
                  </select>
                </label>
              )}
              <button
                className="btn btn-tonal"
                disabled={busy}
                onClick={() => void requestSelected()}
              >
                {t(
                  'lumen.share.requestSelected',
                  'Request Selected ({count})',
                  { count: selected.length }
                )}
              </button>
            </div>
          )}
        </Section>
      )}
    </>
  );
}
