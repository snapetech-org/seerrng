const clickFirstTitleCardInSlider = (sliderTitle: string): void => {
  cy.contains('.slider-header', sliderTitle)
    .closest('[data-testid=media-slider]')
    .find('[data-testid=title-card]', { timeout: 15000 })
    .first()
    .trigger('mouseover')
    .find('[data-testid=title-card-title]')
    .invoke('text')
    .then((text) => {
      cy.contains('.slider-header', sliderTitle)
        .closest('[data-testid=media-slider]')
        .find('[data-testid=title-card]')
        .first()
        .click();
      cy.get('[data-testid=media-title]').should('contain', text);
    });
};

const stubTitleDetails = (
  mediaType: 'movie' | 'tv',
  result: Record<string, unknown> & { id: number }
) => {
  const details = {
    ...result,
    credits: { cast: [], crew: [] },
    productionCompanies: [],
    productionCountries: [],
    spokenLanguages: [],
    genres: [],
    keywords: [],
    relatedVideos: [],
    externalIds: {},
    releases: { results: [] },
    contentRatings: { results: [] },
    seasons: [],
    createdBy: [],
    episodeRunTime: [],
    networks: [],
    originalLanguage: 'en',
    status: 'Released',
  };

  cy.intercept('GET', `/api/v1/${mediaType}/${result.id}`, details);
  cy.intercept('GET', `**/_next/data/*/${mediaType}/${result.id}.json*`, {
    pageProps: { [mediaType]: details },
    __N_SSP: true,
  });
};

