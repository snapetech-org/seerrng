describe('Search provider errors', () => {
  beforeEach(() => {
    cy.loginAsAdmin();
    cy.request('/api/v1/auth/me').then(({ body }) =>
      cy.request('POST', `/api/v1/user/${body.id}/settings/interface-theme`, {
        theme: 'seerrNGJ',
      })
    );
  });

  it('shows an audiobook catalog failure message and a retry action', () => {
    cy.mockConfiguredMediaAvailability({ booksEnabled: true });
    cy.intercept('GET', '**/api/v1/settings/public*').as('publicSettings');
    cy.intercept('GET', '/api/v1/search*', (request) => {
      if (request.query.format !== 'audiobook') {
        request.reply({
          page: 1,
          totalPages: 1,
          totalResults: 0,
          results: [],
        });
        return;
      }

      request.alias = 'audiobookSearch';
      expect(request.query.type).to.eq('book');
      request.reply({
        statusCode: 503,
        body: {
          message:
            'The configured audiobook catalog is unavailable. Please try again.',
        },
      });
    });

    cy.visit('/search?query=pacific');
    cy.wait('@publicSettings');
    cy.contains('button', 'Media Filters').click();
    cy.contains('button', 'Audiobooks').click();
    cy.location('search').should('include', 'type=book');
    cy.location('search').should('include', 'format=audiobook');
    cy.wait('@audiobookSearch');
    cy.get('[role="alert"]')
      .should(
        'contain.text',
        'The configured audiobook catalog is unavailable. Please try again.'
      )
      .and('contain.text', 'The catalog could not be reached. Try again.');
    cy.get('[role="alert"]')
      .contains('button', 'Try again')
      .should('be.visible');
  });
});
