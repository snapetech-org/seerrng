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
import { usePrefs } from '../settings';
import { AdvancedOptions, canChooseRequestOptions } from './detail';

// Poster quick requests are one click for most people. People who may choose the
// Radarr/Sonarr server, quality and folder get this sheet first (unless the
// "requestOptions" setting is off), like SeerrNG's own request dialog.
export function useAsksRequestOptions() {
  const { user } = useAuth();
  const { prefs } = usePrefs();
  return prefs.requestOptions && canChooseRequestOptions(user?.permissions);
}

export function RequestSheet({
  it,
  onClose,
  onDone,
}: {
  it: TitleResult;
  onClose: () => void;
  onDone: () => void; // request sent
}) {
  const tv = it.mediaType === 'tv';
  const [opts, setOpts] = useState<RequestOptions>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const onOpts = useCallback((o: RequestOptions) => setOpts(o), []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  // The phone's Back closes the sheet (like a native dialog) instead of leaving the page:
  // the sheet adds a copy of the current history entry and closes when it's popped.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    let popped = false;
    window.history.pushState(window.history.state, '', window.location.href);
    const onPop = () => {
      popped = true;
      closeRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // closed with a button: drop the extra entry so Back isn't needed twice
      if (!popped) window.history.back();
    };
  }, []);
  const send = async () => {
    setBusy(true);
    setErr('');
    try {
      await (tv
        ? requestSeries(it.id, 'all', opts)
        : requestMovie(it.id, opts));
      onDone();
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
                {tv ? 'Entire series · ' : ''}Choose where it goes
              </span>
            </div>
          </div>
          <AdvancedOptions
            kind={tv ? 'tv' : 'movie'}
            is4k={false}
            onChange={onOpts}
            inline
          />
          {err && (
            <p className="note" role="alert">
              {err}
            </p>
          )}
          <div className="pk-foot">
            <button className="btn btn-primary" disabled={busy} onClick={send}>
              {busy ? 'Requesting…' : 'Request'}
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

// Wraps a card's one-click request: people who may choose options get the sheet,
// everyone else keeps the one-click request. `done` runs after the sheet's request.
export function useQuickRequest(
  it: TitleResult,
  oneClick: () => void | Promise<void>,
  done: () => void
) {
  const asks = useAsksRequestOptions();
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
        onDone={() => {
          setOpen(false);
          done();
        }}
      />
    ) : null,
  };
}
