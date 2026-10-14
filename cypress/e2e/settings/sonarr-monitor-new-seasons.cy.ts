describe('Sonarr future-season monitoring settings', () => {
  beforeEach(() => {
    cy.loginAsAdmin();
    cy.intercept('GET', '/api/v1/settings/sonarr', []).as('getSonarrSettings');
  });

  it('offers the latest-requested monitoring mode after a connection test', () => {
    cy.viewport(1280, 900);
    cy.intercept('POST', '/api/v1/settings/sonarr/test', {
      statusCode: 200,
      body: {
        profiles: [{ id: 1, name: 'HD' }],
        rootFolders: [{ id: 1, path: '/tv' }],
        tags: [],
        languageProfiles: null,
        urlBase: '',
      },
    }).as('testSonarr');

    cy.visit('/settings/services');
    cy.wait('@getSonarrSettings');
    cy.contains('button', 'Add Sonarr Server').click();
    cy.get('#name').type('Test Sonarr');
    cy.get('#hostname').type('sonarr.example');
    cy.get('#apiKey').type('test-api-key');
    cy.get('[data-testid="modal-root"]').contains('button', 'Test').click();
    cy.wait('@testSonarr');

    cy.get('#monitorNewItems').should('be.enabled');
    cy.get('#monitorNewItems option').should('have.length', 3);
    cy.get('#monitorNewItems option[value="latest"]').should(
      'have.text',
      'Latest Season Requested'
    );
    cy.get('#monitorNewItems').select('latest').should('have.value', 'latest');

    cy.viewport(390, 844);
    cy.get('#monitorNewItems')
      .scrollIntoView()
      .should('be.visible')
      .select('none')
      .select('latest')
      .should('have.value', 'latest');
  });
});
