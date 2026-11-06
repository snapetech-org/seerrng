import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const theme = process.env.SEERR_WATCH_THEME ?? 'seerrNGJ';
const stage = process.env.SEERR_WATCH_STAGE ?? 'candidate';
for (const width of [390, 1440]) {
  test(`private watch-session lifecycle at ${width}px`, async ({
    page,
    baseURL,
    browser,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    expect(
      (
        await page.request.post('/api/v1/auth/local', {
          data: { email: 'admin@seerr.dev', password: 'test1234' },
        })
      ).status()
    ).toBe(200);
    expect(
      (
        await page.request.post('/api/v1/user/1/settings/interface-theme', {
          data: { theme },
        })
      ).status()
    ).toBe(200);
    await page.route('**/api/v1/genres/movie', (route) =>
      route.fulfill({
        json: [
          { id: 28, name: 'Action' },
          { id: 35, name: 'Comedy' },
        ],
      })
    );
    await page.goto('/watch-sessions');
    await expect(
      page.getByRole('heading', { name: 'Watch Sessions', exact: true })
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute(
      'data-interface-theme',
      theme
    );
    await page.getByLabel('Session Name', { exact: true }).fill('Household QA');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath(`${stage}-${theme}-${width}-create.png`),
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Create Session', exact: true })
      .click();
    await expect(page).toHaveURL(/\/watch-sessions\/\d+$/);
    const sessionId = page.url().split('/').at(-1)!;
    const member = await browser.newContext({
      baseURL,
      serviceWorkers: 'block',
    });
    try {
      await expect(
        page.getByRole('heading', { name: 'Session Settings', exact: true })
      ).toBeVisible();
      await page
        .getByRole('button', { name: 'Create Invite Link', exact: true })
        .click();
      const invite = page.getByLabel('Copy Invite Link', { exact: true });
      await expect(invite).toBeVisible();
      const token = new URL(await invite.inputValue()).hash.slice(
        '#token='.length
      );
      expect(
        (
          await member.request.post('/api/v1/auth/local', {
            data: { email: 'friend@seerr.dev', password: 'test1234' },
          })
        ).status()
      ).toBe(200);
      const joinPage = await member.newPage();
      await joinPage.goto(
        `/watch-sessions/join#token=${encodeURIComponent(token)}`
      );
      await expect(joinPage).toHaveURL(
        new RegExp(`/watch-sessions/${sessionId}$`)
      );
      expect(joinPage.url()).not.toContain(token);
      await joinPage.close();
      const listed = await page.request.get(
        `/api/v1/watch-sessions/${sessionId}/invites`
      );
      const serialized = JSON.stringify(await listed.json());
      expect(serialized).not.toContain(token);
      expect(serialized).not.toContain('tokenHash');
      await page.reload();
      await expect(
        page.getByRole('button', { name: 'Start Session', exact: true })
      ).toBeEnabled();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: info.outputPath(`${stage}-${theme}-${width}-draft.png`),
        fullPage: true,
      });
      await page.route(`**/api/v1/watch-sessions/${sessionId}/deck`, (route) =>
        route.fulfill({ json: { candidates: [], hasMore: false } })
      );
      await page.route(
        `**/api/v1/watch-sessions/${sessionId}/my-ballots`,
        (route) => route.fulfill({ json: { ballots: [] } })
      );
      await page.route(
        `**/api/v1/watch-sessions/${sessionId}/matches?*`,
        (route) => route.fulfill({ json: { matches: [], hasMore: false } })
      );
      await page
        .getByRole('button', { name: 'Start Session', exact: true })
        .click();
      await expect(
        page.getByRole('heading', { name: 'Movies To Review', exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole('heading', {
          name: 'Everyone Wants To Watch',
          exact: true,
        })
      ).toBeVisible();
      expect(
        (
          await page.request.put(`/api/v1/watch-sessions/${sessionId}`, {
            data: {
              title: 'Late edit',
              filters: { genreIds: [], ranking: 'popularity.desc' },
            },
          })
        ).status()
      ).toBe(409);
      expect(
        (
          await page.request.put(
            `/api/v1/watch-sessions/${sessionId}/preferences`,
            { data: { includeWatchlistContributions: true } }
          )
        ).status()
      ).toBe(409);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: info.outputPath(`${stage}-${theme}-${width}-active.png`),
        fullPage: true,
      });
      if (stage === 'candidate') {
        const card = {
          candidateId: 77,
          id: 970001,
          title: 'Household Fixture Movie With A Longer Title',
          voteAverage: 7.4,
          releaseDate: '2020-01-01',
          genres: [],
          overview:
            'A deterministic title for private ballot controls and narrow layouts.',
        };
        let decision: 'want' | 'pass' | undefined;
        await page.route(
          `**/api/v1/watch-sessions/${sessionId}/deck`,
          (route) =>
            route.fulfill({
              json: { candidates: decision ? [] : [card], hasMore: false },
            })
        );
        await page.route(
          `**/api/v1/watch-sessions/${sessionId}/my-ballots`,
          (route) =>
            route.fulfill({
              json: { ballots: decision ? [{ ...card, decision }] : [] },
            })
        );
        await page.route(
          `**/api/v1/watch-sessions/${sessionId}/matches?*`,
          (route) =>
            route.fulfill({
              json: {
                matches: decision === 'want' ? [card] : [],
                hasMore: false,
              },
            })
        );
        await page.route(
          `**/api/v1/watch-sessions/${sessionId}/candidates/77/ballot`,
          (route) => {
            expect(route.request().method()).toBe('PUT');
            decision = route.request().postDataJSON().decision;
            return route.fulfill({ json: { saved: true } });
          }
        );
        await page.reload();
        const deck = page.locator('section').filter({
          has: page.getByRole('heading', {
            name: 'Movies To Review',
            exact: true,
          }),
        });
        await expect(deck.getByText(card.title, { exact: true })).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: info.outputPath(`${stage}-${theme}-${width}-populated.png`),
          fullPage: true,
        });
        await deck.getByRole('button', { name: "I'm In", exact: true }).click();
        const choices = page.locator('section').filter({
          has: page.getByRole('heading', {
            name: 'Your Choices',
            exact: true,
          }),
        });
        await expect(
          choices.getByRole('button', { name: "I'm In", exact: true })
        ).toBeDisabled();
        const matches = page.locator('section').filter({
          has: page.getByRole('heading', {
            name: 'Everyone Wants To Watch',
            exact: true,
          }),
        });
        await expect(
          matches.getByText(card.title, { exact: true })
        ).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: info.outputPath(`${stage}-${theme}-${width}-ballot.png`),
          fullPage: true,
        });
        await choices
          .getByRole('button', { name: 'Pass', exact: true })
          .click();
        await expect(
          choices.getByRole('button', { name: 'Pass', exact: true })
        ).toBeDisabled();
        await expect(
          matches.getByText(card.title, { exact: true })
        ).toHaveCount(0);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      ).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await page.request.delete(`/api/v1/watch-sessions/${sessionId}`);
      await member.close();
    }
  });
}
