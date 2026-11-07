/** Exercise the active theme's real filter presentation. */
export const closeSourcePanel = () => {
  cy.get('body').then(($body) => {
    const close = $body.find(
      '.slideover button[aria-label="Close panel"]:visible'
    );
    if (close.length) cy.wrap(close.first()).click();
  });
};

export const openFilterSection = (label: string) => {
  closeSourcePanel();
  cy.get('html').then(($html) => {
    if ($html.attr('data-interface-theme') === 'seerrOrig') {
      cy.get('body').then(($body) => {
        if ($body.find('.upstream-discovery-controls').length) {
          cy.contains(
            '.upstream-discovery-controls button',
            'Active Filters'
          ).click();
        } else {
          cy.contains(
            '.upstream-filter-sections button',
            new RegExp(`^${label}$`)
          ).click();
        }
      });
      cy.get('.slideover').should('be.visible');
    } else {
      cy.get(`section[aria-label="${label}"] button.detail-disclosure-button`)
        .then(($button) => {
          if ($button.attr('aria-expanded') === 'false')
            cy.wrap($button).click();
        })
        .should('have.attr', 'aria-expanded', 'true');
    }
  });
};

export const openSourceTools = () => {
  cy.get('body').then(($body) => {
    const summary = $body.find('.upstream-extra-tools:not([open]) > summary');
    if (summary.length) cy.wrap(summary.first()).click();
  });
};
