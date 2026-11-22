import { expect, test } from '@playwright/test';

const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
const baseline = process.env.LUMEN_FOLLOW_BASELINE === '1';

test('the shared Follow action follows the saved account locale', async ({
  page,
}, info) => {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
      .replace(/^\/lumen(?=\/)/, '')
      .slice('/api/v1'.length);
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Fixture Reader', permissions: 32 },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale: 'fr' } });
    if (path === '/person/77')
      return route.fulfill({
        json: { id: 77, name: 'Fixture Director' },
      });
    if (path === '/follow') return route.fulfill({ json: { results: [] } });
    return route.fulfill({ json: {} });
  });

  await page.goto(`${mount}/person/77`);
  const action = page.getByRole('button', {
    name: baseline ? 'Follow' : 'Suivre',
    exact: true,
  });
  await expect(action).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    )
    .toBe(true);

  const captureDir = process.env.LUMEN_FOLLOW_CAPTURE_DIR;
  if (captureDir && ['desktop', 'iphone'].includes(info.project.name)) {
    await page.screenshot({
      path: `${captureDir}/${baseline ? 'baseline' : 'candidate'}-${mount ? 'bundled' : 'standalone'}-${info.project.name}.png`,
      fullPage: true,
    });
  }
});
