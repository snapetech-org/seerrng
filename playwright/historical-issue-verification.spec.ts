import { expect, test, type Page } from '@playwright/test';

const theme = process.env.SEERR_ISSUE_THEME ?? 'seerrNGJ';
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
async function login(page: Page, email = 'admin@seerr.dev') {
  const auth = await page.request.post('/api/v1/auth/local', {
    data: { email, password: 'test1234' },
  });
  expect(auth.status()).toBe(200);
  const user = await auth.json();
  expect(
    (
      await page.request.post(
        `/api/v1/user/${user.id}/settings/interface-theme`,
        { data: { theme } }
      )
    ).status()
  ).toBe(200);
  return user as { id: number };
}
for (const width of [390, 1440]) {
  test(`Prowlarr indexer listbox preserves visible rows at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    const categories = [
      'movie',
      'tv',
      'music',
      'ebook',
      'audiobook',
      'comic',
      'magazine',
      'adult',
      'sports',
      'retro',
      'modern',
      'game',
    ];
    await page.route('**/api/v1/settings/prowlarr', (route) =>
      route.fulfill({
        json: {
          hostname: 'fixture.invalid',
          port: 9696,
          useSsl: false,
          baseUrl: '',
          apiKeyConfigured: true,
          categoryMappings: Object.fromEntries(
            categories.map((category) => [category, [2000]])
          ),
          indexerIdsByCategory: {},
        },
      })
    );
    await page.route('**/api/v1/settings/prowlarr/coverage', (route) =>
      route.fulfill({
        json: {
          configured: true,
          success: true,
          categoryCatalog: [{ id: 2000, name: 'Movies', indexerCount: 4 }],
          indexers: [1, 2, 3, 4].map((id) => ({
            id,
            name: `Fixture Indexer ${id}`,
            enabled: true,
            supportsSearch: true,
          })),
        },
      })
    );
    await page.goto('/settings/prowlarr');
    await expect(page.locator('html')).toHaveAttribute(
      'data-interface-theme',
      theme
    );
    const listbox = page.locator('select[aria-label="Indexers for Movies"]');
    await expect(listbox).toHaveCount(1);
    await page
      .locator('details')
      .filter({ has: listbox })
      .locator('summary')
      .click();
    await expect(listbox).toBeVisible();
    await expect(listbox.locator('option')).toHaveCount(4);
    const geometry = await listbox.evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      size: (element as HTMLSelectElement).size,
      font: parseFloat(getComputedStyle(element).fontSize),
    }));
    expect(geometry.size).toBe(4);
    expect(geometry.height).toBeGreaterThanOrEqual(
      geometry.size * geometry.font
    );
    await listbox.selectOption(['1', '3']);
    expect(
      await listbox.evaluate((element) =>
        Array.from(
          (element as HTMLSelectElement).selectedOptions,
          (option) => option.value
        )
      )
    ).toEqual(['1', '3']);
    await listbox.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`${theme}-${width}-prowlarr-listbox.png`),
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
  });
  test(`own category preferences and optional navigation at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const user = await login(page, 'friend@seerr.dev');
    const settingsUrl = `/api/v1/user/${user.id}/settings/main`;
    const original = await (await page.request.get(settingsUrl)).json();
    try {
      expect(
        (
          await page.request.post(settingsUrl, {
            data: {
              enabledMediaCategories: {
                movie: true,
                tv: true,
                retro: false,
                modern: false,
                game: false,
              },
            },
          })
        ).status()
      ).toBe(200);
      await page.route('**/api/v1/settings/public', async (route) => {
        const response = await route.fetch();
        return route.fulfill({
          json: {
            ...(await response.json()),
            softwareEnabled: false,
            romarrEnabled: false,
          },
        });
      });
      await page.goto('/profile/settings/main');
      await expect(page.locator('html')).toHaveAttribute(
        'data-interface-theme',
        theme
      );
      const movies = page.getByTestId('user-category-movie');
      await expect(movies).toHaveAttribute('aria-pressed', 'true');
      await movies.click();
      await expect(movies).toHaveAttribute('aria-pressed', 'false');
      await page
        .getByRole('button', { name: 'Save Changes', exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (await (await page.request.get(settingsUrl)).json())
              .enabledMediaCategories.movie
        )
        .toBe(false);
      await page.reload();
      await expect(page.getByTestId('user-category-movie')).toHaveAttribute(
        'aria-pressed',
        'false'
      );
      await expect(
        page.locator('[data-navigation-link-id="movies"]')
      ).toHaveCount(0);
      await expect(
        page.locator('[data-navigation-link-id="software"]')
      ).toHaveCount(0);
      await expect(
        page.locator('[data-navigation-link-id="series"]').first()
      ).toBeAttached();
      await movies.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath(`${theme}-${width}-own-category-preferences.png`),
      });
    } finally {
      expect(
        (
          await page.request.post(settingsUrl, {
            data: {
              enabledMediaCategories: original.usesDefaultEnabledMediaCategories
                ? null
                : original.enabledMediaCategories,
            },
          })
        ).status()
      ).toBe(200);
    }
  });
}
