import { useState } from 'react';
import { Link } from 'react-router-dom';
import { isAdministrator, useAuth } from '../auth';
import { useBlocklistNavigation } from '../blocklist';
import AvatarContent from '../components/AvatarContent';
import { Section } from '../components/cards';
import { ConfirmSheet } from '../components/ConfirmSheet';
import {
  canChooseRequestOptions,
  canRequestMovies,
  canUseRequestAccess,
  canUseShare,
} from '../components/detail';
import RequestLimits from '../components/RequestLimits';
import { fullSeerrUrl } from '../components/Shell';
import { useToast } from '../components/toast';
import { canManageDownloads } from '../downloadPermissions';
import { canViewFollowing } from '../followPermissions';
import { CAN_HOVER, usePublicSettings } from '../hooks';
import { Icon } from '../icons';
import { canSearchIndexers } from '../indexerPermissions';
import { canReadIssues } from '../issuePermissions';
import { useLiveTvStatus } from '../liveTv';
import { mediaServer, services } from '../mediaServer';
import {
  DISCOVER_ROWS,
  discoverRowLabel,
  usePrefs,
  type DiscoverRow,
} from '../settings';
import { AdminLinks } from './AdminHome';
import { canSeeRecent } from './Discover';

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
  const liveTv = useLiveTvStatus();
  const showBlocklist = useBlocklistNavigation();
  const toast = useToast();
  const { prefs, set, reset, locked, seerrPublicUrl } = usePrefs();
  const [askReset, setAskReset] = useState(false);
  const full = fullSeerrUrl(seerrPublicUrl);
  const isAdmin = isAdministrator(user?.permissions);
  const publicSettings = usePublicSettings();
  const lockedToLumen = publicSettings?.lockLumenForNonAdmins && !isAdmin;
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
        <span className="avatar">
          <AvatarContent
            key={user?.id}
            name={user?.displayName}
            avatar={user?.avatar}
          />
        </span>
        <div>
          <b>{user?.displayName}</b>
          <small>Signed in to SeerrNG</small>
        </div>
      </div>

      {!isAdmin && ((user?.permissions ?? 0) & 8) !== 0 && (
        <Section title="User Management">
          <div className="setlist">
            <div className="set">
              <b>Users</b>
              <Link className="go" to="/admin/users" aria-label="Open Users">
                Open <Icon name="chev" size="sm" />
              </Link>
            </div>
          </div>
        </Section>
      )}

      {isAdmin && (
        <Section title="Administration">
          <div className="setlist">
            <div className="set">
              <b>SeerrNG Administration</b>
              <Link
                className="go"
                to="/admin"
                aria-label="Open SeerrNG Administration"
              >
                Open <Icon name="chev" size="sm" />
              </Link>
            </div>
          </div>
          <AdminLinks />
        </Section>
      )}

      {canUseShare(user?.permissions) && (
        <Section title="Discover">
          <div className="setlist">
            <div className="set">
              <b>Share &amp; Identify</b>
              <Link
                className="go"
                to="/share"
                aria-label="Open Share & Identify"
              >
                Open <Icon name="chev" size="sm" />
              </Link>
            </div>
          </div>
        </Section>
      )}

      <Section title="Library">
        <div className="setlist">
          <div className="set">
            <b>My Media</b>
            <Link className="go" to="/library" aria-label="Open My Media">
              Open <Icon name="chev" size="sm" />
            </Link>
          </div>
          {publicSettings?.swipeEnabled &&
            canUseRequestAccess(user?.permissions) && (
              <div className="set">
                <b>Swipe</b>
                <Link className="go" to="/swipe" aria-label="Open Swipe">
                  Open <Icon name="chev" size="sm" />
                </Link>
              </div>
            )}
          {canRequestMovies(user?.permissions) && (
            <div className="set">
              <b>Watch Sessions</b>
              <Link
                className="go"
                to="/watch-sessions"
                aria-label="Open Watch Sessions"
              >
                Open <Icon name="chev" size="sm" />
              </Link>
            </div>
          )}
          {liveTv.data?.configured && (
            <div className="set">
              <b>Recordings</b>
              <Link
                className="go"
                to="/recordings"
                aria-label="Open Recordings"
              >
                Open <Icon name="chev" size="sm" />
              </Link>
            </div>
          )}
          <div className="set">
            <b>Release Calendar</b>
            <Link
              className="go"
              to="/calendar"
              aria-label="Open Release Calendar"
            >
              Open <Icon name="chev" size="sm" />
            </Link>
          </div>
          <div className="set">
            <b>Coming soon</b>
            <Link className="go" to="/soon" aria-label="Open Coming soon">
              Open <Icon name="chev" size="sm" />
            </Link>
          </div>
          <div className="set">
            <b>Watchlist</b>
            <Link className="go" to="/watchlist" aria-label="Open Watchlist">
              Open <Icon name="chev" size="sm" />
            </Link>
          </div>
          <div className="set">
            <b>My Games</b>
            <Link className="go" to="/game-library" aria-label="Open My Games">
              Open <Icon name="chev" size="sm" />
            </Link>
          </div>
          {canViewFollowing(user?.permissions) && (
            <div className="set">
              <b>Following</b>
              <Link className="go" to="/following" aria-label="Open Following">
                Open <Icon name="chev" size="sm" />
              </Link>
            </div>
          )}
        </div>
      </Section>

      {(canManageDownloads(user?.permissions) ||
        canSearchIndexers(user?.permissions)) && (
        <Section title="Acquisition">
          <div className="setlist">
            {canManageDownloads(user?.permissions) && (
              <div className="set">
                <b>Download Inbox</b>
                <Link
                  className="go"
                  to="/downloads"
                  aria-label="Open Download Inbox"
                >
                  Open <Icon name="chev" size="sm" />
                </Link>
              </div>
            )}
            {canSearchIndexers(user?.permissions) && (
              <div className="set">
                <b>Indexer Search</b>
                <Link
                  className="go"
                  to="/indexer-search"
                  aria-label="Open Indexer Search"
                >
                  Open <Icon name="chev" size="sm" />
                </Link>
              </div>
            )}
          </div>
        </Section>
      )}

      {(showBlocklist || canReadIssues(user?.permissions)) && (
        <Section title="Support">
          <div className="setlist">
            {showBlocklist && (
              <div className="set">
                <b>Blocklist</b>
                <Link
                  className="go"
                  to="/blocklist"
                  aria-label="Open Blocklist"
                >
                  Open <Icon name="chev" size="sm" />
                </Link>
              </div>
            )}
            {canReadIssues(user?.permissions) && (
              <div className="set">
                <b>Issues</b>
                <Link className="go" to="/issues" aria-label="Open Issues">
                  Open <Icon name="chev" size="sm" />
                </Link>
              </div>
            )}
          </div>
        </Section>
      )}

      <Section title="Account">
        <div className="setlist">
          {user && (
            <div className="set">
              <b>My Profile</b>
              <Link
                className="go"
                to="/household/me"
                aria-label="Open My Profile"
              >
                Open <Icon name="chev" size="sm" />
              </Link>
            </div>
          )}
          <div className="set">
            <b>Profile and Password</b>
            <Link
              className="go"
              to="/me/account"
              aria-label="Open Account Settings"
            >
              Open <Icon name="chev" size="sm" />
            </Link>
          </div>
        </div>
      </Section>
      {user && (
        <RequestLimits
          id={user.id}
          categories={
            prefs.showBooks ? ['movie', 'tv', 'book'] : ['movie', 'tv']
          }
        />
      )}

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
          onClick={() => setAskReset(true)}
        >
          Reset to defaults
        </button>
      </Section>

      {askReset && (
        <ConfirmSheet
          title="Reset to defaults?"
          body="Your theme, quick-request, narrator and Discover row choices go back to how they started."
          confirm="Reset"
          onClose={() => setAskReset(false)}
          onConfirm={() => {
            setAskReset(false);
            reset();
          }}
        />
      )}

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
          {!lockedToLumen && (
            <div className="set">
              <span>
                <b>Full SeerrNG</b>
                <small>Issues, watchlists, settings and admin tools</small>
              </span>
              <a className="go" href={full} aria-label="Open Full SeerrNG">
                Open <Icon name="chev" size="sm" />
              </a>
            </div>
          )}
        </div>
      </Section>
      <button
        className="btn btn-quiet"
        style={{ justifySelf: 'start' }}
        onClick={() =>
          signOut().catch(() => toast('Couldn’t sign out. Try again.'))
        }
      >
        Sign out
      </button>
    </>
  );
}
