const createFailedTvRequest = (
  id: number,
  requestedBy: { id: number; permissions: number }
) => ({
  id,
  status: 4,
  failureReason: 'tvdb_id_unresolved',
  createdAt: '2026-10-12T00:00:00.000Z',
  updatedAt: '2026-10-12T00:00:00.000Z',
  type: 'tv',
  is4k: false,
  serverId: 0,
  profileId: null,
  metadataProfileId: null,
  rootFolder: null,
  languageProfileId: null,
  tags: null,
  media: {
    downloadStatus: [],
    downloadStatus4k: [],
    id: id + 9000,
    mediaType: 'tv',
    tmdbId: 66732,
    status: 1,
    status4k: 1,
    identifiers: [],
  },
  seasons: [
    { id: id + 1, seasonNumber: 0, status: 4 },
    { id: id + 2, seasonNumber: 2, status: 4 },
  ],
  modifiedBy: null,
  requestedBy: {
    ...requestedBy,
    email: 'requester@seerr.dev',
    displayName: 'Requester',
    avatar: '/avatar.png',
  },
  seasonCount: 2,
});

describe('manual TV season mapping', () => {
  it('requires explicit official seasons before retrying and fits a narrow viewport', () => {
    cy.loginAsAdmin();
    cy.request('/api/v1/auth/me').then(({ body: currentUser }) => {
      const request = createFailedTvRequest(803, {
        id: currentUser.id,
        permissions: currentUser.permissions,
      });

      cy.intercept('GET', `/api/v1/user/${currentUser.id}/requests?*`, {
        pageInfo: { pages: 1, pageSize: 10, results: 1, page: 1 },
        results: [request],
        serviceErrors: {
          radarr: [],
          sonarr: [],
          lidarr: [],
          readarr: [],
        },
      }).as('getFailedRequests');
      cy.intercept('GET', '/api/v1/request/803', request);
      cy.intercept('GET', '/api/v1/tv/66732', {
        id: 66732,
        name: 'Mapping TV Fixture',
        firstAirDate: '2020-01-01',
        mediaType: 'tv',
      });
      cy.intercept('GET', '/api/v1/service/sonarr/lookup/66732?*', {
        body: [
          {
            tvdbId: 321,
            title: 'Mapping TV Fixture',
            year: 2020,
          },
        ],
      }).as('sonarrLookup');
      cy.intercept('GET', '/api/v1/service/tvdb/seasons/321', {
        body: [
          { seasonNumber: 0, year: null },
          { seasonNumber: 1, year: 2020 },
          { seasonNumber: 2, year: 2021 },
        ],
      }).as('officialSeasons');
      cy.intercept('POST', '/api/v1/request/803/retry', {
        statusCode: 200,
        body: request,
      }).as('mapRequest');

      cy.visit(`/users/${currentUser.id}`, {
        onBeforeLoad(window) {
          class ImmediateIntersectionObserver implements IntersectionObserver {
            readonly root = null;
            readonly rootMargin = '0px';
            readonly thresholds = [0];

            constructor(
              private readonly callback: IntersectionObserverCallback
            ) {}

            disconnect() {}

            observe(target: Element) {
              this.callback(
                [
                  {
                    target,
                    isIntersecting: true,
                    intersectionRatio: 1,
                  } as IntersectionObserverEntry,
                ],
                this
              );
            }

            takeRecords() {
              return [];
            }

            unobserve() {}
          }

          Object.defineProperty(window, 'IntersectionObserver', {
            configurable: true,
            value: ImmediateIntersectionObserver,
          });
        },
      });
      cy.wait('@getFailedRequests');
      cy.contains('.slider-header', 'Recent Requests')
        .closest('[data-testid=media-slider]')
        .scrollIntoView()
        .should('be.visible')
        .contains('[data-testid=request-card]', 'Mapping TV Fixture');

      cy.contains('Mapping TV Fixture')
        .parents('[data-testid=request-card]')
        .scrollIntoView()
        .within(() => {
          cy.contains('button', 'Map TV seasons').should('be.visible').click();
        });

      cy.wait('@sonarrLookup');
      cy.get('#tvdb-series-803').click();
      cy.contains('[role=option]', 'Mapping TV Fixture (2020)').click();
      cy.wait('@officialSeasons');

      cy.get('#tvdb-season-803-0').should(
        'contain.text',
        'Choose a TVDB season'
      );
      cy.get('#tvdb-season-803-2').should(
        'contain.text',
        'Choose a TVDB season'
      );
      cy.contains('button', 'Map seasons and retry').should('be.disabled');

      cy.viewport(1280, 900);
      cy.screenshot('tv-season-mapping-desktop', { capture: 'viewport' });
      cy.viewport(390, 844);
      cy.screenshot('tv-season-mapping-narrow', { capture: 'viewport' });

      cy.get('#tvdb-season-803-0').click();
      cy.contains('[role=option]', 'Season 0 (Specials)').click();
      cy.get('#tvdb-season-803-2').click();
      cy.contains('[role=option]', 'Season 1 (2020)').click();
      cy.contains('button', 'Map seasons and retry').click();

      cy.wait('@mapRequest')
        .its('request.body')
        .should('deep.equal', {
          tvdbId: 321,
          seasonMappings: [
            { seasonNumber: 0, externalSeasonNumber: 0 },
            { seasonNumber: 2, externalSeasonNumber: 1 },
          ],
        });
    });
  });
});
