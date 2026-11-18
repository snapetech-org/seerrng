import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ApiError,
  requestMovie,
  requestSeries,
  titleOf,
  tmdbImg,
  type RequestOptions,
  type TitleResult,
} from '../api';
import { useAuth } from '../auth';
import { friendlyError } from '../errors';
import { useApi, usePublicSettings } from '../hooks';
import { usePrefs } from '../settings';
import {
  AdvancedOptions,
  canChooseRequestOptions,
  canManageRequests,
  canRequest4k,
} from './detail';
import { useToast } from './toast';
import { useDialog } from './useDialog';

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

export function useVideoRequestQuota(kind: 'movie' | 'tv') {
  const { user } = useAuth();
  const id =
    user?.id && !canManageRequests(user.permissions) ? user.id : undefined;
  const quota = useApi<
    Partial<
      Record<
        'movie' | 'tv',
        {
          limit?: number;
          remaining?: number;
          restricted?: boolean;
        }
      >
    >
  >(id ? `/user/${id}/quota` : null, { currentPathOnly: true });
  return { status: quota.data?.[kind], refresh: quota.refresh };
}

// a just-closed sheet is about to undo its history step (one sheet is open at a time)
let pendingBack = false;

// The phone's Back closes a sheet (like a native dialog) instead of leaving the page: the
// sheet adds a copy of the current history entry and closes when it's popped.
export function useBackCloses(onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
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

export function isQuotaDenial(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status === 403 &&
    (error.code === 'REQUEST_QUOTA_EXCEEDED' ||
      error.message === 'Movie Quota exceeded.' ||
      error.message === 'Series Quota exceeded.')
  );
}

export function streamingOverrideMessage(error: unknown) {
  if (
    error instanceof ApiError &&
    error.code === 'STREAMING_REQUEST_POLICY_REJECTED' &&
    error.allowOverride
  )
    return error.message;
}

type RequestDone = (
  is4k: boolean,
  series?: SeriesRequest,
  quotaException?: boolean
) => void;

type SeriesRequest = Awaited<ReturnType<typeof requestSeries>>;

export function RequestSheet({
  it,
  onClose,
  onDone,
  quotaDenied = false,
  streamingDenial,
}: {
  it: TitleResult;
  onClose: () => void;
  onDone: RequestDone;
  quotaDenied?: boolean;
  streamingDenial?: string;
}) {
  const { user } = useAuth();
  const canAskApproval = !!user && !canManageRequests(user.permissions);
  const [denied, setDenied] = useState(quotaDenied);
  const approval = canAskApproval && denied;
  const tv = it.mediaType === 'tv';
  const asks = useAsksRequestOptions();
  const offers4k = useOffers4k(tv ? 'tv' : 'movie');
  const [fourK, setFourK] = useState(false);
  const [opts, setOpts] = useState<RequestOptions>({});
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');
  const [override, setOverride] = useState<
    | {
        message: string;
        options: RequestOptions;
      }
    | undefined
  >(
    streamingDenial === undefined
      ? undefined
      : { message: streamingDenial, options: {} }
  );
  const onOpts = useCallback((o: RequestOptions) => setOpts(o), []);
  useBackCloses(onClose);
  const box = useRef<HTMLDivElement>(null);
  useDialog(box, onClose);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (override) cancel.current?.focus();
  }, [override]);
  // without server choices there's nothing to wait for
  const canSend = !!override || !asks || ready;
  const send = async () => {
    if (busy || !canSend) return;
    setBusy(true);
    setErr('');
    const base = asks ? opts : {};
    const body = override
      ? { ...override.options, bypassStreamingRequestPolicy: true }
      : offers4k && fourK
        ? { ...base, is4k: true }
        : base;
    try {
      const options =
        approval && !body.userId
          ? { ...body, requestQuotaApproval: true }
          : body;
      const series = tv
        ? await requestSeries(it.id, 'all', options)
        : undefined;
      const movie = tv ? undefined : await requestMovie(it.id, options);
      onDone(
        !!body.is4k,
        series,
        series?.quotaException ?? movie?.quotaException
      );
    } catch (e) {
      const message = streamingOverrideMessage(e);
      if (!override && message !== undefined)
        setOverride({ message, options: body });
      else if (!denied && canAskApproval && !body.userId && isQuotaDenial(e))
        setDenied(true);
      else setErr(friendlyError(e, 'Request failed'));
      setBusy(false);
    }
  };
  return createPortal(
    <div className="sheet-wrap open">
      <div className="sheet-scrim" aria-hidden="true" onClick={onClose} />
      <div
        ref={box}
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
                {tv && (asks || offers4k)
                  ? 'Entire series · '
                  : tv
                    ? 'Entire series'
                    : null}
                {asks
                  ? 'Choose where it goes'
                  : offers4k
                    ? 'Choose the quality'
                    : null}
              </span>
            </div>
          </div>
          {!override && offers4k && (
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
                    // the same choice keeps its server list, which won't report ready again
                    if (v === fourK) return;
                    setFourK(v);
                    setReady(false);
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
          {!override && asks && (
            // keyed by quality: the 4K choice lists the 4K servers with their own defaults
            <AdvancedOptions
              key={fourK ? '4k' : 'hd'}
              kind={tv ? 'tv' : 'movie'}
              series={tv ? { id: it.id } : undefined}
              is4k={offers4k && fourK}
              onChange={onOpts}
              inline
              onReady={setReady}
            />
          )}
          {override && (
            <p className="note" role="alert">
              {override.message}
            </p>
          )}
          {approval && (
            <p className="note">
              This request exceeds your quota. You can ask a request manager to
              approve it.
            </p>
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
                : override
                  ? approval
                    ? 'Request Approval Anyway'
                    : 'Request Anyway'
                  : approval
                    ? 'Request Approval'
                    : offers4k && fourK
                      ? 'Request in 4K'
                      : 'Request'}
            </button>
            <button ref={cancel} className="btn btn-tonal" onClick={onClose}>
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
export function useQuickRequest(it: TitleResult, done: RequestDone) {
  const { user } = useAuth();
  const toast = useToast();
  const choosesOptions = useAsksRequestOptions();
  const offers4k = useOffers4k(it.mediaType === 'tv' ? 'tv' : 'movie');
  const [sheet, setSheet] = useState<
    'options' | 'approval' | { streamingDenial: string }
  >();
  const close = useCallback(() => setSheet(undefined), []);
  return {
    request: async () => {
      if (choosesOptions || offers4k) {
        setSheet('options');
        return;
      }
      try {
        const series =
          it.mediaType === 'tv' ? await requestSeries(it.id) : undefined;
        if (it.mediaType === 'movie') await requestMovie(it.id);
        done(false, series);
      } catch (error) {
        const message = streamingOverrideMessage(error);
        if (message !== undefined) setSheet({ streamingDenial: message });
        else if (
          user &&
          !canManageRequests(user.permissions) &&
          isQuotaDenial(error)
        )
          setSheet('approval');
        else toast(friendlyError(error, 'Request failed'));
      }
    },
    sheet: sheet ? (
      <RequestSheet
        it={it}
        quotaDenied={sheet === 'approval'}
        streamingDenial={
          typeof sheet === 'object' ? sheet.streamingDenial : undefined
        }
        onClose={close}
        onDone={(is4k, series, quotaException) => {
          close();
          done(is4k, series, quotaException);
        }}
      />
    ) : null,
  };
}
