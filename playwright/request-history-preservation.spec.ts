import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`removing provider media preserves request history at ${width}px`, async ({
    page,
    baseURL,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const login = await page
      .context()
      .request.post(`${baseURL}/api/v1/auth/local`, {
        data: { email: 'admin@seerr.dev', password: 'test1234' },
      });
    expect(login.status()).toBe(200);
    const deletes: string[] = [];
    let detailReads = 0;
    let listReads = 0;
    const baseline = process.env.SEERR_REQUEST_RECOVERY_BASELINE === 'true';
    const media = {
      id: 9101,
      mediaType: 'movie',
      tmdbId: 550,
      status: 5,
      status4k: 1,
      serviceId: 1,
      externalServiceId: 77,
      requests: [],
      issues: [],
      downloadStatus: [],
      downloadStatus4k: [],
    };
    const row = {
      id: 9102,
      type: 'movie',
      status: 5,
      is4k: false,
      media,
      requestedBy: { id: 1, displayName: 'Admin', avatar: '' },
      seasons: [],
      canRemove: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    await page.route('**/api/v1/request?*', (route) => {
      listReads++;
      return route.fulfill({
        json: {
          pageInfo: { pages: 1, pageSize: 10, results: 1, page: 1 },
          results: [row],
          serviceErrors: { radarr: [], sonarr: [], lidarr: [], readarr: [] },
        },
      });
    });
    await page.route('**/api/v1/request/9102', (route) => {
      if (route.request().method() === 'GET') detailReads++;
      return route.fulfill({ json: row });
    });
    await page.route('**/api/v1/movie/550', (route) =>
      route.fulfill({
        json: {
          id: 550,
          title: 'Retained Film',
          originalTitle: 'Retained Film',
          releaseDate: '2020-01-01',
          genres: [],
          mediaInfo: media,
        },
      })
    );
    await page.route('**/api/v1/media/9101**', (route) => {
      if (route.request().method() === 'DELETE')
        deletes.push(new URL(route.request().url()).pathname);
      return route.fulfill({ status: 204 });
    });
    await page.goto('/users/1/requests');
    await expect(
      page.getByText('Retained Film', { exact: true })
    ).toBeVisible();
    // Paginated row data is sufficient on mount and when the browser regains focus.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    if (baseline) await expect.poll(() => detailReads).toBeGreaterThan(0);
    else expect(detailReads).toBe(0);
    await page.screenshot({
      path: info.outputPath(`request-row-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    const beforeRefresh = listReads;
    const remove = page.getByRole('button', { name: /Remove from Radarr/ });
    await remove.click();
    const removed = page.waitForResponse(
      (r) =>
        r.url().includes('/api/v1/media/9101/file?') &&
        r.request().method() === 'DELETE'
    );
    const confirmation = remove.locator('div').last();
    await expect(confirmation).toHaveCSS('opacity', '1');
    await confirmation.click();
    expect((await removed).status()).toBe(204);
    // The list refresh follows the whole deletion sequence.
    await expect.poll(() => listReads).toBeGreaterThan(beforeRefresh);
    expect(deletes).toEqual(
      baseline
        ? ['/api/v1/media/9101/file', '/api/v1/media/9101']
        : ['/api/v1/media/9101/file']
    );
    await expect(
      page.getByText('Retained Film', { exact: true })
    ).toBeVisible();
  });
}
