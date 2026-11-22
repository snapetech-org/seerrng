import { expect, test } from '@playwright/test';

for (const override of [false, true]) {
  test(`Share retries only the failed series in a mixed batch (streaming override: ${override})`, async ({
    page,
  }, info) => {
    const writes: unknown[] = [];
    let tvAttempts = 0;
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const { pathname } = new URL(route.request().url());
      const path = pathname.slice(7);
      if (path === '/auth/me')
        return route.fulfill({ json: { id: 1, permissions: 32 } });
      if (path === '/resolve/capabilities')
        return route.fulfill({ json: { enabled: true } });
      if (path === '/resolve')
        return route.fulfill({
          json: {
            groups: [
              { id: 42, title: 'Fixture Series', mediaType: 'tv' },
              { id: 72, title: 'Fixture Movie', mediaType: 'movie' },
            ].map(({ id, title, mediaType }) => ({
              input: title,
              autoSelected: 0,
              candidates: [
                {
                  id: String(id),
                  title,
                  mediaType,
                  evidence: 'Exact title match',
                },
              ],
            })),
          },
        });
      if (path === '/request' && route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        writes.push(body);
        if (
          body.mediaType === 'tv' &&
          (++tvAttempts === 1 ||
            (override && !body.bypassStreamingRequestPolicy))
        )
          return route.fulfill(
            override
              ? {
                  status: 403,
                  json: {
                    code: 'STREAMING_REQUEST_POLICY_REJECTED',
                    allowOverride: true,
                    message: 'Available on your streaming service.',
                  },
                }
              : { status: 202, json: { message: 'No seasons available.' } }
          );
        return route.fulfill({ status: 201, json: { id: writes.length } });
      }
      return route.fulfill({ json: { results: [] } });
    });
    await page.goto('/share');
    await page
      .getByLabel('Titles, links, or ISBNs')
      .fill('Fixture Series\nFixture Movie');
    await page.getByRole('button', { name: 'Find Matches' }).click();
    await page
      .getByRole('combobox', { name: 'Series Seasons' })
      .selectOption('all');
    await page.getByRole('button', { name: 'Request Selected (2)' }).click();
    const confirmation = page.getByRole('alertdialog', {
      name: 'Streaming Request Policy',
    });
    if (override) {
      await expect(
        confirmation.getByText(
          'Fixture Series: Available on your streaming service.'
        )
      ).toBeVisible();
      expect(writes).toHaveLength(2);
      await confirmation.getByRole('button', { name: 'Cancel' }).click();
      await expect(confirmation).toHaveCount(0);
      expect(writes).toHaveLength(2);
    } else {
      await expect(
        page.getByText('No selected seasons were added.')
      ).toBeVisible();
    }
    await expect(
      page.getByText('Submitted 1 request.', { exact: true })
    ).toBeVisible();
    const movie = page
      .getByRole('listitem')
      .filter({ hasText: 'Fixture Movie' });
    const series = page
      .getByRole('listitem')
      .filter({ hasText: 'Fixture Series' });
    await expect(
      movie.getByText('Request submitted', { exact: true })
    ).toBeVisible();
    await expect(
      series.getByText('Request submitted', { exact: true })
    ).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath('share-tv-unconfirmed.png'),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Request Selected (1)' }).click();
    if (override)
      await confirmation
        .getByRole('button', { name: 'Request Anyway' })
        .click();
    await expect(
      series.getByText('Request submitted', { exact: true })
    ).toBeVisible();
    expect(writes).toEqual([
      { mediaType: 'tv', mediaId: 42, seasons: 'all' },
      { mediaType: 'movie', mediaId: 72 },
      { mediaType: 'tv', mediaId: 42, seasons: 'all' },
      ...(override
        ? [
            {
              mediaType: 'tv',
              mediaId: 42,
              seasons: 'all',
              bypassStreamingRequestPolicy: true,
            },
          ]
        : []),
    ]);
  });
}

for (const permissions of [32, 2]) {
  test(`Share & Identify is reachable from desktop and mobile navigation (permissions: ${permissions})`, async ({
    page,
  }, info) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname.slice(7);
      if (path === '/auth/me')
        return route.fulfill({
          json: { id: 1, displayName: 'Household', permissions },
        });
      if (path === '/settings/public')
        return route.fulfill({ json: { mediaServerType: 1 } });
      if (path === '/resolve/capabilities')
        return route.fulfill({ json: { enabled: true } });
      if (path === '/user/1/settings/main')
        return route.fulfill({ json: { enabledMediaCategories: {} } });
      if (path === '/discover/genreslider/movie')
        return route.fulfill({ json: [] });
      return route.fulfill({ json: { results: [] } });
    });

    await page.goto('/');
    const discoverShortcut = page.locator('#view').getByRole('link', {
      name: 'Share & Identify',
      exact: true,
    });
    await discoverShortcut.scrollIntoViewIfNeeded();
    await expect(discoverShortcut).toBeVisible();
    await page.screenshot({ path: info.outputPath('discover-share.png') });
    await discoverShortcut.click();
    await expect(page).toHaveURL(/\/share$/);
    await page.goto('/');
    const desktop = (page.viewportSize()?.width ?? 0) >= 1040;
    if (desktop) {
      const main = page.getByRole('navigation', { name: 'Main', exact: true });
      const link = main.getByRole('link', {
        name: 'Share & Identify',
        exact: true,
      });
      await expect(link).toBeVisible();
      await link.click();
      await expect(page).toHaveURL(/\/share$/);
      await expect(page.getByRole('heading', { name: 'Share' })).toBeVisible();
      await page.screenshot({ path: info.outputPath('share.png') });
    } else {
      const tabs = page.getByRole('navigation', { name: 'Tabs', exact: true });
      await tabs.locator('a[href="/me"]').click();
      const link = page.getByRole('link', {
        name: 'Open Share & Identify',
        exact: true,
      });
      await expect(link).toBeVisible();
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
    }
    await expect(page).toHaveURL(/\/share$/);
    await expect(page.getByRole('heading', { name: 'Share' })).toBeVisible();
  });
}

test('Share & Identify navigation stays hidden without request access', async ({
  page,
}) => {
  await page.route('https://**/*', (route) => route.abort());
  await page.route('**/lumen-config.json', (route) =>
    route.fulfill({ json: {} })
  );
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.slice(7);
    if (path === '/auth/me')
      return route.fulfill({
        json: { id: 1, displayName: 'Viewer', permissions: 0 },
      });
    if (path === '/settings/public')
      return route.fulfill({ json: { mediaServerType: 1 } });
    if (path === '/discover/genreslider/movie')
      return route.fulfill({ json: [] });
    return route.fulfill({ json: { results: [] } });
  });
  await page.goto('/');
  await expect(
    page.getByRole('link', { name: 'Share', exact: true })
  ).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('discover.png') });
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', {
      name: 'Share & Identify',
      exact: true,
    })
  ).toHaveCount(0);
  await page.goto('/me');
  await expect(
    page.getByRole('link', {
      name: 'Open Share & Identify',
      exact: true,
    })
  ).toHaveCount(0);
});
