import { expect, test } from '@playwright/test';

test('shell navigation landmarks and request badges follow the account locale', async ({
  page,
}) => {
  const locale = ['en', 'fr', 'ar'].includes(process.env.LUMEN_NAV_LOCALE ?? '')
    ? (process.env.LUMEN_NAV_LOCALE as 'en' | 'fr' | 'ar')
    : 'en';
  const labels = {
    en: {
      primary: 'Main navigation',
      tabs: 'Tabs',
      pending: 'Pending requests: 4',
    },
    fr: {
      primary: 'Navigation principale',
      tabs: 'Onglets',
      pending: 'Demandes en attente : 4',
    },
    ar: {
      primary: 'التنقل الرئيسي',
      tabs: 'علامات التبويب',
      pending: 'الطلبات المعلّقة: 4',
    },
  }[locale];
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
      .replace(/^\/lumen/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2, userType: 2 } });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale } });
    if (path === '/request/count')
      return route.fulfill({ json: { pending: 4 } });
    return route.fulfill({ json: {} });
  });

  const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
  await page.goto(`${mount}/me`);
  await expect(page.locator('.side')).toHaveAttribute(
    'aria-label',
    labels.primary
  );
  await expect(page.locator('.tabbar')).toHaveAttribute(
    'aria-label',
    labels.tabs
  );
  await expect(page.locator(`[aria-label="${labels.pending}"]`)).toHaveCount(2);
});

test('mobile tabs yield to long forms on scroll and return on scroll up', async ({
  page,
}, testInfo) => {
  const viewport = page.viewportSize();
  test.skip(!viewport || viewport.width >= 1040, 'Mobile tab bar only');

  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
      .replace(/^\/lumen/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 2, userType: 2 } });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          applicationTitle: 'SeerrNG',
          mediaServerType: 4,
          enabledMediaCategories: { movie: true, tv: true, ebook: true },
        },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale: 'en' } });
    if (path === '/user')
      return route.fulfill({
        json: {
          pageInfo: { pages: 1, results: 8 },
          results: Array.from({ length: 8 }, (_, index) => ({
            id: index + 2,
            displayName: `Demo User ${index + 1}`,
            email: `demo-${index + 1}@example.test`,
            permissions: 0,
            requestCount: index,
            userType: 1,
          })),
        },
      });
    return route.fulfill({ json: {} });
  });

  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  const tabs = page.locator('.tabbar');
  await expect(tabs).toBeVisible();
  await expect(tabs).not.toHaveAttribute('data-hidden');
  await page.getByRole('button', { name: 'Create Local User' }).click();
  await expect(
    page.getByRole('heading', { name: 'Create Local User' })
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollHeight))
    .toBeGreaterThan(viewport!.height + 300);

  const username = page.getByLabel('Username');
  await username.focus();
  await expect(tabs).toHaveAttribute('data-hidden', 'true');
  await expect(page.getByRole('navigation', { name: 'Tabs' })).toHaveCount(0);
  if (testInfo.project.name === 'iphone') {
    const baselineTabs = await page.addStyleTag({
      content:
        '.tabbar[data-hidden] { transform: translateX(-50%) !important; opacity: 1 !important; pointer-events: auto !important; }',
    });
    await page.screenshot({
      path: testInfo.outputPath('editing-baseline-tabs-visible.png'),
    });
    await baselineTabs.evaluate((style) => style.remove());
    await page.screenshot({
      path: testInfo.outputPath('editing-candidate-tabs-hidden.png'),
    });
  }
  await username.evaluate((input: HTMLInputElement) => input.blur());
  await expect(tabs).not.toHaveAttribute('data-hidden');

  await page.evaluate(() => window.scrollTo(0, 96));
  await page.waitForFunction(() => window.scrollY > 48);
  await expect(tabs).toHaveAttribute('data-hidden', 'true');
  await expect(tabs).toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByRole('navigation', { name: 'Tabs' })).toHaveCount(0);
  expect(await tabs.evaluate((element: HTMLElement) => element.inert)).toBe(
    true
  );
  await expect
    .poll(() => tabs.evaluate((element) => getComputedStyle(element).opacity))
    .toBe('0');
  if (
    testInfo.project.name === 'iphone' ||
    testInfo.project.name === 'tablet'
  ) {
    await page.screenshot({
      path: testInfo.outputPath('tabs-hidden-on-scroll.png'),
    });
  }

  await page.evaluate(() => window.scrollTo(0, 40));
  await page.waitForFunction(() => window.scrollY <= 40);
  await expect(tabs).not.toHaveAttribute('data-hidden');
  await expect
    .poll(() => tabs.evaluate((element) => getComputedStyle(element).opacity))
    .toBe('1');
  await page
    .getByRole('navigation', { name: 'Tabs' })
    .getByRole('link', { name: 'Requests' })
    .focus();
  await page.evaluate(() => window.scrollTo(0, 96));
  await page.waitForFunction(() => window.scrollY > 48);
  await expect(tabs).not.toHaveAttribute('data-hidden');
  await expect(
    page
      .getByRole('navigation', { name: 'Tabs' })
      .getByRole('link', { name: 'Requests' })
  ).toBeFocused();
});

