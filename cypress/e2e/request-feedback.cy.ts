type RequestStatusFixture = {
  stage: string;
  attempt: number;
  percent: number | null;
  size: number | null;
  sizeLeft: number | null;
  estimatedCompletionTime: string | null;
  downloadCount: number;
  downloadId: string | null;
  service: string | null;
  message: string;
  messageKey: string;
  observedAt: string;
  isTerminal: boolean;
  needsAttention: boolean;
  retryable: boolean;
};

const requestStatus: RequestStatusFixture = {
  stage: 'requested',
  attempt: 0,
  percent: null,
  size: null,
  sizeLeft: null,
  estimatedCompletionTime: null,
  downloadCount: 0,
  downloadId: null,
  service: null,
  message: 'Pending approval.',
  messageKey: 'waitingForApproval',
  observedAt: '2026-11-11T12:00:00.000Z',
  isTerminal: false,
  needsAttention: false,
  retryable: false,
};

const request = {
  id: 101,
  type: 'tv',
  status: 1,
  is4k: false,
  createdAt: '2026-11-11T12:00:00.000Z',
  updatedAt: '2026-11-11T12:00:00.000Z',
  requestedBy: { id: 1, displayName: 'admin', avatar: null },
  modifiedBy: null,
  media: {
    id: 303,
    mediaType: 'tv',
    tmdbId: 66732,
    status: 1,
    status4k: 1,
    identifiers: [],
  },
  seasons: [],
  watchAheadEpisodeCount: 0,
  watchAheadUsesUserDefault: true,
  watchAheadParentRequestId: null,
  isAutoRequest: false,
};

const statusResults = {
  pageInfo: { page: 1, pages: 1, pageSize: 10, results: 1 },
  results: [{ request, status: requestStatus, canRemove: false }],
  counts: {
    total: 1,
    pending: 1,
    active: 1,
    incomplete: 1,
    attention: 0,
    completed: 0,
    unavailable: 0,
    failed: 0,
  },
  olderCount: 0,
};

const installRequestFixtures = () => {
  cy.intercept('GET', '/api/v1/request/count', { pending: 1 });
  cy.intercept(
    'GET',
    '/api/v1/request?take=1&skip=0&filter=active&requestedBy=1',
    {
      pageInfo: { page: 1, pages: 1, pageSize: 1, results: 166 },
      results: [],
    }
  );
  cy.intercept('GET', '/api/v1/request/status?*', statusResults);
  cy.intercept('GET', '/api/v1/request/status/101', {
    request,
    current: requestStatus,
    history: { results: [], total: 0 },
  });
  cy.intercept('GET', '/api/v1/request/status/users*', {
    pageInfo: { page: 1, pages: 1, pageSize: 100, results: 1 },
    results: [{ id: 1, displayName: 'admin', avatar: '' }],
  });
  cy.intercept('GET', '/api/v1/tv/66732', {
    id: 66732,
    name: 'Episode Queue Test Series',
    mediaType: 'tv',
    firstAirDate: '2020-01-01',
    posterPath: null,
    backdropPath: null,
    genres: [],
    createdBy: [],
    episodeRunTime: [],
  });
  cy.intercept('GET', '/api/v1/user/1/settings/episode-queue', {
    defaultEpisodeCount: 2,
  });
};

const selectPersius = () =>
  cy.request('/api/v1/auth/me').then(({ body: currentUser }) =>
    cy.request({
      method: 'POST',
      url: `/api/v1/user/${currentUser.id}/settings/interface-theme`,
      body: { theme: 'persiusNG' },
      headers: { 'X-Forwarded-Proto': 'https' },
    })
  );

describe('request feedback discoverability', () => {
  beforeEach(() => {
    cy.loginAsAdmin();
    selectPersius();
    installRequestFixtures();
  });

  for (const viewport of [
    { width: 1440, height: 900, name: 'desktop' },
    { width: 390, height: 844, name: 'phone' },
  ]) {
    it(`leads to Pending and exposes Episode Queue on ${viewport.name}`, () => {
      let restoreAnimationFrame: (() => void) | undefined;
      cy.viewport(viewport.width, viewport.height);
      cy.visit('/requests?filter=pending', {
        onBeforeLoad(window) {
          const originalRequestAnimationFrame =
            window.requestAnimationFrame.bind(window);
          window.requestAnimationFrame = (callback) =>
            window.setTimeout(() => callback(window.performance.now()), 16);
          restoreAnimationFrame = () => {
            window.requestAnimationFrame = originalRequestAnimationFrame;
          };
        },
      });
      cy.window().then(() => restoreAnimationFrame?.());

      cy.get('[data-interface-role="request-card"]').should('be.visible');
      cy.get('.persius-request-tabs button[aria-pressed="true"]').should(
        'contain.text',
        'Pending'
      );
      cy.get(
        'nav[data-navigation-device="desktop"] a[data-navigation-link-id="requests"]'
      )
        .should('have.attr', 'href', '/requests?filter=pending')
        .and('contain.text', '1');
      cy.contains(
        '[data-interface-role="request-card"] .persius-request-actions button',
        'Episode Queue'
      ).should('be.visible');

      if (viewport.name === 'phone') {
        cy.get('button[aria-label="More navigation"]').click();
        cy.get('button[aria-label="Close menu"]').should('exist');
        cy.get('.mobile-menu-navigation a[data-navigation-link-id="requests"]')
          .should('exist')
          .and('have.attr', 'href', '/requests?filter=pending')
          .and('contain.text', '1');
      }

      cy.contains(
        '[data-interface-role="request-card"] .persius-request-actions button',
        'Episode Queue'
      ).click();
      cy.get('[role="dialog"]').should('contain.text', 'Episode Queue');
      cy.get('[role="dialog"]').should('contain.text', 'Queue Length');
    });
  }
});
