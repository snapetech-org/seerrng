describe('Reader app delivery settings', () => {
  const assertGeneratedAddressFieldsFit = () => {
    for (const selector of [
      '#grimmory-opds',
      '#grimmory-komga',
      '#bookorbit-opds',
    ]) {
      cy.get(selector).should(($input) => {
        const input = $input[0];
        const field = input.closest('.reader-generated-address-field');
        expect(field, `${selector} has a dedicated address layout`).not.to.eq(
          null
        );
        if (!field) return;
        const button = field.querySelector('button');
        expect(button, `${selector} has a copy action`).not.to.eq(null);
        if (!button) return;
        const inputBounds = input.getBoundingClientRect();
        const buttonBounds = button.getBoundingClientRect();
        const fieldBounds = field.getBoundingClientRect();
        expect(
          inputBounds.width,
          `${selector} remains readable`
        ).to.be.at.least(260);
        expect(
          buttonBounds.top,
          `${selector} copy action sits below the URL`
        ).to.be.at.least(inputBounds.bottom - 1);
        expect(
          buttonBounds.right,
          `${selector} copy action stays in its row`
        ).to.be.at.most(fieldBounds.right + 1);
      });
    }
  };

  beforeEach(() => {
    cy.loginAsAdmin();
    cy.viewport(1280, 900);
    cy.intercept('PUT', '/api/v1/settings/reader-delivery').as(
      'saveReaderSettings'
    );
  });

  it('saves reader addresses, exposes working catalog links, and fits mobile', () => {
    cy.visit('/settings/services?serviceCategory=audiobooks-books');
    cy.request('/api/v1/interface-themes/seerrOrig/theme.css').then(
      ({ status, headers, body }) => {
        expect(status).to.eq(200);
        expect(headers['content-type']).to.include('text/css');
        expect(body).to.include('--poster-width');
      }
    );
    cy.viewport(1280, 900);
    cy.window().its('innerWidth').should('eq', 1280);
    cy.window().its('innerHeight').should('eq', 900);
    cy.contains('h3.settings-group-heading', 'Reader Apps').should(
      'be.visible'
    );

    cy.get('#grimmory-url')
      .clear()
      .type('https://grimmory.example.test/library');
    cy.get('#bookorbit-url')
      .clear()
      .type('https://bookorbit.example.test/library');
    cy.get('#reader-delivery-preferred').select('bookorbit');
    cy.contains('button', 'Save Reader Settings').click();

    cy.wait('@saveReaderSettings').then(({ request, response }) => {
      expect(request.body).to.include({
        grimmoryUrl: 'https://grimmory.example.test/library',
        bookorbitUrl: 'https://bookorbit.example.test/library',
        preferredProvider: 'bookorbit',
      });
      expect(response?.statusCode).to.eq(200);
    });

    cy.get('#grimmory-opds').should(
      'have.value',
      'https://grimmory.example.test/library/api/v1/opds'
    );
    cy.get('#grimmory-komga').should(
      'have.value',
      'https://grimmory.example.test/library/komga/api'
    );
    cy.get('#bookorbit-opds').should(
      'have.value',
      'https://bookorbit.example.test/library/api/v1/opds'
    );
    cy.get('#reader-delivery-preferred').should('have.value', 'bookorbit');
    cy.contains('SeerrNG-managed reader shelves').should('be.visible');
    cy.contains('No reader shelves have been created').should('be.visible');
    cy.get('.reader-settings-grid')
      .first()
      .children('li')
      .then(($cards) => {
        expect($cards).to.have.length(2);
        const first = $cards[0].getBoundingClientRect();
        const second = $cards[1].getBoundingClientRect();
        expect(
          first.width,
          'reader service cards use the settings width'
        ).to.be.greaterThan(550);
        expect(
          first.bottom,
          'reader service cards stack in reading order'
        ).to.be.at.most(second.top + 1);
      });
    assertGeneratedAddressFieldsFit();
    cy.document().then((document) => {
      expect(
        document.documentElement.scrollWidth,
        'page should not overflow horizontally at desktop width'
      ).to.be.at.most(document.documentElement.clientWidth);
    });
    cy.contains('h3.settings-group-heading', 'Reader Apps').scrollIntoView({
      offset: { top: -140, left: 0 },
    });
    cy.screenshot('reader-delivery-settings-desktop', {
      capture: 'viewport',
    });

    cy.reload();
    cy.request('/api/v1/interface-themes/seerrOrig/theme.css').then(
      ({ status, headers, body }) => {
        expect(status).to.eq(200);
        expect(headers['content-type']).to.include('text/css');
        expect(body).to.include('--poster-width');
      }
    );
    cy.viewport(1280, 900);
    cy.contains('h3.settings-group-heading', 'Reader Apps').should(
      'be.visible'
    );
    cy.get('#reader-delivery-preferred').should('have.value', 'bookorbit');
    cy.get('#grimmory-opds').should(
      'have.value',
      'https://grimmory.example.test/library/api/v1/opds'
    );

    cy.viewport(390, 844);
    cy.window().its('innerWidth').should('eq', 390);
    cy.window().its('innerHeight').should('eq', 844);
    assertGeneratedAddressFieldsFit();
    cy.contains('h3.settings-group-heading', 'Reader Apps').scrollIntoView({
      offset: { top: -120, left: 0 },
    });
    cy.document().then((document) => {
      expect(
        document.documentElement.scrollWidth,
        'page should not overflow horizontally at mobile width'
      ).to.be.at.most(document.documentElement.clientWidth);
    });
    cy.screenshot('reader-delivery-settings-mobile', {
      capture: 'viewport',
    });
  });
});
