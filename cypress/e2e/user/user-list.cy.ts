const testUser = {
  username: 'Test User',
  emailAddress: 'test@seeerr.dev',
  password: 'test1234',
};

describe('User List', () => {
  beforeEach(() => {
    cy.loginAsAdmin();
  });

  it('opens the user list from the home page', () => {
    cy.visit('/');

    cy.get('[data-testid=sidebar-toggle]').click();
    cy.get('[data-testid=sidebar-menu-users-mobile]').click();

    cy.get('[data-testid=page-header]').should('contain', 'User List');
  });

  it('can find the admin user and friend user in the user list', () => {
    cy.visit('/users');

    cy.env<{ ADMIN_EMAIL: string; USER_EMAIL: string }>([
      'ADMIN_EMAIL',
      'USER_EMAIL',
    ]).then(({ ADMIN_EMAIL, USER_EMAIL }) => {
      cy.get('[data-testid=user-list-row]').contains(ADMIN_EMAIL);
      cy.get('[data-testid=user-list-row]').contains(USER_EMAIL);
    });
  });

  it('can create a local user', () => {
    cy.visit('/users');

    cy.contains('Create Local User').click();

    cy.get('[data-testid=modal-title]').should('contain', 'Create Local User');

    cy.get('#username').type(testUser.username);
    cy.get('#email').type(testUser.emailAddress);
    cy.get('#password').type(testUser.password);

    cy.intercept('/api/v1/user*').as('user');

    cy.get('[data-testid=modal-ok-button]').click();

    cy.wait('@user');
    // Wait a little longer for the user list to fully re-render
    cy.wait(1000);

    cy.get('[data-testid=user-list-row]').contains(testUser.emailAddress);
  });

  it('can delete the created local test user', () => {
    cy.visit('/users');

    cy.contains('[data-testid=user-list-row]', testUser.emailAddress)
      .contains('Delete')
      .click();

    cy.get('[data-testid=modal-title]').should('contain', `Delete User`);

    cy.intercept('/api/v1/user*').as('user');

    cy.get('[data-testid=modal-ok-button]').should('contain', 'Delete').click();

    cy.wait('@user');
    cy.wait(1000);

    cy.get('[data-testid=user-list-row]')
      .contains(testUser.emailAddress)
      .should('not.exist');
  });

  it('sorts by column headers and updates request params and row order', () => {
    cy.intercept('GET', '/api/v1/user?*').as('userListFetch');

    cy.visit('/users');
    cy.wait('@userListFetch');

    cy.contains('button', 'User Name').click();
    cy.wait('@userListFetch').then((interception) => {
      const url = interception.request.url;
      expect(url).to.include('sort=displayname');
      expect(url).to.include('sortDirection=asc');
    });

    cy.get(
      '[data-testid=user-list-row] [data-testid=user-list-username-link]'
    ).then(($links) => {
      const displayNames = $links
        .toArray()
        .map((el) => (el as HTMLElement).innerText.trim().toLowerCase());
      const sortedAsc = [...displayNames].sort((a, b) => a.localeCompare(b));
      expect(displayNames).to.deep.equal(sortedAsc);
    });

    cy.contains('button', 'Joined').click();

    cy.window().then((win) => {
      const rawSettings = win.localStorage.getItem('ul-filter-settings');
      expect(
        rawSettings,
        'ul-filter-settings should be stored in localStorage'
      ).to.be.a('string');

      const settings = JSON.parse(rawSettings as string);
      expect(settings.currentSort).to.equal('created');
      expect(settings.sortDirection).to.equal('asc');
    });
  });

  it('refreshes selected linked media-server users only after opting in', () => {
    const importedUserId = '88888888888888888888888888888888';
    const newUserId = '99999999999999999999999999999999';

    cy.intercept('GET', '/api/v1/settings/public', (request) => {
      request.continue((response) => {
        // MediaServerType.JELLYFIN; keep this browser test isolated from the configured provider.
        response.body.mediaServerType = 2;
      });
    });
    cy.intercept('GET', '/api/v1/settings/jellyfin/users', {
      statusCode: 200,
      body: [
        {
          id: importedUserId,
          username: 'Linked Jellyfin User',
          thumb: '/user-icon-192x192.png',
          email: 'linked@example.com',
          isImported: true,
        },
        {
          id: newUserId,
          username: 'New Jellyfin User',
          thumb: '/user-icon-192x192.png',
          email: 'new@example.com',
          isImported: false,
        },
      ],
    }).as('jellyfinUsers');
    cy.intercept('POST', '/api/v1/user/import-from-jellyfin', {
      statusCode: 201,
      body: { createdUsers: [], refreshedUsers: 1 },
    }).as('jellyfinImport');

    cy.visit('/users');
    cy.contains('button', /Import (Jellyfin|Emby) Users/).click();
    cy.wait('@jellyfinUsers');

    cy.get('[data-testid=jellyfin-sync-existing]').should('not.be.checked');
    cy.get(`[data-testid=jellyfin-import-user-${importedUserId}]`).should(
      'not.exist'
    );
    cy.get(`[data-testid=jellyfin-import-user-${newUserId}]`).should('exist');
    cy.get(
      `[data-testid=jellyfin-import-user-${newUserId}] svg.cached-image-avatar-fallback`
    )
      .should('have.attr', 'width', '20')
      .and('have.attr', 'height', '20');
    cy.get(
      `[data-testid=jellyfin-import-user-${newUserId}] svg.cached-image-avatar-fallback`
    ).should(($icon) => {
      expect(($icon[0] as SVGSVGElement).getBoundingClientRect()).to.include({
        width: 20,
        height: 20,
      });
    });

    cy.get('[data-testid=jellyfin-sync-existing]').check();
    cy.get(
      `[data-testid=jellyfin-user-import-status-${importedUserId}]`
    ).should('contain', 'Already Imported');
    cy.get(
      `[data-testid=jellyfin-import-user-${importedUserId}] svg.cached-image-avatar-fallback`
    )
      .should('have.attr', 'width', '20')
      .and('have.attr', 'height', '20');
    cy.get(
      `[data-testid=jellyfin-import-user-${importedUserId}] svg.cached-image-avatar-fallback`
    ).should(($icon) => {
      expect(($icon[0] as SVGSVGElement).getBoundingClientRect()).to.include({
        width: 20,
        height: 20,
      });
    });
    cy.get(`[data-testid=jellyfin-select-user-${importedUserId}]`).click();
    cy.get('[data-testid=modal-ok-button]').click();

    cy.wait('@jellyfinImport').then(({ request }) => {
      expect(request.body).to.deep.equal({
        jellyfinUserIds: [importedUserId],
        syncExisting: true,
      });
    });
  });
});
