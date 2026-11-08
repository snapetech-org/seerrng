const REQUEST_PERMISSION = 32;
const REQUEST_BOOK_PERMISSION = 34359738368n;

const createFailedBookRequest = (
  id: number,
  requestedBy: { id: number; permissions: number },
  externalId: string
) => ({
  id,
  status: 4,
  createdAt: '2026-09-29T00:00:00.000Z',
  updatedAt: '2026-09-29T00:00:00.000Z',
  type: 'book',
  is4k: false,
  serverId: null,
  profileId: null,
  metadataProfileId: null,
  rootFolder: null,
  languageProfileId: null,
  tags: null,
  bookFormat: 'audiobook',
  media: {
    downloadStatus: [],
    audiobookDownloadStatus: [],
    id: id + 9000,
    mediaType: 'book',
    tmdbId: 0,
    status: 1,
    status4k: 1,
    identifiers: [{ provider: 'openlibrary', value: externalId }],
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

describe('failed request retry', () => {
  it('lets an authorized requester search again and hides the action on someone else’s request', () => {
    cy.loginAsUser();
    cy.request('/api/v1/auth/me').then(({ body: currentUser }) => {
      const requestPermissionMask =
        BigInt(REQUEST_PERMISSION) | REQUEST_BOOK_PERMISSION;
      expect(
        (BigInt(currentUser.permissions) & requestPermissionMask) !== 0n
      ).to.equal(true);

      const ownedRequest = createFailedBookRequest(
        801,
        { id: currentUser.id, permissions: currentUser.permissions },
        'OL12345W'
      );
      const otherRequest = createFailedBookRequest(
        802,
        { id: currentUser.id + 1, permissions: currentUser.permissions },
        'OL12346W'
      );

      cy.intercept('GET', `/api/v1/user/${currentUser.id}/requests?*`, {
        pageInfo: { pages: 1, pageSize: 10, results: 2, page: 1 },
        results: [ownedRequest, otherRequest],
        serviceErrors: {
          radarr: [],
          sonarr: [],
          lidarr: [],
          readarr: [],
        },
      }).as('getFailedRequests');
      cy.intercept('GET', '/api/v1/request/801', ownedRequest);
      cy.intercept('GET', '/api/v1/request/802', otherRequest);
      cy.intercept('GET', '/api/v1/book/OL12345W', {
        id: 'OL12345W',
        mediaType: 'book',
        title: 'Owned Failed Audiobook',
        author: 'Fixture Author',
        isbnCandidates: [],
        subjects: [],
      }).as('ownedBook');
      cy.intercept('GET', '/api/v1/book/OL12346W', {
        id: 'OL12346W',
        mediaType: 'book',
        title: 'Someone Else’s Failed Audiobook',
        author: 'Fixture Author',
        isbnCandidates: [],
        subjects: [],
      });
      cy.intercept('POST', '/api/v1/request/801/retry', {
        statusCode: 200,
        body: ownedRequest,
      }).as('retryOwnedRequest');

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
      cy.wait('@getFailedRequests');
      cy.contains('.slider-header', 'Recent Requests')
        .closest('[data-testid=media-slider]')
        .scrollIntoView()
        .should('be.visible')
        .contains('[data-testid=request-card]', 'Owned Failed Audiobook');
      cy.wait('@ownedBook');
      cy.contains('Owned Failed Audiobook')
        .parents('[data-testid=request-card]')
        .scrollIntoView()
        .within(() => {
          cy.contains('button', /^Retry$/)
            .should('be.visible')
            .and(($button) => {
              const button = $button[0];
              const document = button.ownerDocument;
              const view = document.defaultView!;
              const probe = document.createElement('div');
              probe.style.position = 'absolute';
              probe.style.visibility = 'hidden';
              probe.style.height = view
                .getComputedStyle(button)
                .getPropertyValue('--action-control-height');
              document.body.appendChild(probe);
              const sharedHeight = parseFloat(
                view.getComputedStyle(probe).height
              );
              probe.remove();
              expect(
                sharedHeight,
                'configured shared action height'
              ).to.be.greaterThan(0);
              expect(button.getBoundingClientRect().height).to.be.closeTo(
                sharedHeight,
                0.5
              );
            })
            .click();
        });
      cy.wait('@retryOwnedRequest')
        .its('request.url')
        .should('include', '/api/v1/request/801/retry');
      cy.contains('Someone Else’s Failed Audiobook')
        .parents('[data-testid=request-card]')
        .should('not.contain', 'Retry');
    });
  });
});
