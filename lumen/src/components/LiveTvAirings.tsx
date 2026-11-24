import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { useLiveTvStatus } from '../liveTv';
import { ServiceNote } from './extra';
import { useDialog } from './useDialog';

interface Airing {
  channel: string;
  channelName: string;
  start: string;
  stop: string;
  title: string;
  subTitle?: string;
  season?: number;
  episode?: number;
}

interface Guide {
  configured: boolean;
  guideReady?: boolean;
  airings: Airing[];
}

interface Title {
  title?: string;
  original?: string;
  mediaType: 'movie' | 'tv';
  tmdbId: number;
}

function airingTime(airing: Airing, locale: string) {
  const start = new Date(airing.start);
  const end = new Date(airing.stop);
  return Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())
    ? `${new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(start)} – ${new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(end)}`
    : '';
}

function AiringsSheet({
  title,
  query,
  canRequest,
  close,
}: {
  title: Title;
  query: string;
  canRequest: boolean;
  close: () => void;
}) {
  const { locale, t } = useLumenLocale();
  const dialog = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const guide = useApi<Guide>(`/live-tv/airings?${query}`, {
    currentPathOnly: true,
  });
  const [busy, setBusy] = useState(false);
  const [recorded, setRecorded] = useState(new Set<string>());
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>();
  const dismiss = () => {
    if (!pending.current) close();
  };
  useDialog(dialog, dismiss);

  async function request(
    key: string,
    airing: Airing,
    kind: 'airing' | 'series'
  ) {
    if (!canRequest || pending.current || recorded.has(key)) return;
    pending.current = true;
    setBusy(true);
    setNotice(undefined);
    try {
      const result = await api<{ status: string }>('/live-tv/recordings', {
        method: 'POST',
        body: JSON.stringify({
          kind,
          title: airing.title,
          mediaType: title.mediaType,
          tmdbId: title.tmdbId,
          ...(kind === 'airing'
            ? { channel: airing.channel, start: airing.start }
            : {}),
        }),
      });
      setRecorded((previous) => new Set(previous).add(key));
      setNotice({
        text:
          result.status === 'pending'
            ? t('lumen.liveTv.recordingPending')
            : t('lumen.liveTv.recordingScheduled'),
      });
    } catch (failure) {
      setNotice({
        text: friendlyError(
          failure,
          t('lumen.liveTv.recordingFailed'),
          (id, fallback) => t(id, fallback)
        ),
        error: true,
      });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const airings = guide.data?.airings ?? [];
  return createPortal(
    <div className="sheet-wrap open">
      <div className="sheet-scrim" aria-hidden="true" onClick={dismiss} />
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('lumen.liveTv.airings')}
        ref={dialog}
      >
        <div className="grab" />
        <div className="pk">
          <header>
            <h3>{t('lumen.liveTv.airings')}</h3>
            <p className="note">{title.title || title.original}</p>
          </header>
          <ServiceNote
            what={t('lumen.liveTv.airings')}
            error={guide.error}
            retry={guide.reload}
          />
          {!guide.data && !guide.error && (
            <p className="note" role="status">
              {t('lumen.liveTv.checkingGuide')}
            </p>
          )}
          {guide.data?.configured === false && (
            <p className="note">{t('lumen.liveTv.unavailable')}</p>
          )}
          {guide.data?.configured && guide.data.guideReady === false && (
            <>
              <p className="note">{t('lumen.liveTv.guideNotReady')}</p>
              <div className="toolbar">
                <button
                  className="btn btn-tonal btn-sm"
                  type="button"
                  onClick={guide.reload}
                >
                  {t('lumen.liveTv.checkAgain')}
                </button>
              </div>
            </>
          )}
          {guide.data?.guideReady && !airings.length && (
            <p className="note">{t('lumen.liveTv.noAirings')}</p>
          )}
          {!!airings.length && !canRequest && (
            <p className="note">{t('lumen.liveTv.viewOnly')}</p>
          )}
          {title.mediaType === 'tv' && airings[0] && canRequest && (
            <div className="toolbar">
              <button
                className="btn btn-tonal btn-sm"
                type="button"
                disabled={busy || recorded.has('series')}
                onClick={() => void request('series', airings[0], 'series')}
              >
                {recorded.has('series')
                  ? t('lumen.liveTv.seriesSubmitted')
                  : t('lumen.liveTv.recordSeries')}
              </button>
            </div>
          )}
          {!!airings.length && (
            <div className="setlist">
              {airings.map((airing) => {
                const key = JSON.stringify([airing.channel, airing.start]);
                return (
                  <div className="set" key={key}>
                    <span>
                      <b>{airing.subTitle || airing.title}</b>
                      <small>
                        {airing.channelName || airing.channel} ·{' '}
                        {airingTime(airing, locale)}
                      </small>
                      {airing.season !== undefined &&
                        airing.episode !== undefined && (
                          <small>
                            {t('lumen.liveTv.seasonEpisode', undefined, {
                              season: airing.season,
                              episode: airing.episode,
                            })}
                          </small>
                        )}
                    </span>
                    {canRequest && (
                      <button
                        className="btn btn-tonal btn-sm"
                        type="button"
                        disabled={busy || recorded.has(key)}
                        onClick={() => void request(key, airing, 'airing')}
                      >
                        {recorded.has(key)
                          ? t('lumen.liveTv.requestSubmitted')
                          : t('lumen.liveTv.recordAiring')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {notice && (
            <p className="note" role={notice.error ? 'alert' : 'status'}>
              {notice.text}
            </p>
          )}
          <div className="toolbar">
            {!busy && (
              <Link
                className="btn btn-tonal btn-sm"
                to="/recordings"
                onClick={dismiss}
              >
                {t('lumen.liveTv.viewRecordings')}
              </Link>
            )}
            <button
              className="btn btn-quiet btn-sm"
              type="button"
              disabled={busy}
              onClick={dismiss}
            >
              {t('i18n.close')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function LiveTvAirings(title: Title) {
  const { t } = useLumenLocale();
  const status = useLiveTvStatus();
  const [open, setOpen] = useState(false);
  const names = [
    ...new Set(
      [title.title, title.original].flatMap((name) => {
        const value = name?.trim();
        return value && value.length <= 300 ? [value] : [];
      })
    ),
  ];
  if (!status.data?.configured || !names.length) return null;
  const query = new URLSearchParams({ limit: '10' });
  names.forEach((name) => query.append('title', name));
  return (
    <>
      <button
        className="btn btn-tonal btn-sm"
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {t('lumen.liveTv.findAirings')}
      </button>
      {open && (
        <AiringsSheet
          title={title}
          query={query.toString()}
          canRequest={status.data.canRequest}
          close={() => setOpen(false)}
        />
      )}
    </>
  );
}
