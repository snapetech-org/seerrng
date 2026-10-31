import Badge from '@app/components/Common/Badge';
import FollowUnreadCount from '@app/components/Following/FollowUnreadCount';
import {
  menuMessages,
  navigationSections,
  type NavigationLink,
} from '@app/components/Layout/Sidebar/navigation';
import { getNavigationSectionsForTheme } from '@app/components/Layout/Sidebar/navigationPresentation';
import UserDropdown from '@app/components/Layout/UserDropdown';
import VersionStatus from '@app/components/Layout/VersionStatus';
import { PersiusBrand } from '@app/components/Persius/Chrome';
import { PersiusNavigationIcon } from '@app/components/Persius/Icons';
import { useTheme } from '@app/context/ThemeContext';
import useBlocklistNavigation from '@app/hooks/useBlocklistNavigation';
import useClickOutside from '@app/hooks/useClickOutside';
import useSettings from '@app/hooks/useSettings';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import { isContentRestrictedUser } from '@app/utils/contentRestriction';
import {
  getUserServiceAvailability,
  isOptionalCatalogPathEnabled,
} from '@app/utils/serviceAvailability';
import versionedAsset from '@app/utils/versionedAsset';
import { Transition, TransitionChild } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type { RequestResultsResponse } from '@server/interfaces/api/requestInterfaces';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { cloneElement, Fragment, useEffect, useRef } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';
import { getPersiusNavigationSections } from './navigationPresentation';

interface SidebarProps {
  open?: boolean;
  setClosed: () => void;
  pendingRequestsCount: number;
  openIssuesCount: number;
  revalidateIssueCount: () => void;
  revalidateRequestsCount: () => void;
}

