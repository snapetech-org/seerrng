import { navigationSections } from '@app/components/Layout/Sidebar/navigation';
import DiscoverBooksPage from '@app/pages/discover/books';
import { isOptionalCatalogPathEnabled } from '@app/utils/serviceAvailability';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@app/components/Discover/DiscoverBooks', () => ({
  default: ({ format }: { format: string }) =>
    React.createElement('output', null, format),
}));

describe('Books navigation', () => {
  const books = navigationSections
    .flatMap((section) => section.links)
    .find((link) => link.id === 'books')!;

  it('defaults the Books page to ebooks rather than the combined catalog', () => {
    expect(renderToStaticMarkup(React.createElement(DiscoverBooksPage))).toBe(
      '<output>ebook</output>'
    );
  });

  it('explicitly selects ebooks so saved All Books or Audiobooks pins cannot override the sidebar', () => {
    const target = new URL(books.href, 'https://seerr.invalid');
    expect(target.pathname).toBe('/discover/books');
    expect(target.searchParams.get('format')).toBe('ebook');
  });

  it('keeps the format-qualified sidebar link hidden when books are unavailable', () => {
    expect(
      isOptionalCatalogPathEnabled(books.href, {
        booksEnabled: false,
        musicEnabled: false,
        comicsEnabled: false,
      })
    ).toBe(false);
    expect(
      isOptionalCatalogPathEnabled(books.href, {
        booksEnabled: true,
        musicEnabled: false,
        comicsEnabled: false,
      })
    ).toBe(true);
  });
});
