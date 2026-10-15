const BASIC_REQUEST_PERMISSION = 32;

const visitUserEditPage = (email: string): void => {
  cy.visit('/users');

  cy.contains('[data-testid=user-list-row]', email).contains('Edit').click();
};

describe('Auto Request Settings', () => {
  let temporaryUserId: number | null = null;

  beforeEach(() => {
    cy.loginAsAdmin();
  });

  afterEach(() => {
    if (temporaryUserId === null) return;
    const userId = temporaryUserId;
    temporaryUserId = null;
    return cy
      .request('DELETE', `/api/v1/user/${userId}`)
      .its('status')
      .should('eq', 200);
  });

  it('should not see watchlist sync settings on an account without permissions', () => {
    cy.env<{ USER_EMAIL: string }>(['USER_EMAIL']).then(({ USER_EMAIL }) => {
      visitUserEditPage(USER_EMAIL);
    });

    cy.contains('Auto-Request Movies').should('not.exist');
    cy.contains('Auto-Request Series').should('not.exist');
  });

  it('should see watchlist sync settings on an admin account', () => {
    cy.env<{ ADMIN_EMAIL: string }>(['ADMIN_EMAIL']).then(({ ADMIN_EMAIL }) => {
      visitUserEditPage(ADMIN_EMAIL);
    });

    cy.contains('Auto-Request Movies').should('exist');
    cy.contains('Auto-Request Series').should('exist');
  });

  it('should see auto-request settings after being given permission', () => {
    const testEmail = `auto-request-settings-${Date.now()}-${Cypress._.random(1, 999999)}@seerr.dev`;

    cy.request<{ id: number }>('POST', '/api/v1/user', {
      email: testEmail,
      password: 'test1234',
      username: 'Auto Request Settings Test',
    }).then(({ body: user }) => {
      temporaryUserId = user.id;
      cy.intercept('GET', `/api/v1/user/${user.id}`).as('fixtureUser');
      cy.intercept('GET', `/api/v1/user/${user.id}/settings/permissions`).as(
        'fixturePermissions'
      );

      return cy
        .request('POST', `/api/v1/user/${user.id}/settings/permissions`, {
          permissions: BASIC_REQUEST_PERMISSION,
        })
        .its('status')
        .should('eq', 200)
        .then(() => {
          visitUserEditPage(testEmail);
          cy.location('pathname').should('eq', `/users/${user.id}/settings`);
          cy.wait('@fixtureUser').its('response.body.id').should('eq', user.id);
        });
    });

    cy.get('[data-testid="settings-nav-desktop"]')
      .contains('Permissions')
      .click();
    cy.location('pathname').should('match', /\/settings\/permissions$/);
    cy.wait('@fixturePermissions')
      .its('response.body.permissions')
      .should('eq', BASIC_REQUEST_PERMISSION);

    cy.get('#autorequest')
      .should('be.visible')
      .and('not.be.disabled')
      .and('not.be.checked')
      .click();

    cy.intercept('POST', '/api/v1/user/*/settings/permissions').as(
      'userPermissions'
    );

    cy.contains('Save Changes').click();
    cy.wait('@userPermissions');

    cy.reload();

    cy.get('#autorequest').should('be.checked');
    cy.get('#autorequestmovies').should('be.checked');
    cy.get('#autorequesttv').should('be.checked');

    cy.get('[data-testid="settings-nav-desktop"]').contains('General').click();
    cy.location('pathname').should('match', /\/settings\/main$/);

    cy.contains('Auto-Request Movies').should('exist');
    cy.contains('Auto-Request Series').should('exist');
    let watchlistSyncMoviesAfterToggle = false;
    let watchlistSyncTvAfterToggle = false;
    cy.get('#watchlistSyncMovies').then(($checkbox) => {
      watchlistSyncMoviesAfterToggle = !$checkbox.is(':checked');
      cy.wrap($checkbox).click();
    });
    cy.get('#watchlistSyncMovies').should(($checkbox) => {
      expect($checkbox.is(':checked')).to.eq(watchlistSyncMoviesAfterToggle);
      expect($checkbox.is(':checked')).to.eq(
        !(originalUserSettings?.watchlistSyncMovies ?? false)
      );
    });
    cy.get('#watchlistSyncTv').then(($checkbox) => {
      watchlistSyncTvAfterToggle = !$checkbox.is(':checked');
      cy.wrap($checkbox).click();
    });
    cy.get('#watchlistSyncTv').should(($checkbox) => {
      expect($checkbox.is(':checked')).to.eq(watchlistSyncTvAfterToggle);
      expect($checkbox.is(':checked')).to.eq(
        !(originalUserSettings?.watchlistSyncTv ?? false)
      );
    });

    cy.intercept('POST', '/api/v1/user/*/settings/main', (request) => {
      expect(request.body.watchlistSyncMovies).to.eq(
        watchlistSyncMoviesAfterToggle
      );
      expect(request.body.watchlistSyncTv).to.eq(watchlistSyncTvAfterToggle);
      request.continue();
    }).as('userMain');
    cy.contains('Save Changes').click();
    cy.wait('@userMain').its('response.statusCode').should('eq', 200);

    cy.reload();
    cy.get('#watchlistSyncMovies').should(($checkbox) => {
      expect($checkbox.is(':checked')).to.eq(watchlistSyncMoviesAfterToggle);
    });
    cy.get('#watchlistSyncTv').should(($checkbox) => {
      expect($checkbox.is(':checked')).to.eq(watchlistSyncTvAfterToggle);
    });

    cy.get('[data-testid="settings-nav-desktop"]')
      .contains('Permissions')
      .click();
    cy.location('pathname').should('match', /\/settings\/permissions$/);

    cy.intercept('POST', '/api/v1/user/*/settings/permissions').as(
      'removeAutoRequest'
    );
    cy.get('#autorequest').should('be.checked').click();
    cy.contains('Save Changes').click();
    cy.wait('@removeAutoRequest');

    cy.reload();
    cy.get('#autorequest').should('not.be.checked');

    cy.get('[data-testid="settings-nav-desktop"]').contains('General').click();
    cy.contains('Auto-Request Movies').should('not.exist');
    cy.get('#watchlistSyncMovies').should('not.exist');
  });
});
