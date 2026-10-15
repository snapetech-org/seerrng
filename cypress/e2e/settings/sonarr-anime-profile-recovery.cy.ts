const sonarrSettings = {
  id: 4,
  name: 'Sonarr test',
  hostname: 'sonarr.example.test',
  port: 8989,
  apiKey: 'test-key',
  useSsl: false,
  baseUrl: '',
  activeProfileId: 1,
  activeProfileName: 'Standard profile',
  activeDirectory: '/tv',
  tags: [],
  is4k: false,
  isDefault: true,
  externalUrl: '',
  syncEnabled: false,
  preventSearch: true,
  tagRequests: false,
  overrideRule: [],
  seriesType: 'standard' as const,
  animeSeriesType: 'anime' as const,
  activeAnimeProfileId: 2,
  activeAnimeProfileName: 'Anime profile',
  activeAnimeDirectory: '/anime',
  animeTags: [],
  enableSeasonFolders: true,
  monitorNewItems: 'all' as const,
};

const openSonarrSettings = () => {
  cy.contains('.settings-service-title', 'Sonarr test')
    .closest('li')
    .within(() => {
      cy.contains('button', 'Edit').click();
    });
};

describe('Sonarr anime profile recovery', () => {
  beforeEach(() => {
    cy.loginAsAdmin();
    cy.intercept('GET', '/api/v1/settings/sonarr', {
      body: [sonarrSettings],
    }).as('sonarrSettings');
  });

  it('shows the configured anime profile and allows an existing server to be saved offline', () => {
    cy.intercept('POST', '/api/v1/settings/sonarr/test', {
      statusCode: 500,
      body: { message: 'Failed to connect to Sonarr' },
    }).as('testSonarrOffline');
    cy.intercept('PUT', '/api/v1/settings/sonarr/4', (request) => {
      expect(request.body.activeProfileName).to.equal('Standard profile');
      expect(request.body.activeAnimeProfileName).to.equal('Anime profile');
      request.reply({ statusCode: 200, body: sonarrSettings });
    }).as('saveSonarrOffline');

    cy.visit('/settings/services');
    cy.wait('@sonarrSettings');
    cy.contains('.settings-service-title', 'Sonarr test')
      .closest('li')
      .within(() => {
        cy.contains('dt', 'Active Anime Profile').should('be.visible');
        cy.contains('dd', 'Anime profile').should('be.visible');
      });

    openSonarrSettings();
    cy.wait('@testSonarrOffline');
    cy.get('[role="dialog"]')
      .contains('button', 'Save')
      .should('be.enabled')
      .click();
    cy.wait('@saveSonarrOffline').its('response.statusCode').should('eq', 200);
  });

  it('shows a clear message when a reachable Sonarr rejects a missing anime profile', () => {
    cy.intercept('POST', '/api/v1/settings/sonarr/test', {
      statusCode: 200,
      body: {
        profiles: [{ id: 1, name: 'Standard profile' }],
        rootFolders: [{ id: 1, path: '/tv' }],
        languageProfiles: null,
        tags: [],
        urlBase: '',
      },
    }).as('testSonarr');
    cy.intercept('PUT', '/api/v1/settings/sonarr/4', {
      statusCode: 422,
      body: {
        message:
          'The selected anime quality profile does not exist on this Sonarr server.',
      },
    }).as('saveSonarrMissingAnimeProfile');

    cy.visit('/settings/services');
    cy.wait('@sonarrSettings');
    openSonarrSettings();
    cy.wait('@testSonarr');
    cy.get('[role="dialog"]').contains('button', 'Save').click();
    cy.wait('@saveSonarrMissingAnimeProfile');
    cy.contains(
      'The selected anime quality profile does not exist on this Sonarr server.'
    ).should('be.visible');
  });
});
