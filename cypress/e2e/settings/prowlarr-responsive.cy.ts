// Cypress drives this spec through repeated full-page visits. The app's
// service worker is verified separately by Playwright; do not register it in
// this UI-only spec because its navigation fetch can hold Cypress's load event
// open between tests.
Cypress.on('window:before:load', (win) => {
  if ('serviceWorker' in win.navigator) {
    Object.defineProperty(win.navigator.serviceWorker, 'register', {
      configurable: true,
      value: () => Promise.reject(new Error('Disabled in this Cypress spec')),
    });
  }
});

const categoryMappings = {
  movie: [2000],
  tv: [5000],
  sports: [5060],
  music: [3000],
  ebook: [7000],
  audiobook: [3030],
  comic: [7030],
  magazine: [7010],
  adult: [6000],
  retro: [4050],
  modern: [4000],
  game: [4050],
};

const coverage = {
  configured: true,
  success: true,
  version: '2.5.5.5823',
  totalIndexers: 6,
  enabledSearchableIndexers: 6,
  categories: Object.fromEntries(
    Object.keys(categoryMappings).map((category) => [category, 1])
  ),
  categoryCatalog: [],
  indexers: Array.from({ length: 6 }, (_, index) => ({
    id: index + 1,
    name: `Search indexer ${index + 1}`,
    enabled: true,
    supportsSearch: true,
  })),
};

const prowlarrSettings = {
  hostname: 'prowlarr.test',
  port: 9696,
  useSsl: false,
  baseUrl: '',
  apiKey: 'REDACTED',
  apiKeyConfigured: true,
  categoryMappings,
};

const diagnostics = Array.from({ length: 27 }, (_, index) => ({
  id: index + 1,
  name: index === 26 ? 'AnimeTosho (Usenet)' : `Indexer ${index + 1}`,
  layer: 'indexer-feed' as const,
  success: index !== 20,
  status: index === 20 ? 429 : 200,
  ...(index === 20 ? { error: 'Recently rate limited by the indexer.' } : {}),
}));

