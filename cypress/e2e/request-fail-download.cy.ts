const PRIVATE_DOWNLOAD_ALIAS = 'a'.repeat(64);
const REQUEST_PENDING = 1;
const REQUEST_DECLINED = 3;
const MEDIA_DELETED = 7;

const createApprovedMovieRequest = (
  id: number,
  requestedBy: { id: number; permissions: number },
  tmdbId: number,
  title: string,
  downloadId: string
) => ({
  id,
  status: 2,
  createdAt: '2026-09-29T00:00:00.000Z',
  updatedAt: '2026-09-29T00:00:00.000Z',
  type: 'movie',
  is4k: false,
  serverId: 31,
  profileId: 7,
  metadataProfileId: null,
  rootFolder: '/movies',
  languageProfileId: null,
  tags: null,
  media: {
    id: id + 9000,
    mediaType: 'movie',
    tmdbId,
    tvdbId: null,
    imdbId: null,
    status: 3,
    status4k: 1,
    serviceId: 31,
    externalServiceId: tmdbId + 100,
    mediaUrl: `https://plex.example/movie/${tmdbId}`,
    downloadStatus: [
      {
        mediaType: 'movie',
        externalId: tmdbId + 100,
        size: 100,
        sizeLeft: 50,
        status: 'downloading',
        timeLeft: '00:10:00',
        estimatedCompletionTime: '2026-10-01T00:00:00.000Z',
        title: `${title} bad release`,
        downloadId,
      },
    ],
    downloadStatus4k: [],
    identifiers: [],
  },
  seasons: [],
  modifiedBy: null,
  requestedBy: {
    ...requestedBy,
    email: 'requester@seerr.dev',
    displayName: 'Requester',
    avatar: '/avatar.png',
  },
  seasonCount: 0,
});

const createPartialBookRequest = (
  id: number,
  requestedBy: { id: number; permissions: number }
) => ({
  id,
  status: 2,
  createdAt: '2026-09-29T00:00:00.000Z',
  updatedAt: '2026-09-29T00:00:00.000Z',
  type: 'book',
  is4k: false,
  bookFormat: 'both',
  serverId: 0,
  profileId: 7,
  metadataProfileId: null,
  rootFolder: '/books',
  languageProfileId: null,
  tags: null,
  media: {
    id: id + 9000,
    mediaType: 'book',
    tmdbId: 0,
    status: 3,
    status4k: 1,
    serviceId: 0,
    externalServiceId: 101,
    audiobookServiceId: null,
    audiobookExternalServiceId: null,
    downloadStatus: [],
    audiobookDownloadStatus: [],
    identifiers: [{ provider: 'openlibrary', value: 'OLZEROBOOKW' }],
  },
  seasons: [],
  modifiedBy: null,
  requestedBy: {
    ...requestedBy,
    email: 'requester@seerr.dev',
    displayName: 'Requester',
    avatar: '/avatar.png',
  },
  seasonCount: 0,
});

