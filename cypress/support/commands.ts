/// <reference types="cypress" />
import 'cy-mobile-commands';
import { mockConfiguredMediaAvailability } from './configuredMedia';

Cypress.Commands.add('login', (email, password) => {
  cy.session(
    [email, password],
    () => {
      cy.request({
        method: 'POST',
        url: '/api/v1/auth/local',
        body: { email, password },
        // Tell express-session that this test request represents the HTTPS
        // edge. The browser still runs on localhost HTTP, so the Secure
        // cookie is copied into Cypress's test-only jar below.
        headers: { 'X-Forwarded-Proto': 'https' },
      }).then((response) => {
        expect(response.status).to.eq(200);

        // The application must emit a Secure session cookie. Cypress runs
        // this production build over plain localhost HTTP, so the browser
        // correctly refuses to store that cookie. Copy only this test
        // session into Cypress's local HTTP jar; production never uses this
        // path.
        const setCookie = response.headers['set-cookie'];
        const cookieHeaders = Array.isArray(setCookie)
          ? setCookie
          : setCookie
            ? [setCookie]
            : [];
        const sessionCookie = cookieHeaders
          .map((cookie) => cookie.match(/^connect\.sid=([^;]+)/)?.[1])
          .find((value): value is string => Boolean(value));

        if (!sessionCookie) {
          throw new Error('Login response did not include connect.sid');
        }

        cy.setCookie('connect.sid', sessionCookie, {
          httpOnly: true,
          sameSite: 'lax',
          secure: false,
        });
        // These native layout fixtures exercise the upstream interface. Set its
        // theme once per session; individual tests may still change it later.
        cy.request({
          method: 'POST',
          url: `/api/v1/user/${response.body.id}/settings/interface-theme`,
          body: { theme: 'seerrOrig' },
          headers: { 'X-Forwarded-Proto': 'https' },
        })
          .its('status')
          .should('eq', 200);
      });
    },
    {
      validate() {
        cy.request('/api/v1/auth/me').its('status').should('eq', 200);
      },
    }
  );
});

Cypress.Commands.add('loginAsAdmin', () => {
  cy.env<{ ADMIN_EMAIL: string; ADMIN_PASSWORD: string }>([
    'ADMIN_EMAIL',
    'ADMIN_PASSWORD',
  ]).then(({ ADMIN_EMAIL, ADMIN_PASSWORD }) => {
    cy.login(ADMIN_EMAIL, ADMIN_PASSWORD);
  });
});

Cypress.Commands.add('loginAsUser', () => {
  cy.env<{ USER_EMAIL: string; USER_PASSWORD: string }>([
    'USER_EMAIL',
    'USER_PASSWORD',
  ]).then(({ USER_EMAIL, USER_PASSWORD }) => {
    cy.login(USER_EMAIL, USER_PASSWORD);
  });
});

Cypress.Commands.add(
  'mockConfiguredMediaAvailability',
  mockConfiguredMediaAvailability
);

// A native page first hydrates with the public default, then loads the account's
// saved package. Assertions must observe that settled preference, including
// tests that intentionally switch away from the upstream fixture.
Cypress.Commands.overwrite(
  'visit',
  (
    originalVisit,
    url: string | (Partial<Cypress.VisitOptions> & { url: string }),
    options?: Partial<Cypress.VisitOptions>
  ) => {
    return cy
      .then(() =>
        originalVisit(
          typeof url === 'string' ? { ...options, url } : { ...url, ...options }
        )
      )
      .then((window) =>
        cy
          .request({ url: '/api/v1/auth/me', failOnStatusCode: false })
          .then((response) => {
            if (response.status !== 200) return cy.wrap(window, { log: false });
            return cy
              .get('html')
              .should(
                'have.attr',
                'data-interface-theme',
                response.body.settings?.interfaceTheme ?? 'persiusNG'
              )
              .then(
                () =>
                  new Cypress.Promise<typeof window>((resolve, reject) => {
                    const deadline = window.performance.now() + 5000;
                    let settled = 0;
                    const sample = () => {
                      const moving = window.document
                        .getAnimations()
                        .some(
                          (animation) =>
                            animation.playState === 'running' &&
                            animation.effect?.getComputedTiming().iterations !==
                              Infinity
                        );
                      settled = moving ? 0 : settled + 1;
                      if (settled >= 3) return resolve(window);
                      if (window.performance.now() > deadline)
                        return reject(
                          new Error(
                            'Native presentation did not settle after navigation'
                          )
                        );
                      window.requestAnimationFrame(sample);
                    };
                    window.requestAnimationFrame(sample);
                  })
              );
          })
      );
  }
);
