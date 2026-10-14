describe('General Settings', () => {
  beforeEach(() => {
    cy.loginAsAdmin();
  });

  // Always restore the process-wide restart flag, even if the test aborts
  // before it can revert the setting itself.
  afterEach(() => {
    cy.request('POST', '/api/v1/settings/network', { trustProxy: false });
  });

  it('opens the settings page from the home page', () => {
    cy.visit('/');

    cy.get('[data-testid=sidebar-toggle]').click();
    cy.get('[data-testid=sidebar-menu-settings-mobile]').click();

    cy.contains('h3', 'General Settings').should('be.visible');
  });

  it('accepts a trailing slash for YouTube URLs and keeps the application URL strict', () => {
    cy.intercept('POST', '/api/v1/settings/main', {
      statusCode: 200,
      body: {},
    }).as('saveMainSettings');
    cy.visit('/settings/main');

    cy.get('#youtubeUrl').clear().type('https://youtube.example/watch/');
    cy.get('#applicationUrl').clear().type('https://seerr.example/');
    cy.get('[data-testid="settings-main-form"]').submit();

    cy.get('#applicationUrl')
      .closest('.form-row')
      .find('.error')
      .should('contain', 'URL must not end in a trailing slash');
    cy.get('#youtubeUrl')
      .closest('.form-row')
      .find('.error')
      .should('not.exist');

    cy.get('#applicationUrl').clear().type('https://seerr.example');
    cy.get('[data-testid="settings-main-form"]').submit();
    cy.wait('@saveMainSettings').then(({ request }) => {
      expect(request.body.youtubeUrl).to.eq('https://youtube.example/watch/');
      expect(request.body.applicationUrl).to.eq('https://seerr.example');
    });
  });

  it('modifies setting that requires restart', () => {
    cy.intercept('POST', '/api/v1/settings/network').as('saveNetwork');
    cy.intercept('GET', '/api/v1/status?checkUpdateAvailable=false').as(
      'getStatus'
    );
    cy.visit('/settings/network');
    cy.wait('@getStatus');

    cy.get('button#trustProxy').scrollIntoView().should('be.visible').click();
    cy.get('[data-testid=settings-network-form]').submit();
    cy.wait('@saveNetwork').then(({ request, response }) => {
      expect(
        response?.statusCode,
        JSON.stringify({ request: request.body, response: response?.body })
      ).to.eq(200);
    });
    cy.wait('@getStatus');
    cy.get('[data-testid=modal-title]').should(
      'contain',
      'Server Restart Required'
    );

    cy.get('[data-testid=modal-ok-button]').click();
    cy.get('[data-testid=modal-root]').should('not.exist');

    cy.get('button#trustProxy').scrollIntoView().should('be.visible').click();
    cy.get('[data-testid=settings-network-form]').submit();
    cy.wait('@saveNetwork');
    cy.wait('@getStatus');
    cy.get('[data-testid=modal-title]').should('not.exist');
  });
});
