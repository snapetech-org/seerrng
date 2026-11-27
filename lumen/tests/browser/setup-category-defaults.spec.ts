import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';

test('guided setup recommends services when category settings use server defaults', async ({
  page,
}) => {
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .slice(7);
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale: 'en' } });
    if (path === '/settings/public')
      return route.fulfill({
        json: { initialized: true, mediaServerType: 4 },
      });
    if (path === '/settings/main')
      return route.fulfill({
        json: {
          defaultPermissions: 0,
          enable4k: false,
          partialRequestsEnabled: false,
        },
      });
    return route.fulfill({ json: [] });
  });

  await page.goto(`${mount}/setup?guide=1&step=services`);
  await expect(
    page.getByText('Services for your enabled categories appear first.')
  ).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Setup steps' }).getByRole('link', {
      name: 'Request Services',
    })
  ).toHaveAttribute('aria-current', 'step');
});
