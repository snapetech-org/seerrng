import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { MediaInfo } from '../api';
import { useExtras, type Extra } from '../extras';
import { Icon, type IconName } from '../icons';
import { usePrefs } from '../settings';
import { Glyph, statusOf, type Stat } from './cards';
import { Pill } from './detail';
import { Avatar, SEERR_PUBLIC_URL } from './Shell';
import { useToast } from './toast';

// The pieces the extra categories share: a poster card, the page header, the status-aware
// request button and the "this category is off" notice.

export const extraStat = (mi?: MediaInfo): Stat => statusOf(mi, true);

export function ExtraCard({
  href,
  img,
  title,
  meta,
  stat,
  shape,
  icon,
}: {
  href: string;
  img?: string;
  title: string;
  meta?: string;
  stat?: Stat;
  shape?: 'sq' | 'book' | 'wide';
  icon: IconName;
}) {
  return (
    <div className={`poster ${shape || ''}`}>
      <div className="art">
        {img ? (
          <img loading="lazy" src={img} alt="" />
        ) : (
          <span className="art-ph">
            <Icon name={icon} />
          </span>
        )}
        <Glyph s={stat || null} />
        <Link className="hit" to={href} aria-label={title} />
      </div>
      <div className="t">{title}</div>
      {meta && <div className="m">{meta}</div>}
    </div>
  );
}

export function ExtraHeader({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children?: ReactNode;
}) {
  return (
    <header className="ph">
      <div className="ph-row">
        <div>
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
        value={value}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

// the detail page's main button: shows the library state, or requests it
export function RequestButton({
  stat,
  label = 'Request',
  request,
  className = 'btn btn-primary',
}: {
  stat: Stat;
  label?: string;
  request: () => Promise<unknown>;
  className?: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  if (stat?.k === 'ok')
    return (
      <button className="btn btn-tonal" disabled>
        <Icon name="check" />
        {stat.word}
      </button>
    );
  if (stat || done)
    return (
      <button className="btn btn-tonal" disabled>
        <Icon name={stat?.ico || 'clock'} />
        {stat?.word || 'Requested'}
      </button>
    );
  const go = async () => {
    setBusy(true);
    try {
      await request();
      setDone(true);
      toast('Requested');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className={className} disabled={busy} onClick={go}>
      <Icon name="plus" />
      {label}
    </button>
  );
}

export const StatPill = ({ s }: { s: Stat }) =>
  s ? (
    <Pill k={s.k} icon={s.ico}>
      {s.word}
    </Pill>
  ) : null;

// wraps a category's pages: waits for settings, then shows the page or why it isn't there
export function ExtraGate({ k, children }: { k: Extra; children: ReactNode }) {
  const x = useExtras();
  const { seerrPublicUrl } = usePrefs();
  if (!x.ready) return <div className="detail-loading" aria-busy="true" />;
  if (x.enabled(k)) return <>{children}</>;
  const label = {
    music: 'Music',
    comic: 'Comics',
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
        or{' '}
        <a
          href={seerrPublicUrl || SEERR_PUBLIC_URL}
          style={{ color: 'var(--accent)' }}
        >
          open full SeerrNG
        </a>
        .
      </div>
    </>
  );
}

// why a list is empty when the server says a service isn't connected
export function ServiceNote({
  error,
  what,
}: {
  error: string | null;
  what: string;
}) {
  if (!error) return null;
  return (
    <div className="empty">
      <b>Couldn’t load {what}</b>
      {error}
    </div>
  );
}
