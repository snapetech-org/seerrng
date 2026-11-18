import { expect, test } from '@playwright/test';

for (const mediaType of ['movie', 'tv'] as const) {
  test(`${mediaType} Live TV looks up both titles and records the selected programme`, async ({
    page,
  }, info) => {
    const title = 'Fixture Title';
    const original = 'Original Fixture Title';
    const start = '2026-11-19T19:00:00Z';
    const channel = 'fixture-1';
    const writes: unknown[] = [];
    const lookups: string[][] = [];
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname.slice(7);
      if (path === '/auth/me')
        return route.fulfill({ json: { id: 1, permissions: 32 } });
      if (path === '/live-tv/status')
        return route.fulfill({
          json: { configured: true, guideReady: true, canRequest: true },
        });
      if (path === `/${mediaType}/42`)
        return route.fulfill({
          json: {
            id: 42,
            title,
            name: title,
            originalTitle: original,
            originalName: original,
            genres: [],
            seasons: [],
            credits: { cast: [], crew: [] },
          },
        });
      if (path === '/live-tv/airings') {
        lookups.push(url.searchParams.getAll('title'));
        return route.fulfill({
          json: {
            configured: true,
            guideReady: lookups.length > 1,
            airings:
              lookups.length > 1
                ? [
                    {
                      title: original,
                      subTitle: 'Fixture Programme',
                      channel,
                      channelName: 'Fixture Channel',
                      start,
                      stop: '2026-11-19T20:00:00Z',
                      season: 1,
                      episode: 2,
                    },
                  ]
                : [],
          },
        });
      }
      if (path === '/live-tv/recordings' && request.method() === 'POST') {
        writes.push(request.postDataJSON());
        return route.fulfill({
          status: 201,
          json: { status: mediaType === 'tv' ? 'scheduled' : 'pending' },
        });
      }
      if (path === '/live-tv/recordings')
        return route.fulfill({ json: { results: [], pageInfo: { total: 0 } } });
      return route.fulfill({ json: { results: [] } });
    });
    await page.goto(`/${mediaType}/42`);
    const open = page.getByRole('button', { name: 'Find Live TV Airings' });
    await expect(open).toBeVisible();
    expect(lookups).toEqual([]);
    await open.click();
    const sheet = page.getByRole('dialog', { name: 'Live TV Airings' });
    await expect(
      sheet.getByText('The Live TV guide is not ready yet.')
    ).toBeVisible();
    await sheet.getByRole('button', { name: 'Check Again' }).click();
    await expect(sheet.getByText('Fixture Programme')).toBeVisible();
    expect(lookups).toEqual([
      [title, original],
      [title, original],
    ]);
    await page.screenshot({ path: info.outputPath('airings.png') });
    const kind = mediaType === 'tv' ? 'series' : 'airing';
    await sheet
      .getByRole('button', {
        name: kind === 'series' ? 'Record Series' : 'Record Airing',
      })
      .click();
    await expect(sheet.getByRole('status')).toHaveText(
      mediaType === 'tv'
        ? 'Recording scheduled.'
        : 'Recording requested for approval.'
    );
    expect(writes).toEqual([
      {
        kind,
        title: original,
        tmdbId: 42,
        mediaType,
        ...(kind === 'airing' ? { channel, start } : {}),
      },
    ]);
    await sheet.getByRole('link', { name: 'View Recordings' }).click();
    await expect(
      page.getByRole('heading', { name: 'Recordings' })
    ).toBeVisible();
  });
}
