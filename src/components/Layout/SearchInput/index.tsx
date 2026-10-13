import useSearchInput from '@app/hooks/useSearchInput';
import defineMessages from '@app/utils/defineMessages';
import { XCircleIcon } from '@heroicons/react/24/outline';
import { MagnifyingGlassIcon } from '@heroicons/react/24/solid';
import type { KeyboardEvent } from 'react';
import { useCallback } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Layout.SearchInput', {
  searchPlaceholder: 'Search movies, series, music, books, and people',
});

const SearchInput = () => {
  const intl = useIntl();
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
          Search
        </label>
        <div className="relative flex w-full items-center text-white focus-within:text-gray-200">
          <div className="app-search-input-icon">
            <MagnifyingGlassIcon className="h-5 w-5" />
          </div>
          <input
            id="search_field"
            className="app-search-input"
            data-has-value={hasSearchValue}
            placeholder={intl.formatMessage(messages.searchPlaceholder)}
            type="search"
            autoComplete="off"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onFocus={() => setIsOpen(true)}
            onBlur={handleBlur}
            onKeyUp={handleKeyUp}
          />
          {hasSearchValue && (
            <button
              className="app-search-clear-control border-none p-1 text-gray-400 transition outline-none hover:text-white focus:border-none focus:outline-none"
              onClick={() => clear()}
              aria-label="Clear the search text"
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
