describe('Book discovery formats', () => {
  beforeEach(() => {
    cy.loginAsAdmin();
    // Exercise the Orig disclosure owner regardless of prior saved preferences.
    cy.request('POST', '/api/v1/user/1/settings/interface-theme', {
      theme: 'seerrOrig',
    });
    cy.mockConfiguredMediaAvailability({ booksEnabled: true });
  });

  it('separates Books and Audiobooks while preserving discovery filters', () => {
    cy.intercept('GET', '/api/v1/discover/books*', (request) => {
      expect(request.query.responseVersion).to.eq('3');
      request.alias =
        request.query.format === 'audiobook'
          ? 'discoverAudiobooks'
          : request.query.format === 'ebook'
            ? 'discoverEbooks'
            : 'discoverBooks';
      request.reply({
        page: 1,
        totalPages: 1,
        totalResults: 1,
        results: [
          {
            id: 'OLFORMATBOOK',
            mediaType: 'book',
            title: 'Format-aware Book',
            author: 'Format Author',
            posterPath: '/images/seerr_poster_not_found.png',
          },
        ],
      });
    });

    cy.visit('/discover/books?subject=fantasy&sortBy=rating');
    cy.wait('@discoverEbooks')
      .its('request.url')
      .should('include', 'format=ebook');
    cy.contains('[data-testid=page-header]', 'Books').should('be.visible');
    cy.contains('button', 'Media Filters').click();
    cy.get('[data-testid=book-format-tab-ebook]')
      .should('have.attr', 'aria-current', 'page')
      .and('contain', 'Books');

    cy.get('[data-testid=book-format-tab-all]').click();
    cy.wait('@discoverBooks')
      .its('request.url')
      .should('not.include', 'format=');
    cy.get('[data-testid=book-format-tab-all]')
      .should('have.attr', 'aria-current', 'page')
      .and('contain', 'All Books');

    cy.get('[data-testid=book-format-tab-ebook]').click();
    cy.wait('@discoverEbooks')
      .its('request.url')
      .should('include', 'format=ebook');
    cy.get('[data-testid=book-format-tab-ebook]')
      .should('have.attr', 'aria-current', 'page')
      .and('contain', 'Books');

    cy.get('[data-testid=book-format-tab-audiobook]').should(
      'have.attr',
      'href',
      '/discover/audiobooks?subject=fantasy&sortBy=rating'
    );
    cy.get('[data-testid=book-format-tab-audiobook]').click();
    cy.location('pathname').should('eq', '/discover/audiobooks');
    cy.url({ timeout: 10000 })
      .should('include', 'subject=fantasy')
      .and('include', 'sortBy=rating');
    cy.wait('@discoverAudiobooks')
      .its('request.url')
      .should('include', 'format=audiobook');
    cy.contains('[data-testid=page-header]', 'Audiobooks').should('be.visible');
    cy.contains('button', 'Media Filters').click();
    cy.get('[data-testid=book-format-tab-audiobook]').should(
      'have.attr',
      'aria-current',
      'page'
    );
    // Cypress treats a rendered ancestor with content-visibility: auto as
    // hidden, so assert the badge's rendered geometry instead of using its
    // visibility heuristic.
    cy.get('[data-testid=title-card]').first().scrollIntoView();
    cy.get('[data-testid=title-card]')
      .first()
      .find('[title=Audiobook]')
      .should('have.attr', 'title', 'Audiobook')
      .and(($badge) => {
        const { width, height } = $badge[0].getBoundingClientRect();
        expect(width).to.be.greaterThan(0);
        expect(height).to.be.greaterThan(0);
      });
  });
});
