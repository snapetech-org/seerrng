import useSettings from '@app/hooks/useSettings';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import {
  getUserServiceAvailability,
  isOptionalCatalogPathEnabled,
} from '@app/utils/serviceAvailability';
import Link from 'next/link';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Common.RelatedTools', {
  label: 'Related Tools',
  share: 'Share & Identify',
  shareText:
    'Paste a link, ISBN, list, or photo and request the matches. Works from your phone’s Share menu.',
  following: 'Following',
  followingText:
    'Personal news about the narrators, series, games, and artists you follow.',
  bookRecommendations: 'Book Recommendations',
  bookRecommendationsText:
    'Browse and filter Hardcover book recommendations, then request a book in your preferred format.',
  collectors: 'Collector Picks',
  collectorsText: 'Releases shared by collectors you follow in slskdN.',
  gameFinder: 'Game Finder',
  gameFinderText:
    'Save a search by theme, mode, perspective, language, and length.',
  patches: 'Translations & Hacks',
  patchesText:
    'Fan translations and ROM hacks with exact versions and completeness.',
});

const TOOLS = {
  share: { href: '/share', title: messages.share, text: messages.shareText },
  following: {
    href: '/following',
    title: messages.following,
    text: messages.followingText,
  },
  bookRecommendations: {
    href: '/discover/book-recommendations',
    title: messages.bookRecommendations,
    text: messages.bookRecommendationsText,
  },
  collectors: {
    href: '/discover/collectors',
    title: messages.collectors,
    text: messages.collectorsText,
  },
  gameFinder: {
    href: '/discover/games',
    title: messages.gameFinder,
    text: messages.gameFinderText,
  },
  patches: {
    href: '/discover/patches',
    title: messages.patches,
    text: messages.patchesText,
  },
} as const;

export type RelatedToolId = keyof typeof TOOLS;

/** A short, labelled row of links to the tools that extend the current page. */
const RelatedTools = ({ tools }: { tools: RelatedToolId[] }) => {
  const intl = useIntl();
  const { currentSettings } = useSettings();
  const { user, hasPermission } = useUser();
  const serviceAvailability = getUserServiceAvailability(
    currentSettings,
    user?.settings?.enabledMediaCategories,
    hasPermission(Permission.ADMIN)
  );
  const visibleTools = tools.filter((id) => {
    if (id === 'gameFinder') {
      return isOptionalCatalogPathEnabled(
        '/discover/games',
        serviceAvailability
      );
    }
    if (id === 'patches') {
      return isOptionalCatalogPathEnabled(
        '/discover/patches',
        serviceAvailability
      );
    }
    return true;
  });

  if (!hasPermission(Permission.REQUEST)) return null;
  if (!visibleTools.length) return null;

  return (
    <nav
      aria-label={intl.formatMessage(messages.label)}
      className="related-tools"
    >
      <ul className="related-tools-list">
        {visibleTools.map((id) => {
          const tool = TOOLS[id];
          return (
            <li key={id}>
              <Link href={tool.href} className="related-tools-link">
                <span className="related-tools-title">
                  {intl.formatMessage(tool.title)}
                </span>
                <span className="related-tools-text">
                  {intl.formatMessage(tool.text)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default RelatedTools;
