import { expect, test } from '@playwright/test';

const locale = (process.env.LUMEN_CARD_TITLE_LOCALE ?? 'en') as
  'en' | 'fr' | 'ar';

const description = {
  en: 'Show titles under posters for movies, series, music and books. Account Settings has a choice per type.',
  fr: 'Afficher les titres sous les affiches de films, séries, musique et livres. Les paramètres du compte permettent de choisir pour chaque type.',
  ar: 'اعرض العناوين أسفل ملصقات الأفلام والمسلسلات والموسيقى والكتب. يمكنك اختيار إعداد مستقل لكل نوع من إعدادات الحساب.',
} as const;

test('account title-view switch explains its shared preference in the saved locale', async ({
  page,
}, info) => {
  const captureDir = process.env.LUMEN_VISUAL_CAPTURE_DIR;
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(
      '/api/v1'.length
    );
    if (path === '/auth/me')
      return route.fulfill({
        json: {
          id: 1,
          displayName: 'Fixture User',
          permissions: 2,
          settings: { cardTextVisibilityMovie: 'always' },
        },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/settings/public')
      return route.fulfill({ json: { applicationTitle: 'SeerrNG' } });
    return route.fulfill({ json: [] });
  });

  await page.goto('/me');
  const expected = description[locale];
  const toggle = page.getByRole('switch').filter({ hasText: expected });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(toggle).toContainText(expected);
  if (captureDir && ['desktop', 'iphone'].includes(info.project.name))
    await page.screenshot({
      path: `${captureDir}/${locale}/account-title-view-${info.project.name}.png`,
      fullPage: true,
      animations: 'disabled',
    });
});
