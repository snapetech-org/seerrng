import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  artUrl,
  MediaStatus,
  type CardTitleKind,
  type MediaInfo,
} from '../api';
import { isAdministrator, useAuth } from '../auth';
import { friendlyError } from '../errors';
import { useExtras, type Extra, type Magazine } from '../extras';
import { usePublicSettings } from '../hooks';
import { useLumenLocale } from '../i18n';
import { Icon, type IconName } from '../icons';
import type { ManagedMediaType } from '../mediaIdentity';
import { usePrefs } from '../settings';
import {
  Glyph,
  QualityStatusGlyphs,
  StatLabel,
  statusOf,
  TouchQuick,
  useCardTitleMode,
  type QualityStatus,
  type Stat,
} from './cards';
import { Pill } from './detail';
import { Avatar, fullSeerrUrl } from './Shell';
import { useToast } from './toast';
import WatchlistButton from './WatchlistButton';

// The pieces the extra categories share: a poster card, the page header, the status-aware
// request button and the "this category is off" notice.

export const extraStat = (mi?: MediaInfo): Stat => statusOf(mi, true);

// A comic or manga series: complete only when every issue/volume is in; "9 of 16" while
// part of it is; the download's progress while a download (often one pack for many
// volumes) runs; otherwise the usual requested state.
export function comicState(mi?: MediaInfo): {
  stat: Stat;
  pct?: number;
  detail?: string;
} {
  if (!mi) return { stat: null };
  const p = mi.comicProgress;
  const ofTotal =
    p && p.total > 0 ? `${Math.min(p.owned, p.total)} of ${p.total}` : '';
  if (mi.status === MediaStatus.AVAILABLE)
    return {
      stat: { k: 'ok', word: 'Complete', ico: 'check' },
      detail: p?.total ? `All ${p.total} in library` : undefined,
    };
  const dls = mi.downloadStatus || [];
  if (dls.length) {
    const pcts = dls
      .map((d) => {
        if (typeof d.percent === 'number' && Number.isFinite(d.percent))
          return d.percent;
        if (
          Number.isFinite(d.size) &&
          d.size > 0 &&
          Number.isFinite(d.sizeLeft) &&
          d.sizeLeft >= 0 &&
          d.sizeLeft <= d.size
        )
          return ((d.size - d.sizeLeft) / d.size) * 100;
      })
      .filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
    const pct =
      pcts.length === dls.length
        ? Math.max(
            0,
            Math.min(
              100,
              Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)
            )
          )
        : undefined;
    return {
      stat: {
        k: 'dl',
        word:
          pct === undefined
            ? 'Downloading'
            : pct === 0
              ? 'Queued'
              : `Downloading ${pct}%`,
        ico: 'down',
      },
      pct,
      detail: ofTotal ? `${ofTotal} in library` : undefined,
    };
  }
  if (mi.status === MediaStatus.PARTIAL)
    return {
      stat: {
        k: 'ok',
        word: ofTotal ? `${ofTotal} in library` : 'Partly in library',
        ico: 'check',
      },
    };
  return { stat: statusOf(mi, true) };
}

export function MagazineCard({ magazine }: { magazine: Magazine }) {
  return (
    <ExtraCard
      href={'/magazine/' + encodeURIComponent(magazine.title)}
      img={magazine.posterPath}
      title={magazine.title}
      shape="book"
      icon="magazine"
      stat={extraStat(magazine.mediaInfo)}
      watchlist={{ mediaType: 'magazine', id: magazine.title }}
      meta={[
        magazine.publisher,
        magazine.latestIssue
          ? 'Latest ' + magazine.latestIssue
          : magazine.firstPublishYear,
      ]
        .filter(Boolean)
        .join(' · ')}
    />
  );
}

