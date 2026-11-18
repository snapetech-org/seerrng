import { expect, test } from '@playwright/test';

for (const kind of ['movie', 'tv']) {
  test(`${kind} live download progress keeps HD and 4K separate`, async ({
    page,
  }, info) => {
    const hd = 'ld1_' + 'a'.repeat(32);
    const fourK = 'ld1_' + 'b'.repeat(32);
    let send: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      send = resolve;
    });
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/auth/me'))
        return route.fulfill({ json: { id: 1, permissions: 2 } });
      if (url.pathname.endsWith('/settings/public'))
        return route.fulfill({
          json: { movie4kEnabled: true, series4kEnabled: true },
        });
      if (url.pathname.endsWith(`/${kind}/42`))
        return route.fulfill({
          json: {
            id: 42,
            title: 'Fixture Title',
            name: 'Fixture Title',
            genres: [],
            seasons: [],
            credits: { cast: [], crew: [] },
            mediaInfo: {
              id: 1,
              status: 3,
              status4k: 3,
              downloadStatus: [
                { size: 100, sizeLeft: 90, liveDownloadToken: hd },
              ],
              downloadStatus4k: [
                { size: 100, sizeLeft: 80, liveDownloadToken: fourK },
              ],
            },
          },
        });
      if (url.pathname.endsWith('/live/downloads')) {
        expect(new Set(url.searchParams.get('ids')?.split(','))).toEqual(
          new Set([hd, fourK])
        );
        await ready;
        const events = [
          { id: hd, sizeLeft: 60 },
          { id: fourK, sizeLeft: 25 },
        ].map((update) => ({
          ...update,
          size: 100,
          state: 'downloading',
          progress: (100 - update.sizeLeft) / 100,
        }));
        return route.fulfill({
          contentType: 'text/event-stream',
          body: `event: downloads\ndata: ${JSON.stringify(events)}\n\n`,
        });
      }
      return route.fulfill({ json: { results: [] } });
    });
    await page.goto(`/${kind}/42`);
    const status = page.locator(kind === 'tv' ? '.dtop' : '.dstatus');
    await expect(
      status.getByText('Downloading 10%', { exact: true })
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath('scheduled.png'),
      fullPage: true,
    });
    send();
    await expect(
      status.getByText('Downloading 40%', { exact: true })
    ).toBeVisible();
    if (kind === 'tv') {
      await page
        .getByRole('group', { name: 'Quality' })
        .getByRole('button', { name: '4K', exact: true })
        .click();
      await expect(
        status.getByText('Downloading 75%', { exact: true })
      ).toBeVisible();
    } else {
      await expect(
        status.getByText('4K · Downloading 75%', { exact: true })
      ).toBeVisible();
    }
    await page.screenshot({
      path: info.outputPath('live.png'),
      fullPage: true,
    });
  });
}
