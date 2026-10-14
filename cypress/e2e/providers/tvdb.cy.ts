// eslint-disable-next-line no-relative-import-paths/no-relative-import-paths -- Cypress specs use deterministic local title fixtures.
import { openTitleDetailsFromSearch } from '../../support/titleFixtures';

describe('TVDB Integration', () => {
  // Constants for routes and selectors
  const ROUTES = {
    home: '/',
    metadataSettings: '/settings/metadata',
    tomorrowIsOursTvShow: '/tv/72879',
    monsterTvShow: '/tv/225634',
    dragonnBallZKaiAnime: '/tv/61709',
  };

  const SELECTORS = {
    sidebarToggle: '[data-testid=sidebar-toggle]',
    sidebarSettingsMobile: '[data-testid=sidebar-menu-settings-mobile]',
    settingsNav: 'nav[aria-label="Tabs"]',
    metadataTestButton: '[data-testid="metadata-test-button"]',
    metadataSaveButton: '[data-testid="settings-save-button"]',
    tmdbStatus: '[data-testid="tmdb-status"]',
    tvdbStatus: '[data-testid="tvdb-status"]',
    tvMetadataProviderSelector: '[data-testid="tv-metadata-provider-selector"]',
    animeMetadataProviderSelector:
      '[data-testid="anime-metadata-provider-selector"]',
    seasonSelector: '[data-testid="season-selector"]',
    season1: 'button[aria-label="Expand Season 01"]',
    season2: 'button[aria-label="Expand Season 02"]',
    season3: 'button[aria-label="Expand Season 03"]',
    episodeList: '[data-tree-part="episodes"]',
    episode9: '9 - Hang Men',
  };

  const seasonFixture = (
    showId: number,
    seasonNumber: number,
    episodeCount: number,
    seasonId: number,
    firstEpisodeId: number
  ) => ({
    airDate: null,
    id: seasonId,
    name: `Season ${seasonNumber}`,
    overview: '',
    seasonNumber,
    episodes: Array.from({ length: episodeCount }, (_, index) => ({
      id: firstEpisodeId + index,
      name: `Episode ${index + 1}`,
      airDate: null,
      episodeNumber: index + 1,
      overview: '',
      productionCode: '',
      seasonNumber,
      showId,
      voteAverage: 0,
      voteCount: 0,
    })),
    externalIds: {},
  });

  // Reusable commands
  const navigateToMetadataSettings = () => {
    cy.visit(ROUTES.home);
    cy.get(SELECTORS.sidebarToggle).click();
    cy.get(SELECTORS.sidebarSettingsMobile).click();
    cy.get(
      `${SELECTORS.settingsNav} a[href="${ROUTES.metadataSettings}"]`
    ).click();
  };

  const testAndVerifyMetadataConnection = () => {
    cy.intercept('POST', '/api/v1/settings/metadatas/test', {
      statusCode: 200,
      body: {
        success: true,
        tests: { tmdb: 'not tested', tvdb: 'ok' },
      },
    }).as('testConnection');
    cy.get(SELECTORS.metadataTestButton)
      .scrollIntoView()
      .should('be.visible')
      .click();
    return cy.wait('@testConnection');
  };

  const saveMetadataSettings = (customBody: Record<string, string>) => {
    // Saving provider settings probes the configured provider on the server.
    // Keep this browser fixture independent of live TMDB/TVDB availability.
    cy.intercept('PUT', '/api/v1/settings/metadatas', (request) => {
      expect(request.body).to.deep.include(customBody);
      request.reply({
        statusCode: 200,
        body: {
          success: true,
          ...customBody,
          tests: { tvdb: 'ok', tmdb: 'not tested' },
        },
      });
    }).as('saveMetadata');

    cy.get(SELECTORS.metadataSaveButton).click();
    return cy.wait('@saveMetadata');
  };

  const openMediaServer = () => {
    cy.get('button[aria-controls="series-media-server-panel"]')
      .should('be.visible')
      .then(($button) => {
        if ($button.attr('aria-expanded') !== 'true') cy.wrap($button).click();
      });
    cy.get('#series-media-server-panel').should('be.visible');
    cy.get('#series-media-server-panel [data-selection-tree]').should('exist');
  };

  beforeEach(() => {
    // Perform login
    cy.loginAsAdmin();

    // Navigate to Metadata settings
    navigateToMetadataSettings();

    // Verify we're on the correct settings page
    cy.contains('h3', 'Metadata Providers').should('be.visible');

    // Configure TVDB as TV provider and test connection
    cy.get(SELECTORS.tvMetadataProviderSelector).click();

    // get id react-select-4-option-1
    cy.get('[class*="react-select__option"]').contains('TheTVDB').click();

    cy.get(SELECTORS.animeMetadataProviderSelector).click();
    cy.get('[class*="react-select__option"]').contains('TheTVDB').click();

    // Test the connection
    testAndVerifyMetadataConnection().then(({ response }) => {
      if (!response) {
        throw new Error('TVDB test connection did not return a response');
      }
      expect(response.statusCode).to.equal(200);
      // Check TVDB connection status
      cy.get(SELECTORS.tvdbStatus).should('contain', 'Operational');
    });

    // Save settings
    saveMetadataSettings({
      anime: 'tvdb',
      tv: 'tvdb',
    }).then(({ response }) => {
      if (!response) {
        throw new Error('Metadata settings save did not return a response');
      }
      expect(response.statusCode).to.equal(200);
      expect(response.body.tv).to.equal('tvdb');
    });
  });

  it('tests music metadata providers and saves bounded Cover Art Archive limits', () => {
    cy.intercept('POST', '/api/v1/settings/metadatas/test', (request) => {
      expect(request.body).to.deep.equal({
        musicbrainz: true,
        coverartarchive: true,
      });
      request.reply({
        statusCode: 200,
        body: {
          success: true,
          tests: {
            tmdb: 'not tested',
            tvdb: 'not tested',
            musicbrainz: 'ok',
            coverartarchive: 'ok',
          },
        },
      });
    }).as('testMusicMetadata');

    cy.get('#caa-max-concurrent-requests').clear().type('0');
    cy.get('[data-testid="music-metadata-test-button"]')
      .should('be.enabled')
      .click();
    cy.wait('@testMusicMetadata');
    cy.get('[data-testid="musicbrainz-status"]').should(
      'contain',
      'Operational'
    );
    cy.get('[data-testid="coverartarchive-status"]').should(
      'contain',
      'Operational'
    );

    const musicSettingsSaveBodies: Record<string, unknown>[] = [];
    cy.intercept('PUT', '/api/v1/settings/metadatas/music', (request) => {
      musicSettingsSaveBodies.push(request.body);
      expect(request.body).to.deep.equal({
        maxConcurrentRequests: 2,
        maxRequestsPerSecond: 10,
      });
      request.reply({
        statusCode: 200,
        body: {
          success: true,
          maxConcurrentRequests: 2,
          maxRequestsPerSecond: 10,
        },
      });
    }).as('saveMusicMetadataSettings');

    cy.get('#caa-max-concurrent-requests').clear().type('2');
    cy.get('#caa-max-requests-per-second').clear().type('10');
    cy.get('[data-testid="settings-save-button"]').should('be.enabled').click();
    cy.wait('@saveMusicMetadataSettings');
    cy.then(() => expect(musicSettingsSaveBodies).to.have.length(1));
  });

  it('should display "Tomorrow is Ours" show information with multiple seasons from TVDB', () => {
    // The browser loads metadata for every visible season together.
    cy.intercept('GET', '/api/v1/tv/72879/season/1', {
      statusCode: 200,
      body: seasonFixture(72879, 1, 100, 701, 7000),
    });
    cy.intercept('GET', '/api/v1/tv/72879/season/2', {
      statusCode: 200,
      body: seasonFixture(72879, 2, 247, 702, 8000),
    }).as('tomorrowSeason2');
    openTitleDetailsFromSearch({
      id: 72879,
      mediaType: 'tv',
      title: 'Tomorrow is Ours',
      date: '2017-07-17',
      details: {
        seasons: [
          { id: 701, name: 'Season 1', seasonNumber: 1, episodeCount: 100 },
          { id: 702, name: 'Season 2', seasonNumber: 2, episodeCount: 247 },
        ],
      },
    });
    openMediaServer();
    cy.get(SELECTORS.season2).should('be.visible');

    // Verify that multiple seasons are displayed (TMDB has only 1 season, TVDB has multiple)
    // cy.get(SELECTORS.seasonSelector).should('exist');
    // Select Season 2 and verify it loads
    cy.wait('@tomorrowSeason2').its('response.statusCode').should('eq', 200);
    cy.get(SELECTORS.season2)
      .should('be.visible')
      .and('have.attr', 'aria-expanded', 'false')
      .scrollIntoView()
      .click();
    cy.get('button[aria-label="Collapse Season 02"]').should(
      'have.attr',
      'aria-expanded',
      'true'
    );

    // Verify that episodes are displayed for Season 2
    cy.get(`${SELECTORS.episodeList}[aria-label="Season 02 Episodes"]`)
      .should('be.visible')
      .within(() => {
        cy.contains('[data-tree-part="number"]', /^01$/).should('be.visible');
        cy.contains('[data-tree-part="number"]', /^247$/)
          .scrollIntoView()
          .should('be.visible');
      });
  });

  it('Should display "Monster" show information correctly when not existing on TVDB', () => {
    const episodes = Array.from({ length: 9 }, (_, index) => ({
      id: 9000 + index,
      name: index === 8 ? 'Hang Men' : `Episode ${index + 1}`,
      airDate: null,
      episodeNumber: index + 1,
      overview: '',
      productionCode: '',
      seasonNumber: 1,
      showId: 225634,
      voteAverage: 0,
      voteCount: 0,
    }));
    cy.intercept('GET', '/api/v1/tv/225634/season/1', {
      airDate: null,
      id: 901,
      name: 'Season 1',
      overview: '',
      seasonNumber: 1,
      episodes,
      externalIds: {},
    }).as('monsterSeason1');
    openTitleDetailsFromSearch({
      id: 225634,
      mediaType: 'tv',
      title: 'Monster',
      date: '2014-07-07',
      details: {
        seasons: [
          { id: 901, name: 'Season 1', seasonNumber: 1, episodeCount: 9 },
        ],
      },
    });
    openMediaServer();
    cy.get(SELECTORS.season1).should('be.visible');

    // Select Season 1
    cy.wait('@monsterSeason1').its('response.statusCode').should('eq', 200);
    cy.get(SELECTORS.season1)
      .should('be.visible')
      .and('have.attr', 'aria-expanded', 'false')
      .scrollIntoView()
      .click();

    // Verify specific episode exists
    cy.get(`${SELECTORS.episodeList}[aria-label="Season 01 Episodes"]`)
      .should('be.visible')
      .contains('[data-tree-part="episode"]', 'Hang Men')
      .within(() => {
        cy.contains('[data-tree-part="number"]', /^09$/).should('exist');
        cy.contains('[data-tree-part="name"]', 'Hang Men').should('exist');
      });
  });

  it('should display "Dragon Ball Z Kai" show information with multiple only 2 seasons from TVDB', () => {
    cy.intercept('GET', '/api/v1/tv/61709/season/1', {
      statusCode: 200,
      body: seasonFixture(61709, 1, 98, 1001, 10_000),
    });
    cy.intercept('GET', '/api/v1/tv/61709/season/2', {
      statusCode: 200,
      body: seasonFixture(61709, 2, 25, 1002, 10_100),
    }).as('dragonSeason2');
    openTitleDetailsFromSearch({
      id: 61709,
      mediaType: 'tv',
      title: 'Dragon Ball Z Kai',
      date: '2009-04-05',
      details: {
        seasons: [
          { id: 1001, name: 'Season 1', seasonNumber: 1, episodeCount: 98 },
          { id: 1002, name: 'Season 2', seasonNumber: 2, episodeCount: 25 },
        ],
      },
    });
    openMediaServer();
    cy.get(SELECTORS.season2).should('be.visible');

    // Select Season 2 and verify it visible
    cy.wait('@dragonSeason2').its('response.statusCode').should('eq', 200);
    cy.get(SELECTORS.season2)
      .should('be.visible')
      .and('have.attr', 'aria-expanded', 'false')
      .scrollIntoView()
      .click();
    cy.get('button[aria-label="Collapse Season 02"]').should(
      'have.attr',
      'aria-expanded',
      'true'
    );

    // select season 3 and verify it not visible
    cy.get(SELECTORS.season3).should('not.exist');
    cy.get(`${SELECTORS.episodeList}[aria-label="Season 02 Episodes"]`).should(
      'be.visible'
    );
  });
});
