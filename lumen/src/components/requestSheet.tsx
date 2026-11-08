import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  requestMovie,
  requestSeries,
  titleOf,
  tmdbImg,
  type RequestOptions,
  type TitleResult,
} from '../api';
import { useAuth } from '../auth';
import { usePublicSettings } from '../hooks';
import { usePrefs } from '../settings';
import {
  AdvancedOptions,
  canChooseRequestOptions,
  canRequest4k,
} from './detail';

// Poster quick requests are one click for most people. People who may choose the
// Radarr/Sonarr server, quality and folder get this sheet first (unless the
// "requestOptions" setting is off), like SeerrNG's own request dialog.
export function useAsksRequestOptions() {
  const { user } = useAuth();
  const { prefs } = usePrefs();
  return prefs.requestOptions && canChooseRequestOptions(user?.permissions);
}

// People who may request in 4K pick 1080p or 4K first (when the server has 4K for that kind).
export function useOffers4k(kind: 'movie' | 'tv') {
  const { user } = useAuth();
  const pub = usePublicSettings();
  return (
    !!(kind === 'movie' ? pub?.movie4kEnabled : pub?.series4kEnabled) &&
    canRequest4k(user?.permissions, kind)
  );
}

// a just-closed sheet is about to undo its history step (one sheet is open at a time)
let pendingBack = false;

// The phone's Back closes a sheet (like a native dialog) instead of leaving the page: the
// sheet adds a copy of the current history entry and closes when it's popped.
export function useBackCloses(onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, []);
  useEffect(() => {
    let popped = false;
    // remounted at once (React StrictMode runs effects twice): reuse the entry already
    // added rather than going back, whose popstate would close the new sheet
    if (pendingBack) pendingBack = false;
    else
      window.history.pushState(window.history.state, '', window.location.href);
    const onPop = () => {
      popped = true;
      closeRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // closed with a button: drop the extra entry so Back isn't needed twice. A microtask
      // runs after an immediate remount but before anything the person does next.
      if (!popped) {
        pendingBack = true;
        queueMicrotask(() => {
          if (!pendingBack) return;
          pendingBack = false;
          window.history.back();
        });
      }
    };
  }, []);
}

export function RequestSheet({
  it,
  onClose,
  onDone,
}: {
  it: TitleResult;
  onClose: () => void;
  onDone: (is4k: boolean) => void; // request sent
}) {
  const tv = it.mediaType === 'tv';
  const asks = useAsksRequestOptions();
  const offers4k = useOffers4k(tv ? 'tv' : 'movie');
  const [fourK, setFourK] = useState(false);
  const [opts, setOpts] = useState<RequestOptions>({});
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');
  const onOpts = useCallback((o: RequestOptions) => setOpts(o), []);
  useBackCloses(onClose);
  // without server choices there's nothing to wait for
  const canSend = asks ? ready : true;
  const send = async () => {
    if (busy || !canSend) return;
    setBusy(true);
    setErr('');
    const base = asks ? opts : {};
    const body = offers4k && fourK ? { ...base, is4k: true } : base;
    try {
      await (tv
        ? requestSeries(it.id, 'all', body)
        : requestMovie(it.id, body));
      onDone(!!body.is4k);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed');
      setBusy(false);
    }
  };
  return createPortal(
    <div className="sheet-wrap open">
      <div className="sheet-scrim" onClick={onClose} />
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Request ${titleOf(it)}`}
      >
        <div className="grab" />
        <div className="pk">
          <div className="pk-head">
            <div className="p">
              {it.posterPath && <img src={tmdbImg(it.posterPath)} alt="" />}
            </div>
            <div>
              <h3>Request {titleOf(it)}</h3>
              <span className="sub">
                {tv ? 'Entire series · ' : ''}
                {asks ? 'Choose where it goes' : 'Choose the quality'}
              </span>
            </div>
          </div>
          {offers4k && (
            <div className="seg" role="group" aria-label="Quality">
              {(
                [
                  [false, '1080p'],
                  [true, '4K'],
                ] as [boolean, string][]
              ).map(([v, t]) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={fourK === v}
                  onClick={() => {
                    setFourK(v);
                    setReady(false);
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
          {asks && (
            // keyed by quality: the 4K choice lists the 4K servers with their own defaults
            <AdvancedOptions
              key={fourK ? '4k' : 'hd'}
              kind={tv ? 'tv' : 'movie'}
              is4k={offers4k && fourK}
              onChange={onOpts}
              inline
              onReady={setReady}
            />
          )}
          {err && (
            <p className="note" role="alert">
              {err}
            </p>
          )}
          <div className="pk-foot">
            <button
              className="btn btn-primary"
              disabled={busy || !canSend}
              onClick={send}
            >
              {busy
                ? 'Requesting…'
                : offers4k && fourK
                  ? 'Request in 4K'
                  : 'Request'}
            </button>
            <button className="btn btn-tonal" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Wraps a card's one-click request: people who may choose options or request 4K get the
// sheet, everyone else keeps the one-click request. `done` runs after the sheet's request.
export function useQuickRequest(
  it: TitleResult,
  oneClick: () => void | Promise<void>,
  done: (is4k: boolean) => void
) {
  const choosesOptions = useAsksRequestOptions();
  const offers4k = useOffers4k(it.mediaType === 'tv' ? 'tv' : 'movie');
  const asks = choosesOptions || offers4k;
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return {
    request: async () => {
      if (asks) setOpen(true);
      else await oneClick();
    },
    sheet: open ? (
      <RequestSheet
        it={it}
        onClose={close}
        onDone={(is4k) => {
          setOpen(false);
          done(is4k);
        }}
      />
    ) : null,
  };
}
