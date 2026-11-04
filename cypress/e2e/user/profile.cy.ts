// eslint-disable-next-line no-relative-import-paths/no-relative-import-paths -- Cypress specs use deterministic local title fixtures.
import { stubTitleDetails } from '../../support/titleFixtures';

describe('User Profile', () => {
  beforeEach(() => {
    cy.loginAsAdmin();
  });

  it('opens user profile page from the home page', () => {
    cy.visit('/');

    cy.get('[data-testid=user-menu]').click();
    cy.get('[data-testid=user-menu-profile]').click();

    cy.env<{ ADMIN_EMAIL: string }>(['ADMIN_EMAIL']).then(({ ADMIN_EMAIL }) => {
      cy.get('h1').should('contain', ADMIN_EMAIL);
    });
  });

  it('opens Advanced Theme from self user settings', () => {
    cy.visit('/users/1/settings/main');

    cy.get('[data-testid=settings-nav-desktop]')
      .contains('Advanced Theme')
      .should('have.attr', 'href', '/profile/advanced-theme')
      .click();

    cy.location('pathname').should('eq', '/profile/advanced-theme');
    cy.contains('h1', 'Advanced Theme Overrides').should('be.visible');
  });

  it('loads plex watchlist', () => {
    cy.intercept('/api/v1/user/[0-9]*/watchlist*', {
      fixture: 'watchlist.json',
    }).as('getWatchlist');
    // Wait for one of the watchlist movies to resolve
    stubTitleDetails({
      id: 361743,
      mediaType: 'movie',
      title: 'Top Gun: Maverick',
      date: '2022-05-27',
    });

    cy.visit('/profile');

    cy.wait('@getWatchlist');

    // The supplied watchlist title renders a fallback card before metadata.
    // Its parent div, not the outer slider item, is TmdbTitleCard's IO target.
    const getWatchlistCard = () =>
      cy
        .contains('.slider-header', 'Watchlist')
        .closest('[data-testid=media-slider]')
        .find('[data-testid=title-card]')
        .first()
        .parent();

    getWatchlistCard().scrollIntoView();
    getWatchlistCard()
      .should('be.visible')
      .should(($observedCard) => {
        const target = $observedCard[0];
        const bounds = target.getBoundingClientRect();
        const window = target.ownerDocument.defaultView;
        if (!window) throw new Error('Watchlist card has no browsing context');
        expect(bounds.width, 'observed card width').to.be.greaterThan(0);
        expect(bounds.height, 'observed card height').to.be.greaterThan(0);
        expect(
          bounds.right,
          'observed card crosses viewport left edge'
        ).to.be.greaterThan(0);
        expect(
          bounds.bottom,
          'observed card crosses viewport top edge'
        ).to.be.greaterThan(0);
        expect(
          bounds.left,
          'observed card crosses viewport right edge'
        ).to.be.lessThan(window.innerWidth);
        expect(
          bounds.top,
          'observed card crosses viewport bottom edge'
        ).to.be.lessThan(window.innerHeight);
      });

    cy.wait('@fixtureTitleDetails')
      .its('response.statusCode')
      .should('eq', 200);

    getWatchlistCard()
      .find('[data-poster-region="frame"]')
      .trigger('mouseover');
    getWatchlistCard()
      .find('[data-poster-region="detail-link"]')
      .should('be.visible')
      .click();
    cy.location('pathname').should('eq', '/movie/361743');
    cy.get('[data-testid=media-title]').should('contain', 'Top Gun: Maverick');
  });
});
