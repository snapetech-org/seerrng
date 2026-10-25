import Badge from '@app/components/Common/Badge';
import {
  menuMessages,
  navigationSections,
  type NavigationLink,
  type NavigationSection,
} from '@app/components/Layout/Sidebar/navigation';
import useBlocklistNavigation from '@app/hooks/useBlocklistNavigation';
import useClickOutside from '@app/hooks/useClickOutside';
import useSettings from '@app/hooks/useSettings';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import {
  getUserServiceAvailability,
  isOptionalCatalogPathEnabled,
} from '@app/utils/serviceAvailability';
import { Transition } from '@headlessui/react';
import { EllipsisHorizontalIcon, XMarkIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { cloneElement, useEffect, useMemo, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

interface MobileMenuProps {
  pendingRequestsCount: number;
  openIssuesCount: number;
  revalidateIssueCount: () => void;
  revalidateRequestsCount: () => void;
}

const MobileMenu = ({
  pendingRequestsCount,
  openIssuesCount,
  revalidateIssueCount,
  revalidateRequestsCount,
}: MobileMenuProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const intl = useIntl();
  const [isOpen, setIsOpen] = useState(false);
  const { hasPermission, user } = useUser();
  const showBlocklistNavigation = useBlocklistNavigation();
  const { currentSettings } = useSettings();
  const router = useRouter();
  useClickOutside(ref, () => {
    if (closeTimer.current !== undefined) {
      clearTimeout(closeTimer.current);
    }
    closeTimer.current = setTimeout(() => {
      closeTimer.current = undefined;
      setIsOpen(false);
    }, 150);
  });

  useEffect(
    () => () => {
      if (closeTimer.current !== undefined) {
        clearTimeout(closeTimer.current);
      }
    },
    []
  );

  const toggle = () => setIsOpen((open) => !open);

  const filteredSections = useMemo<NavigationSection[]>(
    () =>
      navigationSections
        .map((section) => ({
          ...section,
          links: section.links.filter(
            (link) =>
              isOptionalCatalogPathEnabled(
                link.href,
                getUserServiceAvailability(
                  currentSettings,
                  user?.settings?.enabledMediaCategories,
                  hasPermission(Permission.ADMIN)
                )
              ) &&
              (link.id !== 'blocklist' || showBlocklistNavigation) &&
              (!link.requiredPermission ||
                hasPermission(link.requiredPermission, {
                  type: link.permissionType ?? 'and',
                }))
          ),
        }))
        .filter((section) => section.links.length > 0),
    [
      currentSettings,
      hasPermission,
      showBlocklistNavigation,
      user?.settings?.enabledMediaCategories,
    ]
  );
  const filteredLinks = useMemo(
    () => filteredSections.flatMap((section) => section.links),
    [filteredSections]
  );

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
    <div className="fixed inset-x-0 bottom-0 z-50">
      <Transition
        show={isOpen}
        as="div"
        ref={ref}
        enter="transition duration-500"
        enterFrom="opacity-0 translate-y-0"
        enterTo="opacity-100 -translate-y-full"
        leave="transition duration-500"
        leaveFrom="opacity-100 -translate-y-full"
        leaveTo="opacity-0 translate-y-0"
        className="app-menu-gradient mobile-menu-navigation absolute inset-x-0 top-0 flex w-full -translate-y-full flex-col border-t border-gray-600 px-6 py-6 font-semibold text-gray-100 backdrop-blur"
      >
        {filteredSections.map((section) => (
          <div
            key={`mobile-menu-section-${section.id}`}
            className="sidebar-navigation-section"
            role="group"
            aria-label={intl.formatMessage(menuMessages[section.ariaLabelKey])}
          >
            {section.headingKey && (
              <h2 className="sidebar-navigation-heading">
                {intl.formatMessage(menuMessages[section.headingKey])}
              </h2>
            )}
            <div className="sidebar-navigation-items">
              {section.links.map((link: NavigationLink) => {
                const isActive = router.pathname.match(link.activeRegExp);
                return (
                  <Link
                    key={`mobile-menu-link-${link.id}`}
                    href={link.href}
                    prefetch={false}
                    onClick={() => setIsOpen(false)}
                    className={`main-menu-link flex items-center px-2 py-2 ${
                      isActive ? 'sidebar-link-selected' : 'sidebar-link-idle'
                    }`}
                    data-navigation-level={link.nested ? 'nested' : 'primary'}
                    data-testid={link.dataTestId && `${link.dataTestId}-more`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {cloneElement(
                      isActive ? link.svgIconSelected : link.svgIcon,
                      { className: 'h-5 w-5' }
                    )}
                    <span className="ms-2">
                      {intl.formatMessage(menuMessages[link.messagesKey])}
                    </span>
                    {link.href === '/requests' &&
                      pendingRequestsCount > 0 &&
                      hasPermission(Permission.MANAGE_REQUESTS) && (
                        <div className="ms-auto flex">
                          <Badge className="rounded-md border-indigo-500 bg-gradient-to-br from-indigo-600 to-purple-600">
                            {pendingRequestsCount}
                          </Badge>
                        </div>
                      )}
                    {link.href === '/issues' &&
                      openIssuesCount > 0 &&
                      hasPermission(Permission.MANAGE_ISSUES) && (
                        <div className="ms-auto flex">
                          <Badge className="rounded-md border-indigo-500 bg-gradient-to-br from-indigo-600 to-purple-600">
                            {openIssuesCount}
                          </Badge>
                        </div>
                      )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </Transition>
      <div className="app-mobile-menu-surface padding-bottom-safe border-t border-gray-600 backdrop-blur">
        <div className="flex h-full items-center justify-between px-6 py-4 text-gray-100">
          {filteredLinks
            .slice(0, filteredLinks.length === 5 ? 5 : 4)
            .map((link) => {
              const isActive =
                router.pathname.match(link.activeRegExp) && !isOpen;
              return (
                <Link
                  key={`mobile-menu-link-${link.id}`}
                  href={link.href}
                  prefetch={false}
                  aria-label={intl.formatMessage(
                    menuMessages[link.messagesKey]
                  )}
                  className={`main-menu-link relative flex flex-col items-center space-y-1 p-2 ${
                    isActive ? 'sidebar-link-selected' : 'sidebar-link-idle'
                  }`}
                  data-testid={link.dataTestId && `${link.dataTestId}-bottom`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {cloneElement(
                    isActive ? link.svgIconSelected : link.svgIcon,
                    {
                      className: 'h-6 w-6',
                    }
                  )}
                  {link.href === '/requests' &&
                    pendingRequestsCount > 0 &&
                    hasPermission(Permission.MANAGE_REQUESTS) && (
                      <div className="absolute start-3 bottom-3">
                        <Badge
                          className={`bg-gradient-to-br ${
                            router.pathname.match(link.activeRegExp)
                              ? 'border-indigo-600 from-indigo-700 to-purple-700'
                              : 'border-indigo-500 from-indigo-600 to-purple-600'
                          } flex ${
                            pendingRequestsCount > 99 ? 'w-6' : 'w-4'
                          } h-4 items-center justify-center !px-[5px] !py-[7px] text-[8px]`}
                        >
                          {pendingRequestsCount > 99
                            ? '99+'
                            : pendingRequestsCount}
                        </Badge>
                      </div>
                    )}
                </Link>
              );
            })}
          {filteredLinks.length > 4 && filteredLinks.length !== 5 && (
            <button
              className={`main-menu-link flex flex-col items-center space-y-1 p-2 ${
                isOpen ? 'sidebar-link-selected' : 'sidebar-link-idle'
              }`}
              onClick={() => toggle()}
              aria-label={intl.formatMessage(
                isOpen
                  ? globalMessages.closeMenu
                  : globalMessages.moreNavigation
              )}
            >
              {isOpen ? (
                <XMarkIcon className="h-6 w-6" />
              ) : (
                <EllipsisHorizontalIcon className="h-6 w-6" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MobileMenu;