describe('Discover', () => {
  beforeEach(() => {
    cy.loginAsAdmin();
  });

  it('loads a trending item', () => {
    const movie = {
      id: 438148,
      mediaType: 'movie',
      title: 'Minions: The Rise of Gru',
      overview: '',
      releaseDate: '2022-06-29',
      posterPath: null,
    };
    cy.intercept('GET', '/api/v1/discover/trending*', {
      page: 1,
      totalPages: 1,
      totalResults: 1,
      results: [movie],
    });
    stubTitleDetails('movie', movie);
    cy.visit('/');
    cy.contains('.slider-header', 'Trending').scrollIntoView();
    cy.contains('[data-testid=title-card-title]', 'Minions: The Rise of Gru', {
      timeout: 15000,
    }).should('be.visible');
  });

  it('loads popular movies', () => {
    const movie = {
      id: 438148,
      mediaType: 'movie',
      title: 'Minions: The Rise of Gru',
      overview: '',
      releaseDate: '2022-06-29',
      posterPath: null,
    };
    cy.intercept('GET', '/api/v1/discover/movies*', {
      page: 1,
      totalPages: 1,
      totalResults: 1,
      results: [movie],
    });
    stubTitleDetails('movie', movie);
    cy.visit('/');
    cy.contains('.slider-header', 'Popular Movies').scrollIntoView();
    cy.contains('[data-testid=title-card-title]', 'Minions: The Rise of Gru', {
      timeout: 15000,
    }).should('be.visible');
  });

  it('switches a selected genre between include and exclude modes', () => {
    cy.viewport(1280, 900);
    cy.intercept('GET', '/api/v1/genres/movie', {
      body: [{ id: 28, name: 'Action' }],
    });
    cy.intercept('GET', '/api/v1/discover/movies*', {
      page: 1,
      totalPages: 1,
      totalResults: 0,
      results: [],
    }).as('getMovieDiscover');

    cy.visit('/discover/movies');
    cy.wait('@getMovieDiscover');
    cy.contains('button.detail-disclosure-button', 'Filters').click();
    cy.get('button[aria-label="Genres"]').click();
    cy.contains('[role=option]', 'Action').click();
    cy.wait('@getMovieDiscover').then(({ request }) => {
      expect(request.query.genre).to.eq('28');
      expect(request.query.excludeGenre).to.equal(undefined);
    });
    cy.location('search').should('include', 'genre=28');

    cy.get('button[aria-label="Exclude Genres"]')
      .should('have.attr', 'aria-pressed', 'false')
      .click();
    cy.get('button[aria-label="Exclude Genres"]').should(
      'have.attr',
      'aria-pressed',
      'true'
    );
    cy.wait('@getMovieDiscover').then(({ request }) => {
      expect(request.query.genre).to.eq('28');
      expect(request.query.excludeGenre).to.eq('true');
    });
    cy.location('search').should('include', 'excludeGenre=true');
    cy.window().then((win) => {
      expect(win.document.documentElement.scrollWidth).to.be.at.most(
        win.innerWidth
      );
    });

    cy.get('[aria-label="Quality Available"]').contains('button', 'HD').click();
    cy.wait('@getMovieDiscover').then(({ request }) => {
      expect(request.query.availability).to.eq('hd');
      expect(request.query.genre).to.eq('28');
      expect(request.query.excludeGenre).to.eq('true');
    });
    cy.location('search').should('include', 'availability=hd');
    cy.location('search').should('include', 'excludeGenre=true');

    cy.get('button[aria-label="Exclude Genres"]')
      .should('have.attr', 'aria-pressed', 'true')
      .click();
    cy.get('button[aria-label="Exclude Genres"]').should(
      'have.attr',
      'aria-pressed',
      'false'
    );
    cy.wait('@getMovieDiscover').then(({ request }) => {
      expect(request.query.excludeGenre).to.equal(undefined);
    });
    cy.location('search').should('not.include', 'excludeGenre=');
  });

  it('clears an unsupported status exclusion when switching to local availability', () => {
    cy.viewport(390, 844);
    cy.intercept('GET', '/api/v1/genres/tv', {
      body: [{ id: 18, name: 'Drama' }],
    });
    cy.intercept('GET', '/api/v1/discover/tv*', {
      page: 1,
      totalPages: 1,
      totalResults: 0,
      results: [],
    }).as('getTvDiscover');

    cy.visit('/discover/tv');
    cy.wait('@getTvDiscover');
    cy.contains('button.detail-disclosure-button', 'Filters').click();
    cy.get('button[aria-label="Status"]').click();
    cy.contains('[role=option]', 'Ended').click();
    cy.wait('@getTvDiscover');
    cy.get('button[aria-label="Exclude Status"]').click();
    cy.wait('@getTvDiscover');
    cy.get('button[aria-label="Exclude Status"]').should(
      'have.attr',
      'aria-pressed',
      'true'
    );
    cy.get('button[aria-label="Exclude Status"]').then(($button) => {
      const bounds = $button[0].getBoundingClientRect();
      expect(bounds.left).to.be.at.least(0);
      cy.window().then((win) => {
        expect(bounds.right).to.be.at.most(win.innerWidth);
      });
    });

    cy.get('[aria-label="Quality Available"]').contains('button', 'HD').click();
    cy.wait('@getTvDiscover').then(({ request }) => {
      expect(request.query.availability).to.eq('hd');
      expect(request.query.status).to.equal(undefined);
      expect(request.query.excludeStatus).to.equal(undefined);
    });
    cy.location('search').should('include', 'availability=hd');
    cy.location('search').should('not.include', 'status=');
    cy.location('search').should('not.include', 'excludeStatus=');
    cy.get('button[aria-label="Status"]').should('not.exist');
    cy.get('.page-error-message[role="status"][data-severity="info"]')
      .should(
        'have.text',
        'Local availability cannot apply Studio, Streaming Services, or Series Status filters. Those selections were cleared.'
      )
      .then(($notice) => {
        const bounds = $notice[0].getBoundingClientRect();
        expect(bounds.left).to.be.at.least(0);
        cy.window().then((win) => {
          expect(bounds.right).to.be.at.most(win.innerWidth);
        });
      });
    cy.window().then((win) => {
      expect(win.document.documentElement.scrollWidth).to.be.at.most(
        win.innerWidth
      );
    });
  });

  it('loads upcoming movies', () => {
    const movie = {
      id: 99002,
      mediaType: 'movie',
      title: 'Upcoming Movie Fixture',
      releaseDate: '2099-01-01',
      posterPath: null,
    };
    cy.intercept('GET', '/api/v1/discover/movies*', {
      page: 1,
      totalPages: 1,
      totalResults: 1,
      results: [movie],
    });
    stubTitleDetails('movie', movie);
    cy.visit('/');
    cy.contains('.slider-header', 'Upcoming Movies').scrollIntoView();
    clickFirstTitleCardInSlider('Upcoming Movies');
  });

  it('loads popular series', () => {
    const series = {
      id: 99001,
      mediaType: 'tv',
      name: 'Upcoming Series Fixture',
      firstAirDate: '2099-01-01',
      posterPath: null,
    };
    cy.intercept('GET', '/api/v1/discover/tv*', {
      page: 1,
      totalPages: 1,
      totalResults: 1,
      results: [series],
    }).as('getPopularTv');
    stubTitleDetails('tv', series);
    cy.visit('/');
    cy.contains('.slider-header', 'Popular Series').scrollIntoView();
    cy.wait('@getPopularTv');
    clickFirstTitleCardInSlider('Popular Series');
  });

  it('loads upcoming series', () => {
    const series = {
      id: 99001,
      mediaType: 'tv',
      name: 'Upcoming Series Fixture',
      firstAirDate: '2099-01-01',
      posterPath: null,
    };
    cy.intercept('GET', '/api/v1/discover/tv*', {
      page: 1,
      totalPages: 1,
      totalResults: 1,
      results: [series],
    });
    stubTitleDetails('tv', series);
    cy.visit('/');
    cy.contains('.slider-header', 'Upcoming Series').scrollIntoView();
    clickFirstTitleCardInSlider('Upcoming Series');
  });

  it('displays error for media with invalid TMDB ID', () => {
    cy.intercept('GET', '/api/v1/movie/998814', { statusCode: 404 });
    cy.intercept('GET', '/api/v1/media?*', {
      pageInfo: { pages: 1, pageSize: 20, results: 1, page: 1 },
      results: [
        {
          downloadStatus: [],
          downloadStatus4k: [],
          id: 1922,
          mediaType: 'movie',
          tmdbId: 998814,
          tvdbId: null,
          imdbId: null,
          status: 5,
          status4k: 1,
          createdAt: '2022-08-18T18:11:13.000Z',
          updatedAt: '2022-08-18T19:56:41.000Z',
          lastSeasonChange: '2022-08-18T19:56:41.000Z',
          mediaAddedAt: '2022-08-18T19:56:41.000Z',
          serviceId: null,
          serviceId4k: null,
          externalServiceId: null,
          externalServiceId4k: null,
          externalServiceSlug: null,
          externalServiceSlug4k: null,
          ratingKey: null,
          ratingKey4k: null,
          seasons: [],
        },
      ],
    }).as('getMedia');

    cy.visit('/');
    cy.wait('@getMedia');
    cy.contains('.slider-header', 'Recently Added')
      .closest('[data-testid=media-slider]')
      .find('[data-testid=title-card]')
      .first()
      .find('[data-testid=title-card-title]')
      .contains('Movie Not Found');
  });

  it('displays error for request with invalid TMDB ID', () => {
    cy.intercept('GET', '/api/v1/movie/998814', { statusCode: 404 });
    cy.intercept('GET', '/api/v1/request?*', {
      pageInfo: { pages: 1, pageSize: 10, results: 1, page: 1 },
      results: [
        {
          id: 582,
          status: 1,
          createdAt: '2022-08-18T18:11:13.000Z',
          updatedAt: '2022-08-18T18:11:13.000Z',
          type: 'movie',
          is4k: false,
          serverId: null,
          profileId: null,
          rootFolder: null,
          languageProfileId: null,
          tags: null,
          media: {
            downloadStatus: [],
            downloadStatus4k: [],
            id: 1922,
            mediaType: 'movie',
            tmdbId: 998814,
            tvdbId: null,
            imdbId: null,
            status: 2,
            status4k: 1,
            createdAt: '2022-08-18T18:11:13.000Z',
            updatedAt: '2022-08-18T18:11:13.000Z',
            lastSeasonChange: '2022-08-18T18:11:13.000Z',
            mediaAddedAt: null,
            serviceId: null,
            serviceId4k: null,
            externalServiceId: null,
            externalServiceId4k: null,
            externalServiceSlug: null,
            externalServiceSlug4k: null,
            ratingKey: null,
            ratingKey4k: null,
          },
          seasons: [],
          modifiedBy: null,
          requestedBy: {
            permissions: 4194336,
            id: 18,
            email: 'demo@seerr.dev',
            plexUsername: null,
            username: '',
            recoveryLinkExpirationDate: null,
            userType: 2,
            avatar:
              'https://gravatar.com/avatar/c77fdc27cab83732b8623d2ea873d330?default=mm&size=200',
            movieQuotaLimit: null,
            movieQuotaDays: null,
            tvQuotaLimit: null,
            tvQuotaDays: null,
            createdAt: '2022-08-17T04:55:28.000Z',
            updatedAt: '2022-08-17T04:55:28.000Z',
            requestCount: 1,
            displayName: 'demo@seerr.dev',
          },
          seasonCount: 0,
        },
      ],
    }).as('getRequests');
    cy.intercept('GET', '/api/v1/request/582', { statusCode: 500 });

    cy.visit('/');
    cy.wait('@getRequests');
    cy.contains('.slider-header', 'Recent Requests')
      .closest('[data-testid=media-slider]')
      .scrollIntoView()
      .should('be.visible')
      .find('[data-testid=request-card]')
      .first()
      .find('[data-testid=request-card-title]')
      .contains('Movie Not Found');
  });

  it('deep-links failed book and music request cards to manage slideovers', () => {
    const requestedBy = {
      permissions: 4194336,
      id: 18,
      email: 'friend@seerr.dev',
      plexUsername: null,
      username: '',
      recoveryLinkExpirationDate: null,
      userType: 2,
      avatar:
        'https://gravatar.com/avatar/c77fdc27cab83732b8623d2ea873d330?default=mm&size=200',
      movieQuotaLimit: null,
      movieQuotaDays: null,
      tvQuotaLimit: null,
      tvQuotaDays: null,
      createdAt: '2022-08-17T04:55:28.000Z',
      updatedAt: '2022-08-17T04:55:28.000Z',
      requestCount: 1,
      displayName: 'friend@seerr.dev',
    };

    cy.intercept('GET', '/api/v1/request?*', {
      pageInfo: { pages: 1, pageSize: 10, results: 2, page: 1 },
      results: [
        {
          id: 701,
          status: 4,
          createdAt: '2026-05-15T00:00:00.000Z',
          updatedAt: '2026-05-15T00:00:00.000Z',
          type: 'book',
          is4k: false,
          serverId: null,
          profileId: null,
          metadataProfileId: null,
          rootFolder: null,
          languageProfileId: null,
          tags: null,
          bookFormat: 'ebook',
          media: {
            downloadStatus: [],
            audiobookDownloadStatus: [],
            id: 9701,
            mediaType: 'book',
            tmdbId: 0,
            status: 1,
            status4k: 1,
            identifiers: [{ provider: 'openlibrary', value: 'OLCARDFAILEDW' }],
          },
          seasons: [],
          modifiedBy: null,
          requestedBy,
          seasonCount: 0,
        },
        {
          id: 702,
          status: 4,
          createdAt: '2026-05-15T00:00:00.000Z',
          updatedAt: '2026-05-15T00:00:00.000Z',
          type: 'music',
          is4k: false,
          serverId: null,
          profileId: null,
          metadataProfileId: null,
          rootFolder: null,
          languageProfileId: null,
          tags: null,
          media: {
            downloadStatus: [],
            id: 9702,
            mediaType: 'music',
            tmdbId: 0,
            mbId: '56565656-5656-5656-5656-565656565656',
            status: 1,
            status4k: 1,
          },
          seasons: [],
          modifiedBy: null,
          requestedBy,
          seasonCount: 0,
        },
      ],
      serviceErrors: {
        radarr: [],
        sonarr: [],
        lidarr: [],
        readarr: [],
      },
    }).as('getRequests');
    cy.intercept('GET', '/api/v1/request/701', { statusCode: 500 });
    cy.intercept('GET', '/api/v1/request/702', { statusCode: 500 });
    cy.intercept('GET', '/api/v1/book/OLCARDFAILEDW', {
      id: 'OLCARDFAILEDW',
      mediaType: 'book',
      title: 'Failed Card Book',
      author: 'Card Author',
      firstPublishYear: 2026,
      isbnCandidates: [],
      subjects: [],
    });
    cy.intercept('GET', '/api/v1/music/56565656-5656-5656-5656-565656565656', {
      id: '56565656-5656-5656-5656-565656565656',
      mbId: '56565656-5656-5656-5656-565656565656',
      mediaType: 'album',
      title: 'Failed Card Album',
      type: 'Album',
      releaseDate: '2026-05-01',
      artist: {
        id: '78787878-7878-7878-7878-787878787878',
        name: 'Card Artist',
      },
      tracks: [],
    });

    cy.visit('/');
    cy.wait('@getRequests');
    cy.contains('.slider-header', 'Recent Requests')
      .closest('[data-testid=media-slider]')
      .scrollIntoView()
      .should('be.visible')
      .contains('[data-testid=request-card]', 'Failed Card Book')
      .find('a[href="/book/OLCARDFAILEDW?manage=1&format=ebook"]')
      .should('contain', 'Failed');
    cy.contains('.slider-header', 'Recent Requests')
      .closest('[data-testid=media-slider]')
      .scrollIntoView()
      .should('be.visible')
      .contains('[data-testid=request-card]', 'Failed Card Album')
      .find('a[href="/music/56565656-5656-5656-5656-565656565656?manage=1"]')
      .should('contain', 'Failed');
  });

  it('loads plex watchlist', () => {
    cy.intercept('/api/v1/discover/watchlist*', {
      fixture: 'watchlist.json',
    }).as('getWatchlist');
    // Wait for one of the watchlist movies to resolve
    stubTitleDetails('movie', {
      id: 361743,
      mediaType: 'movie',
      title: 'Top Gun: Maverick',
      releaseDate: '2022-05-27',
      posterPath: null,
    });

    cy.visit('/discover/watchlist');
    cy.wait('@getWatchlist');
    cy.get('[data-testid=title-card]')
      .first()
      .trigger('mouseover')
      .find('[data-testid=title-card-title]')
      .invoke('text')
      .then((text) => {
        cy.get('[data-testid=title-card]').first().click();
        cy.get('[data-testid=media-title]').should('contain', text);
      });
  });
});
