describe('service setup categories', () => {
  beforeEach(() => {
    cy.loginAsAdmin();
  });

  it('shows only the selected category and keeps the choice in the URL', () => {
    cy.intercept('GET', '/api/v1/settings/readarr', []);
    cy.visit('/settings/services');

    cy.get('[data-settings-category="tv-movies"]')
      .should('be.visible')
      .and('contain', 'Radarr Settings');
    cy.get('[data-settings-category="audiobooks-books"]').should(
      'not.be.visible'
    );
    cy.get('[data-settings-category="music"]').should('not.be.visible');
    cy.get('[data-settings-category="tools-other"]').should('not.be.visible');

    cy.contains('button[aria-pressed="false"]', 'Music').click();
    cy.location('search').should('eq', '?serviceCategory=music');
    cy.get('[data-settings-category="music"]')
      .should('be.visible')
      .and('contain', 'Lidarr Settings')
      .and('contain', 'Navidrome Availability')
      .and('contain', 'Configure Spotify playlist access');
    cy.get('#slskdn-enabled').should('be.visible');
    cy.get('[data-settings-category="tv-movies"]').should('not.be.visible');

    cy.reload();
    cy.get('[data-settings-category="music"]').should('be.visible');

    cy.contains('button[aria-pressed="false"]', 'Audiobooks & Books').click();
    cy.location('search').should('eq', '?serviceCategory=audiobooks-books');
    cy.get('[data-settings-category="audiobooks-books"]')
      .should('be.visible')
      .and('contain', 'Book Acquisition Services')
      .and('contain', 'Connect ChaptarrNG, BookshelfNG')
      .and('contain', 'No variable is needed on the SeerrNG container')
      .and('contain', 'Add ChaptarrNG Server')
      .and('contain', 'Reader Apps')
      .and('contain', 'Audiobookshelf Availability')
      .and('contain', 'Connect Audiobookshelf library');

    cy.contains('button', 'Add ChaptarrNG Server').click();
    cy.contains('[data-testid=modal-title]', 'Add ChaptarrNG Server').should(
      'exist'
    );
    cy.get('[role="dialog"]')
      .contains('CHAPTARR__AUTH__SEERRAPIKEY')
      .should('exist');
    cy.get('[data-testid=modal-cancel-button]').click();

    cy.contains('button[aria-pressed="false"]', 'System').click();
    cy.location('search').should('eq', '?serviceCategory=tools-other');
    cy.get('[data-settings-category="tools-other"]')
      .should('be.visible')
      .and('contain', 'Connect your apps');
    cy.get('#prowlarr').should('not.exist');
    cy.contains('section.app-card-sub', 'Live Download Progress').should(
      'be.visible'
    );
    cy.contains('section.app-card-sub', 'Swipe Discovery').should('be.visible');
    cy.get('[data-settings-category="audiobooks-books"]').should(
      'not.be.visible'
    );
  });

  it('opens Prowlarr from Settings search and preserves existing Prowlarr links', () => {
    cy.visit('/settings/services');
    cy.get('input[aria-label="Search Settings"]').type('Prowlarr{enter}');

    cy.location('pathname').should('eq', '/settings/prowlarr');
    cy.get('#prowlarr-settings-title').should('be.visible');
    cy.get('.settings-page-navigation-row nav a[href="/settings/prowlarr"]')
      .should('contain', 'Prowlarr')
      .next()
      .should('contain', 'Metadata Providers');

    cy.visit('/settings/services?settingsSearchTarget=prowlarr#prowlarr');
    cy.location('pathname').should('eq', '/settings/prowlarr');
    cy.get('#prowlarr-settings-title').should('be.visible');

    cy.visit('/settings/services#prowlarr');
    cy.location('pathname').should('eq', '/settings/prowlarr');
    cy.get('#prowlarr-settings-title').should('be.visible');

    cy.visit('/settings/services');
    cy.get('input[aria-label="Search Settings"]').type('Navidrome{enter}');
    cy.get('[data-settings-category="music"]').should('be.visible');
    cy.location('search').should('eq', '?serviceCategory=music');
    cy.get('[data-settings-category="tools-other"]').should('not.be.visible');
  });

  it('keeps Whisparr setup available when its saved server list fails to load', () => {
    let attempts = 0;
    cy.intercept('GET', '/api/v1/settings/whisparr', (request) => {
      attempts += 1;
      request.reply(
        attempts === 1
          ? {
              delay: 1000,
              statusCode: 503,
              body: { error: 'Temporary settings failure.' },
            }
          : { delay: 1000, statusCode: 200, body: [] }
      );
    }).as('whisparrSettings');
    cy.intercept('POST', '/api/v1/settings/whisparr/test', {
      statusCode: 200,
      body: {
        profiles: [{ id: 1, name: 'Default' }],
        rootFolders: [{ id: 1, path: '/media/adult' }],
        tags: [],
      },
    }).as('whisparrTest');

    cy.visit('/settings/services?serviceCategory=tv-movies');
    cy.contains('button', 'Connect Whisparr Server').should('not.exist');
    cy.wait('@whisparrSettings').its('response.statusCode').should('eq', 503);

    cy.get('[data-settings-category="tv-movies"]')
      .contains('h3', 'Whisparr Settings')
      .scrollIntoView()
      .should('be.visible');
    cy.contains('Whisparr server settings could not be loaded.')
      .scrollIntoView()
      .should('be.visible');
    cy.contains(
      'Retry to check saved connections before adding another server.'
    ).should('be.visible');
    cy.contains(
      'SeerrNG returned HTTP 503 while loading Whisparr settings.'
    ).should('be.visible');
    cy.contains('button', 'Connect Whisparr Server')
      .scrollIntoView()
      .should('be.visible');

    cy.contains('button', 'Retry').click();
    cy.contains('button', 'Connect Whisparr Server').should('not.exist');
    cy.wait('@whisparrSettings').its('response.statusCode').should('eq', 200);
    cy.contains(
      'No Whisparr servers are connected. Connect one to enable the Adult category.'
    ).should('be.visible');

    cy.viewport(390, 640);
    cy.contains('button', 'Connect Whisparr Server')
      .scrollIntoView()
      .should('be.visible')
      .click();
    cy.get('[role="dialog"]')
      .should('have.attr', 'aria-modal', 'true')
      .and('contain', 'Connect Whisparr')
      .within(() => {
        cy.get('#name').type('Adult Library');
        cy.get('#hostname').type('whisparr.local');
        cy.get('#port').clear().type('6969');
        cy.get('#apiKey').type('test-api-key');
        cy.contains('button', 'Test').click();
      });
    cy.wait('@whisparrTest').its('response.statusCode').should('eq', 200);
    cy.get('[role="dialog"] #activeProfileId').select('1');
    cy.get('[role="dialog"] #rootFolder').select('/media/adult');
    cy.get('[role="dialog"] [data-testid="modal-ok-button"]').should(
      'be.enabled'
    );
    cy.document().then((document) => {
      expect(document.documentElement.scrollWidth).to.be.at.most(
        document.documentElement.clientWidth + 1
      );
    });
  });

  it('keeps the category chooser usable on a narrow screen', () => {
    cy.viewport(390, 640);
    cy.visit('/settings/services');

    cy.get('nav[aria-label="Service categories"] button').should(
      'have.length',
      4
    );
    cy.document().then((document) => {
      expect(document.documentElement.scrollWidth).to.be.at.most(
        document.documentElement.clientWidth + 1
      );
    });

    cy.contains('button[aria-pressed="false"]', 'Audiobooks & Books').click();
    cy.get('[data-settings-category="audiobooks-books"]').should('be.visible');
    cy.document().then((document) => {
      expect(document.documentElement.scrollWidth).to.be.at.most(
        document.documentElement.clientWidth + 1
      );
    });
  });
});
