// eslint-disable-next-line no-relative-import-paths/no-relative-import-paths -- Cypress specs use deterministic local title fixtures.
import { openTitleDetailsFromSearch } from '../support/titleFixtures';

describe('Movie Details', () => {
  it('loads a movie page', () => {
    cy.loginAsAdmin();
    openTitleDetailsFromSearch({
      id: 438148,
      mediaType: 'movie',
      title: 'Minions: The Rise of Gru',
      date: '2022-06-29',
    });

    cy.get('[data-testid=media-title]').should(
      'contain',
      'Minions: The Rise of Gru (2022)'
    );
  });

  it('lets a signed-in user follow and unfollow availability at desktop and narrow widths', () => {
    cy.loginAsAdmin();
    let following = false;
    const subscriptionPath =
      '/api/v1/user/1/availability-subscriptions/movie/438148';
    cy.intercept('GET', subscriptionPath, (request) => {
      request.reply({
        body: { subscribed: following, canSubscribe: true },
      });
    }).as('availabilitySubscriptionState');
    cy.intercept('POST', subscriptionPath, (request) => {
      following = true;
      request.reply({
        body: { subscribed: true, canSubscribe: true },
      });
    }).as('followAvailability');
    cy.intercept('DELETE', subscriptionPath, (request) => {
      following = false;
      request.reply({ statusCode: 204 });
    }).as('unfollowAvailability');
    cy.viewport(1440, 900);
    openTitleDetailsFromSearch({
      id: 438148,
      mediaType: 'movie',
      title: 'Minions: The Rise of Gru',
      date: '2022-06-29',
    });

    cy.wait('@availabilitySubscriptionState');
    cy.get('button[aria-label="Notify Me When Available"]')
      .should('be.visible')
      .and('have.attr', 'aria-pressed', 'false')
      .then(($button) => {
        const bounds = $button[0].getBoundingClientRect();
        expect(bounds.left).to.be.greaterThan(0);
        expect(bounds.right).to.be.lessThan(1440);
      });
    cy.screenshot('media-availability-subscription-desktop');

    cy.viewport(390, 844);
    cy.get('button[aria-label="Notify Me When Available"]')
      .should('be.visible')
      .then(($button) => {
        const bounds = $button[0].getBoundingClientRect();
        expect(bounds.left).to.be.greaterThan(0);
        expect(bounds.right).to.be.lessThan(390);
      });
    cy.screenshot('media-availability-subscription-narrow');

    cy.get('button[aria-label="Notify Me When Available"]').click();
    cy.wait('@followAvailability');
    cy.get('button[aria-label="Stop Availability Notifications"]')
      .should('be.visible')
      .and('have.attr', 'aria-pressed', 'true');

    cy.get('button[aria-label="Stop Availability Notifications"]').click();
    cy.wait('@unfollowAvailability');
    cy.get('button[aria-label="Notify Me When Available"]')
      .should('be.visible')
      .and('have.attr', 'aria-pressed', 'false');
  });

  it('shows standard and 4K requests in one segmented control', () => {
    cy.loginAsAdmin();
    cy.intercept('GET', '/api/v1/settings/public', (request) => {
      request.continue((response) => {
        response.body.movie4kEnabled = true;
      });
    });
    openTitleDetailsFromSearch({
      id: 438148,
      mediaType: 'movie',
      title: 'Minions: The Rise of Gru',
      date: '2022-06-29',
    });

    cy.get('[data-testid=format-request-option-standard]')
      .filter(':visible')
      .last()
      .then(($standardButton) => {
        cy.get('[data-testid=format-request-option-4k]')
          .filter(':visible')
          .last()
          .should('be.visible')
          .then(($fourKButton) => {
            expect(
              $fourKButton[0].getBoundingClientRect().left
            ).to.be.greaterThan(
              $standardButton[0].getBoundingClientRect().left
            );
          });
      });
  });

  it('hides the 4K request action without 4K request permission', () => {
    cy.loginAsUser();
    cy.intercept('GET', '/api/v1/settings/public', (request) => {
      request.continue((response) => {
        response.body.movie4kEnabled = true;
      });
    });
    openTitleDetailsFromSearch({
      id: 438148,
      mediaType: 'movie',
      title: 'Minions: The Rise of Gru',
      date: '2022-06-29',
    });

    cy.get('[data-testid=format-request-option-standard]').should('be.visible');
    cy.get('[data-testid=format-request-option-4k]').should('not.exist');
  });

  it('opens a single-quality request from anywhere on the request button', () => {
    cy.loginAsAdmin();
    cy.intercept('GET', '/api/v1/settings/public', (request) => {
      request.continue((response) => {
        response.body.movie4kEnabled = false;
      });
    });
    cy.intercept('GET', '/api/v1/service/radarr', [
      {
        id: 1,
        name: 'Test Radarr',
        is4k: false,
        isDefault: true,
        activeProfileId: 1,
        activeDirectory: '/movies',
        activeTags: [],
      },
    ]);
    openTitleDetailsFromSearch({
      id: 438148,
      mediaType: 'movie',
      title: 'Minions: The Rise of Gru',
      date: '2022-06-29',
    });

    cy.get('[data-testid=format-request-control]')
      .filter(':has([data-testid="format-request-option-standard"])')
      .first()
      .should('be.visible')
      .and('be.enabled')
      .click('left');

    cy.get('[role="dialog"]').should('be.visible');
    cy.get('[role="dialog"]').should('contain.text', 'Movie · HD');
  });

  it('keeps unavailable management visible but disabled with an explanation', () => {
    cy.loginAsAdmin();
    openTitleDetailsFromSearch({
      id: 438148,
      mediaType: 'movie',
      title: 'Minions: The Rise of Gru',
      date: '2022-06-29',
    });
    cy.get('button[aria-label="Manage Movie"]')
      .should('be.visible')
      .and('be.disabled')
      .and(
        'have.attr',
        'data-disabled-reason',
        'This title must be added to a media service before it can be managed.'
      );
    cy.get('button[aria-label="Close panel"]').should('not.exist');
  });
});
