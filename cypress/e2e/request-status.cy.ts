// eslint-disable-next-line no-relative-import-paths/no-relative-import-paths -- Theme interaction helper.
import {
  closeSourcePanel,
  openFilterSection as openRequestFilterSection,
} from '../support/themeControls';

describe('Request Status', () => {
  beforeEach(() => {
    cy.loginAsAdmin();
  });

  it('opens on all requests and lets users choose a history window', () => {
    cy.visit('/requests');
    openRequestFilterSection('Filters');

    cy.get('button[aria-label="Time Period"]')
      .should('be.visible')
      .and('contain', 'All time')
      .click();

    cy.contains('[role=option]', 'Last 14 days').click();
    cy.location('search').should('contain', 'timeFrame=14d');

    cy.get('button[aria-label="Time Period"]').click();
    cy.contains('[role=option]', 'All time').click();
    cy.location('search').should('not.contain', 'timeFrame=');

    openRequestFilterSection('Media Filters');
    cy.contains('button', 'Books').should('be.visible');
    cy.contains('button', 'Audiobooks').click();
    cy.location('search').should('contain', 'mediaType=audiobook');
    openRequestFilterSection('Filters');
    cy.contains('Showing requests for')
      .should('be.visible')
      .parent()
      .find('[title="Audiobook"]')
      .should('be.visible');
    closeSourcePanel();
  });
});