export function ExtraCard({
  href,
  img,
  title,
  meta,
  stat,
  shape,
  icon,
  note,
  pct,
  titleKind,
  watchlist,
  quick,
  metaHref,
  statusBadges,
}: {
  href: string;
  // the meta line (an album's artist) opens its own page
  metaHref?: string;
  img?: string;
  title: string;
  meta?: string;
  stat?: Stat;
  shape?: 'sq' | 'book' | 'wide';
  icon: IconName;
  note?: string; // a second, quieter line (e.g. the library state)
  titleKind?: CardTitleKind;
  watchlist?: { mediaType: ManagedMediaType; id: string | number };
  pct?: number; // a download progress bar along the bottom of the art
  // a one-tap request on the cover (Get album), shown while nothing is owned or asked for
  quick?: { label: string; action: string; run: () => Promise<unknown> };
  statusBadges?: QualityStatus[];
}) {
  const titleMode = useCardTitleMode(titleKind);
  const safeImage = artUrl(img);
  const [imageFailed, setImageFailed] = useState(false);
  const [quickState, setQuickState] = useState<'idle' | 'busy' | 'done'>(
    'idle'
  );
  const shownStat: Stat =
    quickState === 'done'
      ? { k: 'wait', word: 'Requested', ico: 'clock' }
      : stat || null;
  const quickBusy = useRef(false);
  const toast = useToast();
  const { t } = useLumenLocale();
  const { prefs } = usePrefs();
  const runQuick = async () => {
    if (!quick || quickBusy.current || quickState === 'done') return;
    quickBusy.current = true;
    setQuickState('busy');
    try {
      await quick.run();
      setQuickState('done');
    } catch (error) {
      setQuickState('idle');
      toast(
        friendlyError(
          error,
          t(
            'lumen.request.couldNotRequestTitle',
            'Could not request {title}.',
            {
              title,
            }
          )
        )
      );
    } finally {
      quickBusy.current = false;
    }
  };
  const showQuick =
    Boolean(quick) && prefs.hoverRequest && !stat && quickState !== 'done';
  return (
    <div
      className={`poster ${shape || ''}`}
      data-title-mode={safeImage ? titleMode : undefined}
    >
      <div className="art">
        {/* a cover that fails to load stays in place, hidden, under the icon */}
        {safeImage && (
          <img
            loading="lazy"
            src={safeImage}
            referrerPolicy="no-referrer"
            alt=""
            hidden={imageFailed}
            onError={() => setImageFailed(true)}
          />
        )}
        {(!safeImage || imageFailed) && (
          <span className="art-ph">
            <Icon name={icon} />
          </span>
        )}
        {statusBadges?.length ? (
          <QualityStatusGlyphs statuses={statusBadges} />
        ) : (
          <Glyph s={shownStat} />
        )}
        {pct != null && (
          <span className="bar" aria-hidden="true">
            <i style={{ width: `${pct}%` }} />
          </span>
        )}
        <Link className="hit" to={href} aria-label={title} />
        {showQuick && quick && (
          <TouchQuick
            label={quick.label}
            onClick={runQuick}
            busy={quickState === 'busy'}
          />
        )}
        {showQuick && quick && !watchlist && (
          <div className="qa">
            <div className="qb">
              <button
                type="button"
                className="qbtn go"
                disabled={quickState === 'busy'}
                onClick={() => void runQuick()}
                aria-label={quick.label}
              >
                <Icon name="plus" size="sm" />
                {quick.action}
              </button>
            </div>
          </div>
        )}
        {watchlist && (
          <WatchlistButton
            mediaType={watchlist.mediaType}
            detail={{ id: watchlist.id, title }}
            requestedId={watchlist.id}
            compact
            touch
          />
        )}
        {watchlist && (
          <div className="qa">
            <div className="qb watchlist-row">
              {showQuick && quick && (
                <button
                  type="button"
                  className="qbtn go"
                  disabled={quickState === 'busy'}
                  onClick={() => void runQuick()}
                  aria-label={quick.label}
                >
                  <Icon name="plus" size="sm" />
                  {quick.action}
                </button>
              )}
              <WatchlistButton
                mediaType={watchlist.mediaType}
                detail={{ id: watchlist.id, title }}
                requestedId={watchlist.id}
                compact
              />
            </div>
          </div>
        )}
      </div>
      <div className="t">
        {/* the art's link already names the card for screen readers */}
        <Link to={href} tabIndex={-1} aria-hidden="true">
          {title}
        </Link>
      </div>
      {meta &&
        (metaHref ? (
          <div className="m">
            <Link to={metaHref}>{meta}</Link>
          </div>
        ) : (
          <div className="m">{meta}</div>
        ))}
      {note && <div className="m2">{note}</div>}
    </div>
  );
}

export function ExtraHeader({
  title,
  sub,
  leading,
  children,
}: {
  title: string;
  sub?: string;
  leading?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="ph">
      <div className="ph-row">
        <div>
          {leading}
          <h1>{title}</h1>
        </div>
        <Avatar className="avatar ph-only-avatar" />
      </div>
      {sub && <p className="sub">{sub}</p>}
      {children}
    </header>
  );
}

