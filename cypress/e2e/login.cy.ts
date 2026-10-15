describe('Login Page', () => {
  it('succesfully logs in as an admin', () => {
    cy.loginAsAdmin();
    cy.visit('/');
    cy.contains('Trending');
  });

  it('succesfully logs in as a local user', () => {
    cy.loginAsUser();
    cy.visit('/');
    cy.contains('Trending');
  });

  it('returns to the requested path, query, and section after login', () => {
    cy.visit('/settings/services?settingsSearchTarget=prowlarr#prowlarr');
    cy.location('pathname').should('eq', '/login');

    cy.env<{ ADMIN_EMAIL: string; ADMIN_PASSWORD: string }>([
      'ADMIN_EMAIL',
      'ADMIN_PASSWORD',
    ]).then(({ ADMIN_EMAIL, ADMIN_PASSWORD }) => {
      cy.get('[data-testid=email]').type(ADMIN_EMAIL);
      cy.get('[data-testid=password]').type(ADMIN_PASSWORD);
      cy.get('[data-testid=local-signin-button]').click();
    });

    cy.location('pathname').should('eq', '/settings/services');
    cy.location('search').should('eq', '?settingsSearchTarget=prowlarr');
    cy.location('hash').should('eq', '#prowlarr');
  });

  it('returns an already signed-in user to the saved destination', () => {
    cy.loginAsAdmin();
    cy.visit(
      '/login?returnTo=%2Fsettings%2Fservices%3FsettingsSearchTarget%3Dprowlarr%23prowlarr'
    );

    cy.location('pathname').should('eq', '/settings/services');
    cy.location('search').should('eq', '?settingsSearchTarget=prowlarr');
    cy.location('hash').should('eq', '#prowlarr');
  });

  it('signs out to a clean login page without a return destination', () => {
    cy.loginAsAdmin();
    cy.visit('/settings/services?settingsSearchTarget=prowlarr#prowlarr');
    cy.get('[data-testid=user-menu]').click();
    cy.contains('Sign Out').click();

    cy.location('pathname').should('eq', '/login');
    cy.location('search').should('eq', '');
    cy.location('hash').should('eq', '');
  });
});