test('mobile tabs yield on an ordinary user library screen', async ({
  page,
}, testInfo) => {
  const viewport = page.viewportSize();
  test.skip(!viewport || viewport.width >= 1040, 'Mobile tab bar only');

  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
      .replace(/^\/lumen/, '')
      .replace(/^\/api\/v1/, '');
    if (path === '/auth/me')
      return route.fulfill({ json: { id: 1, permissions: 0, userType: 1 } });
    if (path === '/settings/public')
      return route.fulfill({
        json: {
          applicationTitle: 'SeerrNG',
          mediaServerType: 4,
          enabledMediaCategories: { movie: true, tv: true },
        },
      });
    if (path === '/user/1/settings/main')
      return route.fulfill({ json: { locale: 'en' } });
    if (path === '/integrations/discovery/accounts')
      return route.fulfill({
        json: { accounts: [{ provider: 'trakt' }], mediaServer: null },
      });
    if (path.startsWith('/integrations/discovery/library/trakt'))
      return route.fulfill({
        json: {
          allowWrites: false,
          items: Array.from({ length: 24 }, (_, index) => ({
            id: `trakt:${index + 1}`,
            sourceId: String(index + 1),
            title: `Library Fixture ${index + 1}`,
            mediaType: 'movie',
            tmdbId: index + 1,
            mappingAvailable: true,
            identityMapped: false,
          })),
          hasMore: false,
          missingMappings: 0,
          truncated: false,
        },
      });
    return route.fulfill({ json: {} });
  });

  await page.goto('/library?source=trakt');
  await expect(page.getByRole('heading', { name: 'My Media' })).toBeVisible();
  await expect(page.getByText('Library Fixture 24')).toBeVisible();
  const captureDir = process.env.LUMEN_NAV_CAPTURE_DIR;
  if (captureDir && ['iphone', 'tablet'].includes(testInfo.project.name))
    await page.screenshot({
      path: `${captureDir}/library-visible-${testInfo.project.name}.png`,
      fullPage: true,
    });
  const tabs = page.locator('.tabbar');
  await expect(tabs).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 180));
  await page.waitForFunction(() => window.scrollY > 48);
  await expect(tabs).toHaveAttribute('data-hidden', 'true');
  await expect
    .poll(() => tabs.evaluate((element) => getComputedStyle(element).opacity))
    .toBe('0');
  if (captureDir && ['iphone', 'tablet'].includes(testInfo.project.name))
    await page.screenshot({
      path: `${captureDir}/library-hidden-${testInfo.project.name}.png`,
    });
  await page.evaluate(() => window.scrollTo(0, 20));
  await page.waitForFunction(() => window.scrollY <= 20);
  await expect(tabs).not.toHaveAttribute('data-hidden');
});
