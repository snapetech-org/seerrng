// eslint-disable-next-line no-relative-import-paths/no-relative-import-paths -- Cypress specs use deterministic local title fixtures.
import { openTitleDetailsFromSearch } from '../support/titleFixtures';

const requestServices = (services: string[]) => {
  cy.intercept('GET', '/api/v1/auth/me', (request) => {
    request.continue((response) => {
      response.body.requestServices = services;
    });
  });
};

const videoServices = (serviceType: 'radarr' | 'sonarr') => {
  const name = serviceType === 'radarr' ? 'Radarr' : 'Sonarr';
  const service = (id: number, overrides: Record<string, unknown> = {}) => ({
    id,
    name: `${name} ${id}`,
    is4k: false,
    isDefault: id === 1,
    activeProfileId: 1,
    activeDirectory: serviceType === 'radarr' ? '/movies' : '/tv',
    activeTags: [],
    ...overrides,
  });

  cy.intercept('GET', `/api/v1/service/${serviceType}`, [
    service(1),
    service(2, { requestButtonLabel: 'Archive' }),
    service(3, {
      requestButtonLabel: 'Anime',
      requestButtonAnimeOnly: true,
    }),
  ]);
};

const openRequestDialog = (mediaType: 'movie' | 'tv') => {
  if (mediaType === 'movie') {
    cy.get('[data-testid="format-request-control"]')
      .filter(':has([data-testid="format-request-option-standard"])')
      .first()
      .should('be.visible')
      .and('be.enabled')
      .click('left');
  } else {
    cy.contains('button', /^Request$/)
      .filter(':visible')
      .should('be.enabled')
      .click();
  }
  cy.get('[role="dialog"]').should('be.visible');
  cy.get(`#${mediaType}-request-destination`).should('be.visible');
};

describe('Per-service movie and series request destinations', () => {
  beforeEach(() => {
    cy.loginAsUser();
    cy.intercept('GET', '/api/v1/user/*/settings/request-root-folders', {
      body: {},
    });
    cy.intercept('GET', '/api/v1/settings/public', (request) => {
      request.continue((response) => {
        response.body.movie4kEnabled = false;
        response.body.series4kEnabled = false;
      });
    });
  });

  it('shows only the granted, eligible movie destinations and keeps the selector usable when narrow', () => {
    requestServices(['radarr:2', 'radarr:3']);
    videoServices('radarr');
    openTitleDetailsFromSearch({
      id: 438148,
      mediaType: 'movie',
      title: 'Minions: The Rise of Gru',
      date: '2022-06-29',
    });

    openRequestDialog('movie');
    cy.get('#movie-request-destination').should(
      'contain.text',
      'Default destination (Radarr 1)'
    );
    cy.get('#movie-request-destination').click();
    cy.contains('[role="option"]', 'Archive (Radarr 2)').should('be.visible');
    cy.contains('[role="option"]', 'Anime (Radarr 3)').should('not.exist');
    cy.contains('[role="option"]', 'Archive (Radarr 2)').click();
    cy.get('#movie-request-destination').should(
      'contain.text',
      'Archive (Radarr 2)'
    );

    cy.screenshot('request-destination-movie-desktop', {
      capture: 'viewport',
    });
    cy.viewport(390, 844);
    cy.get('[role="dialog"]').should('be.visible');
    cy.get('#movie-request-destination')
      .should('be.visible')
      .and('contain.text', 'Archive (Radarr 2)');
    cy.get('[role="dialog"]').then(($dialog) => {
      expect($dialog[0].getBoundingClientRect().width).to.be.at.most(390);
    });
    cy.screenshot('request-destination-movie-mobile', {
      capture: 'viewport',
    });

    cy.viewport(1280, 900);
    cy.intercept('POST', '/api/v1/request', {
      statusCode: 201,
      body: { id: 1, media: { status: 1, status4k: 1 } },
    }).as('submitDestinationRequest');
    cy.get('[role="dialog"] [data-testid="modal-ok-button"]').click();
    cy.wait('@submitDestinationRequest').then(({ request }) => {
      expect(request.body).to.include({
        mediaType: 'movie',
        mediaId: 438148,
        requestServiceServerId: 2,
      });
      expect(request.body).not.to.have.property('serverId');
    });
  });
});
