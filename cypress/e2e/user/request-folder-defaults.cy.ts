describe('Per-user request destination folders', () => {
  const folderSelect = 'select[id="request-folder-radarr:1"]';

  beforeEach(() => {
    cy.loginAsAdmin();
    cy.request('/api/v1/auth/me').then(({ body }) =>
      cy.request('POST', `/api/v1/user/${body.id}/settings/interface-theme`, {
        theme: 'seerrNGJ',
      })
    );

    cy.intercept('GET', '/api/v1/service/radarr', {
      body: [{ id: 1, name: 'Main Radarr' }],
    });
    cy.intercept('GET', '/api/v1/service/radarr/1', {
      body: {
        server: {
          id: 1,
          name: 'Main Radarr',
          is4k: false,
          isDefault: true,
          activeProfileId: 1,
          activeDirectory: '/media/Movies',
          activeTags: [],
        },
        profiles: [{ id: 1, name: 'HD-1080p' }],
        rootFolders: [
          { id: 1, path: '/media/Movies', freeSpace: 1000000000 },
          { id: 2, path: '/media/Movies/David', freeSpace: 1000000000 },
        ],
        tags: [],
      },
    });
    for (const service of ['sonarr', 'lidarr', 'readarr']) {
      cy.intercept('GET', `/api/v1/service/${service}`, { body: [] });
    }
    cy.intercept('GET', '/api/v1/service/comic', { body: [] });
    cy.intercept('POST', '/api/v1/user/*/settings/main').as('saveUserSettings');

    cy.visit('/profile/settings/main');
    cy.contains('label', 'Default Request Folders')
      .scrollIntoView()
      .should('be.visible');
  });

  it('saves a user-named folder, stays usable on narrow screens, and clears to the service default', () => {
    cy.get(folderSelect)
      .should('be.visible')
      .select('/media/Movies/David')
      .should('have.value', '/media/Movies/David');
    cy.get(folderSelect).scrollIntoView();
    cy.screenshot('request-folder-defaults-desktop', {
      capture: 'viewport',
    });

    cy.viewport(390, 844);
    cy.get(folderSelect)
      .scrollIntoView()
      .should('be.visible')
      .and('have.value', '/media/Movies/David');
    cy.scrollTo('bottom');
    cy.get(folderSelect).should('be.visible');
    cy.screenshot('request-folder-defaults-mobile', { capture: 'viewport' });

    cy.contains('button', 'Save Changes').click();
    cy.wait('@saveUserSettings').then(({ request, response }) => {
      expect(response?.statusCode).to.eq(200);
      expect(request.body.requestRootFolders).to.deep.equal({
        'radarr:1': '/media/Movies/David',
      });
    });

    cy.get(folderSelect).select('');
    cy.contains('button', 'Save Changes').click();
    cy.wait('@saveUserSettings').then(({ request, response }) => {
      expect(response?.statusCode).to.eq(200);
      expect(request.body.requestRootFolders).to.deep.equal({});
    });

    cy.reload();
    cy.get(folderSelect).should('have.value', '');
  });

  it('preselects the saved folder in the advanced request dialog', () => {
    cy.get(folderSelect).select('/media/Movies/David');
    cy.contains('button', 'Save Changes').click();
    cy.wait('@saveUserSettings').then(({ response }) => {
      expect(response?.statusCode).to.eq(200);
    });

    cy.intercept('GET', '/api/v1/user/*/settings/request-root-folders', {
      'radarr:1': '/media/Movies/David',
    }).as('getRequestRootFolders');
    cy.intercept('GET', '/api/v1/search*', {
      page: 1,
      totalPages: 1,
      totalResults: 1,
      results: [
        {
          id: 501,
          mediaType: 'movie',
          title: 'Folder Preference Movie',
          releaseDate: '2026-01-01',
          posterPath: null,
          overview: 'A movie used to verify request folder preferences.',
        },
      ],
    }).as('searchMovie');
    cy.intercept('GET', '/api/v1/movie/501', {
      id: 501,
      mediaType: 'movie',
      title: 'Folder Preference Movie',
      originalTitle: 'Folder Preference Movie',
      releaseDate: '2026-01-01',
      posterPath: null,
      backdropPath: null,
      genreIds: [],
      overview: 'A movie used to verify request folder preferences.',
    }).as('getMovie');

    cy.visit('/search?query=folder%20preference');
    cy.wait('@searchMovie');
    cy.get('[data-testid="title-card"]')
      .first()
      .trigger('mouseover')
      .within(() => cy.contains('button', 'Request').click());
    cy.wait('@getMovie');
    cy.get('[role="dialog"]').should('be.visible');
    cy.get('[role="dialog"]').contains('button', 'Advanced Options').click();
    cy.wait('@getRequestRootFolders').then(({ response }) => {
      expect(response?.statusCode).to.eq(200);
    });
    cy.get('[role="dialog"]')
      .contains('button', '/media/Movies/David')
      .should('have.attr', 'data-table-part', 'choice-row')
      .and('have.attr', 'aria-pressed', 'true');
  });

  it('shows the service default when a saved folder is no longer available', () => {
    cy.intercept('GET', '/api/v1/user/*/settings/request-root-folders', {
      'radarr:1': '/media/Movies/David',
    }).as('getRequestRootFolders');
    cy.intercept('GET', '/api/v1/search*', {
      page: 1,
      totalPages: 1,
      totalResults: 1,
      results: [
        {
          id: 501,
          mediaType: 'movie',
          title: 'Folder Preference Movie',
          releaseDate: '2026-01-01',
          posterPath: null,
          overview: 'A movie used to verify request folder preferences.',
        },
      ],
    });
    cy.intercept('GET', '/api/v1/movie/501', {
      id: 501,
      mediaType: 'movie',
      title: 'Folder Preference Movie',
      originalTitle: 'Folder Preference Movie',
      releaseDate: '2026-01-01',
      posterPath: null,
      backdropPath: null,
      genreIds: [],
      overview: 'A movie used to verify request folder preferences.',
    });
    cy.intercept('GET', '/api/v1/service/radarr/1', {
      body: {
        server: {
          id: 1,
          name: 'Main Radarr',
          is4k: false,
          isDefault: true,
          activeProfileId: 1,
          activeDirectory: '/media/Movies',
          activeTags: [],
        },
        profiles: [{ id: 1, name: 'HD-1080p' }],
        rootFolders: [{ id: 1, path: '/media/Movies', freeSpace: 1000000000 }],
        tags: [],
      },
    });

    cy.visit('/search?query=folder%20preference');
    cy.get('[data-testid="title-card"]')
      .first()
      .trigger('mouseover')
      .within(() => cy.contains('button', 'Request').click());
    cy.get('[role="dialog"]').contains('button', 'Advanced Options').click();
    cy.wait('@getRequestRootFolders');
    cy.get('[role="dialog"]')
      .contains('button', '/media/Movies')
      .should('have.attr', 'data-table-part', 'choice-row')
      .and('have.attr', 'aria-pressed', 'true');
  });
});