const Sidebar = ({
  open,
  setClosed,
  pendingRequestsCount,
  openIssuesCount,
  revalidateIssueCount,
  revalidateRequestsCount,
}: SidebarProps) => {
  const navRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const intl = useIntl();
  const { interfaceThemeDefinition } = useTheme();
  const persius = interfaceThemeDefinition.layout === 'persius';
  const { user, hasPermission } = useUser();
  const showBlocklistNavigation = useBlocklistNavigation();
  const { currentSettings } = useSettings();
  const { data: ownRequests } = useSWR<RequestResultsResponse>(
    persius && user?.id
      ? `/api/v1/request?take=1&skip=0&filter=active&requestedBy=${user.id}`
      : null,
    { refreshInterval: 30000 }
  );
  const requestBadgeCount = persius
    ? (ownRequests?.pageInfo.results ?? 0)
    : pendingRequestsCount;
  const serviceAvailability = getUserServiceAvailability(
    currentSettings,
    user?.settings?.enabledMediaCategories,
    hasPermission(Permission.ADMIN)
  );
  const contentRestricted = isContentRestrictedUser(
    user,
    currentSettings.ageGate?.defaultRestricted
  );
  useClickOutside(navRef, () => setClosed());

  const visibleSidebarSections = navigationSections
    .map((section) => ({
      ...section,
      links: section.links.filter(
        (link) =>
          !(contentRestricted && link.id === 'adult') &&
          (link.id !== 'blocklist' || showBlocklistNavigation) &&
          isOptionalCatalogPathEnabled(link.href, serviceAvailability) &&
          (link.requiredPermission
            ? hasPermission(link.requiredPermission, {
                type: link.permissionType ?? 'and',
              })
            : true)
      ),
    }))
    .filter((section) => section.links.length > 0);

  const displayedSidebarSections = getNavigationSectionsForTheme(
    persius
      ? getPersiusNavigationSections(visibleSidebarSections)
      : visibleSidebarSections,
    interfaceThemeDefinition.navigation
  );

  const renderNavigationLink = (
    link: NavigationLink,
    device: 'mobile' | 'desktop'
  ) => {
    const selected =
      (persius &&
        link.id === 'audiobooks' &&
        router.pathname.startsWith('/book/') &&
        router.query.format === 'audiobook') ||
      (persius &&
      link.id === 'books' &&
      router.pathname.startsWith('/book/') &&
      router.query.format === 'audiobook'
        ? false
        : router.pathname.match(link.activeRegExp));
    const navigationIcon =
      interfaceThemeDefinition.activeNavigationIcon === 'filled' && selected ? (
        link.svgIconSelected
      ) : persius ? (
        <PersiusNavigationIcon name={link.id} fallback={link.svgIcon} />
      ) : (
        link.svgIcon
      );
    const iconClass = device === 'desktop' ? 'me-3 h-6 w-6' : 'me-3 h-6 w-6';
    const className =
      device === 'mobile'
        ? `flex items-center rounded-md px-2 py-2 text-base leading-6 font-medium text-white transition duration-150 ease-in-out focus:outline-none ${
            selected
              ? 'main-menu-link sidebar-link-selected'
              : 'main-menu-link sidebar-link-idle'
          }`
        : `group flex items-center rounded-md px-2 py-2 text-lg leading-6 font-medium text-white transition duration-150 ease-in-out focus:outline-none ${
            selected
              ? 'main-menu-link sidebar-link-selected'
              : 'main-menu-link sidebar-link-idle'
          }`;

    return (
      <Link
        key={`${device}-${link.id}`}
        href={link.href}
        prefetch={false}
        onClick={device === 'mobile' ? setClosed : undefined}
        className={className}
        data-navigation-link-id={link.id}
        data-navigation-level={link.nested ? 'nested' : 'primary'}
        data-testid={
          device === 'mobile'
            ? link.dataTestId
              ? `${link.dataTestId}-mobile`
              : undefined
            : link.dataTestId
        }
        aria-current={selected ? 'page' : undefined}
      >
        {cloneElement(navigationIcon, { className: iconClass })}
        {intl.formatMessage(menuMessages[link.messagesKey])}
        {link.messagesKey === 'following' && <FollowUnreadCount />}
        {device === 'desktop' &&
          link.messagesKey === 'requests' &&
          requestBadgeCount > 0 &&
          (persius || hasPermission(Permission.MANAGE_REQUESTS)) && (
            <div className="ms-auto flex">
              <Badge
                className={`rounded-md bg-gradient-to-br ${
                  selected
                    ? 'border-indigo-600 from-indigo-700 to-purple-700'
                    : 'border-indigo-500 from-indigo-600 to-purple-600'
                }`}
              >
                {requestBadgeCount}
              </Badge>
            </div>
          )}
        {device === 'desktop' &&
          link.messagesKey === 'issues' &&
          openIssuesCount > 0 &&
          hasPermission(Permission.MANAGE_ISSUES) && (
            <div className="ms-auto flex">
              <Badge
                className={`rounded-md bg-gradient-to-br ${
                  selected
                    ? 'border-indigo-600 from-indigo-700 to-purple-700'
                    : 'border-indigo-500 from-indigo-600 to-purple-600'
                }`}
              >
                {openIssuesCount}
              </Badge>
            </div>
          )}
      </Link>
    );
  };

  const renderNavigationSections = (device: 'mobile' | 'desktop') =>
    displayedSidebarSections.map((section) => {
      const content = (
        <div className="sidebar-navigation-items">
          {section.links.map((link) => renderNavigationLink(link, device))}
        </div>
      );
      if (persius && section.id === 'persius-more')
        return (
          <details
            key={`${device}-${section.id}`}
            className="sidebar-navigation-section persius-navigation-more"
          >
            <summary className="sidebar-navigation-heading">
              {intl.formatMessage(menuMessages.more)}
            </summary>
            {content}
          </details>
        );
      return (
        <div
          key={`${device}-${section.id}`}
          className="sidebar-navigation-section"
          data-navigation-section={section.id}
          role={
            interfaceThemeDefinition.navigation === 'flat' ? undefined : 'group'
          }
          aria-label={
            interfaceThemeDefinition.navigation === 'flat'
              ? undefined
              : intl.formatMessage(menuMessages[section.ariaLabelKey])
          }
        >
          {section.headingKey && (
            <h2 className="sidebar-navigation-heading">
              {intl.formatMessage(menuMessages[section.headingKey])}
            </h2>
          )}
          {content}
        </div>
      );
    });

  useEffect(() => {
    if (openIssuesCount) {
      revalidateIssueCount();
    }

    if (pendingRequestsCount) {
      revalidateRequestsCount();
    }
  }, [
    revalidateIssueCount,
    revalidateRequestsCount,
    pendingRequestsCount,
    openIssuesCount,
  ]);

  return (
    <>
      <div className="lg:hidden">
        <Transition as={Fragment} show={open}>
          <div className="fixed inset-0 z-40 flex">
            <TransitionChild
              as="div"
              enter="transition-opacity ease-linear duration-300"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="transition-opacity ease-linear duration-300"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <div className="fixed inset-0">
                <div className="absolute inset-0 bg-gray-900 opacity-90" />
              </div>
            </TransitionChild>
            <TransitionChild
              as="div"
              enter="transition-transform ease-in-out duration-300"
              enterFrom="ltr:-translate-x-full rtl:translate-x-full"
              enterTo="translate-x-0"
              leave="transition-transform ease-in-out duration-300"
              leaveFrom="translate-x-0"
              leaveTo="ltr:-translate-x-full rtl:translate-x-full"
            >
              <>
                <div className="sidebar relative flex h-full w-full max-w-xs flex-1 flex-col">
                  <div className="sidebar-close-button absolute end-0 -me-14 p-1">
                    <button
                      className="flex h-12 w-12 items-center justify-center rounded-full focus:bg-gray-600 focus:outline-none"
                      aria-label={intl.formatMessage(
                        globalMessages.closeSidebar
                      )}
                      onClick={() => setClosed()}
                    >
                      <XMarkIcon className="h-6 w-6 text-white" />
                    </button>
                  </div>
                  <div
                    ref={navRef}
                    className="flex flex-1 flex-col overflow-y-auto pt-4 pb-8 sm:pb-4"
                  >
                    <div className="sidebar-brand-slot flex flex-shrink-0 items-center px-2">
                      {persius ? (
                        <PersiusBrand />
                      ) : (
                        <span className="w-full px-4 text-xl text-gray-50">
                          <Link href="/" className="relative block h-24 w-64">
                            <Image
                              src={versionedAsset('/logo_full.svg')}
                              alt="Seerr"
                              fill
                              className="object-contain object-left rtl:object-right"
                            />
                          </Link>
                        </span>
                      )}
                    </div>
                    <nav
                      className="sidebar-navigation"
                      data-navigation-device="mobile"
                      aria-label={intl.formatMessage(
                        globalMessages.primaryNavigation
                      )}
                    >
                      {renderNavigationSections('mobile')}
                    </nav>
                    {persius && (
                      <div className="persius-sidebar-account">
                        <UserDropdown />
                      </div>
                    )}
                    {hasPermission(Permission.ADMIN) && (
                      <div className="px-2">
                        <VersionStatus onClick={() => setClosed()} />
                      </div>
                    )}
                  </div>
                </div>
                <div className="w-14 flex-shrink-0">
                  {/* <!-- Force sidebar to shrink to fit close icon --> */}
                </div>
              </>
            </TransitionChild>
          </div>
        </Transition>
      </div>

      <div className="fixed start-0 top-0 bottom-0 z-30 hidden lg:flex lg:flex-shrink-0">
        <div className="sidebar flex w-64 flex-col">
          <div className="flex h-0 flex-1 flex-col">
            <div className="flex flex-1 flex-col overflow-y-auto pb-4">
              <div className="sidebar-brand-slot flex flex-shrink-0 items-center">
                {persius ? (
                  <PersiusBrand />
                ) : (
                  <span className="w-full px-4 py-2 text-2xl text-gray-50">
                    <Link href="/" className="relative block h-24">
                      <Image
                        src={versionedAsset('/logo_full.svg')}
                        alt="Seerr"
                        fill
                        className="object-contain object-left rtl:object-right"
                        loading="eager"
                      />
                    </Link>
                  </span>
                )}
              </div>
              <nav
                className="sidebar-navigation"
                data-navigation-device="desktop"
                aria-label={intl.formatMessage(
                  globalMessages.primaryNavigation
                )}
              >
                {renderNavigationSections('desktop')}
              </nav>
              {persius && (
                <div className="persius-sidebar-account">
                  <UserDropdown />
                </div>
              )}
              {hasPermission(Permission.ADMIN) && (
                <div className="px-2">
                  <VersionStatus />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
