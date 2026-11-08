const makeMovie = (title: string, id: number) => ({
  id,
  mediaType: 'movie',
  title,
  releaseDate: '2026-01-01',
  posterPath: '/images/seerr_poster_not_found.png',
  voteAverage: 7,
});

const makeSeries = (name: string, id: number) => ({
  id,
  mediaType: 'tv',
  name,
  firstAirDate: '2026-01-01',
  posterPath: '/images/seerr_poster_not_found.png',
  voteAverage: 7,
});

const makeAlbum = (title: string, id: string) => ({
  id,
  mediaType: 'album',
  title,
  posterPath: '/images/seerr_poster_not_found.png',
  'primary-type': 'Album',
  'artist-credit': [{ name: 'Verifier Artist' }],
});

const makeBook = (title: string, id: string) => ({
  id,
  mediaType: 'book',
  title,
  author: 'Verifier Author',
  firstPublishYear: 2026,
  posterPath: '/images/seerr_poster_not_found.png',
});

describe('Theme picker and seeded discovery refresh', () => {
  beforeEach(() => {
    cy.loginAsAdmin();
    cy.mockConfiguredMediaAvailability({
      booksEnabled: true,
      musicEnabled: true,
    });
  });

  it('changes themes through the picker and persists across reloads', () => {
    cy.viewport(1400, 900);
    cy.intercept('GET', '/api/v1/discover/movies*', {
      page: 1,
      totalPages: 1,
      totalResults: 0,
      results: [],
    });

    cy.request('/api/v1/auth/me').then(({ body: user }) => {
      cy.request('POST', `/api/v1/user/${user.id}/settings/theme`, {
        palette: 'seerr',
      })
        .its('body.themePalette')
        .should('eq', 'seerr');
      cy.request('POST', `/api/v1/user/${user.id}/settings/advanced-theme`, {
        overrides: null,
      })
        .its('body.advancedThemeOverrides')
        .should('eq', null);
    });

    cy.visit('/discover/movies', {
      onBeforeLoad(win) {
        win.localStorage.removeItem('seerr-theme-mode');
        win.localStorage.removeItem('seerr-theme-palette');
      },
    });
    cy.contains('[data-testid=page-header]', 'Movies').should('be.visible');

    cy.get('html').should('have.attr', 'data-theme-palette', 'seerr');
    cy.get('meta[name="theme-color"]').should(
      'have.attr',
      'content',
      '#1f2937'
    );
    cy.get('button[aria-label="Theme picker"]')
      .should('have.length', 1)
      .click();
    cy.contains('button', /^SeerrNG$/).should('exist');
    cy.contains('button', /^Seerr$/).click();
    cy.get('html').should('have.attr', 'data-theme-palette', 'classic');
    cy.get('meta[name="theme-color"]').should(
      'have.attr',
      'content',
      '#1e293b'
    );
    cy.get('button[aria-label="Theme picker"]')
      .should('have.length', 1)
      .click();
    cy.contains('button', 'Lagoon').click();
    cy.get('html').should('have.attr', 'data-theme-palette', 'lagoon');
    cy.get('meta[name="theme-color"]').should(
      'not.have.attr',
      'content',
      '#1f2937'
    );
    cy.window()
      .its('localStorage')
      .invoke('getItem', 'seerr-theme-palette')
      .should('eq', 'lagoon');

    cy.reload();
    cy.contains('[data-testid=page-header]', 'Movies').should('be.visible');
    cy.get('html').should('have.attr', 'data-theme-palette', 'lagoon');

    cy.get('button[aria-label="Theme picker"]')
      .should('have.length', 1)
      .click();
    cy.contains('button', 'Dark mode').click();
    cy.get('html').should('have.attr', 'data-theme-mode', 'light');
    cy.window()
      .its('localStorage')
      .invoke('getItem', 'seerr-theme-mode')
      .should('eq', 'light');
  });

  it('requests new seeded lineups for movies, series, music, and books after page reload', () => {
    cy.viewport(1400, 900);

    const movieSeeds: string[] = [];
    cy.intercept('GET', '/api/v1/discover/movies*', {
      page: 1,
      totalPages: 1,
      totalResults: 0,
      results: [],
    });
    cy.intercept(
      {
        method: 'GET',
        pathname: '/api/v1/discover/movies',
        query: { shuffleSeed: /.+/ },
      },
      (req) => {
        const seed = req.query.shuffleSeed;
        expect(seed, 'movie shuffleSeed').to.be.a('string');
        movieSeeds.push(seed as string);
        req.reply({
          page: 1,
          totalPages: 1,
          totalResults: 2,
          results: [
            makeMovie(`Movie lineup ${seed}`, 101),
            makeMovie(`Movie backup ${seed}`, 102),
          ],
        });
      }
    ).as('movies');
    cy.visit('/discover/movies');
    cy.wait('@movies');
    cy.reload();
    cy.wait('@movies');
    cy.then(() => {
      expect(movieSeeds.length).to.be.greaterThan(1);
      expect(new Set(movieSeeds).size).to.be.greaterThan(1);
    });

    const seriesSeeds: string[] = [];
    cy.intercept('GET', '/api/v1/discover/tv*', {
      page: 1,
      totalPages: 1,
      totalResults: 0,
      results: [],
    });
    cy.intercept(
      {
        method: 'GET',
        pathname: '/api/v1/discover/tv',
        query: { shuffleSeed: /.+/ },
      },
      (req) => {
        const seed = req.query.shuffleSeed;
        expect(seed, 'series shuffleSeed').to.be.a('string');
        seriesSeeds.push(seed as string);
        req.reply({
          page: 1,
          totalPages: 1,
          totalResults: 2,
          results: [
            makeSeries(`Series lineup ${seed}`, 201),
            makeSeries(`Series backup ${seed}`, 202),
          ],
        });
      }
    ).as('series');
    cy.visit('/discover/tv');
    cy.wait('@series');
    cy.reload();
    cy.wait('@series');
    cy.then(() => {
      expect(seriesSeeds.length).to.be.greaterThan(1);
      expect(new Set(seriesSeeds).size).to.be.greaterThan(1);
    });

    const musicSeeds: string[] = [];
    cy.intercept('GET', '/api/v1/discover/music*', {
      page: 1,
      totalPages: 1,
      totalResults: 0,
      results: [],
    });
    cy.intercept(
      {
        method: 'GET',
        pathname: '/api/v1/discover/music',
        query: { shuffleSeed: /.+/ },
      },
      (req) => {
        const seed = req.query.shuffleSeed;
        expect(seed, 'music shuffleSeed').to.be.a('string');
        musicSeeds.push(seed as string);
        req.reply({
          page: 1,
          totalPages: 1,
          totalResults: 2,
          results: [
            makeAlbum(`Music lineup ${seed}`, `album-${seed}`),
            makeAlbum(`Music backup ${seed}`, `album-backup-${seed}`),
          ],
        });
      }
    ).as('music');
    cy.visit('/discover/music');
    cy.wait('@music');
    cy.reload();
    cy.wait('@music');
    cy.then(() => {
      expect(musicSeeds.length).to.be.greaterThan(1);
      expect(new Set(musicSeeds).size).to.be.greaterThan(1);
    });

    const bookSeeds: string[] = [];
    cy.intercept('GET', '/api/v1/discover/books*', {
      page: 1,
      totalPages: 1,
      totalResults: 0,
      results: [],
    });
    cy.intercept(
      {
        method: 'GET',
        pathname: '/api/v1/discover/books',
        query: { shuffleSeed: /.+/ },
      },
      (req) => {
        const seed = req.query.shuffleSeed;
        expect(seed, 'book shuffleSeed').to.be.a('string');
        bookSeeds.push(seed as string);
        req.reply({
          page: 1,
          totalPages: 1,
          totalResults: 2,
          results: [
            makeBook(`Book lineup ${seed}`, `book-${seed}`),
            makeBook(`Book backup ${seed}`, `book-backup-${seed}`),
          ],
        });
      }
    ).as('books');
    cy.visit('/discover/books');
    cy.wait('@books');
    cy.reload();
    cy.wait('@books');
    cy.then(() => {
      expect(bookSeeds.length).to.be.greaterThan(1);
      expect(new Set(bookSeeds).size).to.be.greaterThan(1);
    });
  });

  it('prefetches and appends another ranked book page before reaching the bottom', () => {
    cy.viewport(500, 700);

    let firstPageRequests = 0;
    const firstPageBooks = Array.from({ length: 20 }, (_, index) =>
      makeBook(`First page book ${index + 1}`, `first-page-${index + 1}`)
    );

    cy.intercept('GET', '/api/v1/discover/books*', (req) => {
      if (req.query.page === '2') {
        req.reply({
          page: 2,
          totalPages: 2,
          totalResults: 41,
          results: [makeBook('Appended book', 'second-page-1')],
        });
        return;
      }

      firstPageRequests += 1;
      req.reply({
        page: 1,
        totalPages: 2,
        totalResults: 41,
        results: firstPageBooks,
      });
    }).as('books');

    cy.visit('/discover/books');
    cy.wait('@books');
    cy.get('[data-testid=title-card]')
      .should('have.length', 20)
      .first()
      .then(($firstCard) => {
        cy.window().then((win) => {
          const maxScrollTop =
            win.document.documentElement.scrollHeight - win.innerHeight;
          const prefetchScrollTop = maxScrollTop - win.innerHeight / 2;

          expect(prefetchScrollTop).to.be.greaterThan(0);
          cy.scrollTo(0, prefetchScrollTop);
          cy.window().its('scrollY').should('be.lessThan', maxScrollTop);
        });
        cy.wait('@books').its('request.query.page').should('eq', '2');

        cy.get('[data-testid=title-card]')
          .should('have.length', 21)
          .first()
          .should(($currentFirstCard) => {
            expect($currentFirstCard[0]).to.eq($firstCard[0]);
          });
      });
    cy.then(() => {
      expect(firstPageRequests).to.eq(1);
    });
  });
});
