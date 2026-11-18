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

for (const format of ['ebook', 'audiobook', 'album', 'scene']) {
  test(`${format} detail subscribes only to its own queue`, async ({
    page,
  }, info) => {
    const ebook = 'ld1_' + 'c'.repeat(32);
    const audio = 'ld1_' + 'd'.repeat(32);
    const isAudio = format === 'audiobook';
    const id = isAudio ? audio : ebook;
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
          json: {
            musicEnabled: true,
            adultEnabled: true,
            enabledMediaCategories: { music: true, adult: true },
          },
        });
      if (url.pathname.endsWith('/adult/42'))
        return route.fulfill({
          json: {
            id: '42',
            title: 'Fixture Scene',
            performers: [],
            mediaInfo: {
              id: 1,
              status: 3,
              downloadStatus: [
                { size: 100, sizeLeft: 90, liveDownloadToken: ebook },
              ],
            },
          },
        });
      if (url.pathname.endsWith('/music/42'))
        return route.fulfill({
          json: {
            id: '42',
            title: 'Fixture Album',
            artist: { id: 'artist', name: 'Fixture Artist' },
            mediaInfo: {
              id: 1,
              status: 3,
              downloadStatus: [
                { size: 100, sizeLeft: 90, liveDownloadToken: ebook },
              ],
            },
          },
        });
      if (url.pathname.includes('/book/'))
        return route.fulfill({
          json: {
            id: 'OL700W',
            title: 'Fixture Book',
            author: 'Fixture Author',
            description: 'A book with two downloads.',
            mediaInfo: {
              id: 1,
              status: 3,
              downloadStatus: [
                { size: 100, sizeLeft: 90, liveDownloadToken: ebook },
              ],
              audiobookDownloadStatus: [
                { size: 100, sizeLeft: 70, liveDownloadToken: audio },
              ],
            },
          },
        });
      if (url.pathname.endsWith('/live/downloads')) {
        expect(url.searchParams.get('ids')).toBe(id);
        await ready;
        const update = {
          id,
          size: 100,
          sizeLeft: 45,
          progress: 0.55,
          state: 'downloading',
        };
        return route.fulfill({
          contentType: 'text/event-stream',
          body: `event: downloads\ndata: ${JSON.stringify([update])}\n\n`,
        });
      }
      return route.fulfill({ json: {} });
    });
    const path = {
      scene: '/adult/42',
      album: '/music/42',
      ebook: '/book/OL700W',
      audiobook: '/book/OL700W?f=audio',
    }[format]!;
    await page.goto(path);
    const status = page.locator('.dstatus');
    await expect(
      status.getByText(isAudio ? 'Downloading 30%' : 'Downloading 10%', {
        exact: true,
      })
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath('scheduled.png') });
    send();
    await expect(
      status.getByText('Downloading 55%', { exact: true })
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath('live.png') });
  });
}

for (const media of ['movie', 'tv']) {
  test(`${media} trailers use a valid YouTube video ID`, async ({
    page,
  }, info) => {
    const mount = process.env.LUMEN_TEST_MOUNT === '/lumen' ? '/lumen' : '';
    const title = media === 'movie' ? 'Fixture Movie' : 'Fixture Series';
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/lumen-config.json', (route) =>
      route.fulfill({ json: {} })
    );
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname.slice(7);
      if (path === '/auth/me')
        return route.fulfill({ json: { id: 1, permissions: 32 } });
      if (path === `/${media}/42` || path === `/${media}/43`) {
        const valid = path.endsWith('/42');
        return route.fulfill({
          json: {
            id: valid ? 42 : 43,
            title,
            name: title,
            seasons: [],
            numberOfSeasons: 0,
            genres: [],
            relatedVideos: [
              {
                site: 'YouTube',
                type: 'Trailer',
                key: 'invalid',
                url: 'https://example.invalid/trailer',
              },
              ...(valid
                ? [
                    {
                      site: 'YouTube',
                      type: 'Trailer',
                      key: 'fixture1234',
                      url: 'https://example.invalid/other',
                    },
                  ]
                : []),
            ],
          },
        });
      }
      return route.fulfill({ json: { results: [] } });
    });
    await page.goto(`${mount}/${media}/42`);
    const trailer = page.getByRole('link', { name: 'Trailer', exact: true });
    await expect(trailer).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=fixture1234'
    );
    await page.screenshot({
      path: info.outputPath(`${media}-trailer-valid.png`),
      animations: 'disabled',
    });
    await page.goto(`${mount}/${media}/43`);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(trailer).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath(`${media}-trailer-invalid.png`),
      animations: 'disabled',
    });
  });
}
