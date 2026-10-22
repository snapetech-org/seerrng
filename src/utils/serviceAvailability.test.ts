import { strictEqual } from 'node:assert';
import { describe, it } from 'node:test';
import {
  getUserServiceAvailability,
  isDiscoverMediaTypeEnabled,
  isDiscoverWatchlistTypeEnabled,
  isOptionalCatalogPathEnabled,
} from './serviceAvailability';

describe('isOptionalCatalogPathEnabled', () => {
  it('hides optional catalogs without a configured backend service', () => {
    const availability = {
      musicEnabled: false,
      booksEnabled: false,
      comicsEnabled: false,
    };

    strictEqual(
      isOptionalCatalogPathEnabled('/discover/music', availability),
      false
    );
    strictEqual(
      isOptionalCatalogPathEnabled('/discover/books', availability),
      false
    );
    strictEqual(
      isOptionalCatalogPathEnabled('/discover/audiobooks', availability),
      false
    );
    strictEqual(
      isOptionalCatalogPathEnabled('/discover/comics', availability),
      false
    );
    strictEqual(
      isOptionalCatalogPathEnabled('/discover/movies', availability),
      true
    );
  });

  it('hides game and patch catalogs until their services are configured', () => {
    const unavailable = {
      musicEnabled: false,
      booksEnabled: false,
      comicsEnabled: false,
      softwareEnabled: false,
      romarrEnabled: false,
    };

    strictEqual(
      isOptionalCatalogPathEnabled('/discover/games', unavailable),
      false
    );
    strictEqual(
      isOptionalCatalogPathEnabled('/discover/patches', unavailable),
      false
    );

    const configured = {
      ...unavailable,
      softwareEnabled: true,
      romarrEnabled: true,
    };
    strictEqual(
      isOptionalCatalogPathEnabled('/discover/games', configured),
      true
    );
    strictEqual(
      isOptionalCatalogPathEnabled('/discover/patches', configured),
      true
    );

    const categoriesDisabled = {
      ...configured,
      enabledMediaCategories: {
        game: false,
        retro: false,
        modern: false,
      },
    };
    strictEqual(
      isOptionalCatalogPathEnabled('/discover/games', categoriesDisabled),
      false
    );
    strictEqual(
      isOptionalCatalogPathEnabled('/discover/patches', categoriesDisabled),
      false
    );
  });

  it('keeps the personal game library visible when request integrations are disabled', () => {
    strictEqual(
      isOptionalCatalogPathEnabled('/games', {
        musicEnabled: false,
        booksEnabled: false,
        comicsEnabled: false,
        softwareEnabled: false,
        romarrEnabled: false,
        enabledMediaCategories: { game: false },
      }),
      true
    );
  });

  it('shows each optional catalog when its backend is configured', () => {
    strictEqual(
      isOptionalCatalogPathEnabled('/discover/music', {
        musicEnabled: true,
        booksEnabled: false,
        comicsEnabled: false,
      }),
      true
    );
    strictEqual(
      isOptionalCatalogPathEnabled('/discover/books', {
        musicEnabled: false,
        booksEnabled: true,
        comicsEnabled: false,
      }),
      true
    );
    strictEqual(
      isOptionalCatalogPathEnabled('/discover/audiobooks', {
        musicEnabled: false,
        booksEnabled: true,
        comicsEnabled: false,
      }),
      true
    );
    strictEqual(
      isOptionalCatalogPathEnabled('/discover/comics', {
        musicEnabled: false,
        booksEnabled: false,
        comicsEnabled: true,
      }),
      true
    );
  });

  it('hides categories disabled by the administrator while preserving defaults', () => {
    const availability = {
      musicEnabled: true,
      booksEnabled: true,
      comicsEnabled: true,
      magazinesEnabled: true,
      softwareEnabled: true,
      romarrEnabled: true,
      enabledMediaCategories: {
        movie: false,
        tv: false,
        music: false,
        ebook: false,
        audiobook: true,
        comic: false,
        magazine: false,
        retro: false,
        modern: true,
        game: false,
      },
    };

    strictEqual(
      isOptionalCatalogPathEnabled('/discover/movies', availability),
      false
    );
    strictEqual(
      isOptionalCatalogPathEnabled('/discover/tv/genre/1', availability),
      false
    );
    strictEqual(
      isOptionalCatalogPathEnabled('/discover/music', availability),
      false
    );
    strictEqual(
      isOptionalCatalogPathEnabled('/discover/books', availability),
      false
    );
    strictEqual(
      isOptionalCatalogPathEnabled('/discover/audiobooks', availability),
      true
    );
    strictEqual(
      isOptionalCatalogPathEnabled('/discover/comics', availability),
      false
    );
    strictEqual(
      isOptionalCatalogPathEnabled('/discover/magazines', availability),
      false
    );
    strictEqual(isOptionalCatalogPathEnabled('/software', availability), true);
  });

  it('requires the matching Bookshelf service and media category for each book format', () => {
    const availability = {
      musicEnabled: false,
      booksEnabled: true,
      ebookServiceEnabled: false,
      audiobookServiceEnabled: true,
      comicsEnabled: false,
      enabledMediaCategories: {
        ebook: true,
        audiobook: true,
      },
    };

    strictEqual(
      isOptionalCatalogPathEnabled('/discover/books', availability),
      false
    );
    strictEqual(
      isOptionalCatalogPathEnabled('/discover/audiobooks', availability),
      true
    );
    strictEqual(isOptionalCatalogPathEnabled('/author/', availability), true);
    strictEqual(isDiscoverMediaTypeEnabled('book', availability), false);
    strictEqual(isDiscoverMediaTypeEnabled('audiobook', availability), true);
  });

  it('keeps software visible only for enabled categories with connected providers', () => {
    const availability = {
      musicEnabled: false,
      booksEnabled: false,
      comicsEnabled: false,
      softwareEnabled: true,
      romarrEnabled: true,
      enabledMediaCategories: {
        movie: true,
        tv: true,
        music: true,
        ebook: true,
        audiobook: true,
        comic: true,
        magazine: true,
        retro: false,
        modern: false,
        game: true,
      },
    };

    strictEqual(isOptionalCatalogPathEnabled('/software', availability), true);
    strictEqual(
      isOptionalCatalogPathEnabled('/software', {
        ...availability,
        enabledMediaCategories: {
          ...availability.enabledMediaCategories,
          game: false,
        },
      }),
      false
    );
    strictEqual(
      isOptionalCatalogPathEnabled('/software', {
        ...availability,
        romarrEnabled: false,
        enabledMediaCategories: {
          ...availability.enabledMediaCategories,
          game: false,
          retro: true,
        },
      }),
      false
    );
  });

  it('keeps a software catalog visible when only one configured provider category is enabled', () => {
    const availability = {
      musicEnabled: false,
      booksEnabled: false,
      comicsEnabled: false,
      softwareEnabled: true,
      romarrEnabled: true,
      enabledMediaCategories: {
        movie: true,
        tv: true,
        music: true,
        ebook: true,
        audiobook: true,
        comic: true,
        magazine: true,
        retro: true,
        modern: false,
        game: false,
      },
    };

    strictEqual(isOptionalCatalogPathEnabled('/software', availability), true);
  });

  it('checks each media tab against its category and configured service', () => {
    const availability = {
      musicEnabled: true,
      booksEnabled: true,
      comicsEnabled: true,
      enabledMediaCategories: {
        movie: false,
        tv: true,
        music: true,
        ebook: false,
        audiobook: true,
        comic: true,
        magazine: true,
        retro: true,
        modern: true,
        game: true,
      },
    };

    strictEqual(isDiscoverMediaTypeEnabled('movie', availability), false);
    strictEqual(isDiscoverMediaTypeEnabled('tv', availability), true);
    strictEqual(isDiscoverMediaTypeEnabled('music', availability), true);
    strictEqual(isDiscoverMediaTypeEnabled('book', availability), false);
    strictEqual(isDiscoverMediaTypeEnabled('audiobook', availability), true);
  });
});