describe('Prowlarr settings on a short mobile screen', () => {
  beforeEach(() => {
    cy.viewport(390, 640);
    cy.loginAsAdmin();
    cy.intercept('GET', '**/api/v1/settings/**', (request) => {
      const pathname = new URL(request.url).pathname;
      if (pathname === '/api/v1/settings/public') {
        request.continue();
      } else if (pathname === '/api/v1/settings/cache') {
        request.reply({
          body: {
            apiCaches: [],
            imageCache: {
              tmdb: { imageCount: 0, size: 0 },
              avatar: { imageCount: 0, size: 0 },
            },
          },
        });
      } else if (pathname === '/api/v1/settings/download-clients') {
        request.reply({
          body: {
            pollIntervalSeconds: 15,
            clients: [],
          },
        });
      } else if (pathname === '/api/v1/settings/prowlarr') {
        request.alias = 'prowlarrSettings';
        request.reply({ body: prowlarrSettings });
      } else if (pathname === '/api/v1/settings/prowlarr/coverage') {
        request.alias = 'prowlarrCoverage';
        request.reply({ body: coverage });
      } else if (pathname === '/api/v1/settings/software-acquisition') {
        request.reply({
          body: {
            romarr: {
              hostname: '',
              port: 6868,
              useSsl: false,
              baseUrl: '',
              apiKey: '',
              apiKeyConfigured: false,
            },
            questarr: {
              hostname: '',
              port: 3000,
              useSsl: false,
              baseUrl: '',
              apiKey: '',
              apiKeyConfigured: false,
            },
            emulationCatalogProvider: 'questarr',
            emulationSystemGroups: {},
          },
        });
      } else if (pathname === '/api/v1/settings/reader-delivery') {
        request.reply({
          body: {
            grimmoryUrl: '',
            grimmoryUsername: '',
            grimmoryPassword: '',
            bookorbitUrl: '',
            bookorbitUsername: '',
            bookorbitPassword: '',
            preferredProvider: 'grimmory',
          },
        });
      } else if (pathname === '/api/v1/settings/reader-delivery/groupings') {
        request.reply({ body: [] });
      } else {
        // Preserve the response contracts for settings this test does not cover.
        request.continue();
      }
    });
    cy.intercept('GET', '/api/v1/blocklist/count', { body: { count: 0 } });
    cy.intercept('GET', '/api/v1/overrideRule', { body: [] });
    cy.intercept('GET', '/api/v1/request/software/catalog/systems', {
      body: { results: [] },
    });
    cy.intercept('POST', '/api/v1/settings/prowlarr/test', {
      body: { ...coverage, diagnostics },
    }).as('testProwlarr');
    cy.intercept('PUT', '/api/v1/settings/prowlarr', {
      statusCode: 200,
      body: { success: true },
    }).as('saveProwlarr');
  });

  it('keeps save reachable after scrolling the long indexer report', () => {
    cy.visit('/settings/prowlarr');
    cy.wait('@prowlarrSettings').then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
      expect(response?.body).to.deep.equal(prowlarrSettings);
    });
    cy.get('#prowlarr', { timeout: 10000 }).should('be.visible');
    cy.contains(
      'This setting connects to Prowlarr only. NZBHydra2 is not currently supported here.'
    ).should('be.visible');
    cy.contains('#prowlarr h3', 'Prowlarr indexers', {
      timeout: 10000,
    }).scrollIntoView();
    cy.get('#prowlarr')
      .contains('button', 'Test connection and inspect coverage')
      .click();
    cy.wait('@testProwlarr');

    cy.get('[data-testid=prowlarr-diagnostics]').should('be.visible');
    cy.get('[data-testid=prowlarr-diagnostics]')
      .should(($region) => {
        expect(getComputedStyle($region[0]).maxHeight).to.equal('288px');
        expect($region[0].scrollHeight).to.be.greaterThan(
          $region[0].clientHeight
        );
      })
      .scrollTo('bottom');
    cy.get('[data-testid=prowlarr-diagnostics]')
      .contains('li', 'AnimeTosho (Usenet)')
      .should('be.visible');
    cy.get('[data-testid=prowlarr-actions]').scrollIntoView();
    cy.get('[data-testid=prowlarr-actions]').should('be.visible');
    cy.get('[data-testid=prowlarr-actions]')
      .contains('button', 'Save Prowlarr settings')
      .then(($button) => {
        const bounds = $button[0].getBoundingClientRect();
        expect(bounds.height).to.be.at.least(44);
        expect(bounds.top).to.be.at.least(0);
        expect(bounds.bottom).to.be.at.most(640);
      })
      .click();
    cy.wait('@saveProwlarr').its('response.statusCode').should('eq', 200);
  });

  it('shows usable multi-select lists for category filters and indexer assignments', () => {
    cy.viewport(959, 374);
    cy.visit('/settings/prowlarr');
    cy.wait('@prowlarrSettings');
    cy.wait('@prowlarrCoverage');

    cy.contains('h4', 'Category filters')
      .parent()
      .find('details summary')
      .first()
      .click();
    cy.get('select[multiple]')
      .first()
      .should(($select) => {
        expect($select[0].size).to.be.greaterThan(1);
        expect($select[0].clientHeight).to.be.greaterThan(60);
      });

    cy.contains('h4', 'Indexer Assignments by Media Type')
      .parent()
      .find('details summary')
      .first()
      .click();
    cy.get('select[aria-label="Indexers for Movies"]')
      .should(($select) => {
        expect($select[0].size).to.equal(6);
        expect($select[0].clientHeight).to.be.greaterThan(60);
      })
      .select(['1', '2'])
      .should(($select) => {
        expect(
          Array.from($select[0].selectedOptions, (option) => option.value)
        ).to.deep.equal(['1', '2']);
      });

    if (Cypress.expose('VISUAL_REVIEW')) {
      cy.screenshot('prowlarr-indexer-assignments-959x374', {
        capture: 'viewport',
      });
    }

    cy.viewport(1280, 800);
    cy.get('select[aria-label="Indexers for Movies"]').should(($select) => {
      expect($select[0].clientHeight).to.be.greaterThan(60);
    });
    if (Cypress.expose('VISUAL_REVIEW')) {
      cy.screenshot('prowlarr-indexer-assignments-1280x800', {
        capture: 'viewport',
      });
    }

    cy.viewport(390, 640);
    cy.reload();
    cy.wait('@prowlarrSettings');
    cy.wait('@prowlarrCoverage');
    cy.contains('h4', 'Indexer Assignments by Media Type')
      .parent()
      .find('details summary')
      .first()
      .click();
    cy.get('select[aria-label="Indexers for Movies"]').should(($select) => {
      expect($select[0].clientHeight).to.be.greaterThan(60);
    });

    if (Cypress.expose('VISUAL_REVIEW')) {
      cy.screenshot('prowlarr-indexer-assignments-mobile', {
        capture: 'viewport',
      });
    }
  });

  it('shows setup assistance without horizontal overflow on a narrow screen', () => {
    cy.visit('/settings/services?serviceCategory=tools-other');

    cy.contains('section.app-card-sub', 'Connect your apps')
      .should('be.visible')
      .and(
        'contain',
        'Find services with a Compose starter, Docker discovery, host checks, or a manual connection report.'
      );
    cy.contains('a', 'Open the setup guide')
      .should('be.visible')
      .should(
        'have.attr',
        'href',
        'https://github.com/snapetech-org/seerrng/blob/main/docs/using-seerr/setup-assistant.md'
      );
    cy.document().then((document) => {
      expect(document.documentElement.scrollWidth).to.be.at.most(
        document.documentElement.clientWidth + 1
      );
    });
    if (Cypress.expose('VISUAL_REVIEW')) {
      cy.screenshot('setup-assistant-mobile', { capture: 'viewport' });
    }
  });

  it('shows setup assistance at desktop width', () => {
    cy.viewport(1280, 720);
    cy.visit('/settings/services?serviceCategory=tools-other');

    cy.contains('section.app-card-sub', 'Connect your apps').should(
      'be.visible'
    );
    cy.contains('section.app-card-sub', 'Connect your apps').should(($card) => {
      const bounds = $card[0].getBoundingClientRect();
      expect(bounds.right).to.be.at.most(
        $card[0].ownerDocument.documentElement.clientWidth + 1
      );
      const description = $card.find('p')[0];
      expect(description.scrollWidth).to.be.at.most(
        description.clientWidth + 1
      );
    });
    cy.document().then((document) => {
      expect(document.documentElement.scrollWidth).to.be.at.most(
        document.documentElement.clientWidth + 1
      );
    });
    if (Cypress.expose('VISUAL_REVIEW')) {
      cy.screenshot('setup-assistant-desktop', { capture: 'viewport' });
    }
  });

  it('imports a discovered address into the matching add form without importing credentials', () => {
    cy.visit('/settings/services?serviceCategory=tools-other');

    const report = {
      network: 'seerrng-shared',
      connections: [
        {
          id: 'radarr',
          title: 'Radarr',
          hostname: 'radarr',
          port: 7878,
          state: 'running',
          apiKey: 'must-not-be-imported',
        },
      ],
    };
    cy.get('input[aria-label="Import connection report"]').selectFile(
      {
        contents: Cypress.Buffer.from(JSON.stringify(report)),
        fileName: 'seerrng-connections.json',
        mimeType: 'application/json',
      },
      { force: true }
    );

    cy.contains('Loaded suggestions for 1 app').should('be.visible');
    cy.contains('button[aria-pressed="false"]', 'TV & Movies').click();
    cy.contains('button', 'Add Radarr Server').scrollIntoView().click();
    cy.get('input[name="hostname"]').should('have.value', 'radarr');
    cy.get('input[name="port"]').should('have.value', '7878');
    cy.get('input[name="apiKey"]').should('have.value', '');
  });
});