// a search box for the pages that search their own catalogue
export function ExtraSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="search extra-q">
      <Icon name="search" />
      <input
        type="search"
        placeholder={placeholder}
        aria-label={placeholder}
        value={value}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </label>
  );
}

// the detail page's main button: shows the library state, or requests it
export function RequestButton({
  stat,
  label,
  request,
  className = 'btn btn-primary',
  onError,
}: {
  stat: Stat;
  label?: string;
  request: () => Promise<unknown>;
  className?: string;
  // answers true when it handled the failure itself (no toast)
  onError?: (error: unknown) => boolean;
}) {
  const toast = useToast();
  const { t } = useLumenLocale();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  if (stat?.k === 'ok')
    return (
      <button className="btn btn-tonal" disabled>
        <Icon name="check" />
        <StatLabel s={stat} />
      </button>
    );
  if (stat || done)
    return (
      <button className="btn btn-tonal" disabled>
        <Icon name={stat?.ico || 'clock'} />
        <StatLabel s={stat ?? { word: 'Requested' }} />
      </button>
    );
  const go = async () => {
    setBusy(true);
    try {
      await request();
      setDone(true);
      toast(t('lumen.common.requestSubmitted', 'Request submitted.'));
    } catch (e) {
      if (!onError?.(e))
        toast(
          friendlyError(
            e,
            t(
              'lumen.common.requestFailed',
              'The request could not be submitted.'
            ),
            t
          )
        );
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className={className} disabled={busy} onClick={go}>
      <Icon name="plus" />
      {label ?? t('lumen.common.request', 'Request')}
    </button>
  );
}

export const StatPill = ({ s }: { s: Stat }) =>
  s ? (
    <Pill k={s.k} icon={s.ico}>
      <StatLabel s={s} />
    </Pill>
  ) : null;

// wraps a category's pages: waits for settings, then shows the page or why it isn't there
export function ExtraGate({ k, children }: { k: Extra; children: ReactNode }) {
  const { t } = useLumenLocale();
  const x = useExtras();
  const { seerrPublicUrl } = usePrefs();
  const { user } = useAuth();
  const lockedToLumen =
    usePublicSettings()?.lockLumenForNonAdmins &&
    !isAdministrator(user?.permissions);
  if (!x.ready)
    return x.error ? (
      <ServiceNote
        error={x.error}
        what={t('lumen.error.what.thisPage', 'this page')}
        retry={x.retry}
      />
    ) : (
      <div className="detail-loading" aria-busy="true" />
    );
  if (x.enabled(k)) return <>{children}</>;
  const label = {
    music: 'Music',
    podcast: 'Podcasts',
    comic: 'Comics/Manga',
    magazine: 'Magazines',
    game: 'Games',
    sports: 'Sports',
    adult: 'Adult',
  }[k];
  return (
    <>
      <ExtraHeader title={label} />
      <div className="empty">
        <b>{label} is turned off on this server</b>
        An admin can turn it on in SeerrNG under Settings › General › Media
        categories.{' '}
        <Link to="/" style={{ color: 'var(--accent)' }}>
          Back to Discover
        </Link>{' '}
        {!lockedToLumen && (
          <>
            or{' '}
            <a
              href={fullSeerrUrl(seerrPublicUrl)}
              style={{ color: 'var(--accent)' }}
            >
              open full SeerrNG
            </a>
          </>
        )}
        .
      </div>
    </>
  );
}

// why a list is empty when the server says a service isn't connected
export function ServiceNote({
  error,
  what,
  title,
  retryLabel,
  retry,
  retryDisabled = false,
  tone,
}: {
  error: string | null;
  what: string;
  title?: string;
  retryLabel?: string;
  retry?: () => void;
  retryDisabled?: boolean;
  tone?: 'warning';
}) {
  const { t } = useLumenLocale();
  if (!error) return null;
  return (
    <div
      className="empty"
      data-tone={tone}
      role={tone === 'warning' ? 'status' : retry ? 'alert' : undefined}
    >
      <b>
        {title ?? t('lumen.error.loadWhat', 'Couldn’t load {what}', { what })}
      </b>
      {retry ? <p>{error}</p> : error}
      {retry && (
        <button
          className="btn btn-tonal"
          onClick={retry}
          disabled={retryDisabled}
        >
          {retryLabel ?? t('lumen.common.retry', 'Retry')}
        </button>
      )}
    </div>
  );
}
