import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  api,
  type RequestItem,
  type RequestOptions,
  type TvDetails,
} from '../api';
import { friendlyError } from '../errors';
import { usePublicSettings } from '../hooks';
import { useLumenLocale } from '../i18n';
import { Icon } from '../icons';
import { AdvancedOptions } from './detail';
import { useBackCloses } from './requestSheet';
import { useDialog } from './useDialog';

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
  const { t } = useLumenLocale();
  useBackCloses(onClose);
  const box = useRef<HTMLDivElement>(null);
  useDialog(box, onClose);
  const tv = r.type === 'tv';
  const waiting = r.status === 1;
  const specialsEnabled = usePublicSettings()?.enableSpecialEpisodes === true;
  const [existingSeasons] = useState(
    () =>
      new Map(
        r.seasons
          .filter((season) => season.status !== 3)
          .map((season) => [season.seasonNumber, season])
      )
  );
  const d = r as RequestItem & Destination;
  const [initial] = useState<RequestOptions>(() => ({
    serverId: d.serverId ?? undefined,
    profileId: d.profileId ?? undefined,
    rootFolder: d.rootFolder ?? undefined,
    languageProfileId: r.languageProfileId ?? undefined,
    metadataLanguageId: r.metadataLanguageId ?? undefined,
    tags: r.tags,
    sonarrSeasonType: r.sonarrSeasonType,
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
  const [tvdbId, setTvdbId] = useState<number | null>(null);
  const [picked, setPicked] = useState(() => new Set(existingSeasons.keys()));
  useEffect(() => {
    if (!tv) return;
    let live = true;
    api<TvDetails>(`/tv/${r.media.tmdbId}`)
      .then((t) => {
        if (!live) return;
        setTvdbId(t.externalIds?.tvdbId ?? null);
        setSeasons((t.seasons || []).filter((s) => (s.episodeCount ?? 1) > 0));
      })
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
    const selectedSeasons = [...picked].sort((a, b) => a - b);
    const seasonRequests = selectedSeasons.map((seasonNumber) => ({
      seasonNumber,
      episodeNumbers:
        existingSeasons.get(seasonNumber)?.episodeNumbers ?? undefined,
    }));
    setBusy(true);
    setErr('');
    try {
      await api(`/request/${r.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          mediaType: r.type,
          is4k: r.is4k,
          ...opts,
          ...(tv
            ? {
                seasons: selectedSeasons,
                seasonRequests: seasonRequests.some(
                  ({ episodeNumbers }) => episodeNumbers?.length
                )
                  ? seasonRequests
                  : undefined,
              }
            : {}),
        }),
      });
      if (then)
        await api(`/request/${r.id}/${then}`, {
          method: 'POST',
          body: '{}',
        });
      onDone(
        then === 'approve'
          ? t('lumen.requestEdit.approved')
          : then === 'retry'
            ? t('lumen.requestEdit.changedAndSent')
            : t('lumen.requestEdit.changed')
      );
    } catch (e) {
      setErr(
        friendlyError(
          e,
          t('lumen.requestEdit.couldNotChange'),
          (id, fallback) => t(id, fallback)
        )
      );
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
        aria-label={t('lumen.requestEdit.title', undefined, { title })}
      >
        <div className="grab" />
        <div className="pk">
          <div className="pk-head">
            <div className="p">{art && <img src={art} alt="" />}</div>
            <div>
              <h3>{t('lumen.requestEdit.title', undefined, { title })}</h3>
              <span className="sub">
                {r.requestedBy?.displayName
                  ? t('lumen.requestEdit.askedBy', undefined, {
                      name: r.requestedBy.displayName,
                    })
                  : ''}
                {r.is4k ? ' · 4K' : ''}
              </span>
            </div>
          </div>
          <AdvancedOptions
            kind={tv ? 'tv' : 'movie'}
            series={tv ? { id: r.media.tmdbId, tvdbId } : undefined}
            is4k={r.is4k}
            onChange={onOpts}
            inline
            onReady={setReady}
            initial={initial}
          />
          {tv && (
            <div
              className="slist"
              role="group"
              aria-label={t('lumen.requestEdit.seasons')}
            >
              {!seasons && (
                <p className="note">
                  {t('components.TrackingControls.loadingSeasons')}
                </p>
              )}
              {seasons
                ?.filter(
                  ({ seasonNumber }) =>
                    seasonNumber > 0 ||
                    (seasonNumber === 0 &&
                      (specialsEnabled || existingSeasons.has(0)))
                )
                .map((s) => {
                  const on = picked.has(s.seasonNumber);
                  const requestedEpisodes = existingSeasons.get(s.seasonNumber)
                    ?.episodeNumbers?.length;
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
                        <b>
                          {s.name ||
                            t(
                              'components.RequestModal.RequestTree.seasonNumber',
                              undefined,
                              {
                                number: s.seasonNumber,
                              }
                            )}
                        </b>
                        {on && requestedEpisodes ? (
                          <small>
                            {t(
                              'lumen.requestEdit.requestedEpisodes',
                              undefined,
                              {
                                count: requestedEpisodes,
                              }
                            )}
                          </small>
                        ) : (
                          !!s.episodeCount && (
                            <small>
                              {t('lumen.requestEdit.episodeCount', undefined, {
                                count: s.episodeCount,
                              })}
                            </small>
                          )
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
                  {busy ? t('i18n.saving') : t('lumen.requestEdit.approve')}
                </button>
                <button
                  className="btn btn-tonal"
                  disabled={busy || !ready || (tv && !picked.size)}
                  onClick={() => go()}
                >
                  {t('lumen.requestEdit.save')}
                </button>
              </>
            ) : (
              <button
                className="btn btn-primary"
                disabled={busy || !ready || (tv && !picked.size)}
                onClick={() => go('retry')}
              >
                {busy ? t('i18n.saving') : t('lumen.requestEdit.saveAndRetry')}
              </button>
            )}
            <button className="btn btn-quiet" onClick={onClose}>
              {t('i18n.cancel')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
