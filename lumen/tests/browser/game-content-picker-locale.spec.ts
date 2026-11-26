import { expect, test } from '@playwright/test';

const testMount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const testApiPath = (url: string) =>
  new URL(url).pathname.replace(/^\/lumen(?=\/)/, '').replace(/^\/api\/v1/, '');

for (const locale of ['en', 'fr', 'ar'])
  for (const baseOwned of [true, false])
    test(`game content picker labels follow ${locale} with base game ${baseOwned ? 'owned' : 'unowned'}`, async ({
      page,
    }, info) => {
      const captureDir = process.env.LUMEN_VISUAL_CAPTURE_DIR;
      const ownership = baseOwned ? 'owned' : 'unowned';
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
                availability: baseOwned ? 'owned' : 'missing',
                genres: [],
                platforms: [],
              },
            },
          });
        if (path === '/game-content/42/editions')
          return route.fulfill({
            json: {
              available: true,
              base: { igdbId: 42, title: 'Owned PC Game', owned: baseOwned },
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
          baseOwned: 'You already have the base game.',
          baseNotOwned: 'The base game is not in your library yet.',
          baseSummary: 'Request the base game.',
          summary: 'What this request gets',
          editionSummary: 'Request Deluxe Edition and its missing content.',
          addonSummary: 'Request the base game if needed, plus: New Expansion.',
        },
        fr: {
          content: 'Contenu à demander',
          unknown: 'Le contenu de cette édition est inconnu.',
          baseOwned: 'Vous avez déjà le jeu de base.',
          baseNotOwned:
            'Vous n’avez pas encore le jeu de base dans votre bibliothèque.',
          baseSummary: 'Demander le jeu de base.',
          summary: 'Contenu de cette demande',
          editionSummary: 'Demander Deluxe Edition et son contenu manquant.',
          addonSummary:
            'Demander le jeu de base si nécessaire, ainsi que : New Expansion.',
        },
        ar: {
          content: 'المحتوى المطلوب',
          unknown: 'محتوى هذا الإصدار غير معروف.',
          baseOwned: 'لديك اللعبة الأساسية بالفعل.',
          baseNotOwned: 'اللعبة الأساسية غير موجودة في مكتبتك بعد.',
          baseSummary: 'طلب اللعبة الأساسية.',
          summary: 'محتوى هذا الطلب',
          editionSummary: 'طلب Deluxe Edition والمحتوى الذي ينقصك منه.',
          addonSummary:
            'طلب اللعبة الأساسية عند الحاجة، بالإضافة إلى: New Expansion.',
        },
      }[locale]!;
      const content = page.getByRole('combobox', { name: labels.content });
      await expect(content).toBeVisible();
      await expect(
        page.getByText(baseOwned ? labels.baseOwned : labels.baseNotOwned)
      ).toBeVisible();
      await expect(page.getByText(labels.baseSummary)).toBeVisible();
      await content.selectOption('edition');
      await expect(page.getByText(labels.unknown)).toBeVisible();
      await expect(page.getByText(labels.summary)).toBeVisible();
      if (captureDir && ['desktop', 'iphone'].includes(info.project.name))
        await page.screenshot({
          path: `${captureDir}/${locale}/game-content-${ownership}-edition-unselected-${info.project.name}.png`,
          fullPage: true,
          animations: 'disabled',
        });
      await page.getByRole('radio', { name: 'Deluxe Edition' }).check();
      await expect(page.getByText(labels.editionSummary)).toBeVisible();
      await content.selectOption('missing-selected');
      const ownedAddon = page.getByRole('checkbox', { name: /Owned Add-on/ });
      await expect(ownedAddon).toBeDisabled();
      await page.getByRole('checkbox', { name: /New Expansion/ }).check();
      await expect(page.getByText(labels.addonSummary)).toBeVisible();
      if (captureDir && info.project.name === 'iphone') {
        await page
          .getByText(baseOwned ? labels.baseOwned : labels.baseNotOwned)
          .scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `${captureDir}/${locale}/game-content-${ownership}-selected-addon-iphone-viewport.png`,
          animations: 'disabled',
        });
      }
      await content.selectOption('base');
      await expect(page.getByText(labels.baseSummary)).toBeVisible();
      if (captureDir && ['desktop', 'iphone'].includes(info.project.name))
        await page.screenshot({
          path: `${captureDir}/${locale}/game-content-${ownership}-selected-addon-${info.project.name}.png`,
          fullPage: true,
          animations: 'disabled',
        });
    });
