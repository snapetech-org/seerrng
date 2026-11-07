// eslint-disable-next-line no-relative-import-paths/no-relative-import-paths -- Theme interaction helper.
import {
  closeSourcePanel,
  openFilterSection as openRequestFilterSection,
} from '../support/themeControls';

describe('Requests', () => {
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

  it('applies task filters to software requests', () => {
    cy.intercept('GET', '/api/v1/request/status*', {
      pageInfo: { page: 1, pages: 1, pageSize: 10, results: 0 },
      results: [],
      counts: {
        total: 1,
        active: 0,
        incomplete: 0,
        attention: 0,
        completed: 0,
        unavailable: 1,
        failed: 1,
      },
      olderCount: 0,
    }).as('requestStatus');
    cy.intercept('GET', '/api/v1/request/software/status*', {
      pageInfo: { page: 1, pages: 1, pageSize: 20, results: 1 },
      results: [
        {
          request: {
            id: 501,
            requestedBy: { id: 1, displayName: 'admin', avatar: null },
            category: 'retro',
            provider: 'romarr',
            status: 'failed',
            title: 'Failed software request',
            createdAt: '2026-09-30T12:00:00.000Z',
          },
          status: 'failed',
          message: 'No matching release was found.',
          assets: [],
        },
      ],
    }).as('softwareStatus');

    cy.visit('/requests');
    cy.wait('@softwareStatus')
      .its('request.url')
      .should('not.include', 'filter=');
    openRequestFilterSection('Task Filters');
    cy.get('section[aria-label="Task Filters"], .slideover')
      .contains('button', 'No Release Found')
      .click();
    cy.location('search').should('include', 'filter=unavailable');
    cy.wait('@softwareStatus')
      .its('request.url')
      .should('include', 'filter=unavailable');
    cy.get('[aria-label="Software Requests"]').should('not.exist');

    cy.get('section[aria-label="Task Filters"], .slideover')
      .contains('button', 'Failed')
      .click();
    cy.location('search').should('include', 'filter=failed');
    cy.wait('@softwareStatus')
      .its('request.url')
      .should('include', 'filter=failed');
    cy.get('[aria-label="Software Requests"]').should(
      'contain.text',
      'Failed software request'
    );
  });

  it('clears a cancelled software request from the request list', () => {
    let cleared = false;
    const clientErrors: string[] = [];
    cy.on('window:before:load', (window) => {
      const originalConsoleError = window.console.error.bind(window.console);
      window.console.error = (...args) => {
        clientErrors.push(args.map(String).join(' '));
        originalConsoleError(...args);
      };
      window.addEventListener('error', (event) => {
        clientErrors.push(event.message);
      });
    });
    cy.intercept('GET', '/api/v1/request/status*', {
      pageInfo: { page: 1, pages: 1, pageSize: 10, results: 0 },
      results: [],
      counts: {
        total: 0,
        active: 0,
        incomplete: 0,
        attention: 0,
        completed: 0,
        unavailable: 0,
        failed: 0,
      },
      olderCount: 0,
    });
    cy.intercept('GET', '/api/v1/request/software/status*', (request) => {
      request.reply({
        pageInfo: { page: 1, pages: 1, pageSize: 20, results: cleared ? 0 : 1 },
        results: cleared
          ? []
          : [
              {
                request: {
                  id: 502,
                  requestedBy: { id: 1, displayName: 'admin', avatar: null },
                  category: 'retro',
                  provider: 'romarr',
                  status: 'cancelled',
                  title: 'Cancelled software request',
                  createdAt: '2026-09-30T12:00:00.000Z',
                },
                status: 'cancelled',
                message: null,
                assets: [],
              },
            ],
      });
    }).as('softwareStatus');
    cy.intercept('DELETE', '/api/v1/request/software/status/502', (request) => {
      cleared = true;
      request.reply({ statusCode: 204, body: null });
    }).as('clearCancelledRequest');

    cy.visit('/requests');
    cy.wait('@softwareStatus');
    cy.get('[aria-label="Software Requests"]')
      .contains('Cancelled software request')
      .should('be.visible');
    cy.get('[aria-label="Software Requests"]')
      .contains('button', 'Clear cancelled request')
      .click();
    cy.get('body').then(($body) => {
      if ($body.text().includes('Oops')) {
        throw new Error(
          `The confirmation click caused a page error: ${clientErrors.join('\n') || 'no browser console error was captured'}`
        );
      }
    });
    cy.get('[role="dialog"]')
      .should('have.attr', 'aria-modal', 'true')
      .within(() => {
        cy.get('[data-testid="modal-title"]').should(
          'have.text',
          'Clear This Cancelled Request?'
        );
        cy.contains('button', 'Clear cancelled request').click();
      });
    cy.then(() => {
      expect(clientErrors.join('\n')).not.to.include(
        'Transition.Child is used but it is missing a parent'
      );
    });
    cy.wait('@clearCancelledRequest');
    cy.contains('Cancelled request cleared.').should('be.visible');
    cy.contains('Cancelled software request').should('not.exist');
    cy.contains(
      'No movie, show, music, book, comic, magazine, or adult requests match these filters.'
    ).should('be.visible');
  });

  it('removes a handed-off download from Requests without cancelling the transfer', () => {
    let removed = false;
    let cancelCalled = false;
    cy.viewport(390, 720);
    cy.intercept('GET', '/api/v1/request/status*', {
      pageInfo: { page: 1, pages: 1, pageSize: 10, results: 0 },
      results: [],
      counts: {
        total: 0,
        active: 0,
        incomplete: 0,
        attention: 0,
        completed: 0,
        unavailable: 0,
        failed: 0,
      },
      olderCount: 0,
    });
    cy.intercept('GET', '/api/v1/request/software/status*', (request) => {
      request.reply({
        pageInfo: {
          page: 1,
          pages: removed ? 0 : 1,
          pageSize: 20,
          results: removed ? 0 : 1,
        },
        results: removed
          ? []
          : [
              {
                request: {
                  id: 503,
                  requestedBy: { id: 1, displayName: 'admin', avatar: null },
                  category: 'retro',
                  provider: 'romarr',
                  status: 'downloading',
                  title: 'Super Mario World',
                  percent: 64,
                  actions: {
                    retry: false,
                    cancel: false,
                    cancelReason:
                      'ROMarrNG has handed this request to the download client; cancel the transfer there.',
                  },
                  createdAt: '2026-09-30T12:00:00.000Z',
                },
                status: 'downloading',
                message: null,
                assets: [],
              },
            ],
      });
    }).as('softwareStatus');
    cy.intercept(
      'POST',
      '/api/v1/request/software/status/503/stop-tracking',
      (request) => {
        removed = true;
        request.reply({ statusCode: 204, body: null });
      }
    ).as('stopTracking');
    cy.intercept(
      'POST',
      '/api/v1/request/software/status/503/cancel',
      (request) => {
        cancelCalled = true;
        request.reply({ statusCode: 409, body: { error: 'Not cancellable.' } });
      }
    );

    cy.visit('/requests');
    cy.wait('@softwareStatus');
    cy.get('[aria-label="Software Requests"] article')
      .should('contain', 'Super Mario World')
      .and('contain', 'cancel the transfer there');
    cy.get('[aria-label="Software Requests"] article')
      .contains('button', 'Cancel')
      .should('not.exist');
    cy.get('[aria-label="Software Requests"] article')
      .contains('button', 'Remove from Requests')
      .should('be.visible')
      .click();
    cy.get('[role="dialog"]')
      .should('have.attr', 'aria-modal', 'true')
      .and(
        'contain',
        'Any download already handed to ROMarrNG or a download client will keep running'
      )
      .and('contain', 'may start a second acquisition')
      .and('contain', 'Installed software is not deleted')
      .within(() => {
        cy.contains('button', 'Remove from Requests').click();
      });

    cy.wait('@stopTracking').its('response.statusCode').should('eq', 204);
    cy.contains(
      'Request removed from SeerrNG. Any active download will keep running.'
    ).should('be.visible');
    cy.contains('Super Mario World').should('not.exist');
    cy.document().then((document) => {
      expect(document.documentElement.scrollWidth).to.be.at.most(
        document.documentElement.clientWidth + 1
      );
    });
    cy.then(() => expect(cancelCalled).to.equal(false));
  });
});
