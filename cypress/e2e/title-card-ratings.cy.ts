const ratingMovie = {
  id: 981234,
  mediaType: 'movie',
  title: 'Rating Fixture',
  releaseDate: '2025-01-01',
  posterPath: null,
  voteAverage: 8.2,
  voteCount: 1200,
};

const ratingProviderRowCount = (container: HTMLElement): number =>
  new Set(
    Array.from(container.children, (provider) =>
      Math.round(provider.getBoundingClientRect().top)
    )
  ).size;

const assertPopoverFitsViewport = () => {
  cy.get('[aria-label="Ratings for Rating Fixture"]')
    .should('be.visible')
    .then(($popover) => {
      const popover = $popover[0];
      expect(popover.scrollWidth).to.be.lte(popover.clientWidth);
      cy.window().then((window) => {
        const bounds = popover.getBoundingClientRect();
        expect(bounds.left).to.be.gte(0);
        expect(bounds.right).to.be.lte(window.innerWidth);
      });
    });
};

describe('Title card ratings', () => {
  beforeEach(() => {
    cy.loginAsAdmin();
    cy.mockConfiguredMediaAvailability({});
    cy.intercept('GET', '/api/v1/discover/movies*', {
      page: 1,
      totalPages: 1,
      totalResults: 1,
      results: [ratingMovie],
    }).as('getMovies');
    cy.intercept('GET', '/api/v1/movie/981234/ratingscombined', {
      statusCode: 200,
      body: {
        rt: {
          criticsRating: 'Fresh',
          criticsScore: 91,
          audienceRating: 'Upright',
          audienceScore: 84,
        },
        imdb: { criticsScore: 8.1, criticsScoreCount: 1200 },
      },
    }).as('getRatings');
  });

  it('waits for a sustained hover before requesting video ratings', () => {
    cy.visit('/discover/movies');
    cy.wait('@getMovies');
    cy.get('[data-testid=title-card]')
      .first()
      .as('movieCard')
      .find('[data-poster-region="frame"]')
      .as('posterFrame')
      .trigger('mouseover');

    cy.wait(100);
    cy.get('@posterFrame').trigger('mouseout');
    cy.wait(350);
    cy.get('@getRatings.all').should('have.length', 0);

    cy.get('@posterFrame').trigger('mouseover');
    cy.wait('@getRatings');
    assertPopoverFitsViewport();
    cy.get('.poster-rating-values').should(($values) => {
      expect(ratingProviderRowCount($values[0])).to.eq(1);
    });
  });

  it('shows ratings after a touch user opens a movie card', () => {
    cy.viewport(390, 844);
    cy.visit('/discover/movies', {
      onBeforeLoad(window) {
        Object.defineProperty(window, 'ontouchstart', {
          configurable: true,
          value: null,
        });
      },
    });
    cy.wait('@getMovies');

    cy.get('[data-testid=title-card]')
      .first()
      .find('[data-poster-region="frame"]')
      .click();
    cy.wait('@getRatings');
    assertPopoverFitsViewport();
    cy.get('.poster-rating-values').should(($values) => {
      expect(ratingProviderRowCount($values[0])).to.be.greaterThan(1);
    });
  });
});
