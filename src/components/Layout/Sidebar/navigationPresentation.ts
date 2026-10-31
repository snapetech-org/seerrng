import type { InterfaceThemeNavigation } from '@server/utils/interfaceTheme';
import type { NavigationSection } from './navigation';

/** Reorder only links that have already passed permission/service filtering. */
export const getPersiusNavigationSections = (
  sections: NavigationSection[]
): NavigationSection[] => {
  const links = sections.flatMap((section) => section.links);
  const primary = ['discover-home', 'movies', 'series', 'books', 'audiobooks'];
  const personal = ['requests', 'calendar'];
  const ordered = (ids: string[]) =>
    ids.flatMap((id) => links.filter((link) => link.id === id));
  const orderedSections: NavigationSection[] = [
    {
      id: 'persius-discover',
      ariaLabelKey: 'discover',
      links: ordered(primary),
    },
    {
      id: 'persius-you',
      ariaLabelKey: 'you',
      headingKey: 'you',
      links: ordered(personal).map((link) =>
        link.id === 'calendar'
          ? {
              ...link,
              href: '/coming-soon',
              messagesKey: 'comingSoon' as const,
              activeRegExp: /^\/(?:coming-soon|calendar)(?:\/|$)/,
            }
          : link
      ),
    },
    {
      id: 'persius-more',
      ariaLabelKey: 'more',
      headingKey: 'more',
      links: links.filter(
        (link) => !primary.includes(link.id) && !personal.includes(link.id)
      ),
    },
  ];
  return orderedSections.filter((section) => section.links.length > 0);
};

const originalNavigationOrder = [
  'discover-home',
  'movies',
  'series',
  'requests',
  'blocklist',
  'issues',
  'users',
  'settings',
];

/** Applies the upstream flat menu order without changing the visible links. */
export const getNavigationSectionsForTheme = (
  sections: NavigationSection[],
  navigation: InterfaceThemeNavigation
): NavigationSection[] => {
  if (navigation !== 'flat' || sections.length === 0) {
    return sections;
  }

  const links = sections
    .flatMap((section) => section.links)
    .map((link, sourceOrder) => ({ link, sourceOrder }));

  links.sort((left, right) => {
    const leftOrder = originalNavigationOrder.indexOf(left.link.id);
    const rightOrder = originalNavigationOrder.indexOf(right.link.id);
    const resolvedLeftOrder =
      leftOrder === -1
        ? originalNavigationOrder.length + left.sourceOrder
        : leftOrder;
    const resolvedRightOrder =
      rightOrder === -1
        ? originalNavigationOrder.length + right.sourceOrder
        : rightOrder;

    return resolvedLeftOrder - resolvedRightOrder;
  });

  return [
    {
      id: 'original',
      ariaLabelKey: 'discover',
      links: links.map(({ link }) => link),
    },
  ];
};