describe('manual fail and search from request status', () => {
  it('lets the requester use the action on a phone and hides it on another user’s request', () => {
    cy.viewport(375, 812);
    cy.loginAsUser();
    cy.request('/api/v1/auth/me').then(({ body: currentUser }) => {
      const ownedRequest = createApprovedMovieRequest(
        811,
        { id: currentUser.id, permissions: currentUser.permissions },
        8811,
        'Owned Movie',
        PRIVATE_DOWNLOAD_ALIAS
      );
      const otherRequest = createApprovedMovieRequest(
        812,
        { id: currentUser.id + 1, permissions: currentUser.permissions },
        8812,
        'Someone Else’s Movie',
        'b'.repeat(64)
      );
      const firstServiceBookRequest = createPartialBookRequest(813, {
        id: currentUser.id,
        permissions: currentUser.permissions,
      });
      const declinedRequest = {
        ...createApprovedMovieRequest(
          814,
          { id: currentUser.id, permissions: currentUser.permissions },
          8814,
          'Declined Movie',
          'c'.repeat(64)
        ),
        status: REQUEST_DECLINED,
      };
      const pendingDeletedRequestBase = createApprovedMovieRequest(
        815,
        { id: currentUser.id, permissions: currentUser.permissions },
        8815,
        'Pending Deleted Movie',
        'd'.repeat(64)
      );
      const pendingDeletedRequest = {
        ...pendingDeletedRequestBase,
        status: REQUEST_PENDING,
        media: {
          ...pendingDeletedRequestBase.media,
          status: MEDIA_DELETED,
          downloadStatus: [],
        },
      };
      const refreshedRequest = {
        ...ownedRequest,
        media: { ...ownedRequest.media, downloadStatus: [] },
      };
      let failed = false;

      cy.intercept('GET', `/api/v1/user/${currentUser.id}/requests?*`, {
        pageInfo: { pages: 1, pageSize: 10, results: 5, page: 1 },
        results: [
          ownedRequest,
          otherRequest,
          firstServiceBookRequest,
          declinedRequest,
          pendingDeletedRequest,
        ],
        serviceErrors: { radarr: [], sonarr: [], lidarr: [], readarr: [] },
      }).as('getRequests');
      cy.intercept('GET', '/api/v1/request/811', (req) => {
        req.reply(failed ? refreshedRequest : ownedRequest);
      });
      cy.intercept('GET', '/api/v1/request/812', otherRequest);
      cy.intercept('GET', '/api/v1/request/813', firstServiceBookRequest);
      cy.intercept('GET', '/api/v1/request/814', declinedRequest);
      cy.intercept('GET', '/api/v1/request/815', pendingDeletedRequest);
      cy.intercept('GET', '/api/v1/movie/8811', {
        id: 8811,
        mediaType: 'movie',
        title: 'Owned Movie',
        originalTitle: 'Owned Movie',
        releaseDate: '2024-01-01',
        posterPath: null,
        voteAverage: 7,
      }).as('ownedMovie');
      cy.intercept('GET', '/api/v1/movie/8812', {
        id: 8812,
        mediaType: 'movie',
        title: 'Someone Else’s Movie',
        originalTitle: 'Someone Else’s Movie',
        releaseDate: '2024-01-01',
        posterPath: null,
        voteAverage: 7,
      });
      cy.intercept('GET', '/api/v1/movie/8814', {
        id: 8814,
        mediaType: 'movie',
        title: 'Declined Movie',
        originalTitle: 'Declined Movie',
        releaseDate: '2024-01-01',
        posterPath: null,
        voteAverage: 7,
      });
      cy.intercept('GET', '/api/v1/movie/8815', {
        id: 8815,
        mediaType: 'movie',
        title: 'Pending Deleted Movie',
        originalTitle: 'Pending Deleted Movie',
        releaseDate: '2024-01-01',
        posterPath: null,
        voteAverage: 7,
      });
      cy.intercept('GET', '/api/v1/book/OLZEROBOOKW', {
        id: 'OLZEROBOOKW',
        mediaType: 'book',
        title: 'Book on First Service',
        author: 'Tester',
        isbnCandidates: [],
        subjects: [],
      });
      cy.intercept('POST', '/api/v1/request/811/fail-download', (req) => {
        expect(req.body).to.deep.equal({ downloadId: PRIVATE_DOWNLOAD_ALIAS });
        failed = true;
        req.reply({ statusCode: 200, body: { success: true } });
      }).as('failOwnedDownload');

      cy.visit(`/users/${currentUser.id}`, {
        onBeforeLoad(window) {
          class ImmediateIntersectionObserver implements IntersectionObserver {
            readonly root = null;
            readonly rootMargin = '0px';
            readonly scrollMargin = '0px';
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
      cy.wait('@getRequests');
      cy.wait('@ownedMovie');
      cy.contains('Owned Movie')
        .parents('[data-testid=request-card]')
        .within(() => {
          cy.contains('Processing').should('not.have.attr', 'href');
        });
      cy.contains('Owned Movie')
        .parents('[data-testid=request-card]')
        .scrollIntoView()
        .within(() => {
          cy.contains('Processing').click();
        });
      cy.get('.app-tooltip')
        .contains('a', 'Play on Plex')
        .should('have.attr', 'href', 'https://plex.example/movie/8811');
      cy.get('.app-tooltip')
        .contains('button', 'Fail this download and search again')
        .should('be.visible')
        .and('have.class', 'app-button')
        .and('have.class', 'button-sm')
        .and(($button) => {
          const bounds = $button[0].getBoundingClientRect();
          // This legacy phone action retains its touch target, unlike compact controls.
          expect(bounds.height).to.be.at.least(44);
          expect(window.getComputedStyle($button[0]).fontSize).to.eq('12px');
          expect(bounds.left).to.be.at.least(0);
          expect(bounds.right).to.be.at.most(Cypress.config('viewportWidth'));
        })
        .click();
      cy.get('.app-tooltip')
        .contains(
          'button',
          'Remove and blocklist this release, then search again?'
        )
        .click();
      cy.wait('@failOwnedDownload')
        .its('request.url')
        .should('include', '/api/v1/request/811/fail-download');
      cy.contains<HTMLElement>(
        'The release was failed and a new search was started.'
      )
        .should('be.visible')
        .should(($message) => {
          const toast = $message.closest('.toast');
          const notification = toast.children().first();
          expect(notification).to.have.css('opacity', '1');
          expect(toast).to.have.css('pointer-events', 'none');
          expect(notification).to.have.css('pointer-events', 'none');
          expect(notification.find('button')).to.have.css(
            'pointer-events',
            'auto'
          );
        });
      cy.contains('Someone Else’s Movie')
        .parents('[data-testid=request-card]')
        .should('not.contain', 'Fail this download and search again');
      cy.contains('Book on First Service')
        .parents('[data-testid=request-card]')
        .within(() => {
          cy.contains('Partial Bookshelf link').should('be.visible');
          cy.contains('Book').should('be.visible');
        });
      cy.contains('Declined Movie')
        .parents('[data-testid=request-card]')
        .within(() => cy.contains('Declined').should('be.visible'));
      cy.contains('Pending Deleted Movie')
        .parents('[data-testid=request-card]')
        .within(() => cy.contains('Pending').should('be.visible'));
    });
  });
});
