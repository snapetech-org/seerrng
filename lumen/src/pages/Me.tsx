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
import { useExtras } from '../extras';
import { canViewFollowing } from '../followPermissions';
import { CAN_HOVER, usePublicSettings } from '../hooks';
import { useLumenLocale } from '../i18n';
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
  titleKey,
  titleValues,
  sub,
  subKey,
  on,
}: {
  path: string;
  title: string;
  titleKey: string;
  titleValues?: Record<string, string | number>;
  sub?: string;
  subKey?: string;
  on: boolean;
}) {
  const { t } = useLumenLocale();
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
        <b>{t(titleKey, title, titleValues)}</b>
        <small>
          {isLocked
            ? t('lumen.me.setByAdmin', 'Set by your admin')
            : subKey
              ? t(subKey, sub)
              : sub}
        </small>
      </span>
      <span className="sw" />
    </div>
  );
}

export default function Me() {
  const { t } = useLumenLocale();
  const { user, signOut } = useAuth();
  const liveTv = useLiveTvStatus();
  const showBlocklist = useBlocklistNavigation();
  const toast = useToast();
  const { prefs, set, reset, locked, seerrPublicUrl } = usePrefs();
  const extras = useExtras();
  const [askReset, setAskReset] = useState(false);
  const full = fullSeerrUrl(seerrPublicUrl);
  const isAdmin = isAdministrator(user?.permissions);
  const publicSettings = usePublicSettings();
  const lockedToLumen = publicSettings?.lockLumenForNonAdmins && !isAdmin;
  const me = (key: string, fallback: string) => t(`lumen.me.${key}`, fallback);
  const openLink = (resource: string) =>
    t('lumen.me.openLink', 'Open {resource}', { resource });
  const open = me('open', 'Open');
  return (
    <>
      <header className="ph">
        <div className="ph-row">
          <div>
            <h1>{t('components.Layout.Sidebar.you', 'You')}</h1>
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
          <small>{t('lumen.me.signedInTo', 'Signed in to SeerrNG')}</small>
        </div>
      </div>

      {!isAdmin && ((user?.permissions ?? 0) & 8) !== 0 && (
        <Section title={me('userManagement', 'User Management')}>
          <div className="setlist">
            <div className="set">
              <b>{me('users', 'Users')}</b>
              <Link
                className="go"
                to="/admin/users"
                aria-label={openLink(me('users', 'Users'))}
              >
                {open} <Icon name="chev" size="sm" />
              </Link>
            </div>
          </div>
        </Section>
      )}

      {isAdmin && (
        <Section title={me('administration', 'Administration')}>
          <div className="setlist">
            <div className="set">
              <b>{me('seerrAdministration', 'SeerrNG Administration')}</b>
              <Link
                className="go"
                to="/admin"
                aria-label={openLink(
                  me('seerrAdministration', 'SeerrNG Administration')
                )}
              >
                {open} <Icon name="chev" size="sm" />
              </Link>
            </div>
          </div>
          <AdminLinks />
        </Section>
      )}

      {canUseShare(user?.permissions) && (
        <Section title={t('components.Layout.Sidebar.discover', 'Discover')}>
          <div className="setlist">
            <div className="set">
              <b>{t('components.Layout.Sidebar.share', 'Share & Identify')}</b>
              <Link
                className="go"
                to="/share"
                aria-label={openLink(
                  t('components.Layout.Sidebar.share', 'Share & Identify')
                )}
              >
                {open} <Icon name="chev" size="sm" />
              </Link>
            </div>
          </div>
        </Section>
      )}

      <Section title={me('library', 'Library')}>
        <div className="setlist">
          <div className="set">
            <b>{t('components.Layout.Sidebar.myMedia', 'My Media')}</b>
            <Link
              className="go"
              to="/library"
              aria-label={openLink(
                t('components.Layout.Sidebar.myMedia', 'My Media')
              )}
            >
              {open} <Icon name="chev" size="sm" />
            </Link>
          </div>
          {publicSettings?.swipeEnabled &&
            canUseRequestAccess(user?.permissions) && (
              <div className="set">
                <b>{t('components.Layout.Sidebar.swipe', 'Swipe')}</b>
                <Link
                  className="go"
                  to="/swipe"
                  aria-label={openLink(
                    t('components.Layout.Sidebar.swipe', 'Swipe')
                  )}
                >
                  {open} <Icon name="chev" size="sm" />
                </Link>
              </div>
            )}
          {canRequestMovies(user?.permissions) && (
            <div className="set">
              <b>
                {t('components.Layout.Sidebar.watchSessions', 'Watch Sessions')}
              </b>
              <Link
                className="go"
                to="/watch-sessions"
                aria-label={openLink(
                  t('components.Layout.Sidebar.watchSessions', 'Watch Sessions')
                )}
              >
                {open} <Icon name="chev" size="sm" />
              </Link>
            </div>
          )}
          {liveTv.data?.configured && (
            <div className="set">
              <b>{t('components.LiveTv.RecordingList.title', 'Recordings')}</b>
              <Link
                className="go"
                to="/recordings"
                aria-label={openLink(
                  t('components.LiveTv.RecordingList.title', 'Recordings')
                )}
              >
                {open} <Icon name="chev" size="sm" />
              </Link>
            </div>
          )}
          <div className="set">
            <b>{me('releaseCalendar', 'Release Calendar')}</b>
            <Link
              className="go"
              to="/calendar"
              aria-label={openLink(me('releaseCalendar', 'Release Calendar'))}
            >
              {open} <Icon name="chev" size="sm" />
            </Link>
          </div>
          <div className="set">
            <b>{t('components.Layout.Sidebar.comingSoon', 'Coming soon')}</b>
            <Link
              className="go"
              to="/soon"
              aria-label={openLink(
                t('components.Layout.Sidebar.comingSoon', 'Coming soon')
              )}
            >
              {open} <Icon name="chev" size="sm" />
            </Link>
          </div>
          <div className="set">
            <b>{t('library.watchlist', 'Watchlist')}</b>
            <Link
              className="go"
              to="/watchlist"
              aria-label={openLink(t('library.watchlist', 'Watchlist'))}
            >
              {open} <Icon name="chev" size="sm" />
            </Link>
          </div>
          {extras.list.some((item) => item.key === 'game') && (
            <div className="set">
              <b>{t('components.Layout.Sidebar.gamesLibrary', 'My Games')}</b>
              <Link
                className="go"
                to="/game-library"
                aria-label={openLink(
                  t('components.Layout.Sidebar.gamesLibrary', 'My Games')
                )}
              >
                {open} <Icon name="chev" size="sm" />
              </Link>
            </div>
          )}
          {canViewFollowing(user?.permissions) && (
            <div className="set">
              <b>{t('components.Layout.Sidebar.following', 'Following')}</b>
              <Link
                className="go"
                to="/following"
                aria-label={openLink(
                  t('components.Layout.Sidebar.following', 'Following')
                )}
              >
                {open} <Icon name="chev" size="sm" />
              </Link>
            </div>
          )}
        </div>
      </Section>

      {(canManageDownloads(user?.permissions) ||
        canSearchIndexers(user?.permissions)) && (
        <Section title={me('acquisition', 'Acquisition')}>
          <div className="setlist">
            {canManageDownloads(user?.permissions) && (
              <div className="set">
                <b>
                  {t('components.Layout.Sidebar.downloads', 'Download Inbox')}
                </b>
                <Link
                  className="go"
                  to="/downloads"
                  aria-label={openLink(
                    t('components.Layout.Sidebar.downloads', 'Download Inbox')
                  )}
                >
                  {open} <Icon name="chev" size="sm" />
                </Link>
              </div>
            )}
            {canSearchIndexers(user?.permissions) && (
              <div className="set">
                <b>
                  {t(
                    'components.Layout.Sidebar.indexerSearch',
                    'Indexer Search'
                  )}
                </b>
                <Link
                  className="go"
                  to="/indexer-search"
                  aria-label={openLink(
                    t(
                      'components.Layout.Sidebar.indexerSearch',
                      'Indexer Search'
                    )
                  )}
                >
                  {open} <Icon name="chev" size="sm" />
                </Link>
              </div>
            )}
          </div>
        </Section>
      )}

      {(showBlocklist || canReadIssues(user?.permissions)) && (
        <Section title={me('support', 'Support')}>
          <div className="setlist">
            {showBlocklist && (
              <div className="set">
                <b>{t('components.Layout.Sidebar.blocklist', 'Blocklist')}</b>
                <Link
                  className="go"
                  to="/blocklist"
                  aria-label={openLink(
                    t('components.Layout.Sidebar.blocklist', 'Blocklist')
                  )}
                >
                  {open} <Icon name="chev" size="sm" />
                </Link>
              </div>
            )}
            {canReadIssues(user?.permissions) && (
              <div className="set">
                <b>{t('components.Layout.Sidebar.issues', 'Issues')}</b>
                <Link
                  className="go"
                  to="/issues"
                  aria-label={openLink(
                    t('components.Layout.Sidebar.issues', 'Issues')
                  )}
                >
                  {open} <Icon name="chev" size="sm" />
                </Link>
              </div>
            )}
          </div>
        </Section>
      )}

      <Section title={me('account', 'Account')}>
        <div className="setlist">
          {user && (
            <div className="set">
              <b>{me('myProfile', 'My Profile')}</b>
              <Link
                className="go"
                to="/household/me"
                aria-label={openLink(me('myProfile', 'My Profile'))}
              >
                {open} <Icon name="chev" size="sm" />
              </Link>
            </div>
          )}
          <div className="set">
            <b>{me('profilePassword', 'Profile and Password')}</b>
            <Link
              className="go"
              to="/me/account"
              aria-label={openLink(me('accountSettings', 'Account Settings'))}
            >
              {open} <Icon name="chev" size="sm" />
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

      <Section title={me('appearance', 'Appearance')}>
        <div className="setlist">
          <div className="set">
            <span>
              <b>{me('theme', 'Theme')}</b>
              <small>
                {locked.has('theme')
                  ? me('setByAdmin', 'Set by your admin')
                  : me('darkDefault', 'Dark is the default')}
              </small>
            </span>
            <div className="seg" role="group" aria-label={me('theme', 'Theme')}>
              {(['dark', 'light', 'system'] as const).map((v) => (
                <button
                  key={v}
                  disabled={locked.has('theme')}
                  aria-pressed={prefs.theme === v}
                  onClick={() => set('theme', v)}
                >
                  {me(
                    `theme.${v}`,
                    v === 'system' ? 'Device' : v[0].toUpperCase() + v.slice(1)
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section title={me('requesting', 'Requesting')}>
        <div className="setlist">
          <Toggle
            path="hoverRequest"
            on={prefs.hoverRequest}
            titleKey="lumen.me.quickRequestTitle"
            title="Quick request on posters"
            subKey={
              CAN_HOVER
                ? 'lumen.me.quickRequestHover'
                : 'lumen.me.quickRequestTouch'
            }
            sub={
              CAN_HOVER
                ? 'Hovering a poster shows Request without opening it'
                : 'A + on each poster requests it without opening it'
            }
          />
          <Toggle
            path="wholeSeriesDefault"
            on={prefs.wholeSeriesDefault}
            titleKey="lumen.me.wholeSeriesTitle"
            title="Request whole series by default"
            subKey="lumen.me.wholeSeriesHelp"
            sub="Off: pick seasons yourself every time"
          />
          <Toggle
            path="narratorChoice"
            on={prefs.narratorChoice}
            titleKey="lumen.me.narratorTitle"
            title="Choose audiobook narrators"
            subKey="lumen.me.narratorHelp"
            sub="Off: one straight Request button, best available recording"
          />
          {canChooseRequestOptions(user?.permissions) && (
            <Toggle
              path="requestOptions"
              on={prefs.requestOptions}
              titleKey="lumen.me.requestOptionsTitle"
              title="Choose server and folder on quick requests"
              subKey="lumen.me.requestOptionsHelp"
              sub="Off: poster Request buttons use the default server, quality and folder"
            />
          )}
          {services().books && (
            <Toggle
              path="showBooks"
              on={prefs.showBooks}
              titleKey="lumen.me.showBooksTitle"
              title="Show books and audiobooks"
              subKey="lumen.me.showBooksHelp"
              sub="Off: Lumen is movies and series only"
            />
          )}
        </div>
      </Section>

      <Section title={me('discoverRows', 'Discover rows')}>
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
                titleKey={
                  r === 'newOnPlex'
                    ? 'lumen.me.row.newOnServer'
                    : `lumen.me.row.${r}`
                }
                title={discoverRowLabel(r)}
                titleValues={
                  r === 'newOnPlex' ? { server: mediaServer().name } : undefined
                }
              />
            ))}
        </div>
        <button
          className="btn btn-quiet btn-sm"
          style={{ marginTop: 10 }}
          onClick={() => setAskReset(true)}
        >
          {me('resetDefaults', 'Reset to defaults')}
        </button>
      </Section>

      {askReset && (
        <ConfirmSheet
          title={me('resetDefaultsQuestion', 'Reset to defaults?')}
          body={me(
            'resetPreferencesHelp',
            'Your theme, quick-request, narrator and Discover row choices go back to how they started.'
          )}
          confirm={me('reset', 'Reset')}
          onClose={() => setAskReset(false)}
          onConfirm={() => {
            setAskReset(false);
            reset();
          }}
        />
      )}

      <Section title={me('more', 'More')}>
        <div className="setlist">
          <div className="set">
            <span>
              <b>
                {t('lumen.me.mediaServer', 'Media server: {name}', {
                  name: mediaServer().name,
                })}
              </b>
              <small>
                {mediaServer().source === 'config'
                  ? me(
                      'mediaServerAdmin',
                      'Set by your admin in lumen-config.json'
                    )
                  : me(
                      'mediaServerFollows',
                      'Follows SeerrNG’s media server setting'
                    )}
              </small>
            </span>
          </div>
          {!lockedToLumen && (
            <div className="set">
              <span>
                <b>{me('fullSeerrNG', 'Full SeerrNG')}</b>
                <small>
                  {me(
                    'fullSeerrDescription',
                    'Issues, watchlists, settings and admin tools'
                  )}
                </small>
              </span>
              <a
                className="go"
                href={full}
                aria-label={openLink(me('fullSeerrNG', 'Full SeerrNG'))}
              >
                {open} <Icon name="chev" size="sm" />
              </a>
            </div>
          )}
        </div>
      </Section>
      <button
        className="btn btn-quiet"
        style={{ justifySelf: 'start' }}
        onClick={() =>
          signOut().catch(() =>
            toast(me('signOutFailure', 'Couldn’t sign out. Try again.'))
          )
        }
      >
        {me('signOut', 'Sign out')}
      </button>
    </>
  );
}
