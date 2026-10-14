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
  children: React.ReactNode;
};

const SettingsLink = ({
  children,
  tabType,
  currentPath,
  route,
  regex,
  hidden = false,
}: SettingsLinkProps) => {
  if (hidden) {
    return null;
  }

  let linkClasses =
    'px-1 py-4 ml-8 text-sm font-medium leading-5 transition duration-300 border-b-2 border-transparent whitespace-nowrap first:ml-0';
  let activeLinkColor = 'text-indigo-500 border-indigo-600';
  let inactiveLinkColor =
    'text-gray-500 border-transparent hover:text-gray-300 hover:border-gray-400 focus:text-gray-300 focus:border-gray-400';

  if (tabType === 'button') {
    linkClasses = 'app-filter-button whitespace-nowrap';
    activeLinkColor = 'app-filter-button-active';
    inactiveLinkColor = 'app-filter-button-idle';
  }

  if (tabType === 'filter') {
    linkClasses = 'app-filter-button settings-page-filter-link';
    activeLinkColor = 'app-filter-button-active';
    inactiveLinkColor = 'app-filter-button-idle';
  }

  return (
    <Link
      href={route}
      className={`${linkClasses} ${
        currentPath.match(regex) ? activeLinkColor : inactiveLinkColor
      }`}
      aria-current={currentPath.match(regex) ? 'page' : undefined}
    >
      {children}
    </Link>
  );
};

const SettingsTabs = ({
  tabType = 'default',
  settingsRoutes,
}: {
  tabType?: 'default' | 'button' | 'filter';
  settingsRoutes: SettingsRoute[];
}) => {
  const intl = useIntl();
  const router = useRouter();
  const { user: currentUser } = useUser();
  const visibleSettingsRoutes = settingsRoutes.filter(
    (route) =>
      !route.hidden &&
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
      <div className={tabType === 'filter' ? 'hidden' : 'sm:hidden'}>
        <label htmlFor="tabs" className="sr-only">
          {intl.formatMessage(messages.selectTab)}
        </label>
        <select
          id="tabs"
          onChange={(e) => {
            navigateMobile(e.target.value);
          }}
          onBlur={(e) => {
            navigateMobile(e.target.value);
          }}
          defaultValue={activeMobileIndex >= 0 ? String(activeMobileIndex) : ''}
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
              ? 'settings-page-filter-nav flex'
              : 'hidden sm:block'
          }
        >
          <nav
            className={
              tabType === 'filter'
                ? 'flex w-full min-w-0 flex-wrap justify-between gap-[5px]'
                : 'flex flex-wrap gap-[5px]'
            }
            aria-label={intl.formatMessage(messages.tabs)}
          >
            {visibleSettingsRoutes.map((route, index) => (
              <SettingsLink
                tabType={tabType}
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
        <div className="hide-scrollbar hidden overflow-x-scroll border-b border-gray-600 sm:block">
          <nav className="flex" data-testid="settings-nav-desktop">
            {visibleSettingsRoutes.map((route, index) => (
              <SettingsLink
                tabType={tabType}
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
