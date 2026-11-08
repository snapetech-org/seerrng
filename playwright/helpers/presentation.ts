import { expect, type Page } from '@playwright/test';

/** Restore the seeded account after tests deliberately change global preferences. */
export const restoreAdminPresentation = async (page: Page): Promise<void> => {
  expect(
    (
      await page.request.post('/api/v1/auth/local', {
        data: { email: 'admin@seerr.dev', password: 'test1234' },
      })
    ).status()
  ).toBe(200);
  expect(
    (
      await page.request.post('/api/v1/user/1/settings/main', {
        data: { locale: 'en', metadataLocale: null, formatRegion: null },
      })
    ).status()
  ).toBe(200);
  expect(
    (
      await page.request.post('/api/v1/user/1/settings/interface-theme', {
        data: { theme: 'seerrOrig' },
      })
    ).status()
  ).toBe(200);
};

/** Enter discovery from the settled native shell, as an in-app navigation. */
export const openAdminNativeRoute = async (
  page: Page,
  path: string
): Promise<void> => {
  await restoreAdminPresentation(page);
  await page.goto('/settings/main');
  await expect(page.locator('html')).toHaveAttribute(
    'data-interface-theme',
    'seerrOrig'
  );
  await page.evaluate(
    (route) =>
      (
        window as unknown as {
          next: { router: { push: (path: string) => Promise<boolean> } };
        }
      ).next.router.push(route),
    path
  );
  await page.waitForURL((url) => `${url.pathname}${url.search}` === path);
};
