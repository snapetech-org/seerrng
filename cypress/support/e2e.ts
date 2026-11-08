import './commands';

beforeEach(() => {
  // These suites exercise the full native interface; Lumen entry is qualified separately.
  cy.setCookie('seerrng-frontend', 'classic');
  if (Cypress.isBrowser({ family: 'chromium' })) {
    // These suites intercept HTTP at Cypress's proxy. A controlling worker can
    // bypass that proxy and its instrumented iframe navigation. Worker-enabled
    // navigation is exercised separately in Playwright with the real worker.
    cy.then(() =>
      Cypress.automation('remote:debugger:protocol', {
        command: 'Network.setBypassServiceWorker',
        params: { bypass: true },
      })
    );
  }
  // These tests explicitly assert metadata HTTP responses. A browser-cached
  // response bypasses cy.intercept even when the real UI loads successfully.
  // Keep real payloads, requests and assertions; disable only test-side caching
  // of read-only movie/series details and season metadata, before any visit.
  cy.intercept(
    {
      method: 'GET',
      pathname: /^\/api\/v1\/(?:movie|tv)\/\d+(?:\/season\/\d+)?$/,
      middleware: true,
    },
    (request) => {
      request.on('before:response', (response) => {
        response.headers['cache-control'] = 'no-store';
      });
    }
  );
});

before(() => {
  if (Cypress.expose('SEED_DATABASE') === true) {
    cy.task('seedDatabase');
  }
});