describe('getUserServiceAvailability', () => {
  it('applies user choices over defaults while preserving global switches', () => {
    const availability = {
      musicEnabled: true,
      booksEnabled: true,
      comicsEnabled: true,
      enabledMediaCategories: { movie: true, tv: false, music: true },
      defaultEnabledMediaCategories: {
        movie: false,
        tv: true,
        music: true,
      },
    };
    const inherited = getUserServiceAvailability(availability);
    strictEqual(inherited.enabledMediaCategories?.movie, false);
    strictEqual(inherited.enabledMediaCategories?.tv, false);
    strictEqual(inherited.enabledMediaCategories?.music, true);

    const customized = getUserServiceAvailability(availability, {
      movie: true,
      music: false,
    });
    strictEqual(customized.enabledMediaCategories?.movie, true);
    strictEqual(customized.enabledMediaCategories?.music, false);
    strictEqual(customized.enabledMediaCategories?.tv, false);

    const administrator = getUserServiceAvailability(
      availability,
      { movie: false },
      true
    );
    strictEqual(administrator.enabledMediaCategories?.movie, true);
    strictEqual(administrator.enabledMediaCategories?.tv, false);
  });
});

describe('isDiscoverWatchlistTypeEnabled', () => {
  const availability = {
    musicEnabled: true,
    booksEnabled: true,
    comicsEnabled: true,
    magazinesEnabled: true,
    enabledMediaCategories: {
      movie: false,
      tv: true,
      music: true,
      ebook: false,
      audiobook: true,
      comic: false,
      magazine: true,
      retro: true,
      modern: true,
      game: true,
    },
  };

  it('hides disabled categories and retains other watchlist types', () => {
    strictEqual(isDiscoverWatchlistTypeEnabled('movie', availability), false);
    strictEqual(isDiscoverWatchlistTypeEnabled('tv', availability), true);
    strictEqual(isDiscoverWatchlistTypeEnabled('music', availability), true);
    strictEqual(isDiscoverWatchlistTypeEnabled('comic', availability), false);
    strictEqual(isDiscoverWatchlistTypeEnabled('magazine', availability), true);
  });

  it('keeps a book watchlist entry while either book format is enabled', () => {
    strictEqual(isDiscoverWatchlistTypeEnabled('book', availability), true);
    strictEqual(
      isDiscoverWatchlistTypeEnabled('book', {
        ...availability,
        enabledMediaCategories: {
          ...availability.enabledMediaCategories,
          audiobook: false,
          ebook: true,
        },
      }),
      true
    );
    strictEqual(
      isDiscoverWatchlistTypeEnabled('book', {
        ...availability,
        enabledMediaCategories: {
          ...availability.enabledMediaCategories,
          audiobook: false,
          ebook: false,
        },
      }),
      false
    );
  });
});
