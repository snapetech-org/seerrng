import type { InterfaceThemeId } from '@server/utils/interfaceTheme';
import type { NavigationSection } from './navigation';

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
  theme: InterfaceThemeId
): NavigationSection[] => {
  if (theme !== 'seerrOrig' || sections.length === 0) {
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
