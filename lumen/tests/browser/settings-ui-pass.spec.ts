import { expect, test, type Page } from '@playwright/test';

const testAppPath = (path: string) =>
  `${process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : ''}${path}`;

async function mockServer(
  page: Page,
  options: { shareEnabled?: boolean; seen?: string[] } = {}
) {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/lumen(?=\/)/, '').slice(7);
    options.seen?.push(path + url.search);
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Owner', permissions: 2 },
      });
    if (path === '/settings/public')
      return route.fulfill({ json: { mediaServerType: 1 } });
    if (path === '/user/1/settings/main') return route.fulfill({ json: {} });
    if (path === '/resolve/capabilities')
      return route.fulfill({
        json: { enabled: options.shareEnabled ?? true },
      });
    if (path === '/issue' || path === '/blocklist')
      return route.fulfill({
        json: { results: [], pageInfo: { pages: 1, results: 0 } },
      });
    // catalogue lookups that answer with plain lists
    if (
      /^\/(genres|languages|regions|watchproviders|discover\/genreslider)/.test(
        path
      )
    )
      return route.fulfill({ json: [] });
    return route.fulfill({ json: { results: [] } });
  });
}

for (const shareEnabled of [true, false]) {
  test(`Share & Identify links follow the Share to Request setting (enabled: ${shareEnabled})`, async ({
    page,
  }) => {
    await mockServer(page, { shareEnabled });
    await page.goto(testAppPath('/me'));
    await expect(
      page.getByRole('link', { name: 'Open Share & Identify' })
    ).toHaveCount(shareEnabled ? 1 : 0);
    if ((page.viewportSize()?.width ?? 0) >= 1040)
      await expect(
        page
          .getByRole('navigation', { name: 'Main navigation', exact: true })
          .getByRole('link', { name: 'Share & Identify' })
      ).toHaveCount(shareEnabled ? 1 : 0);
  });
}

for (const [route, label] of [
  ['/issues', 'Search Issues'],
  ['/blocklist', 'Search Blocklist'],
] as const) {
  test(`${route} sends search only when there is text`, async ({ page }) => {
    const seen: string[] = [];
    await mockServer(page, { seen });
    await page.goto(testAppPath(route));
    const list = route === '/issues' ? '/issue?' : '/blocklist?';
    await expect
      .poll(() => seen.filter((entry) => entry.startsWith(list)).length)
      .toBeGreaterThan(0);
    expect(
      seen.filter(
        (entry) => entry.startsWith(list) && /[?&]search=/.test(entry)
      )
    ).toEqual([]);
    await page.getByRole('searchbox', { name: label }).fill('dune');
    await page.getByRole('searchbox', { name: label }).press('Enter');
    await expect
      .poll(() =>
        seen.some(
          (entry) => entry.startsWith(list) && entry.includes('search=dune')
        )
      )
      .toBe(true);
  });
}

test('More Filters applies the title and every range with one button', async ({
  page,
}) => {
  await mockServer(page);
  await page.goto(testAppPath('/movies'));
  const panel = page.locator('details.more-filters');
  await expect(panel).not.toHaveAttribute('open', '');
  await panel.locator('summary').click();
  await page.getByRole('searchbox', { name: 'Title' }).fill('dune');
  await page.getByLabel('Minimum Rating').fill('6');
  await page.getByLabel('Minimum Runtime (Minutes)').fill('90');
  await page.getByLabel('Maximum Votes').fill('5000');
  await page.getByRole('button', { name: 'Apply Filters' }).click();
  await expect(page).toHaveURL(/search=dune/);
  await expect(page).toHaveURL(/voteAverageGte=6/);
  await expect(page).toHaveURL(/withRuntimeGte=90/);
  await expect(page).toHaveURL(/voteCountLte=5000/);

  // a reversed range blocks Apply and explains why
  await page.getByLabel('Maximum Rating').fill('2');
  await expect(
    page.getByText('The lower bound must be at or below the upper bound.')
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Apply Filters' })
  ).toBeDisabled();

  // the panel stays open on reload while one of its filters is in use
  await page.reload();
  await expect(page.locator('details.more-filters')).toHaveAttribute(
    'open',
    ''
  );
});

for (const route of ['/movies', '/admin/requests', '/admin', '/requests']) {
  test(`${route} fits the screen with every panel open`, async ({ page }) => {
    await mockServer(page);
    await page.goto(testAppPath(route));
    await page.waitForLoadState('networkidle');
    await page.evaluate(() =>
      document.querySelectorAll('details').forEach((d) => (d.open = true))
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
