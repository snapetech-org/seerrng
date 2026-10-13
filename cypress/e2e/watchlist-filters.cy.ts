type WatchlistFixtureItem = {
  id: number;
  ratingKey: string;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
};

const watchlistItems: WatchlistFixtureItem[] = [
  {
    id: 1,
    ratingKey: 'watchlist-arrival',
    tmdbId: 329865,
    mediaType: 'movie',
    title: 'Arrival',
  },
  {
    id: 2,
    ratingKey: 'watchlist-dune',
    tmdbId: 438631,
    mediaType: 'movie',
    title: 'Dune',
  },
  {
    id: 3,
    ratingKey: 'watchlist-the-bear',
    tmdbId: 136315,
    mediaType: 'tv',
    title: 'The Bear',
  },
  {
    id: 4,
    ratingKey: 'watchlist-severance',
    tmdbId: 95396,
    mediaType: 'tv',
    title: 'Severance',
  },
];

const interceptLocalWatchlist = () => {
  cy.intercept('GET', '/api/v1/discover/watchlist*', (request) => {
    const query = request.query;
    const search = typeof query.search === 'string' ? query.search : '';
    const mediaType =
      typeof query.mediaType === 'string' ? query.mediaType : undefined;
    const sortBy = typeof query.sortBy === 'string' ? query.sortBy : undefined;
    const results = watchlistItems
      .filter(
        (item) =>
          item.title.toLowerCase().includes(search.toLowerCase()) &&
          (!mediaType || item.mediaType === mediaType)
      )
      .sort((left, right) => {
        if (sortBy === 'title-asc') {
          return left.title.localeCompare(right.title);
        }
        if (sortBy === 'title-desc') {
          return right.title.localeCompare(left.title);
        }
        return left.id - right.id;
      });

    request.reply({
      page: 1,
      totalPages: 1,
      totalResults: results.length,
      filtersSupported: true,
      results,
    });
  }).as('getLocalWatchlist');
};

const interceptCombinedWatchlist = () => {
  cy.intercept('GET', '/api/v1/discover/watchlist*', {
    page: 1,
    totalPages: 1,
    totalResults: 1,
    filtersSupported: false,
    results: [
      {
        id: 10,
        ratingKey: 'plex-watchlist-movie',
        tmdbId: 361743,
        mediaType: 'movie',
        title: 'Plex Movie',
      },
    ],
  }).as('getCombinedWatchlist');
};

describe('Local Watchlist filters', () => {
  beforeEach(() => {
    cy.loginAsAdmin();
  });

  it('applies a title search and clears it without losing the local list', () => {
    interceptLocalWatchlist();
    cy.visit('/discover/watchlist');
    cy.wait('@getLocalWatchlist');

    cy.get('[data-testid="watchlist-title-search"]').type('Dune{enter}');

    cy.wait('@getLocalWatchlist')
      .its('request.query.search')
      .should('eq', 'Dune');
    cy.location('search').should('include', 'search=Dune');
    cy.get('[data-testid="title-card"]')
      .should('have.length', 1)
      .and('have.attr', 'data-media-type', 'movie');

    cy.get('button').contains('Clear Filters').click();
    cy.location('search').should('eq', '');
    cy.wait('@getLocalWatchlist');
    cy.get('[data-testid="title-card"]').should('have.length', 4);
  });

  it('filters by media type and sorts titles in the selected direction', () => {
    interceptLocalWatchlist();
    cy.visit('/discover/watchlist');
    cy.wait('@getLocalWatchlist');

    cy.get('button[aria-label="Media Type"]').click();
    cy.get('[role="option"]').contains('Series').click();
    cy.get('button[aria-label="Sort By"]').click();
    cy.get('[role="option"]').contains('Title (Z to A)').click();
    cy.get('[data-testid="watchlist-apply-filters"]').click();

    cy.wait('@getLocalWatchlist')
      .its('request.query')
      .should((query) => {
        expect(query.mediaType).to.eq('tv');
        expect(query.sortBy).to.eq('title-desc');
      });
    cy.location('search').should('include', 'mediaType=tv');
    cy.location('search').should('include', 'sortBy=title-desc');
    cy.get('[data-testid="title-card"]')
      .should('have.length', 2)
      .each(($card) => {
        expect($card).to.have.attr('data-media-type', 'tv');
      });
  });

  it('keeps combined Plex watchlists in order without exposing local filters', () => {
    interceptCombinedWatchlist();
    cy.visit('/discover/watchlist');
    cy.wait('@getCombinedWatchlist');

    cy.get('[data-testid="watchlist-filters"]').should('not.exist');
    cy.contains(
      'Filters are unavailable while Plex Watchlist items are combined.'
    ).should('be.visible');
  });
});
