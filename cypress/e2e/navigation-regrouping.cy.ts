describe('primary navigation', () => {
  beforeEach(() => {
    cy.loginAsAdmin();
  });

  it('orders the requested groups and nests User List under Settings', () => {
    cy.viewport(1400, 900);
    cy.intercept('GET', '/api/v1/blocklist/count', { body: { count: 1 } });
    cy.mockConfiguredMediaAvailability({ booksEnabled: true });
    cy.visit('/');

    cy.get('nav[data-navigation-device="desktop"]')
      .find('a')
      .then(($links) => {
        const labels = $links
          .toArray()
          .map((link) => link.textContent?.trim() ?? '');
        const requestedOrder = [
          'Discover',
          'Movies',
          'Series',
          'Books',
          'Audiobooks',
          'Swipe',
          'My Media',
          'My Games',
          'Calendar',
          'Download Inbox',
          'Indexer Search',
          'Requests',
          'Issues',
          'Blocklist',
          'Settings',
          'User List',
        ].filter((label) => labels.includes(label));
        const actualOrder = labels.filter((label) =>
          requestedOrder.includes(label)
        );

        expect(actualOrder).to.deep.equal(requestedOrder);
      });

    cy.get('[role="group"][aria-label="My Library"]')
      .find('.sidebar-navigation-heading')
      .should('have.text', 'My Library');
    cy.get('[data-testid="sidebar-menu-settings"]').should(
      'have.attr',
      'data-navigation-level',
      'primary'
    );
    cy.get('[data-testid="sidebar-menu-users"]')
      .should('have.attr', 'data-navigation-level', 'nested')
      .and('be.visible');
  });

  it('hides Blocklist when empty and shows it once entries exist', () => {
    let countRequests = 0;
    cy.viewport(1400, 900);
    cy.intercept('GET', '/api/v1/blocklist/count', (request) => {
      request.reply({ body: { count: countRequests === 0 ? 0 : 1 } });
      countRequests += 1;
    }).as('blocklistNavigationCount');

    cy.visit('/');
    cy.wait('@blocklistNavigationCount');
    cy.get('nav[data-navigation-device="desktop"] a[href="/blocklist"]').should(
      'not.exist'
    );

    cy.reload();
    cy.wait('@blocklistNavigationCount');
    cy.get('nav[data-navigation-device="desktop"] a[href="/blocklist"]').should(
      'be.visible'
    );

    cy.viewport(390, 844);
    cy.reload();
    cy.wait('@blocklistNavigationCount');
    cy.get('button[aria-label="More navigation"]').click();
    cy.get('.mobile-menu-navigation a[href="/blocklist"]').should('exist');

    cy.viewport(768, 844);
    cy.reload();
    cy.wait('@blocklistNavigationCount');
    cy.get('[data-testid="sidebar-toggle"]').click();
    cy.get('nav[data-navigation-device="mobile"] a[href="/blocklist"]').should(
      'exist'
    );

    if (Cypress.expose('VISUAL_REVIEW')) {
      cy.screenshot('blocklist-navigation-drawer-visible-768x844', {
        capture: 'viewport',
      });
    }
  });

  it('switches between a media discovery page and its Swipe deck', () => {
    cy.intercept('GET', '/api/v1/discover/movies*', {
      page: 1,
      totalPages: 1,
      totalResults: 0,
      results: [],
    });
    cy.intercept('GET', '/api/v1/swipe/status', {
      enabled: true,
      aiRanking: false,
      mediaTypes: ['movie'],
      softwareCatalogProvider: 'questarr',
      bookFormats: ['ebook', 'audiobook'],
    });
    cy.intercept('GET', '/api/v1/swipe/profile', {
      tasteNotes: '',
      seriesRequest: 'first-season',
      bookFormat: 'ebook',
      seedScope: 'full',
      favoriteSeeds: [],
    });
    cy.intercept('GET', '/api/v1/swipe/deck*', {
      mediaType: 'movie',
      ranked: false,
      remaining: 0,
      cards: [],
    });

    cy.visit('/discover/movies');
    cy.get('[data-testid="discovery-mode-tab-swipe"]').click();
    cy.location('pathname').should('eq', '/swipe');
    cy.location('search').should('include', 'mediaType=movie');
    cy.location('search').should('include', 'returnTo');

    cy.get('[data-testid="discovery-mode-tab-discover"]').click();
    cy.location('pathname').should('eq', '/discover/movies');
    cy.get('[data-testid="discovery-mode-tab-swipe"]').should('be.visible');
  });

  it('keeps the current media discovery subpage and filters when switching back', () => {
    cy.mockConfiguredMediaAvailability({ booksEnabled: true });
    cy.intercept('GET', '/api/v1/discover/**', {
      page: 1,
      totalPages: 1,
      totalResults: 0,
      results: [],
    });
    cy.intercept('GET', '/api/v1/swipe/status', {
      enabled: true,
      aiRanking: false,
      mediaTypes: ['tv'],
      softwareCatalogProvider: 'questarr',
      bookFormats: ['ebook', 'audiobook'],
    });
    cy.intercept('GET', '/api/v1/swipe/profile', {
      tasteNotes: '',
      seriesRequest: 'first-season',
      bookFormat: 'ebook',
      seedScope: 'full',
      favoriteSeeds: [],
    });
    cy.intercept('GET', '/api/v1/swipe/deck*', {
      mediaType: 'tv',
      ranked: false,
      remaining: 0,
      cards: [],
    });

    cy.visit('/discover/tv/genre/18?sortBy=popularity.desc&page=2');
    cy.get('[data-testid="discovery-mode-tab-swipe"]').click();
    cy.location('pathname').should('eq', '/swipe');
    cy.location('search').should('include', 'returnTo');

    cy.get('[data-testid="discovery-mode-tab-discover"]').click();
    cy.location('pathname').should('eq', '/discover/tv/genre/18');
    cy.location('search').should('include', 'sortBy=popularity.desc');
    cy.location('search').should('include', 'page=2');
  });

  it('opens the matching Swipe type from series, book, and audiobook discovery', () => {
    cy.mockConfiguredMediaAvailability({ booksEnabled: true });
    cy.intercept('GET', '/api/v1/discover/**', {
      page: 1,
      totalPages: 1,
      totalResults: 0,
      results: [],
    });

    const discoveryTargets = [
      { path: '/discover/tv', mediaType: 'tv' },
      { path: '/discover/books', mediaType: 'book' },
      { path: '/discover/audiobooks', mediaType: 'book' },
    ];

    discoveryTargets.forEach(({ path, mediaType }) => {
      cy.visit(path);
      cy.get('[data-testid="discovery-mode-tab-swipe"]')
        .should('have.attr', 'href')
        .and('include', `mediaType=${mediaType}`);
    });
  });
});
