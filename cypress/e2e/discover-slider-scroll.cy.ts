const makeResults = (firstId: number, prefix: string) =>
  Array.from({ length: 12 }, (_, index) => ({
    id: firstId + index,
    mediaType: 'movie',
    title: `${prefix} ${index + 1}`,
    overview: 'A deterministic Discover slider result.',
    releaseDate: '2026-01-01',
    posterPath: null,
  }));

const moveSliderToCard = (title: string, index: number) =>
  cy
    .contains('.slider-header', title)
    .closest('[data-testid=media-slider]')
    .find('.slider-track')
    .then(($track) => {
      const track = $track[0] as HTMLDivElement;
      const card = track.querySelectorAll('.slider-item')[index] as HTMLElement;
      track.scrollLeft = card.offsetLeft;
      track.dispatchEvent(new Event('scroll', { bubbles: true }));

      return track.scrollLeft;
    });

const assertStoredPosition = (sliderKey: string, position: number) => {
  return cy.window().should((win) => {
    const historyKey = win.history.state?.key;
    expect(typeof historyKey).to.equal('string');
    const stored = win.sessionStorage.getItem(
      `__seerrDiscoverScroll:sliders:${historyKey}`
    );
    expect(stored !== null).to.equal(true);
    expect(JSON.parse(stored ?? '{}')[sliderKey]).to.eq(position);
  });
};

describe('Discover slider Back navigation', () => {
  let originalLocale: string | undefined;

  beforeEach(() => {
    cy.viewport(390, 844);
    cy.loginAsAdmin();
    cy.mockConfiguredMediaAvailability({});
  });

  afterEach(() => {
    if (!originalLocale) return;

    const localeToRestore = originalLocale;
    originalLocale = undefined;
    cy.intercept('POST', '/api/v1/settings/main').as('restoreLocale');
    cy.visit('/settings/main');
    cy.get('#locale').select(localeToRestore);
    cy.get('form button[type="submit"]').first().click();
    cy.wait('@restoreLocale').its('response.statusCode').should('eq', 200);
  });

  it('restores each home carousel to its own horizontal position', () => {
    const trending = makeResults(991000, 'Trending Scroll');
    const popular = makeResults(992000, 'Popular Scroll');
    const target = trending[3];
    const detailPath = `/movie/${target.id}`;
    const details = {
      ...target,
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

    cy.intercept('GET', '/api/v1/discover/trending*', {
      page: 1,
      totalPages: 1,
      totalResults: trending.length,
      results: trending,
    }).as('trending');
    cy.intercept('GET', '/api/v1/discover/movies*', {
      page: 1,
      totalPages: 1,
      totalResults: popular.length,
      results: popular,
    }).as('popularMovies');
    cy.intercept('GET', `/api/v1${detailPath}`, details).as('details');
    cy.intercept('GET', `**/_next/data/*${detailPath}.json*`, {
      pageProps: { movie: details },
      __N_SSP: true,
    });

    cy.visit('/');
    cy.wait('@trending');
    cy.contains('.slider-header', 'Popular Movies').scrollIntoView();
    cy.wait('@popularMovies');

    let trendingPosition = 0;
    let popularPosition = 0;
    moveSliderToCard('Trending', 3)
      .then((position) => {
        trendingPosition = position;
        expect(trendingPosition).to.be.greaterThan(0);
      })
      .then(() => moveSliderToCard('Popular Movies', 5))
      .then((position) => {
        popularPosition = position;
        expect(popularPosition).to.be.greaterThan(0);
        expect(popularPosition).not.to.eq(trendingPosition);
      })
      .then(() => assertStoredPosition('trending', trendingPosition))
      .then(() => assertStoredPosition('popular-movies', popularPosition));

    cy.contains('.slider-header', 'Trending')
      .closest('[data-testid=media-slider]')
      .find('[data-testid=title-card]')
      .eq(3)
      .scrollIntoView({ offset: { top: 120, left: 0 } })
      .trigger('mouseover')
      .click({ scrollBehavior: false });
    cy.wait('@details');
    cy.location('pathname').should('eq', detailPath);

    cy.go('back');
    cy.location('pathname').should('eq', '/');
    cy.contains('.slider-header', 'Trending')
      .closest('[data-testid=media-slider]')
      .find('.slider-track')
      .should(($track) => {
        expect(($track[0] as HTMLDivElement).scrollLeft).to.eq(
          trendingPosition
        );
      });
    cy.contains('.slider-header', 'Popular Movies')
      .closest('[data-testid=media-slider]')
      .find('.slider-track')
      .should(($track) => {
        expect(($track[0] as HTMLDivElement).scrollLeft).to.eq(popularPosition);
      });
  });

  it('restores a right-to-left carousel position after Back navigation', () => {
    const trending = makeResults(993000, 'RTL Trending Scroll');
    const target = trending[3];
    const detailPath = `/movie/${target.id}`;
    const details = {
      ...target,
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

    cy.intercept('POST', '/api/v1/settings/main').as('setArabicLocale');
    cy.visit('/settings/main');
    cy.get('#locale').then(($select) => {
      originalLocale = String($select.val() ?? 'en');
    });
    cy.get('#locale').select('ar');
    cy.get('form button[type="submit"]').first().click();
    cy.wait('@setArabicLocale').its('response.statusCode').should('eq', 200);
    cy.document().its('documentElement.dir').should('eq', 'rtl');

    cy.intercept('GET', '/api/v1/discover/trending*', {
      page: 1,
      totalPages: 1,
      totalResults: trending.length,
      results: trending,
    }).as('rtlTrending');
    cy.intercept('GET', `/api/v1${detailPath}`, details).as('rtlDetails');
    cy.intercept('GET', `**/_next/data/*${detailPath}.json*`, {
      pageProps: { movie: details },
      __N_SSP: true,
    });

    cy.visit('/');
    cy.wait('@rtlTrending');

    let scrollPositionBeforeNavigation = 0;
    cy.contains('.slider-header', 'الأكثر شيوعاً')
      .closest('[data-testid=media-slider]')
      .find('.slider-track')
      .then(($track) => {
        const track = $track[0] as HTMLDivElement;
        expect(getComputedStyle(track).direction).to.eq('rtl');
        expect(track.scrollWidth).to.be.greaterThan(track.clientWidth);
        track.scrollLeft = -260;
        track.dispatchEvent(new Event('scroll', { bubbles: true }));
      });
    assertStoredPosition('trending', 260);

    cy.contains('.slider-header', 'الأكثر شيوعاً')
      .closest('[data-testid=media-slider]')
      .find('[data-testid=title-card]')
      .eq(3)
      .scrollIntoView({ offset: { top: 120, left: 0 } })
      .then(($card) => {
        const slider = $card.closest('[data-testid=media-slider]')[0];
        scrollPositionBeforeNavigation = (
          slider.querySelector('.slider-track') as HTMLDivElement
        ).scrollLeft;
        cy.wrap($card).trigger('mouseover').click({ scrollBehavior: false });
      });
    cy.wait('@rtlDetails');
    cy.location('pathname').should('eq', detailPath);

    cy.go('back');
    cy.location('pathname').should('eq', '/');
    cy.contains('.slider-header', 'الأكثر شيوعاً')
      .closest('[data-testid=media-slider]')
      .find('.slider-track')
      .should(($track) => {
        expect(($track[0] as HTMLDivElement).scrollLeft).to.eq(
          scrollPositionBeforeNavigation
        );
      });
  });
});
