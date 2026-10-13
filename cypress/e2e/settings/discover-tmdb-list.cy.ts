describe('Discover TMDB lists', () => {
  beforeEach(() => {
    cy.loginAsAdmin();
    cy.intercept('GET', '/api/v1/settings/discover').as('getDiscoverSliders');
  });

  it('adds a public TMDB list and browses mixed paginated results', () => {
    const firstPage = [
      {
        id: 42,
        mediaType: 'movie',
        title: 'Same ID Movie',
        releaseDate: '2024-01-01',
        posterPath: null,
        overview: '',
      },
      {
        id: 42,
        mediaType: 'tv',
        name: 'Same ID Series',
        firstAirDate: '2024-01-01',
        posterPath: null,
        overview: '',
      },
      ...Array.from({ length: 18 }, (_, index) => ({
        id: index + 5000,
        mediaType: 'movie',
        title: `List movie ${index + 1}`,
        releaseDate: '2024-01-01',
        posterPath: null,
        overview: '',
      })),
    ];
    cy.intercept('GET', '/api/v1/discover/list/0*', {
      statusCode: 404,
      body: {
        status: 404,
        message: 'TMDB list was not found or is not public.',
      },
    });
    cy.intercept('GET', '/api/v1/discover/list/1234567*', (request) => {
      const url = new URL(request.url);
      const page = Number(url.searchParams.get('page') ?? 1);
      request.reply({
        page,
        totalPages: 2,
        totalResults: 21,
        list: { name: 'Curated List', description: 'Fixture list' },
        results:
          page === 1
            ? firstPage
            : [
                {
                  id: 5018,
                  mediaType: 'movie',
                  title: 'Last list result',
                  releaseDate: '2024-01-01',
                  posterPath: null,
                  overview: '',
                },
              ],
      });
    }).as('tmdbListResults');
    cy.intercept('POST', '/api/v1/settings/discover/add').as(
      'addTmdbListSlider'
    );
    cy.intercept('DELETE', '/api/v1/settings/discover/*').as(
      'deleteTmdbListSlider'
    );

    cy.visit('/');
    cy.get('[data-testid=discover-start-editing]').click();

    const sliderTitle = `Preview List ${Date.now()}`;
    cy.get('#sliderType').select('TMDB List');
    cy.get('#title').type(sliderTitle);
    cy.get('#data').type('0');
    cy.contains(
      '[data-testid=create-discover-option-form] button',
      'Add Slider'
    ).should('be.disabled');
    cy.get('#data').clear().type('1234567');
    cy.contains('.slider-header', sliderTitle)
      .closest('[data-testid=media-slider]')
      .find('[data-testid=title-card]')
      .should('have.length.at.least', 2);
    cy.contains(
      '[data-testid=create-discover-option-form] button',
      'Add Slider'
    ).should('not.be.disabled');
    cy.get('[data-testid=create-discover-option-form]').submit();
    cy.wait('@addTmdbListSlider').its('response.statusCode').should('eq', 200);
    cy.contains('[data-testid=discover-slider-edit-mode]', sliderTitle)
      .find('[role="checkbox"]')
      .click();
    cy.get('[data-testid=discover-customize-submit]').click();
    cy.wait('@getDiscoverSliders');

    cy.contains(
      '[data-testid=media-slider] .page-heading',
      sliderTitle
    ).click();
    cy.location('pathname').should('eq', '/discover/list/1234567');
    cy.wait('@tmdbListResults');
    cy.get('[data-testid=page-header]').should('contain', 'Curated List');
    cy.get('[data-testid=title-card][data-media-type=movie]').should(
      'contain',
      'Same ID Movie'
    );
    cy.get('[data-testid=title-card][data-media-type=tv]').should(
      'contain',
      'Same ID Series'
    );
    cy.scrollTo('bottom');
    cy.contains('[data-testid=title-card]', 'Last list result').should(
      'be.visible'
    );

    cy.go('back');
    cy.get('[data-testid=discover-start-editing]').click();
    cy.contains('[data-testid=discover-slider-edit-mode]', sliderTitle)
      .find('[data-testid=discover-slider-remove-button]')
      .click();
    cy.wait('@deleteTmdbListSlider')
      .its('response.statusCode')
      .should('eq', 204);
  });
});
