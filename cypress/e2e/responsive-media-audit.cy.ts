// eslint-disable-next-line no-relative-import-paths/no-relative-import-paths -- Theme interaction helper.
import { openFilterSection } from '../support/themeControls';
const assertNoHorizontalOverflow = () => {
  cy.document().then((document) => {
    expect(
      document.documentElement.scrollWidth,
      'document width at narrow viewport'
    ).to.be.at.most(document.documentElement.clientWidth + 1);
  });
};

const emptyPage = { page: 1, totalPages: 1, totalResults: 0, results: [] };

describe('Narrow-window media audit', () => {
  beforeEach(() => {
    cy.loginAsAdmin();
    cy.viewport(390, 844);
  });

  it('keeps search filters and results within a phone viewport', () => {
    cy.intercept('GET', '/api/v1/search*', {
      page: 1,
      totalPages: 1,
      totalResults: 1,
      results: [
        {
          id: 'OLNARROW1',
          mediaType: 'book',
          title: 'Narrow Window Book',
          author: 'Audit Author',
          firstPublishYear: 2026,
          posterPath: '/images/seerr_poster_not_found.png',
        },
      ],
    }).as('search');

    cy.visit('/search?query=narrow');
    cy.wait('@search');
    cy.get('[data-testid="title-card"]').should('have.length.at.least', 1);
    assertNoHorizontalOverflow();
  });

  it('keeps book and music Discover controls within a phone viewport', () => {
    cy.mockConfiguredMediaAvailability({ booksEnabled: true });
    cy.intercept('GET', '/api/v1/discover/books*', {
      ...emptyPage,
      totalResults: 1,
      results: [
        {
          id: 'OLNARROWBOOK',
          mediaType: 'book',
          title: 'Narrow Discover Book',
          author: 'Discover Author',
          posterPath: '/images/seerr_poster_not_found.png',
        },
      ],
    }).as('books');
    cy.visit('/discover/books');
    cy.wait('@books');
    cy.get('[data-testid="title-card"]').should('have.length.at.least', 1);
    assertNoHorizontalOverflow();

    cy.intercept('GET', '/api/v1/discover/music*', {
      ...emptyPage,
      totalResults: 1,
      results: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          mediaType: 'album',
          title: 'Narrow Discover Album',
          'primary-type': 'Album',
          posterPath: '/images/seerr_poster_not_found.png',
          'artist-credit': [{ name: 'Discover Artist' }],
        },
      ],
    }).as('music');
    cy.visit('/discover/music');
    cy.wait('@music');
    cy.get('[data-testid="title-card"]').should('have.length.at.least', 1);
    assertNoHorizontalOverflow();
  });

  it('keeps Request Status and its action controls within a phone viewport', () => {
    cy.visit('/requests');
    openFilterSection('Task Filters');
    cy.contains('button', 'Clear Filters').should('be.visible');
    openFilterSection('Media Filters');
    assertNoHorizontalOverflow();
  });
});
