import usePersius from '@app/components/Persius/usePersius';
import persiusMessages from '@app/components/Persius/messages';
import MediaFilterOption from '@app/components/Discover/MediaFilterOption';
import useMediaFilterPin from '@app/hooks/useMediaFilterPin';
import defineMessages from '@app/utils/defineMessages';
import { parseQueryFromPath } from '@app/utils/routeQuery';
import {
  BookOpenIcon,
  SpeakerWaveIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { ParsedUrlQuery } from 'querystring';
import { useIntl } from 'react-intl';

export type BookDiscoveryFormat = 'all' | 'ebook' | 'audiobook';

interface BookFormatTabsProps {
  format: BookDiscoveryFormat;
  query: ParsedUrlQuery;
  currentPath?: string;
  className?: string;
  availableFormats?: readonly BookDiscoveryFormat[];
}

const getBookFormatHref = (
  pathname: string,
  query: ParsedUrlQuery,
  queryFormat?: 'ebook' | 'all'
): string => {
  const queryParams = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (
      key === 'page' ||
      key === 'format' ||
      (key === 'narrator' &&
        (pathname !== '/discover/audiobooks' || queryFormat))
    ) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item) {
          queryParams.append(key, item);
        }
      });
    } else if (value) {
      queryParams.append(key, value);
    }
  });

  if (queryFormat) {
    queryParams.set('format', queryFormat);
  }

  const queryString = queryParams.toString().replace(/\+/g, '%20');

  return `${pathname}${queryString ? `?${queryString}` : ''}`;
};

const messages = defineMessages('components.Discover.BookFormatTabs', {
  format: 'Book format',
  allBooks: 'All Books',
  books: 'Books',
  audiobooks: 'Audiobooks',
});

const BookFormatTabs = ({
  format,
  query,
  currentPath,
  className = '',
  availableFormats = ['all', 'ebook', 'audiobook'],
}: BookFormatTabsProps) => {
  const intl = useIntl();
  const persius = usePersius();
  const router = useRouter();
  const allPathname =
    router.pathname === '/discover/audiobooks'
      ? '/discover/audiobooks'
      : '/discover/books';
  const tabs: {
    format: BookDiscoveryFormat;
    label: (typeof messages)[keyof typeof messages];
    icon: typeof BookOpenIcon;
    pathname: string;
    queryFormat?: 'ebook' | 'all';
  }[] = [
    {
      format: 'all',
      label: messages.allBooks,
      icon: Squares2X2Icon,
      pathname: allPathname,
      queryFormat: 'all',
    },
    {
      format: 'ebook',
      label: messages.books,
      icon: BookOpenIcon,
      pathname: '/discover/books',
      queryFormat: 'ebook',
    },
    {
      format: 'audiobook',
      label: messages.audiobooks,
      icon: SpeakerWaveIcon,
      pathname: '/discover/audiobooks',
    },
  ];
  // During hydration Next.js can expose an incomplete router.query object.
  // The browser path is already the user's source of truth, so use it when it
  // contains a query string and fall back to the parsed router query otherwise.
  const pathQuery = currentPath ? parseQueryFromPath(currentPath) : {};
  const preservedQuery = Object.keys(pathQuery).length > 0 ? pathQuery : query;
  const pin = useMediaFilterPin<BookDiscoveryFormat>({
    scope: 'books',
    selected: format,
    values: ['all', 'ebook', 'audiobook'],
    ready: router.isReady,
    explicit:
      Boolean(preservedQuery.format) ||
      router.pathname === '/discover/audiobooks',
    restore: (value) => {
      const tab = tabs.find((tab) => tab.format === value)!;
      void router.replace(
        getBookFormatHref(tab.pathname, preservedQuery, tab.queryFormat)
      );
    },
  });

  if (persius) return <nav className="persius-segments" data-fill="true" aria-label={intl.formatMessage(messages.format)}>
    {tabs.filter((tab) => availableFormats.includes(tab.format) && (tab.format !== 'all' || format === 'all')).map((tab) => {
      const Icon = tab.icon;
      return <Link key={tab.format} href={getBookFormatHref(tab.pathname, preservedQuery, tab.queryFormat)} aria-current={tab.format === format ? 'page' : undefined}><Icon aria-hidden="true" />{intl.formatMessage(tab.format === 'ebook' ? persiusMessages.ebooks : tab.label)}</Link>;
    })}
  </nav>;

  return (
    <nav
      aria-label={intl.formatMessage(messages.format)}
      className={`app-filter-row ${className}`}
      data-testid="book-format-tabs"
    >
      {tabs
        .filter((tab) => availableFormats.includes(tab.format))
        .map((tab) => {
          const isSelected = tab.format === format;
          const Icon = tab.icon;

          return (
            <MediaFilterOption
              key={tab.format}
              pin={pin}
              value={tab.format}
              label={intl.formatMessage(tab.label)}
              selected={isSelected}
            >
              <Link
                href={getBookFormatHref(
                  tab.pathname,
                  preservedQuery,
                  tab.queryFormat
                )}
                aria-current={isSelected ? 'page' : undefined}
                data-testid={`book-format-tab-${tab.format}`}
                className="app-control-shadow-exempt app-filter-segment-focus"
              >
                <Icon className="app-action-icon" aria-hidden="true" />
                <span>{intl.formatMessage(tab.label)}</span>
              </Link>
            </MediaFilterOption>
          );
        })}
    </nav>
  );
};

export default BookFormatTabs;

