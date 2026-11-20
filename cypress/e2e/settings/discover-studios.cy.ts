describe('Discover Studios customization', () => {
  beforeEach(() => {
    cy.loginAsAdmin();
  });

  it('adds, reorders, persists, and resets the built-in Studios shelf', () => {
    Cypress.config('defaultCommandTimeout', 10000);
    cy.intercept('GET', '/api/v1/studio/99998', {
      id: 99998,
      name: 'Studio Without Logo',
      logoPath: null,
    });
    cy.intercept('GET', '/api/v1/studio/99999', {
      id: 99999,
      name: 'Test Studio',
      logoPath: '/test-studio.png',
    });
    cy.intercept('PUT', '/api/v1/settings/discover/*').as('saveStudioList');

    cy.viewport(1440, 1000);
    cy.visit('/');
    cy.get('[data-testid=discover-start-editing]').click();

    cy.contains('[data-testid=discover-slider-title]', 'Networks')
      .closest('[data-testid=discover-slider-edit-mode]')
      .as('networksSlider');
    cy.get('@networksSlider')
      .find('[data-testid=discover-slider-edit-button]')
      .click();
    cy.get('@networksSlider').find('button:contains("Cancel")').click();

    cy.contains('[data-testid=discover-slider-title]', 'Studios')
      .closest('[data-testid=discover-slider-edit-mode]')
      .as('studiosSlider');
    cy.get('@studiosSlider')
      .find('[data-testid=discover-slider-edit-button]')
      .click();

    cy.get('[data-testid=discover-studio-item]').then(($items) => {
      expect($items.length).to.be.greaterThan(0);
    });

    cy.get('[data-testid=discover-studio-id]').type('99998{enter}');
    cy.contains('This studio does not have a usable logo.').should(
      'be.visible'
    );
    cy.contains(
      '[data-testid=discover-studio-item]',
      'Studio Without Logo'
    ).should('not.exist');

    cy.get('[data-testid=discover-studio-id]').clear().type('99999{enter}');
    cy.contains('[data-testid=discover-studio-item]', 'Test Studio').should(
      'exist'
    );
    cy.contains('[data-testid=discover-studio-item]', 'Test Studio')
      .find('[data-testid=discover-studio-move-up]')
      .click();

    cy.get('[data-testid=discover-studio-save]').click();
    cy.wait('@saveStudioList').then(({ request, response }) => {
      expect(response?.statusCode).to.eq(200);
      const studios = JSON.parse(request.body.data);
      expect(studios[studios.length - 2]).to.deep.include({
        id: 99999,
        name: 'Test Studio',
        logoPath: '/test-studio.png',
      });
    });

    cy.reload();
    cy.get('[data-testid=discover-start-editing]').click();
    cy.contains('[data-testid=discover-slider-title]', 'Studios')
      .closest('[data-testid=discover-slider-edit-mode]')
      .as('studiosSlider');
    cy.get('@studiosSlider')
      .find('[data-testid=discover-slider-edit-button]')
      .click();
    cy.contains('[data-testid=discover-studio-item]', 'Test Studio').should(
      'exist'
    );

    cy.viewport(390, 844);
    cy.get('[data-testid=discover-studio-save]').should('be.visible');
    cy.get('[data-testid=discover-studio-reset]').should('be.visible');
    cy.document().its('documentElement.scrollWidth').should('be.lte', 390);
    cy.get('[data-testid=discover-studio-reset]').click();
    cy.contains('[data-testid=discover-studio-item]', 'Test Studio').should(
      'not.exist'
    );
    cy.get('[data-testid=discover-studio-save]').click();
    cy.wait('@saveStudioList').then(({ request, response }) => {
      expect(response?.statusCode).to.eq(200);
      expect(request.body.data).to.eq('');
    });
  });
});
