// eslint-disable-next-line no-relative-import-paths/no-relative-import-paths -- Cypress specs use deterministic local title fixtures.
import { openTitleDetailsFromSearch } from '../support/titleFixtures';

describe('TV Details', () => {
  it('loads a tv details page', () => {
    cy.loginAsAdmin();
    openTitleDetailsFromSearch({
      id: 66732,
      mediaType: 'tv',
      title: 'Stranger Things',
      date: '2016-07-15',
    });

    cy.get('[data-testid=media-title]').should(
      'contain',
      'Stranger Things (2016)'
    );
  });

  it('opens one request screen and chooses HD or 4K inside it without submitting', () => {
    cy.loginAsAdmin();
    let submissions = 0;
    // The disposable runtime has no Sonarr services. Supply read-only HD/4K
    // destinations so this entry/quality test does not test missing setup.
    const sonarrServers = [false, true].map((is4k, index) => ({
      id: index + 1,
      name: is4k ? 'Test Sonarr 4K' : 'Test Sonarr HD',
      is4k,
      isDefault: true,
      activeProfileId: 1,
      activeDirectory: is4k ? '/tv-4k' : '/tv',
      activeTags: [],
    }));
    cy.intercept('GET', '/api/v1/service/sonarr', sonarrServers).as(
      'sonarrDestinations'
    );
    sonarrServers.forEach((server) => {
      cy.intercept('GET', `/api/v1/service/sonarr/${server.id}`, {
        server,
        profiles: [{ id: 1, name: server.is4k ? 'Ultra HD' : 'HD' }],
        rootFolders: [{ id: 1, path: server.activeDirectory }],
        languageProfiles: [],
        tags: [],
      });
    });
    cy.intercept('POST', '/api/v1/request*', (request) => {
      submissions += 1;
      request.reply({
        statusCode: 500,
        body: { error: 'Unexpected submission' },
      });
    });
    cy.intercept('GET', '/api/v1/settings/public', (request) => {
      request.continue((response) => {
        response.body.series4kEnabled = true;
      });
    });
    openTitleDetailsFromSearch({
      id: 66732,
      mediaType: 'tv',
      title: 'Stranger Things',
      date: '2016-07-15',
      // Keep this test focused on the quality selector; a TVDB mapping skips
      // the separate search-by-name workflow in the request dialog.
      details: { mediaInfo: null, externalIds: { tvdbId: 123456 } },
    });

    cy.wait('@sonarrDestinations').its('response.statusCode').should('eq', 200);

    cy.get('[data-testid=format-request-option-standard]').should('not.exist');
    cy.contains('button', /^Request$/)
      .filter(':visible')
      .should('be.enabled')
      .click();
    cy.get('[role="dialog"]')
      .should('be.visible')
      .within(() => {
        cy.get('[role="group"][aria-label="Quality"]')
          .contains('button', /^HD$/)
          .should('be.visible')
          .and('have.attr', 'aria-pressed', 'true');
        cy.get('[role="group"][aria-label="Quality"]')
          .contains('button', /^4K$/)
          .should('be.enabled')
          .click();
        cy.get('[role="group"][aria-label="Quality"]')
          .contains('button', /^4K$/)
          .should('have.attr', 'aria-pressed', 'true');
        cy.get('[role="group"][aria-label="Quality"]')
          .contains('button', /^HD$/)
          .click()
          .should('have.attr', 'aria-pressed', 'true');
      });
    cy.then(() =>
      expect(
        submissions,
        'screen entry and quality choices do not submit'
      ).to.eq(0)
    );
  });

  it('hides the playback quality selector when 4K is not configured', () => {
    cy.loginAsAdmin();
    cy.intercept('GET', '/api/v1/settings/public', (request) => {
      request.continue((response) => {
        response.body.series4kEnabled = false;
      });
    });
    openTitleDetailsFromSearch({
      id: 66732,
      mediaType: 'tv',
      title: 'Stranger Things',
      date: '2016-07-15',
    });

    cy.get('[aria-label^="Quality:"]').should('not.exist');
  });

  it('shows seasons and expands episodes', () => {
    cy.loginAsAdmin();

    cy.intercept('GET', '/api/v1/tv/66732/season/*', (request) => {
      const seasonNumber = Number(
        new URL(request.url).pathname.split('/').pop()
      );
      const episodes =
        seasonNumber === 4
          ? Array.from({ length: 9 }, (_, index) => ({
              id: 900 + index,
              name: index === 8 ? 'Chapter Nine' : `Episode ${index + 1}`,
              airDate: null,
              episodeNumber: index + 1,
              overview: '',
              productionCode: '',
              seasonNumber,
              showId: 66732,
              voteAverage: 0,
              voteCount: 0,
            }))
          : [];
      const response = {
        airDate: '',
        id: 400 + seasonNumber,
        name: `Season ${seasonNumber}`,
        overview: '',
        seasonNumber,
        episodes,
        externalIds: {},
      };

      if (seasonNumber === 4) {
        request.alias = 'season4';
      }
      request.reply({ body: response });
    });
    openTitleDetailsFromSearch({
      id: 66732,
      mediaType: 'tv',
      title: 'Stranger Things',
      date: '2016-07-15',
      details: {
        seasons: [
          {
            id: 404,
            name: 'Season 4',
            seasonNumber: 4,
            episodeCount: 9,
            airDate: '2022-05-27',
          },
        ],
      },
    });
    cy.get('button[aria-controls="series-media-server-panel"]')
      .should('be.visible')
      .then(($button) => {
        if ($button.attr('aria-expanded') !== 'true') cy.wrap($button).click();
      });
    cy.get('#series-media-server-panel').should('be.visible');
    cy.get('#series-media-server-panel [data-selection-tree]').should('exist');
    cy.get('button[aria-label="Expand Season 04"]').should('be.visible');
    cy.wait('@season4').its('response.statusCode').should('eq', 200);

    cy.get('button[aria-label="Expand Season 04"]')
      .should('be.visible')
      .and('have.attr', 'aria-expanded', 'false')
      .scrollIntoView()
      .click();
    cy.get('button[aria-label="Collapse Season 04"]').should(
      'have.attr',
      'aria-expanded',
      'true'
    );

    cy.get('[data-tree-part="episodes"][aria-label="Season 04 episodes"]')
      .should('be.visible')
      .contains('[data-tree-part="name"]', 'Chapter Nine')
      .scrollIntoView()
      .should('be.visible');
  });
});
