import { expect, test } from '@playwright/test';

const testMount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const testApiPath = (url: string) =>
  new URL(url).pathname.replace(/^\/lumen(?=\/)/, '').replace(/^\/api\/v1/, '');

for (const locale of ['en', 'fr', 'ar'])
  test(`game content picker labels follow ${locale}`, async ({
    page,
  }, info) => {
    const captureDir = process.env.LUMEN_VISUAL_CAPTURE_DIR;
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = testApiPath(route.request().url());
      if (path === '/auth/me')
        return route.fulfill({ json: { id: 1, permissions: 32 } });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { locale } });
      if (path === '/settings/public')
        return route.fulfill({
          json: {
            softwareEnabled: true,
            enabledMediaCategories: { game: true },
          },
        });
      if (path === '/request/software/catalog/games/42')
        return route.fulfill({
          json: {
            game: {
              title: 'Owned PC Game',
              igdbId: 42,
              catalogProvider: 'igdb',
              availability: 'owned',
              genres: [],
              platforms: [],
            },
          },
        });
      if (path === '/game-content/42/editions')
        return route.fulfill({
          json: {
            available: true,
            editions: [
              {
                igdbId: 51,
                title: 'Deluxe Edition',
                owned: false,
                contentKnown: false,
              },
            ],
            addons: [
              {
                igdbId: 52,
                title: 'Owned Add-on',
                owned: true,
                storyContent: false,
              },
              {
                igdbId: 53,
                title: 'New Expansion',
                owned: false,
                storyContent: true,
              },
            ],
          },
        });
      return route.fulfill({ json: { results: [] } });
    });
    await page.goto(`${testMount}/game/game/42`);
    const labels = {
      en: {
        content: 'Content to Request',
        unknown: 'Edition contents are unknown.',
      },
      fr: {
        content: 'Contenu à demander',
        unknown: 'Le contenu de cette édition est inconnu.',
      },
      ar: {
        content: 'المحتوى المطلوب',
        unknown: 'محتوى هذا الإصدار غير معروف.',
      },
    }[locale]!;
    const content = page.getByRole('combobox', { name: labels.content });
    await expect(content).toBeVisible();
    await content.selectOption('edition');
    await expect(page.getByText(labels.unknown)).toBeVisible();
    await expect(
      page.getByRole('radio', { name: 'Deluxe Edition' })
    ).toBeVisible();
    if (captureDir && ['desktop', 'iphone'].includes(info.project.name))
      await page.screenshot({
        path: `${captureDir}/${locale}/game-content-${info.project.name}.png`,
        fullPage: true,
        animations: 'disabled',
      });
  });
