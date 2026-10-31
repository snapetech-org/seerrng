import persiusMessages from '@app/components/Persius/messages';
import usePersius from '@app/components/Persius/usePersius';
import useSearchInput from '@app/hooks/useSearchInput';
import defineMessages from '@app/utils/defineMessages';
import { XCircleIcon } from '@heroicons/react/24/outline';
import { MagnifyingGlassIcon } from '@heroicons/react/24/solid';
import { useRouter } from 'next/router';
import type { KeyboardEvent } from 'react';
import { useCallback, useEffect } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Layout.SearchInput', {
  searchLabel: 'Search',
  searchPlaceholder: 'Search movies, series, music, books, and people',
  clearSearchText: 'Clear the search text',
});

const SearchInput = () => {
  const intl = useIntl();
  const persius = usePersius();
  const router = useRouter();
  const placeholder =
    router.pathname === '/discover/movies'
      ? persiusMessages.searchMovies
      : router.pathname === '/discover/tv'
        ? persiusMessages.searchSeries
        : router.pathname === '/discover/books'
          ? persiusMessages.searchBooks
          : router.pathname === '/discover/audiobooks'
            ? persiusMessages.searchAudio
            : persiusMessages.searchAll;
  useEffect(() => {
    if (!persius) return;
    const focusSearch = (event: globalThis.KeyboardEvent) => {
      if (
        event.key !== '/' ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.defaultPrevented ||
        document.querySelector('[aria-modal="true"]')
      )
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest('input, textarea, select, [role="textbox"]'))
      )
        return;
      event.preventDefault();
      document.getElementById('search_field')?.focus();
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, [persius]);
  const { searchValue, setSearchValue, setIsOpen, clear } = useSearchInput();
  const hasSearchValue = searchValue.length > 0;
  const handleBlur = useCallback(() => {
    if (searchValue === '') {
      setIsOpen(false);
    }
  }, [searchValue, setIsOpen]);
  const handleKeyUp = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    }
  }, []);

  return (
    <div className="flex min-w-0 flex-1 items-center">
      <div className="flex w-full max-w-2xl min-w-0">
        <label htmlFor="search_field" className="sr-only">
          {intl.formatMessage(messages.searchLabel)}
        </label>
        <div className="relative flex w-full items-center text-white focus-within:text-gray-200">
          <div className="pointer-events-none absolute inset-y-0 start-4 flex items-center">
            <MagnifyingGlassIcon className="h-5 w-5" />
          </div>
          <input
            id="search_field"
            className={`app-search-input ${hasSearchValue ? 'pe-7' : ''}`}
            placeholder={intl.formatMessage(
              persius ? placeholder : messages.searchPlaceholder
            )}
            type="search"
            autoComplete="off"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onFocus={() => setIsOpen(true)}
            onBlur={handleBlur}
            onKeyUp={handleKeyUp}
          />
          {persius && !hasSearchValue && (
            <kbd className="persius-search-shortcut" aria-hidden="true">
              /
            </kbd>
          )}
          {hasSearchValue && (
            <button
              className="absolute inset-y-0 end-2 m-auto h-7 w-7 border-none p-1 text-gray-400 transition outline-none hover:text-white focus:border-none focus:outline-none"
              onClick={() => clear()}
              aria-label={intl.formatMessage(messages.clearSearchText)}
            >
              <XCircleIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchInput;
