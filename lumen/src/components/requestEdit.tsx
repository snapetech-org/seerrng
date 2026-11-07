import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  api,
  type RequestItem,
  type RequestOptions,
  type TvDetails,
} from '../api';
import { Icon } from '../icons';
import { AdvancedOptions } from './detail';
import { useBackCloses } from './requestSheet';

// What SeerrNG says about a request's destination (not in Lumen's RequestItem shape).
type Destination = {
  serverId?: number | null;
  profileId?: number | null;
  rootFolder?: string | null;
};

// Admins change a request before acting on it, like SeerrNG's own request editor: server,
// quality, folder, whose request it is and, for a series, which seasons. A waiting request can
// then be approved or just saved; a failed one is saved and tried again.
export function RequestEditSheet({
  r,
  title,
  art,
  onClose,
  onDone,
}: {
  r: RequestItem;
  title: string;
  art?: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  useBackCloses(onClose);
  const tv = r.type === 'tv';
  const waiting = r.status === 1;
  const d = r as RequestItem & Destination;
  const [initial] = useState<RequestOptions>(() => ({
    serverId: d.serverId ?? undefined,
    profileId: d.profileId ?? undefined,
    rootFolder: d.rootFolder ?? undefined,
    userId: r.requestedBy?.id,
  }));
  const [opts, setOpts] = useState<RequestOptions>({});
  const onOpts = useCallback((o: RequestOptions) => setOpts(o), []);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // series: every season with episodes, starting from the ones asked for
  const [seasons, setSeasons] = useState<
    { seasonNumber: number; name?: string; episodeCount?: number }[] | null
  >(null);
  const [picked, setPicked] = useState(
    () => new Set(r.seasons.map((s) => s.seasonNumber))
  );
  useEffect(() => {
    if (!tv) return;
    let live = true;
    api<TvDetails>(`/tv/${r.media.tmdbId}`)
      .then(
        (t) =>
          live &&
          setSeasons(
            (t.seasons || []).filter(
              (s) => s.seasonNumber > 0 && (s.episodeCount ?? 1) > 0
            )
          )
      )
      .catch(() => live && setSeasons([]));
    return () => {
      live = false;
    };
  }, [tv, r.media.tmdbId]);
  const toggle = (n: number) =>
    setPicked((x) => {
      const y = new Set(x);
      if (y.has(n)) y.delete(n);
      else y.add(n);
      return y;
    });

  const go = async (then?: 'approve' | 'retry') => {
    if (busy || !ready || (tv && !picked.size)) return;
    setBusy(true);
    setErr('');
    try {
      await api(`/request/${r.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          mediaType: r.type,
          is4k: r.is4k,
          ...opts,
          ...(tv ? { seasons: [...picked].sort((a, b) => a - b) } : {}),
        }),
      });
      if (then)
        await api(`/request/${r.id}/${then}`, {
          method: 'POST',
          body: '{}',
        });
      onDone(
        then === 'approve'
          ? 'Request approved'
          : then === 'retry'
            ? 'Request changed and sent again'
            : 'Request changed'
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Couldn’t change the request');
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
        aria-label={`Change request for ${title}`}
      >
        <div className="grab" />
        <div className="pk">
          <div className="pk-head">
            <div className="p">{art && <img src={art} alt="" />}</div>
            <div>
              <h3>Change request for {title}</h3>
              <span className="sub">
                {r.requestedBy?.displayName
                  ? `Asked by ${r.requestedBy.displayName}`
                  : ''}
                {r.is4k ? ' · 4K' : ''}
              </span>
            </div>
          </div>
          <AdvancedOptions
            kind={tv ? 'tv' : 'movie'}
            is4k={r.is4k}
            onChange={onOpts}
            inline
            onReady={setReady}
            initial={initial}
          />
          {tv && (
            <div className="slist" role="group" aria-label="Seasons">
              {!seasons && <p className="note">Loading seasons…</p>}
              {seasons?.map((s) => {
                const on = picked.has(s.seasonNumber);
                return (
                  <div
                    key={s.seasonNumber}
                    className="srow"
                    role="checkbox"
                    aria-checked={on}
                    tabIndex={0}
                    onClick={() => toggle(s.seasonNumber)}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        toggle(s.seasonNumber);
                      }
                    }}
                  >
                    <span className="cbx">
                      <Icon name="check" />
                    </span>
                    <span>
                      <b>{s.name || `Season ${s.seasonNumber}`}</b>
                      {!!s.episodeCount && (
                        <small>
                          {s.episodeCount} episode
                          {s.episodeCount === 1 ? '' : 's'}
                        </small>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {err && (
            <p className="note" role="alert">
              {err}
            </p>
          )}
          <div className="pk-foot">
            {waiting ? (
              <>
                <button
                  className="btn btn-primary"
                  disabled={busy || !ready || (tv && !picked.size)}
                  onClick={() => go('approve')}
                >
                  {busy ? 'Saving…' : 'Approve'}
                </button>
                <button
                  className="btn btn-tonal"
                  disabled={busy || !ready || (tv && !picked.size)}
                  onClick={() => go()}
                >
                  Save
                </button>
              </>
            ) : (
              <button
                className="btn btn-primary"
                disabled={busy || !ready || (tv && !picked.size)}
                onClick={() => go('retry')}
              >
                {busy ? 'Saving…' : 'Save and try again'}
              </button>
            )}
            <button className="btn btn-quiet" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
