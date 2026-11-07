import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { Section } from '../components/cards';
import { canChooseRequestOptions } from '../components/detail';
import { initials, SEERR_PUBLIC_URL } from '../components/Shell';
import { CAN_HOVER, useApi } from '../hooks';
import { Icon } from '../icons';
import { mediaServer, services } from '../mediaServer';
import {
  DISCOVER_ROWS,
  discoverRowLabel,
  usePrefs,
  type DiscoverRow,
} from '../settings';
import { canSeeRecent } from './Discover';

type Quota = Record<
  string,
  { limit: number; used: number; days?: number; restricted: boolean }
>;

function Toggle({
  path,
  title,
  sub,
  on,
}: {
  path: string;
  title: string;
  sub?: string;
  on: boolean;
}) {
  const { set, locked } = usePrefs();
  const isLocked = locked.has(path);
  return (
    <div
      className={`set toggle-row ${isLocked ? 'locked' : ''}`}
      role="switch"
      aria-checked={on}
      aria-disabled={isLocked}
      tabIndex={isLocked ? -1 : 0}
      onClick={() => !isLocked && set(path, !on)}
      onKeyDown={(e) => {
        if (!isLocked && (e.key === ' ' || e.key === 'Enter')) {
          e.preventDefault();
          set(path, !on);
        }
      }}
    >
      <span>
        <b>{title}</b>
        <small>{isLocked ? 'Set by your admin' : sub}</small>
      </span>
      <span className="sw" />
    </div>
  );
}

export default function Me() {
  const { user, signOut } = useAuth();
  const { prefs, set, reset, locked, seerrPublicUrl } = usePrefs();
  const quota = useApi<Quota>(user ? `/user/${user.id}/quota` : null).data;
  const full = seerrPublicUrl || SEERR_PUBLIC_URL;
  const isAdmin = ((user?.permissions ?? 0) & 2) !== 0;
  const q = (k: string, label: string) => {
    const x = quota?.[k];
    if (!x) return null;
    const unlimited = !x.limit;
    return (
      <div className="qbox" key={k}>
        <span>{label}</span>
        <b>
          {unlimited ? (
            'No limit'
          ) : (
            <>
              {Math.max(0, x.limit - x.used)} <small>of {x.limit} left</small>
            </>
          )}
        </b>
        {!unlimited && (
          <div className="progress">
            <i
              style={{ width: `${Math.min(100, (x.used / x.limit) * 100)}%` }}
            />
          </div>
        )}
        {!unlimited && x.days ? <span>Every {x.days} days</span> : null}
      </div>
    );
  };

  return (
    <>
      <header className="ph">
        <div className="ph-row">
          <div>
            <h1>You</h1>
          </div>
        </div>
      </header>
      <div className="me-card">
        <span className="avatar">{initials(user?.displayName || '?')}</span>
        <div>
          <b>{user?.displayName}</b>
          <small>Signed in to SeerrNG</small>
        </div>
      </div>

      <Section title="Request limits">
        <div className="quota">
          {q('movie', 'Movies')}
          {q('tv', 'Seasons')}
          {prefs.showBooks && q('book', 'Books')}
        </div>
      </Section>

      <Section title="Appearance">
        <div className="setlist">
          <div className="set">
            <span>
              <b>Theme</b>
              <small>
                {locked.has('theme')
                  ? 'Set by your admin'
                  : 'Dark is the default'}
              </small>
            </span>
            <div className="seg" role="group" aria-label="Theme">
              {(['dark', 'light', 'system'] as const).map((v) => (
                <button
                  key={v}
                  disabled={locked.has('theme')}
                  aria-pressed={prefs.theme === v}
                  onClick={() => set('theme', v)}
                >
                  {v === 'system' ? 'Device' : v[0].toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Requesting">
        <div className="setlist">
          <Toggle
            path="hoverRequest"
            on={prefs.hoverRequest}
            title="Quick request on posters"
            sub={
              CAN_HOVER
                ? 'Hovering a poster shows Request without opening it'
                : 'A + on each poster requests it without opening it'
            }
          />
          <Toggle
            path="wholeSeriesDefault"
            on={prefs.wholeSeriesDefault}
            title="Request whole series by default"
            sub="Off: pick seasons yourself every time"
          />
          <Toggle
            path="narratorChoice"
            on={prefs.narratorChoice}
            title="Choose audiobook narrators"
            sub="Off: one straight Request button, best available recording"
          />
          {canChooseRequestOptions(user?.permissions) && (
            <Toggle
              path="requestOptions"
              on={prefs.requestOptions}
              title="Choose server and folder on quick requests"
              sub="Off: poster Request buttons use the default server, quality and folder"
            />
          )}
          {services().books && (
            <Toggle
              path="showBooks"
              on={prefs.showBooks}
              title="Show books and audiobooks"
              sub="Off: Lumen is movies and series only"
            />
          )}
        </div>
      </Section>

      <Section title="Discover rows">
        <div className="setlist">
          {(Object.keys(DISCOVER_ROWS) as DiscoverRow[])
            .filter(
              (r) =>
                (prefs.showBooks || (r !== 'books' && r !== 'audiobooks')) &&
                (r !== 'newOnPlex' || canSeeRecent(user?.permissions))
            )
            .map((r) => (
              <Toggle
                key={r}
                path={`rows.${r}`}
                on={prefs.rows[r]}
                title={discoverRowLabel(r)}
              />
            ))}
        </div>
        <button
          className="btn btn-quiet btn-sm"
          style={{ marginTop: 10 }}
          onClick={reset}
        >
          Reset to defaults
        </button>
      </Section>

      <Section title="More">
        <div className="setlist">
          <div className="set">
            <span>
              <b>Media server: {mediaServer().name}</b>
              <small>
                {mediaServer().source === 'config'
                  ? 'Set by your admin in lumen-config.json'
                  : 'Follows SeerrNG’s media server setting'}
              </small>
            </span>
          </div>
          {isAdmin && (
            <div className="set">
              <span>
                <b>Lumen settings for everyone</b>
                <small>
                  Defaults, locks, sign-in, media server, logo and tab icon
                </small>
              </span>
              <Link className="go" to="/me/lumen">
                Open <Icon name="chev" size="sm" />
              </Link>
            </div>
          )}
          <div className="set">
            <span>
              <b>Full SeerrNG</b>
              <small>Issues, watchlists, settings and admin tools</small>
            </span>
            <a className="go" href={full}>
              Open <Icon name="chev" size="sm" />
            </a>
          </div>
        </div>
      </Section>
      <button
        className="btn btn-quiet"
        style={{ justifySelf: 'start' }}
        onClick={signOut}
      >
        Sign out
      </button>
    </>
  );
}
