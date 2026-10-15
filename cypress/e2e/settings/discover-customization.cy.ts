describe('Discover Customization', () => {
  beforeEach(() => {
    cy.loginAsAdmin();
    cy.intercept('/api/v1/settings/discover').as('getDiscoverSliders');
  });

  it('show the discover customization settings', () => {
    cy.visit('/');

    cy.get('[data-testid=discover-start-editing]').click();

    cy.get('[data-testid=create-slider-header')
      .should('contain', 'Create New Slider')
      .scrollIntoView();

    // There should be some built in options
    cy.get('[data-testid=discover-slider-edit-mode]').should(
      'contain',
      'Recently Added'
    );
    cy.get('[data-testid=discover-slider-edit-mode]').should(
      'contain',
      'Recent Requests'
    );
  });

  it('can re-order elements and save to persist the changes', () => {
    let firstTitle = '';
    let secondTitle = '';
    cy.visit('/');

    cy.get('[data-testid=discover-start-editing]').click();

    cy.get('[data-testid=discover-slider-edit-mode]')
      .eq(0)
      .find('[data-testid=discover-slider-title]')
      .invoke('text')
      .then((text) => {
        firstTitle = text.trim();
      });
    cy.get('[data-testid=discover-slider-edit-mode]')
      .eq(1)
      .find('[data-testid=discover-slider-title]')
      .invoke('text')
      .then((text) => {
        secondTitle = text.trim();
      });

    cy.get('[data-testid=discover-slider-edit-mode]')
      .first()
      .find('[data-testid=discover-slider-move-down]')
      .click();

    cy.then(() => {
      cy.get('[data-testid=discover-slider-edit-mode]')
        .eq(1)
        .find('[data-testid=discover-slider-title]')
        .should('have.text', firstTitle);
    });

    cy.get('[data-testid=discover-customize-submit').click();
    cy.wait('@getDiscoverSliders');

    cy.reload();

    cy.get('[data-testid=discover-start-editing]').click();

    cy.then(() => {
      cy.get('[data-testid=discover-slider-edit-mode]')
        .eq(1)
        .find('[data-testid=discover-slider-title]')
        .should('have.text', firstTitle);
    });

    cy.get('[data-testid=discover-slider-edit-mode]')
      .first()
      .find('[data-testid=discover-slider-move-down]')
      .click();

    cy.then(() => {
      cy.get('[data-testid=discover-slider-edit-mode]')
        .eq(1)
        .find('[data-testid=discover-slider-title]')
        .should('have.text', secondTitle);
    });

    cy.get('[data-testid=discover-customize-submit').click();
    cy.wait('@getDiscoverSliders');
  });

  it('can create a new discover option and remove it', () => {
    cy.intercept('GET', '/api/v1/search/keyword*', (request) => {
      if (request.query.query === 'invalidkeyword') {
        request.reply({
          page: 1,
          totalPages: 1,
          totalResults: 0,
          results: [],
        });
        return;
      }

      request.reply({
        page: 1,
        totalPages: 1,
        totalResults: 1,
        results: [{ id: 987654, name: 'Christmas' }],
      });
    });
    cy.intercept('GET', '/api/v1/discover/movies*', {
      page: 1,
      totalPages: 1,
      totalResults: 1,
      results: [
        {
          id: 987650,
          mediaType: 'movie',
          title: 'Christmas Fixture Movie',
          releaseDate: '2026-12-01',
          posterPath: null,
          overview: 'A local result used by the discover slider preview.',
        },
      ],
    });
    cy.visit('/');
    cy.intercept('POST', '/api/v1/settings/discover/add').as(
      'addDiscoverSlider'
    );
    cy.intercept('DELETE', '/api/v1/settings/discover/*').as(
      'deleteDiscoverSlider'
    );

    cy.get('[data-testid=discover-start-editing]').click();

    const sliderTitle = `Custom Keyword Slider ${Date.now()}`;

    cy.get('#sliderType').select('TMDB Movie Keyword');

    cy.get('#title').type(sliderTitle);
    // First confirm that an invalid keyword doesn't allow us to submit anything
    cy.get('#data').type('invalidkeyword', { delay: 100 });

    cy.get('[data-testid=create-discover-option-form]')
      .find('button')
      .should('be.disabled');

    cy.get('#data').clear();
    cy.get('#data').type('christmas', { delay: 100 });
    cy.get('.react-select__option').first().click();

    // Confirming we have some results
    cy.contains('.slider-header', sliderTitle)
      .closest('[data-testid=media-slider]')
      .find('[data-testid=title-card]');

    cy.get('[data-testid=create-discover-option-form]').submit();

    cy.wait('@addDiscoverSlider').its('response.statusCode').should('eq', 200);

    cy.contains('[data-testid=discover-slider-edit-mode]', sliderTitle).should(
      'be.visible'
    );

    // Make sure its still there even if we reload
    cy.reload();

    cy.get('[data-testid=discover-start-editing]').click();

    cy.contains('[data-testid=discover-slider-edit-mode]', sliderTitle).should(
      'be.visible'
    );

    // Verify it's not rendering on our discover page (its still disabled!)
    cy.visit('/');

    cy.get('.slider-header').should('not.contain', sliderTitle);

    cy.get('[data-testid=discover-start-editing]').click();

    // Enable it, and check again
    cy.contains('[data-testid=discover-slider-edit-mode]', sliderTitle)
      .find('[role="checkbox"]')
      .click();

    cy.get('[data-testid=discover-customize-submit').click();
    cy.wait('@getDiscoverSliders');

    cy.visit('/');

    cy.contains('.slider-header', sliderTitle)
      .closest('[data-testid=media-slider]')
      .find('[data-testid=title-card]');

    cy.get('[data-testid=discover-start-editing]').click();

    // let's delete it and confirm its deleted.
    cy.contains('[data-testid=discover-slider-edit-mode]', sliderTitle)
      .find('[data-testid=discover-slider-remove-button]')
      .click();

    cy.wait('@deleteDiscoverSlider')
      .its('response.statusCode')
      .should('eq', 204);

    cy.contains('[data-testid=discover-slider-edit-mode]', sliderTitle).should(
      'not.exist'
    );
  });

  it('can customize the built-in Networks shelf and restore its defaults', () => {
    cy.intercept('GET', '/api/v1/network/99998', {
      id: 99998,
      name: 'Network Without Logo',
      logoPath: null,
    });
    cy.intercept('GET', '/api/v1/network/99999', {
      id: 99999,
      name: 'Test Network',
      logoPath: '/test-network.png',
    });
    cy.intercept('PUT', '/api/v1/settings/discover/*').as('saveNetworkList');

    cy.visit('/');
    cy.get('[data-testid=discover-start-editing]').click();

    cy.contains('[data-testid=discover-slider-title]', 'Networks')
      .closest('[data-testid=discover-slider-edit-mode]')
      .as('networksSlider');
    cy.get('@networksSlider')
      .find('[data-testid=discover-slider-edit-button]')
      .click();

    cy.get('[data-testid=discover-network-item]').then(($items) => {
      expect($items.length).to.be.greaterThan(0);
    });

    cy.get('[data-testid=discover-network-id]').type('99998');
    cy.get('[data-testid=discover-network-add]').should('be.visible');
    cy.get('[data-testid=discover-network-id]').type('{enter}');
    cy.contains('This network does not have a usable logo.').should(
      'be.visible'
    );
    cy.contains(
      '[data-testid=discover-network-item]',
      'Network Without Logo'
    ).should('not.exist');

    cy.get('[data-testid=discover-network-id]').clear().type('99999{enter}');
    cy.contains('[data-testid=discover-network-item]', 'Test Network').should(
      'exist'
    );
    cy.contains('[data-testid=discover-network-item]', 'Test Network')
      .find('[data-testid=discover-network-move-up]')
      .click();

    cy.get('[data-testid=discover-network-save]').click();
    cy.wait('@saveNetworkList').then(({ request, response }) => {
      expect(response?.statusCode).to.eq(200);
      const networks = JSON.parse(request.body.data);
      expect(networks[networks.length - 2]).to.deep.include({
        id: 99999,
        name: 'Test Network',
        logoPath: '/test-network.png',
      });
    });

    cy.reload();
    cy.get('[data-testid=discover-start-editing]').click();
    cy.contains('[data-testid=discover-slider-title]', 'Networks')
      .closest('[data-testid=discover-slider-edit-mode]')
      .as('networksSlider');
    cy.get('@networksSlider')
      .find('[data-testid=discover-slider-edit-button]')
      .click();
    cy.contains('[data-testid=discover-network-item]', 'Test Network').should(
      'exist'
    );

    cy.get('[data-testid=discover-network-reset]').click();
    cy.contains('[data-testid=discover-network-item]', 'Test Network').should(
      'not.exist'
    );
    cy.get('[data-testid=discover-network-save]').click();
    cy.wait('@saveNetworkList').then(({ request, response }) => {
      expect(response?.statusCode).to.eq(200);
      expect(request.body.data).to.eq('');
    });
  });
});
