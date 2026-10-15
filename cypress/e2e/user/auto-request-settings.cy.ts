const BASIC_REQUEST_PERMISSION = 32;

const visitUserEditPage = (email: string): void => {
  cy.visit('/users');

  cy.contains('[data-testid=user-list-row]', email).contains('Edit').click();
};

describe('Auto Request Settings', () => {
  let fixtureUserId: number | null = null;
  let originalPermissions: number | null = null;
  let originalUserSettings: {
    watchlistSyncMovies?: boolean | null;
    watchlistSyncTv?: boolean | null;
    watchlistSyncMusic?: boolean | null;
    watchlistSyncBooks?: boolean | null;
    watchlistSyncComics?: boolean | null;
    watchlistSyncMagazines?: boolean | null;
  } | null = null;

  beforeEach(() => {
    cy.loginAsAdmin();
  });

  afterEach(() => {
    if (fixtureUserId === null || originalPermissions === null) return;
    const userId = fixtureUserId;
    const permissions = originalPermissions;
    const userSettings = originalUserSettings;
    fixtureUserId = null;
    originalPermissions = null;
    originalUserSettings = null;
    return cy
      .request('POST', `/api/v1/user/${userId}/settings/permissions`, {
        permissions,
      })
      .its('status')
      .should('eq', 200)
      .then(() => {
        if (userSettings === null) return;
        return cy
          .request('POST', `/api/v1/user/${userId}/settings/main`, {
            watchlistSyncMovies: userSettings.watchlistSyncMovies ?? null,
            watchlistSyncTv: userSettings.watchlistSyncTv ?? null,
            watchlistSyncMusic: userSettings.watchlistSyncMusic ?? null,
            watchlistSyncBooks: userSettings.watchlistSyncBooks ?? null,
            watchlistSyncComics: userSettings.watchlistSyncComics ?? null,
            watchlistSyncMagazines: userSettings.watchlistSyncMagazines ?? null,
          })
          .its('status')
          .should('eq', 200);
      });
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
    cy.env<{ ADMIN_EMAIL: string; USER_EMAIL: string }>([
      'ADMIN_EMAIL',
      'USER_EMAIL',
    ]).then(({ ADMIN_EMAIL, USER_EMAIL }) => {
      return cy
        .request<{ results: { id: number; email: string }[] }>(
          '/api/v1/user?take=100'
        )
        .then(({ body }) => {
          const user =
            body.results.find(
              (result) => result.email === USER_EMAIL && result.id !== 1
            ) ??
            body.results.find(
              (result) => result.email === ADMIN_EMAIL && result.id !== 1
            );

          if (!user) {
            throw new Error(
              `Could not find the seeded Plex user ${USER_EMAIL} or ${ADMIN_EMAIL}`
            );
          }

          return cy
            .request<{ permissions: number }>(
              `/api/v1/user/${user.id}/settings/permissions`
            )
            .then(({ body: permissionData }) => {
              return cy
                .request<{
                  watchlistSyncMovies?: boolean | null;
                  watchlistSyncTv?: boolean | null;
                  watchlistSyncMusic?: boolean | null;
                  watchlistSyncBooks?: boolean | null;
                  watchlistSyncComics?: boolean | null;
                  watchlistSyncMagazines?: boolean | null;
                }>(`/api/v1/user/${user.id}/settings/main`)
                .then(({ body: settings }) => {
                  fixtureUserId = user.id;
                  originalPermissions = permissionData.permissions;
                  originalUserSettings = {
                    watchlistSyncMovies: settings.watchlistSyncMovies,
                    watchlistSyncTv: settings.watchlistSyncTv,
                    watchlistSyncMusic: settings.watchlistSyncMusic,
                    watchlistSyncBooks: settings.watchlistSyncBooks,
                    watchlistSyncComics: settings.watchlistSyncComics,
                    watchlistSyncMagazines: settings.watchlistSyncMagazines,
                  };
                  cy.intercept('GET', `/api/v1/user/${user.id}`).as(
                    'fixtureUser'
                  );
                  cy.intercept(
                    'GET',
                    `/api/v1/user/${user.id}/settings/permissions`
                  ).as('fixturePermissions');

                  return cy.request(
                    'POST',
                    `/api/v1/user/${user.id}/settings/permissions`,
                    { permissions: BASIC_REQUEST_PERMISSION }
                  );
                });
            })
            .its('status')
            .should('eq', 200)
            .then(() => {
              visitUserEditPage(USER_EMAIL);
              cy.location('pathname').should(
                'eq',
                `/users/${user.id}/settings`
              );
              cy.wait('@fixtureUser')
                .its('response.body.id')
                .should('eq', user.id);
            });
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
