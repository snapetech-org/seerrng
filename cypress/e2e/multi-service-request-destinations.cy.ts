// eslint-disable-next-line no-relative-import-paths/no-relative-import-paths -- Cypress specs use deterministic local title fixtures.
import { openTitleDetailsFromSearch } from '../support/titleFixtures';

const requestServices = (services: string[]) => {
  cy.intercept('GET', '/api/v1/auth/me', (request) => {
    request.continue((response) => {
      response.body.requestServices = services;
    });
  });
};

// Chromium dispatches this ResizeObserver notification when the anchored
// Headless UI options portal opens. The menu remains interactive; keep this
// exact exception filter local to these selector tests and assert the full flow.
Cypress.on('uncaught:exception', (error) => {
  if (
    error.message.includes(
      'ResizeObserver loop completed with undelivered notifications'
    )
  ) {
    return false;
  }
  return undefined;
});

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
    cy.get(
      'button[data-testid="format-request-control"], [data-testid="format-request-control"] > button:first-child'
    )
      .filter(
        ':has([data-testid="format-request-option-standard"]), [data-testid="format-request-option-standard"]'
      )
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
  cy.get('body').then(($body) => {
    const advanced = $body
      .find('[role="dialog"] button')
      .filter((_, button) => button.textContent?.trim() === 'Advanced Options');
    if (advanced.length && advanced.attr('aria-expanded') === 'false')
      cy.wrap(advanced).click();
  });
  cy.get(`#${mediaType}-request-destination`).then(($destination) => {
    const details = $destination.closest('details:not([open])');
    if (details.length) cy.wrap(details.first()).children('summary').click();
  });
  cy.get(`#${mediaType}-request-destination`).should('be.visible');
};

describe('Per-service movie and series request destinations', () => {
  beforeEach(() => {
    cy.loginAsUser();
    requestServices(['radarr:2', 'radarr:3']);
    videoServices('radarr');
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

  for (const width of [390, 1280]) {
    it(`switches to a granted Sonarr instance at ${width}px`, () => {
      cy.viewport(width, 900);
      requestServices(['sonarr:2', 'sonarr:3']);
      videoServices('sonarr');
      openTitleDetailsFromSearch({
        id: 1399,
        mediaType: 'tv',
        title: 'Series destination fixture',
        date: '2011-04-17',
        details: {
          externalIds: { tvdbId: 121361, imdbId: 'tt0944947' },
          numberOfSeasons: 1,
          seasons: [
            {
              id: 1,
              seasonNumber: 1,
              name: 'Season 1',
              episodeCount: 10,
              airDate: '2011-04-17',
            },
          ],
        },
      });
      openRequestDialog('tv');
      cy.get('#tv-request-destination').click();
      cy.contains('[role="option"]', 'Archive (Sonarr 2)').click();
      cy.get('#tv-request-destination')
        .should('be.visible')
        .and('contain.text', 'Archive (Sonarr 2)');
      cy.get('[role="dialog"]').then(($dialog) => {
        expect($dialog[0].getBoundingClientRect().width).to.be.at.most(width);
      });
      cy.screenshot(`request-destination-series-${width}`, {
        capture: 'viewport',
      });
    });
  }

  it('shows only the granted, eligible movie destinations', () => {
    cy.viewport(1280, 900);
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

  it('keeps the destination selector usable on a narrow screen', () => {
    cy.viewport(390, 844);
    openTitleDetailsFromSearch({
      id: 438148,
      mediaType: 'movie',
      title: 'Minions: The Rise of Gru',
      date: '2022-06-29',
    });

    openRequestDialog('movie');
    cy.get('#movie-request-destination').click();
    cy.contains('[role="option"]', 'Archive (Radarr 2)').click();
    cy.get('#movie-request-destination')
      .should('be.visible')
      .and('contain.text', 'Archive (Radarr 2)');
    cy.get('[role="dialog"]').then(($dialog) => {
      expect($dialog[0].getBoundingClientRect().width).to.be.at.most(390);
    });
    cy.screenshot('request-destination-movie-mobile', {
      capture: 'viewport',
    });

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
