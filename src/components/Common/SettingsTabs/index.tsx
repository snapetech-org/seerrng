import useUpstreamTheme from '@app/hooks/useUpstreamTheme';
import { useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import type { Permission } from '@server/lib/permissions';
import { hasPermission } from '@server/lib/permissions';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Common.SettingsTabs', {
  selectTab: 'Select a tab',
  selectedTab: 'Selected tab',
  tabs: 'Tabs',
});

export interface SettingsRoute {
  text: string;
  content?: React.ReactNode;
  route: string;
  regex: RegExp;
  requiredPermission?: Permission | Permission[];
  permissionType?: { type: 'and' | 'or' };
  hidden?: boolean;
}

type SettingsLinkProps = {
  tabType: 'default' | 'button' | 'filter';
  currentPath: string;
  route: string;
  regex: RegExp;
  hidden?: boolean;
  upstreamTheme: boolean;
  children: React.ReactNode;
};

const SettingsLink = ({
  children,
  tabType,
  currentPath,
  route,
  regex,
  hidden = false,
  upstreamTheme,
}: SettingsLinkProps) => {
  if (hidden) {
    return null;
  }

  let linkClasses = upstreamTheme
    ? 'settings-tab-upstream'
    : 'px-1 py-4 ms-8 text-sm font-medium leading-5 transition duration-300 border-b-2 border-transparent whitespace-nowrap first:ms-0';
  let activeLinkColor = 'text-indigo-500 border-indigo-600';
  let inactiveLinkColor =
    'text-gray-500 border-transparent hover:text-gray-300 hover:border-gray-400 focus:text-gray-300 focus:border-gray-400';

  if (tabType === 'button') {
    linkClasses = upstreamTheme
      ? 'settings-tab-upstream'
      : 'app-filter-button whitespace-nowrap';
    activeLinkColor = upstreamTheme ? '' : 'app-filter-button-active';
    inactiveLinkColor = upstreamTheme ? '' : 'app-filter-button-idle';
  }

  if (upstreamTheme && tabType !== 'filter') {
    activeLinkColor = '';
    inactiveLinkColor = '';
  }

  if (tabType === 'filter') {
    linkClasses = 'app-filter-button settings-page-filter-link';
    activeLinkColor = 'app-filter-button-active';
    inactiveLinkColor = 'app-filter-button-idle';
  }

  return (
    <Link
      href={route}
      className={[
        linkClasses,
        currentPath.match(regex) ? activeLinkColor : inactiveLinkColor,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-current={currentPath.match(regex) ? 'page' : undefined}
    >
      {children}
    </Link>
  );
};

const SettingsTabs = ({
  tabType = 'default',
  settingsRoutes,
  isRouteVisible,
  compactOnNarrowScreens = false,
}: {
  tabType?: 'default' | 'button' | 'filter';
  settingsRoutes: SettingsRoute[];
  isRouteVisible?: (route: SettingsRoute) => boolean;
  compactOnNarrowScreens?: boolean;
}) => {
  const intl = useIntl();
  const router = useRouter();
  const upstreamTheme = useUpstreamTheme();
  const { user: currentUser } = useUser();
  const visibleSettingsRoutes = settingsRoutes.filter(
    (route) =>
      !route.hidden &&
      (!isRouteVisible || isRouteVisible(route)) &&
      (route.requiredPermission
        ? hasPermission(
            route.requiredPermission,
            currentUser?.permissions ?? 0,
            route.permissionType
          )
        : true)
  );
  const activeMobileIndex = visibleSettingsRoutes.findIndex((route) =>
    router.pathname.match(route.regex)
  );
  const navigateMobile = (rawIndex: string) => {
    const routeIndex = Number.parseInt(rawIndex, 10);
    const destination = visibleSettingsRoutes[routeIndex]?.route;
    if (destination) void router.push(destination);
  };

  return (
    <>
      <div
        className={
          compactOnNarrowScreens
            ? 'lg:hidden'
            : tabType === 'filter'
              ? 'hidden'
              : 'sm:hidden'
        }
      >
        <label htmlFor="tabs" className="sr-only">
          {intl.formatMessage(messages.selectTab)}
        </label>
        <select
          id="tabs"
          onChange={(e) => {
            navigateMobile(e.target.value);
          }}
          value={activeMobileIndex >= 0 ? String(activeMobileIndex) : ''}
          aria-label={intl.formatMessage(messages.selectedTab)}
        >
          {visibleSettingsRoutes.map((route, index) => (
            <option value={String(index)} key={`mobile-settings-link-${index}`}>
              {route.text}
            </option>
          ))}
        </select>
      </div>
      {tabType === 'button' || tabType === 'filter' ? (
        <div
          className={
            tabType === 'filter'
              ? compactOnNarrowScreens
                ? 'settings-page-filter-nav hidden lg:flex'
                : 'settings-page-filter-nav flex'
              : 'hidden sm:block'
          }
        >
          <nav
            className={
              tabType === 'filter'
                ? 'flex w-full min-w-0 flex-wrap justify-between gap-[5px]'
                : upstreamTheme
                  ? `settings-tabs-upstream${
                      tabType === 'button'
                        ? 'settings-tabs-upstream-buttons'
                        : ''
                    }`
                  : 'flex flex-wrap gap-[5px]'
            }
            aria-label={intl.formatMessage(messages.tabs)}
          >
            {visibleSettingsRoutes.map((route, index) => (
              <SettingsLink
                tabType={tabType}
                upstreamTheme={upstreamTheme}
                currentPath={router.pathname}
                route={route.route}
                regex={route.regex}
                hidden={route.hidden ?? false}
                key={`button-settings-link-${index}`}
              >
                {route.content ?? route.text}
              </SettingsLink>
            ))}
          </nav>
        </div>
      ) : (
        <div
          className={`hide-scrollbar hidden overflow-x-scroll border-b border-gray-600 ${
            compactOnNarrowScreens ? 'lg:block' : 'sm:block'
          }`}
        >
          <nav
            className={upstreamTheme ? 'settings-tabs-upstream' : 'flex'}
            data-testid="settings-nav-desktop"
          >
            {visibleSettingsRoutes.map((route, index) => (
              <SettingsLink
                tabType={tabType}
                upstreamTheme={upstreamTheme}
                currentPath={router.pathname}
                route={route.route}
                regex={route.regex}
                key={`standard-settings-link-${index}`}
              >
                {route.text}
              </SettingsLink>
            ))}
          </nav>
        </div>
      )}
    </>
  );
};

export default SettingsTabs;
