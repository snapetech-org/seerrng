import { expect, test } from '@playwright/test';

const testAppPath = (path: string) =>
  `${process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : ''}${path}`;

for (const permissions of [0, 4, 32, 2]) {
  test(`Swipe navigation follows request access (permissions: ${permissions})`, async ({
    page,
  }, info) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
        .replace(/^\/lumen(?=\/)/, '')
        .slice(7);
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 1, displayName: 'Viewer', permissions },
        });
      if (path === '/settings/public')
        return route.fulfill({
          json: { swipeEnabled: true, mediaServerType: 1 },
        });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { enabledMediaCategories: {} } });
      return route.fulfill({ json: { results: [] } });
    });

    const canUseSwipe = (permissions & (2 | 32)) !== 0;
    await page.goto(testAppPath('/'));
    const desktop = (page.viewportSize()?.width ?? 0) >= 1040;
    if (desktop) {
      const nav = page.getByRole('navigation', { name: 'Main', exact: true });
      const link = nav.getByRole('link', { name: 'Swipe', exact: true });
      await expect(link).toHaveCount(canUseSwipe ? 1 : 0);
      await page.screenshot({ path: info.outputPath('discover.png') });
      if (canUseSwipe) {
        await link.click();
        await expect(page).toHaveURL(/\/swipe$/);
      }
    } else {
      const tabs = page.getByRole('navigation', { name: 'Tabs', exact: true });
      await tabs.locator('a[href="/me"]').click();
      const link = page.getByRole('link', { name: 'Open Swipe', exact: true });
      await expect(link).toHaveCount(canUseSwipe ? 1 : 0);
      if (canUseSwipe) {
        await link.scrollIntoViewIfNeeded();
        const linkBottom = await link.evaluate(
          (element) => element.getBoundingClientRect().bottom
        );
        const tabsTop = await tabs.evaluate(
          (element) => element.getBoundingClientRect().top
        );
        expect(linkBottom).toBeLessThan(tabsTop);
        await page.screenshot({ path: info.outputPath('you.png') });
        await link.click();
        await expect(page).toHaveURL(/\/swipe$/);
      } else {
        await page.screenshot({ path: info.outputPath('you.png') });
      }
    }
  });
}

test('Swipe settings test the provider and save enablement without resending its key', async ({
  page,
}, info) => {
  const path = '/api/v1/settings/swipe';
  let saved = {
    enabled: false,
    aiProvider: 'openai',
    aiModel: 'fixture-model',
    aiBaseUrl: 'https://model.internal/v1',
    aiEffort: 'low',
    aiApiKeyConfigured: true,
  };
  const writes: Record<string, unknown>[] = [];
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const url = new URL(request.url()).pathname;
    if (url.endsWith('/auth/me'))
      return route.fulfill({ json: { id: 1, permissions: 2 } });
    if (url.endsWith('/settings/public'))
      return route.fulfill({ json: { swipeEnabled: saved.enabled } });
    if (url === path + '/test') {
      writes.push(request.postDataJSON());
      return route.fulfill({ json: { success: true } });
    }
    if (url !== path) return route.fulfill({ json: {} });
    if (request.method() === 'PUT') {
      const body = request.postDataJSON();
      writes.push(body);
      saved = { ...saved, ...body };
    }
    return route.fulfill({ json: saved });
  });
  await page.goto(testAppPath('/me'));
  await page.getByRole('link', { name: 'Open Swipe Settings' }).click();
  await page.getByLabel('Enable Swipe').check();
  await page.getByRole('combobox', { name: 'Effort' }).selectOption('high');
  await page.getByRole('button', { name: 'Test AI Ordering' }).click();
  await expect(
    page.getByText('The AI provider answered the test request.')
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('swipe-admin.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Swipe settings saved.')).toBeVisible();
  for (const write of writes) {
    expect(write).toMatchObject({
      enabled: true,
      aiProvider: 'openai',
      aiEffort: 'high',
      clearAiApiKey: false,
    });
    expect(write).not.toHaveProperty('aiApiKey');
  }
  expect(writes).toHaveLength(2);
  await page.getByRole('link', { name: 'Back to Account' }).click();
  await expect(
    page.getByRole('link', { name: 'Open Swipe', exact: true })
  ).toBeVisible();
});
